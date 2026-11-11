import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "./messages";

/**
 * English mode must be all English and Hebrew mode all Hebrew. UI text lives in the dictionaries, so a
 * Hebrew letter in a page or component is text that an English visitor would see untranslated.
 * The files below are the deliberate exceptions: what a doctor or a newsletter reader gets is Hebrew.
 */
const ALLOWED = [
  "src/components/doctor-dashboard/", // doctor links, preview and PDF stay Hebrew (their text is in dict/data*.ts)
  "src/app/share/", // the doctor's page
  "src/app/suggest/", // the newsletter readers' page
  "src/components/suggest-reader.tsx",
  "src/components/locale-switch.tsx", // the language's own name
  "src/app/member/circle/page.tsx", // the language's own name in a picker
];

const hebrew = /[֐-׿]/;
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("no hard-coded Hebrew in pages and components", () => {
  it("keeps UI text in the dictionaries", () => {
    const offenders = [...files("src/app"), ...files("src/components")]
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => !ALLOWED.some((a) => p.startsWith(a)))
      .filter((p) => hebrew.test(stripComments(readFileSync(p, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("has no Hebrew in the English dictionaries of the member's own tabs", () => {
    const strings = (v: unknown): string[] =>
      typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
    for (const ns of ["goals", "experiments", "sharing"] as const) {
      expect(strings(messages.en[ns]).filter((s) => hebrew.test(s)), ns).toEqual([]);
    }
  });
});
