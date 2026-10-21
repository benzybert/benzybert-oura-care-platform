import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  fmtClock,
  type DashboardData,
  type Finding,
  type MetricKey,
} from "./doctor-dashboard";
import { fmtDateTime } from "./format";
import { DOCTOR_LABELS_HE, type DoctorRole } from "./types";

/**
 * The doctor dashboard as an A4 PDF (summary, findings, trends, daily table), built from the
 * same DashboardData the web dashboard uses so the two never disagree. Hebrew is laid out
 * right to left: text is reordered with the Unicode bidi algorithm and drawn with the
 * self-hosted IBM Plex Sans Hebrew files (Hebrew and Latin/digits live in separate subsets).
 * Time runs left to right in the charts, newest on the right, like on the page.
 */

export type DoctorPdfMeta = {
  patientName: string | null;
  recipientLabel: string | null;
  recipientRole: DoctorRole | null;
  note: string | null;
  generatedAt: Date;
};

const FONT_DIR = path.join("node_modules", "@fontsource", "ibm-plex-sans-hebrew", "files");
const FONT_FILES = {
  hebRegular: "ibm-plex-sans-hebrew-hebrew-400-normal.woff",
  hebBold: "ibm-plex-sans-hebrew-hebrew-700-normal.woff",
  latRegular: "ibm-plex-sans-hebrew-latin-400-normal.woff",
  latBold: "ibm-plex-sans-hebrew-latin-700-normal.woff",
} as const;

const bidi = bidiFactory();
const HEBREW = /[֐-׿]/;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "<": ">", ">": "<" };

/** Logical string to visual order for drawing in a left-to-right canvas, base direction RTL. */
export function toVisual(text: string): string {
  if (!HEBREW.test(text) && !/[‏‫]/.test(text)) return text;
  const levels = bidi.getEmbeddingLevels(text, "rtl");
  const chars = [...text];
  // Brackets inside right-to-left runs are drawn mirrored.
  chars.forEach((c, i) => {
    if ((levels.levels[i] as number) % 2 === 1 && c in MIRROR) chars[i] = MIRROR[c] as string;
  });
  for (const [from, to] of bidi.getReorderSegments(text, levels) as Array<[number, number]>) {
    const seg = chars.slice(from, to + 1).reverse();
    chars.splice(from, seg.length, ...seg);
  }
  return chars.join("");
}

type Fonts = { regular: [PDFFont, PDFFont]; bold: [PDFFont, PDFFont] };

const pick = (fonts: [PDFFont, PDFFont], ch: string) => (HEBREW.test(ch) ? fonts[0] : fonts[1]);

/** Splits a visual string into runs that each use one font. */
function runs(text: string, fonts: [PDFFont, PDFFont]): Array<{ text: string; font: PDFFont }> {
  const out: Array<{ text: string; font: PDFFont }> = [];
  for (const ch of text) {
    const font = pick(fonts, ch);
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += ch;
    else out.push({ text: ch, font });
  }
  return out;
}

function widthOf(text: string, fonts: [PDFFont, PDFFont], size: number): number {
  return runs(text, fonts).reduce((w, r) => w + safeWidth(r.font, r.text, size), 0);
}

/** Characters a subset lacks would throw; they are replaced by a space. */
function sanitize(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text].map((c) => (supported.has(c.codePointAt(0) as number) ? c : " ")).join("");
}

function safeWidth(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(sanitize(font, text), size);
}

const INK = rgb(0.1, 0.12, 0.15);
const MUTED = rgb(0.4, 0.43, 0.48);
const RULE = rgb(0.85, 0.87, 0.9);
const DATA = rgb(0x0b / 255, 0x84 / 255, 0xa5 / 255);
const ATTN = rgb(0xc9 / 255, 0x6a / 255, 0x12 / 255);
const TINT = rgb(0.96, 0.97, 0.98);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const RIGHT = PAGE_W - MARGIN;
const LEFT = MARGIN;
const CONTENT_W = PAGE_W - MARGIN * 2;

