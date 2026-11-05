import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseLabText } from "./lab-pdf";
import { itemsToLines, looksLikePdf, pdfTextLines } from "./pdf-text";

async function makePdf(rows: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  rows.forEach((cells, r) => cells.forEach((text, c) => page.drawText(text, { x: 40 + c * 140, y: 780 - r * 22, size: 11, font })));
  return doc.save();
}

describe("itemsToLines", () => {
  it("joins items on the same baseline left to right, top line first", () => {
    expect(
      itemsToLines([
        { str: "13.8", x: 200, y: 700, height: 10 },
        { str: "Hemoglobin", x: 40, y: 701, height: 10 },
        { str: "Ferritin 22", x: 40, y: 680, height: 10 },
        { str: " ", x: 10, y: 600, height: 10 },
      ]),
    ).toEqual(["Hemoglobin 13.8", "Ferritin 22"]);
  });
});

describe("pdfTextLines", () => {
  it("reads a table-like PDF back into lines the lab parser understands", async () => {
    const pdf = await makePdf([
      ["Clalit Health Services", "", "Date: 21/10/2026"],
      ["Test", "Result", "Units", "Range"],
      ["Hemoglobin", "14.1", "g/dL", "13.5-17.5"],
      ["LDL Cholesterol", "141", "mg/dL", "<100"],
      ["TSH", "2.3", "mIU/L", "0.4-4.0"],
    ]);
    const res = await pdfTextLines(pdf);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lines).toContain("Hemoglobin 14.1 g/dL 13.5-17.5");
    const draft = parseLabText(res.lines, "2026-11-05");
    expect(draft.takenOn).toBe("2026-10-21");
    expect(draft.lab).toBe("Clalit");
    expect(draft.rows.map((r) => [r.biomarker, r.value, r.refLow, r.refHigh])).toEqual([
      ["hemoglobin", 14.1, 13.5, 17.5],
      ["ldl", 141, null, 100],
      ["tsh", 2.3, 0.4, 4],
    ]);
  });

  it("refuses what is not a PDF and does not throw on a broken one", async () => {
    expect(looksLikePdf(new TextEncoder().encode("hello"))).toBe(false);
    expect(await pdfTextLines(new TextEncoder().encode("hello"))).toEqual({ ok: false, error: "not_pdf" });
    expect(await pdfTextLines(new TextEncoder().encode("%PDF-1.7 garbage"))).toEqual({ ok: false, error: "unreadable" });
    expect(await pdfTextLines(new Uint8Array(5 * 1024 * 1024))).toEqual({ ok: false, error: "too_big" });
  });
});
