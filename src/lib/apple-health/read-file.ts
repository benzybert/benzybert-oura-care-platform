import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { AppleHealthAggregator, type AppleParseStats } from "./parse";
import type { AppleDay } from "./rows";

/**
 * Reads the file the member chose in the browser: Apple's `export.zip` (the XML inside is inflated on the fly) or an
 * already unzipped `export.xml`. The file is streamed in small pieces, so a multi-gigabyte export does not have to fit
 * in memory, and it is never uploaded: only the daily rows that come out are, after the member has looked at them.
 */

export type AppleReadErrorCode = "empty" | "not_export" | "unreadable" | "cancelled";

export class AppleReadError extends Error {
  constructor(readonly code: AppleReadErrorCode) {
    super(code);
    this.name = "AppleReadError";
  }
}

export type AppleReadResult = { days: AppleDay[]; stats: AppleParseStats };

/** XML entries worth reading: not the clinical-document copy (`export_cda.xml`) and not macOS resource-fork leftovers. */
export function isHealthXmlEntry(name: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".xml") || lower.startsWith("__macosx/")) return false;
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  return !base.startsWith("._") && !base.includes("cda");
}

const sleep0 = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function readAppleHealthFile(
  file: Blob,
  today: string,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<AppleReadResult> {
  if (file.size === 0) throw new AppleReadError("empty");
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;

  const agg = new AppleHealthAggregator(today);
  const reader = file.stream().getReader();
  let read = 0;
  let chunks = 0;
  let failed = false;
  let sawXml = false;
  let unzip: Unzip | null = null;
  const decoder = new TextDecoder("utf-8");

  if (isZip) {
    unzip = new Unzip((entry) => {
      if (!isHealthXmlEntry(entry.name)) return;
      sawXml = true;
      const entryDecoder = new TextDecoder("utf-8");
      entry.ondata = (err, data, final) => {
        if (err) {
          failed = true;
          return;
        }
        agg.feed(entryDecoder.decode(data, { stream: !final }));
        if (final) agg.endDocument();
      };
      entry.start();
    });
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
  }

  try {
    for (;;) {
      if (opts.signal?.aborted) throw new AppleReadError("cancelled");
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      if (unzip) unzip.push(value, false);
      else agg.feed(decoder.decode(value, { stream: true }));
      if (failed) throw new AppleReadError("unreadable");
      if (++chunks % 8 === 0) {
        opts.onProgress?.(Math.min(1, read / file.size));
        await sleep0();
      }
    }
    if (unzip) {
      unzip.push(new Uint8Array(0), true);
      if (failed) throw new AppleReadError("unreadable");
    } else {
      agg.feed(decoder.decode());
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    if (e instanceof AppleReadError) throw e;
    throw new AppleReadError("unreadable");
  }
  opts.onProgress?.(1);

  if (isZip && !sawXml) throw new AppleReadError("not_export");
  if (agg.stats.seen === 0) throw new AppleReadError("not_export");
  const days = agg.finish();
  if (days.length === 0) throw new AppleReadError("empty");
  return { days, stats: agg.stats };
}