const METRIC_TITLES: Record<MetricKey, { title: string; unit: string; digits: number }> = {
  totalSleepHours: { title: "משך שינה", unit: "שעות", digits: 1 },
  averageHrv: { title: "HRV", unit: "ms", digits: 0 },
  lowestHeartRate: { title: "דופק מנוחה", unit: "bpm", digits: 0 },
  readinessScore: { title: "ציון מוכנות", unit: "", digits: 0 },
  sleepScore: { title: "ציון שינה", unit: "", digits: 0 },
  steps: { title: "צעדים", unit: "", digits: 0 },
};

const STATUS_LABEL = { attention: "לתשומת לב", info: "לידיעה", ok: "תקין" } as const;

const num = (v: number | null, digits = 0) =>
  v === null || Number.isNaN(v) ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const dmy = (day: string) => {
  const [y, m, d] = day.split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
};
const dm = (day: string) => {
  const [, m, d] = day.split("-");
  return `${Number(d)}.${Number(m)}`;
};

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
    private footer: string,
  ) {
    this.newPage();
  }

  get latin(): PDFFont {
    return this.fonts.regular[1];
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.page.drawText(sanitize(this.fonts.regular[1], this.footer), {
      x: LEFT,
      y: 22,
      size: 8,
      font: this.fonts.regular[1],
      color: MUTED,
    });
  }

  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage();
  }

  /** Draws logical text with its right edge at `xRight` (or left edge at `xLeft`). */
  text(
    s: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; xRight?: number; xLeft?: number; y?: number },
  ): number {
    const size = opts.size ?? 10;
    const fonts = opts.bold ? this.fonts.bold : this.fonts.regular;
    const visual = toVisual(s);
    const w = widthOf(visual, fonts, size);
    let x = opts.xLeft ?? (opts.xRight ?? RIGHT) - w;
    const y = opts.y ?? this.y;
    for (const r of runs(visual, fonts)) {
      const t = sanitize(r.font, r.text);
      // fontkit lays out Hebrew runs right to left on its own; the run is already in visual
      // order here, so hand it over reversed to end up with the order we computed.
      const out = r.font === fonts[0] ? [...t].reverse().join("") : t;
      this.page.drawText(out, { x, y, size, font: r.font, color: opts.color ?? INK });
      x += r.font.widthOfTextAtSize(t, size);
    }
    return w;
  }

  /** Word-wrapped paragraph, right aligned. Returns the height used. */
  paragraph(s: string, opts: { size?: number; color?: ReturnType<typeof rgb>; width?: number; xRight?: number; bold?: boolean }) {
    const size = opts.size ?? 10;
    const width = opts.width ?? CONTENT_W;
    const fonts = opts.bold ? this.fonts.bold : this.fonts.regular;
    const lines: string[] = [];
    for (const para of s.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const cand = line ? `${line} ${word}` : word;
        if (line && widthOf(toVisual(cand), fonts, size) > width) {
          lines.push(line);
          line = word;
        } else line = cand;
      }
      lines.push(line);
    }
    const lh = size * 1.5;
    for (const l of lines) {
      this.ensure(lh);
      this.y -= lh;
      this.text(l, { size, color: opts.color, xRight: opts.xRight, bold: opts.bold });
    }
    return lines.length * lh;
  }

  heading(s: string) {
    this.ensure(40);
    this.y -= 26;
    this.text(s, { size: 14, bold: true });
    this.y -= 6;
    this.page.drawLine({ start: { x: LEFT, y: this.y }, end: { x: RIGHT, y: this.y }, thickness: 0.8, color: RULE });
  }
}

