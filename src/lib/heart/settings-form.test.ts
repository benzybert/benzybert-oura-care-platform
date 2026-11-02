import { describe, expect, it } from "vitest";
import { parseHeartSettings } from "./settings-form";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseHeartSettings", () => {
  it("sets no limits by default", () => {
    const r = parseHeartSettings(form({ sensitivity: "standard" }));
    expect(r).toEqual({
      ok: true,
      value: {
        monitoring: false,
        sensitivity: "standard",
        escalateAfterMinutes: 15,
        limits: {
          urgentEnabled: false,
          nightHrMax: null,
          nightHrMin: null,
          spo2Min: null,
          restHrMax: null,
          restHrMin: null,
          restHrMaxMinutes: 30,
          restHrMinMinutes: 30,
        },
      },
    });
  });

  it("reads the member's own numbers and switches", () => {
    const r = parseHeartSettings(
      form({ sensitivity: "sensitive", monitoring: "on", urgentEnabled: "on", restHrMax: "120", restHrMaxMinutes: "20", restHrMin: "40", nightHrMax: "70", spo2Min: "92", escalateAfterMinutes: "10" }),
    );
    expect(r.ok && r.value).toMatchObject({
      monitoring: true,
      sensitivity: "sensitive",
      escalateAfterMinutes: 10,
      limits: { urgentEnabled: true, restHrMax: 120, restHrMaxMinutes: 20, restHrMin: 40, nightHrMax: 70, spo2Min: 92 },
    });
  });

  it("rejects numbers outside a sane range", () => {
    expect(parseHeartSettings(form({ sensitivity: "standard", restHrMax: "400" })).ok).toBe(false);
    expect(parseHeartSettings(form({ sensitivity: "standard", spo2Min: "50" })).ok).toBe(false);
    expect(parseHeartSettings(form({ sensitivity: "standard", restHrMaxMinutes: "2" })).ok).toBe(false);
    expect(parseHeartSettings(form({ sensitivity: "standard", nightHrMax: "abc" })).ok).toBe(false);
    expect(parseHeartSettings(form({ sensitivity: "standard", nightHrMax: "70.5" })).ok).toBe(false);
  });

  it("rejects a low limit that is not below the high one", () => {
    expect(parseHeartSettings(form({ sensitivity: "standard", restHrMax: "60", restHrMin: "60" })).ok).toBe(false);
    expect(parseHeartSettings(form({ sensitivity: "standard", nightHrMax: "50", nightHrMin: "60" })).ok).toBe(false);
  });

  it("rejects an unknown sensitivity", () => {
    expect(parseHeartSettings(form({ sensitivity: "paranoid" })).ok).toBe(false);
    expect(parseHeartSettings(form({})).ok).toBe(false);
  });
});
