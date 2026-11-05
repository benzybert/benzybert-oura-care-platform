import { extractTextItems, getDocumentProxy } from "unpdf";

/**
 * Text lines of an uploaded PDF, rebuilt from pdf.js text items by their position (same height = same line, left to
 * right). Server-only. The file is read in memory and never stored or logged. The bundled pdf.js (6.x, via unpdf)
 * never evaluates code from a PDF (no eval or Function in it, so the old `isEvalSupported` switch is gone); the size
 * and the number of pages are capped, and a scanned PDF simply yields no lines.
 */

export const PDF_MAX_BYTES = 4 * 1024 * 1024;
export const PDF_MAX_PAGES = 20;

export type PdfTextResult = { ok: true; lines: string[] } | { ok: false; error: "not_pdf" | "too_big" | "too_many_pages" | "unreadable" };

export function looksLikePdf(bytes: Uint8Array): boolean {
  // "%PDF-" within the first 1 KB (some generators put a few bytes before it)
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

type Item = { str: string; x: number; y: number; height: number };

/** Groups items into lines: items whose baselines are within half a line height belong together. */
export function itemsToLines(items: Item[]): string[] {
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(2, (item.height || 10) / 2);
    if (line && Math.abs((line[0] as Item).y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }
  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

export async function pdfTextLines(bytes: Uint8Array): Promise<PdfTextResult> {
  if (bytes.byteLength > PDF_MAX_BYTES) return { ok: false, error: "too_big" };
  if (!looksLikePdf(bytes)) return { ok: false, error: "not_pdf" };
  try {
    const doc = await getDocumentProxy(new Uint8Array(bytes), { stopAtErrors: false });
    try {
      if (doc.numPages > PDF_MAX_PAGES) return { ok: false, error: "too_many_pages" };
      const { items } = await extractTextItems(doc);
      return { ok: true, lines: items.flatMap((page) => itemsToLines(page)) };
    } finally {
      // free the parsed document; older pdf.js builds in unpdf have no destroy()
      await (doc as { destroy?: () => Promise<void> }).destroy?.();
    }
  } catch {
    // The reason is not logged: it could carry content from the file.
    return { ok: false, error: "unreadable" };
  }
}