function drawChart(
  w: Writer,
  box: { x: number; top: number; width: number; height: number },
  title: string,
  values: Array<number | null>,
  avg: Array<number | null> | null,
  opts: { digits: number; clock?: boolean; flagBelow?: number; domain?: [number, number] },
) {
  const { page } = w;
  const { x, top, width, height } = box;
  const bottom = top - height;
  page.drawRectangle({ x, y: bottom, width, height, borderColor: RULE, borderWidth: 0.8 });
  w.text(title, { size: 9.5, bold: true, xRight: x + width - 8, y: top - 15 });

  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) {
    w.text("אין נתונים", { size: 9, color: MUTED, xRight: x + width - 8, y: top - 36 });
    return;
  }
  const lo0 = opts.domain ? opts.domain[0] : Math.min(...real);
  const hi0 = opts.domain ? opts.domain[1] : Math.max(...real);
  const pad = opts.domain ? 0 : (hi0 - lo0 || 1) * 0.15;
  const lo = lo0 - pad;
  const hi = hi0 + pad || lo + 1;
  const px = x + 30;
  const pw = width - 40;
  const pt = top - 26;
  const ph = height - 40;
  const X = (i: number) => px + (i / Math.max(1, values.length - 1)) * pw;
  const Y = (v: number) => pt - ph + ((v - lo) / (hi - lo || 1)) * ph;

  const label = (v: number) => (opts.clock ? fmtClock(v) : num(v, opts.digits));
  const font = w.latin;
  for (const v of [lo0, hi0]) {
    page.drawLine({ start: { x: px, y: Y(v) }, end: { x: px + pw, y: Y(v) }, thickness: 0.4, color: RULE });
    page.drawText(label(v), { x: x + 4, y: Y(v) - 3, size: 7, font, color: MUTED });
  }

  const line = (series: Array<number | null>, color: ReturnType<typeof rgb>, thickness: number) => {
    let prev: number | null = null;
    series.forEach((v, i) => {
      if (v !== null && prev !== null) {
        page.drawLine({ start: { x: X(i - 1), y: Y(prev) }, end: { x: X(i), y: Y(v) }, thickness, color });
      }
      prev = v;
    });
  };
  line(values, DATA, 0.8);
  if (avg) line(avg, rgb(0.1, 0.12, 0.15), 1.6);
  values.forEach((v, i) => {
    if (v === null) return;
    const flagged = opts.flagBelow !== undefined && v < opts.flagBelow;
    page.drawCircle({ x: X(i), y: Y(v), size: flagged ? 2.2 : 1.5, color: flagged ? ATTN : DATA });
  });
}

function statusColor(s: Finding["status"]) {
  return s === "attention" ? ATTN : s === "ok" ? DATA : MUTED;
}

export async function buildDoctorPdf(data: DashboardData, meta: DoctorPdfMeta): Promise<Uint8Array> {
  const read = (f: string) => fs.readFile(path.join(process.cwd(), FONT_DIR, f));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [hr, hb, lr, lb] = await Promise.all(
    [FONT_FILES.hebRegular, FONT_FILES.hebBold, FONT_FILES.latRegular, FONT_FILES.latBold].map(async (f) =>
      doc.embedFont(await read(f), { subset: true }),
    ),
  );
  const fonts: Fonts = { regular: [hr!, lr!], bold: [hb!, lb!] };

  doc.setTitle("Sleep and recovery summary");
  doc.setProducer("Oura Care");
  doc.setCreationDate(meta.generatedAt);

  const w = new Writer(doc, fonts, `Oura Care · ${meta.generatedAt.toISOString().slice(0, 10)}`);

  // Header
  w.y -= 8;
  w.text("סיכום שינה והתאוששות", { size: 22, bold: true });
  w.y -= 20;
  w.text("סיכום ששותף ביוזמת המטופל · לקריאה בלבד · אינו אבחנה", { size: 9.5, color: MUTED });
  w.y -= 18;
  const who = [
    meta.patientName ? `מטופל: ${meta.patientName}` : "מטופל: השם לא צוין",
    meta.recipientLabel || meta.recipientRole
      ? `עבור ${[meta.recipientLabel, meta.recipientRole ? DOCTOR_LABELS_HE[meta.recipientRole] : null].filter(Boolean).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  w.text(who, { size: 11 });
  w.y -= 16;
  w.text(
    `תקופה: ${dmy(data.from)} – ${dmy(data.to)} (${data.windowDays} ימים) · ימים עם נתונים: ${data.daysWithData} מתוך ${data.windowDays} · מקור: טבעת Oura`,
    { size: 9.5, color: MUTED },
  );
  w.y -= 14;
  w.text(`נוצר ${fmtDateTime(meta.generatedAt)}`, { size: 9.5, color: MUTED });

  if (meta.note) {
    w.y -= 22;
    w.text("הערה מהמטופל", { size: 9.5, bold: true, color: MUTED });
    w.paragraph(meta.note, { size: 10.5 });
  }

  if (data.daysWithData === 0) {
    w.heading("אין עדיין נתונים");
    w.paragraph("לא התקבלו נתונים מהטבעת בתקופה הזו.", { size: 11 });
    return doc.save();
  }

  // Snapshot table: columns from the right: metric | last 7 days | start | change | whole period
  w.heading("תמונת מצב");
  w.y -= 4;
  w.paragraph(
    `ממוצע 7 הימים האחרונים (${dm(data.recentRange.from)}–${dm(data.recentRange.to)})` +
      (data.referenceRange ? `, בהשוואה לתחילת התקופה (${dm(data.referenceRange.from)}–${dm(data.referenceRange.to)}).` : "."),
    { size: 9.5, color: MUTED },
  );
  const cols = [
    { label: "מדד", w: 120 },
    { label: "7 ימים אחרונים", w: 100 },
    { label: "תחילת התקופה", w: 100 },
    { label: "שינוי", w: 90 },
    { label: "כל התקופה", w: 105 },
  ];
  const rowH = 20;
  const drawRow = (cells: string[], bold = false, shade = false) => {
    w.ensure(rowH);
    w.y -= rowH;
    if (shade) w.page.drawRectangle({ x: LEFT, y: w.y - 5, width: CONTENT_W, height: rowH, color: TINT });
    let xr = RIGHT - 6;
    cells.forEach((c, i) => {
      w.text(c, { size: 10, bold, xRight: xr, color: bold ? MUTED : INK });
      xr -= cols[i]!.w;
    });
  };
  drawRow(cols.map((c) => c.label), true, true);
  (Object.keys(METRIC_TITLES) as MetricKey[]).forEach((k, idx) => {
    const m = METRIC_TITLES[k];
    const kpi = data.kpis[k];
    const unit = m.unit ? ` ${m.unit}` : "";
    const change =
      kpi.delta === null
        ? "–"
        : `${kpi.delta > 0 ? "+" : kpi.delta < 0 ? "−" : ""}${num(Math.abs(kpi.delta), m.digits)}${kpi.deltaPct !== null && (k === "averageHrv" || k === "steps") ? ` (${Math.round(Math.abs(kpi.deltaPct))}%)` : ""}`;
    drawRow(
      [
        m.title,
        `${num(kpi.recent, m.digits)}${unit}`,
        `${num(kpi.reference, m.digits)}${unit}`,
        change,
        `${num(kpi.period, m.digits)}${unit}`,
      ],
      false,
      idx % 2 === 1,
    );
  });
  w.y -= 22;
  w.text(`שעת הירדמות חציונית: ${fmtClock(data.bedtime.median)} · סטיית תקן: ${num(data.bedtime.sd)} דקות`, {
    size: 9.5,
    color: MUTED,
  });

  // Findings
  const order = { attention: 0, info: 1, ok: 2 } as const;
  const findings = [...data.findings].sort((a, b) => order[a.status] - order[b.status]);
  w.heading("ממצאים");
  w.y -= 2;
  w.paragraph("סיכום אוטומטי לפי ספים קבועים, ביחס לערכים של המטופל עצמו. זה כלי סינון, לא אבחנה.", { size: 9.5, color: MUTED });
  for (const f of findings) {
    w.ensure(52);
    w.y -= 20;
    w.text(`${f.title} · ${STATUS_LABEL[f.status]}`, { size: 10.5, bold: true, color: statusColor(f.status) });
    w.paragraph(f.detail, { size: 9.5, color: INK });
  }

  // Charts: time left to right, newest on the right
  w.heading("מגמות");
  w.y -= 4;
  w.paragraph("נקודה לכל יום, קו כהה לממוצע נע של 7 ימים. ימים בלי נתונים נשארים ריקים. הזמן זורם משמאל לימין.", {
    size: 9.5,
    color: MUTED,
  });
  const charts: Array<{ title: string; key: MetricKey | "bedtime"; digits: number; below?: number; domain?: [number, number] }> = [
    { title: "משך שינה (שעות)", key: "totalSleepHours", digits: 1, below: 6, domain: [0, 10] },
    { title: "HRV (ms)", key: "averageHrv", digits: 0 },
    { title: "דופק מנוחה (bpm)", key: "lowestHeartRate", digits: 0 },
    { title: "ציון מוכנות", key: "readinessScore", digits: 0, below: 60 },
    { title: "ציון שינה", key: "sleepScore", digits: 0 },
    { title: "שעת הירדמות", key: "bedtime", digits: 0 },
  ];
  const cw = (CONTENT_W - 12) / 2;
  const ch = 118;
  for (let i = 0; i < charts.length; i += 2) {
    w.ensure(ch + 12);
    w.y -= 8;
    const top = w.y;
    [charts[i], charts[i + 1]].forEach((c, j) => {
      if (!c) return;
      const xBox = RIGHT - cw - j * (cw + 12);
      if (c.key === "bedtime") {
        drawChart(w, { x: xBox, top, width: cw, height: ch }, c.title, data.bedtime.series, null, { digits: 0, clock: true });
      } else {
        drawChart(
          w,
          { x: xBox, top, width: cw, height: ch },
          c.title,
          data.slots.map((s) => s[c.key as MetricKey] as number | null),
          data.rolling[c.key as MetricKey],
          { digits: c.digits, flagBelow: c.below, domain: c.domain },
        );
      }
    });
    w.y = top - ch;
  }
  w.y -= 6;
  w.text(dm(data.from), { size: 8.5, color: MUTED, xLeft: LEFT });
  w.text(dm(data.to), { size: 8.5, color: MUTED, xRight: RIGHT });

  // Daily table, newest first
  w.heading("נתונים יומיים");
  const dcols = [
    { label: "תאריך", w: 78 },
    { label: "שינה (ש׳)", w: 72 },
    { label: "ציון שינה", w: 70 },
    { label: "מוכנות", w: 66 },
    { label: "HRV", w: 56 },
    { label: "דופק מנוחה", w: 76 },
    { label: "הירדמות", w: 62 },
    { label: "צעדים", w: 60 },
  ];
  const dRow = (cells: string[], bold = false, shade = false) => {
    w.ensure(16);
    w.y -= 16;
    if (shade) w.page.drawRectangle({ x: LEFT, y: w.y - 4, width: CONTENT_W, height: 16, color: TINT });
    let xr = RIGHT - 6;
    cells.forEach((c, i) => {
      w.text(c, { size: 9, bold, xRight: xr, color: bold ? MUTED : INK });
      xr -= dcols[i]!.w;
    });
  };
  w.y -= 4;
  dRow(dcols.map((c) => c.label), true, true);
  [...data.slots].reverse().forEach((s, i) => {
    if (w.y - 16 < MARGIN) {
      w.newPage();
      w.y -= 4;
      dRow(dcols.map((c) => c.label), true, true);
    }
    dRow(
      [
        dmy(s.day),
        num(s.totalSleepHours, 1),
        num(s.sleepScore),
        num(s.readinessScore),
        num(s.averageHrv),
        num(s.lowestHeartRate),
        s.bedtimeStartMinute === null ? "–" : fmtClock(s.bedtimeStartMinute),
        num(s.steps),
      ],
      false,
      i % 2 === 1,
    );
  });

  w.y -= 14;
  w.paragraph("המדדים הם נתוני בריאות כלליים מטבעת צרכנית ואינם אבחון או תחליף לבדיקה רפואית.", { size: 9, color: MUTED });

  return doc.save();
}
