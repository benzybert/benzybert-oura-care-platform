import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { AppleHealthAggregator, parseAppleHealthXml, parseStamp, unionMinutes } from "./parse";
import { AppleReadError, isHealthXmlEntry, readAppleHealthFile } from "./read-file";
import { MAX_DAYS_PER_REQUEST, appleAverages, appleRange, cleanValue, emptyAppleDay, sanitizeAppleDays, type AppleDay } from "./rows";

const TODAY = "2026-11-09";

const q = (type: string, value: number | string, o: { unit?: string; start?: string; source?: string } = {}) =>
  `<Record type="HKQuantityTypeIdentifier${type}" sourceName="${o.source ?? "Apple Watch"}" sourceVersion="11.0" ` +
  `device="&lt;&lt;HKDevice: 0x280&gt;, name:Apple Watch, manufacturer:Apple Inc., model:Watch&gt;" unit="${o.unit ?? "count"}" ` +
  `creationDate="${o.start ?? "2026-11-05 09:00:00 +0200"}" startDate="${o.start ?? "2026-11-05 09:00:00 +0200"}" ` +
  `endDate="${o.start ?? "2026-11-05 09:00:00 +0200"}" value="${value}"/>`;

const sleepRec = (value: string, start: string, end: string, source = "Apple Watch") =>
  `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${source}" sourceVersion="11.0" creationDate="${end}" ` +
  `startDate="${start}" endDate="${end}" value="HKCategoryValueSleepAnalysis${value}"/>`;

const doc = (...parts: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE HealthData [\n<!ELEMENT Record (MetadataEntry*)>\n<!ATTLIST Record type CDATA #REQUIRED>\n]>\n<HealthData locale="en_IL">\n ${parts.join("\n ")}\n</HealthData>`;

const dayOf = (days: AppleDay[], d: string) => days.find((x) => x.day === d);

describe("parseStamp", () => {
  it("keeps the local date and turns the offset into an instant", () => {
    const s = parseStamp("2026-11-05 23:30:00 +0200")!;
    expect(s.day).toBe("2026-11-05");
    expect(new Date(s.ms).toISOString()).toBe("2026-11-05T21:30:00.000Z");
    expect(parseStamp("2026-11-05 07:00:00 -0500")!.ms).toBe(Date.UTC(2026, 10, 5, 12, 0, 0));
    expect(parseStamp("nonsense")).toBeNull();
    expect(parseStamp(undefined)).toBeNull();
  });
});

describe("unionMinutes", () => {
  const min = 60_000;
  it("counts overlaps once", () => {
    expect(unionMinutes([])).toBe(0);
    expect(unionMinutes([[0, 30 * min], [20 * min, 50 * min], [60 * min, 70 * min]])).toBe(60);
  });
});

describe("quantities", () => {
  it("sums steps per source and keeps the source with the most (an iPhone and a Watch must not add up)", () => {
    const xml = doc(
      q("StepCount", 3000, { source: "iPhone", start: "2026-11-05 08:00:00 +0200" }),
      q("StepCount", 4000, { source: "iPhone", start: "2026-11-05 12:00:00 +0200" }),
      q("StepCount", 5200, { source: "Apple Watch", start: "2026-11-05 08:00:00 +0200" }),
    );
    const { days } = parseAppleHealthXml(xml, TODAY);
    expect(dayOf(days, "2026-11-05")?.steps).toBe(7000);
  });

  it("averages resting heart rate, HRV and breathing, converts SpO2 from a fraction and keeps the last weight", () => {
    const xml = doc(
      q("RestingHeartRate", 58, { unit: "count/min" }),
      q("HeartRateVariabilitySDNN", 40, { unit: "ms", start: "2026-11-05 03:00:00 +0200" }),
      q("HeartRateVariabilitySDNN", 50, { unit: "ms", start: "2026-11-05 04:00:00 +0200" }),
      q("RespiratoryRate", 14.5, { unit: "count/min" }),
      q("OxygenSaturation", 0.97, { unit: "%" }),
      q("OxygenSaturation", 0.95, { unit: "%", start: "2026-11-05 10:00:00 +0200" }),
      q("BodyMass", 180, { unit: "lb", start: "2026-11-05 07:00:00 +0200" }),
      q("BodyMass", 81.5, { unit: "kg", start: "2026-11-05 20:00:00 +0200" }),
      q("VO2Max", 41.2, { unit: "mL/min·kg" }),
    );
    const d = dayOf(parseAppleHealthXml(xml, TODAY).days, "2026-11-05")!;
    expect(d.restingHr).toBe(58);
    expect(d.hrvSdnn).toBe(45);
    expect(d.respRate).toBe(14.5);
    expect(d.spo2).toBe(96);
    expect(d.weightKg).toBe(81.5);
    expect(d.vo2Max).toBe(41.2);
  });

  it("converts miles, kilojoules and pounds", () => {
    const xml = doc(
      q("DistanceWalkingRunning", 3, { unit: "mi" }),
      q("ActiveEnergyBurned", 2092, { unit: "kJ" }),
      q("BodyMass", 154.3, { unit: "lb" }),
    );
    const d = dayOf(parseAppleHealthXml(xml, TODAY).days, "2026-11-05")!;
    expect(d.distanceKm).toBe(4.83);
    expect(d.activeKcal).toBe(500);
    expect(d.weightKg).toBe(70);
  });

  it("prefers the Watch's activity summary for active energy and exercise minutes", () => {
    const xml = doc(
      q("ActiveEnergyBurned", 50, { unit: "kcal" }),
      q("AppleExerciseTime", 5, { unit: "min" }),
      `<ActivitySummary dateComponents="2026-11-05" activeEnergyBurned="412.7" activeEnergyBurnedGoal="500" appleExerciseTime="31" appleExerciseTimeGoal="30" appleStandHours="10" appleStandHoursGoal="12"/>`,
      q("ActiveEnergyBurned", 80, { unit: "kcal", start: "2026-11-06 09:00:00 +0200" }),
    );
    const { days } = parseAppleHealthXml(xml, TODAY);
    expect(dayOf(days, "2026-11-05")).toMatchObject({ activeKcal: 413, exerciseMin: 31 });
    expect(dayOf(days, "2026-11-06")).toMatchObject({ activeKcal: 80, exerciseMin: null });
  });

  it("counts workouts and their minutes, whatever unit the duration is in", () => {
    const xml = doc(
      `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Apple Watch" startDate="2026-11-05 07:00:00 +0200" endDate="2026-11-05 07:31:00 +0200">\n  <WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" sum="4000"/>\n </Workout>`,
      `<Workout workoutActivityType="HKWorkoutActivityTypeYoga" duration="1800" durationUnit="sec" startDate="2026-11-05 18:00:00 +0200" endDate="2026-11-05 18:30:00 +0200"/>`,
    );
    expect(dayOf(parseAppleHealthXml(xml, TODAY).days, "2026-11-05")).toMatchObject({ workouts: 2, workoutMin: 60 });
  });

  it("ignores other types, days in the future and days older than ten years", () => {
    const xml = doc(
      q("HeartRate", 80, { unit: "count/min" }),
      q("StepCount", 100, { start: "2026-12-25 09:00:00 +0200" }),
      q("StepCount", 100, { start: "2012-01-01 09:00:00 +0200" }),
      q("StepCount", 100, { start: "2026-11-10 09:00:00 +0200" }),
    );
    const { days, stats } = parseAppleHealthXml(xml, TODAY);
    expect(days.map((d) => d.day)).toEqual(["2026-11-10"]);
    expect(stats).toEqual({ seen: 4, used: 1 });
  });

  it("does not drop a record because of a '>' inside an attribute value", () => {
    const xml = `<HealthData><Record type="HKQuantityTypeIdentifierStepCount" sourceName="A > B" unit="count" startDate="2026-11-05 09:00:00 +0200" endDate="2026-11-05 09:01:00 +0200" value="12"/></HealthData>`;
    expect(dayOf(parseAppleHealthXml(xml, TODAY).days, "2026-11-05")?.steps).toBe(12);
  });
});

describe("sleep", () => {
  it("files a night under the day it ends and merges overlapping intervals", () => {
    const xml = doc(
      sleepRec("AsleepCore", "2026-11-04 23:10:00 +0200", "2026-11-05 01:10:00 +0200"),
      sleepRec("AsleepDeep", "2026-11-05 01:10:00 +0200", "2026-11-05 02:10:00 +0200"),
      sleepRec("AsleepREM", "2026-11-05 02:10:00 +0200", "2026-11-05 03:10:00 +0200"),
      sleepRec("Awake", "2026-11-05 03:10:00 +0200", "2026-11-05 03:25:00 +0200"),
      sleepRec("AsleepCore", "2026-11-05 03:25:00 +0200", "2026-11-05 06:55:00 +0200"),
      // the iPhone's guess overlaps the Watch's and records less: it must not win or add up
      sleepRec("Asleep", "2026-11-04 23:00:00 +0200", "2026-11-05 05:00:00 +0200", "iPhone"),
    );
    const { days } = parseAppleHealthXml(xml, TODAY);
    expect(days.map((d) => d.day)).toEqual(["2026-11-05"]);
    expect(days[0]).toMatchObject({ sleepAsleepMin: 120 + 60 + 60 + 210, sleepCoreMin: 120 + 210, sleepDeepMin: 60, sleepRemMin: 60, sleepAwakeMin: 15 });
  });

  it("keeps stages empty when the source only wrote plain 'asleep' (before iOS 16) and ignores in-bed time", () => {
    const xml = doc(
      sleepRec("InBed", "2026-11-04 22:30:00 +0200", "2026-11-05 07:30:00 +0200", "iPhone"),
      sleepRec("Asleep", "2026-11-04 23:00:00 +0200", "2026-11-05 06:00:00 +0200", "iPhone"),
    );
    const d = parseAppleHealthXml(xml, TODAY).days[0]!;
    expect(d.sleepAsleepMin).toBe(420);
    expect(d.sleepDeepMin).toBeNull();
    expect(d.sleepAwakeMin).toBeNull();
  });

  it("records nothing for a night with only in-bed time, and files an afternoon nap under its own day", () => {
    const xml = doc(
      sleepRec("InBed", "2026-11-04 22:30:00 +0200", "2026-11-05 07:30:00 +0200", "iPhone"),
      sleepRec("Asleep", "2026-11-06 14:00:00 +0200", "2026-11-06 14:40:00 +0200", "iPhone"),
    );
    const { days } = parseAppleHealthXml(xml, TODAY);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ day: "2026-11-06", sleepAsleepMin: 40 });
  });
});

describe("chunking", () => {
  const xml = doc(
    q("StepCount", 1234, { start: "2026-11-05 08:00:00 +0200" }),
    q("RestingHeartRate", 61, { unit: "count/min", start: "2026-11-06 08:00:00 +0200" }),
    sleepRec("AsleepCore", "2026-11-06 23:00:00 +0200", "2026-11-07 06:00:00 +0200"),
    `<Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="20" durationUnit="min" startDate="2026-11-05 17:00:00 +0200" endDate="2026-11-05 17:20:00 +0200"/>`,
  );

  it("gives the same rows however the text is split, even in the middle of a tag", () => {
    const whole = parseAppleHealthXml(xml, TODAY).days;
    for (const size of [1, 7, 64, 500]) {
      const agg = new AppleHealthAggregator(TODAY);
      for (let i = 0; i < xml.length; i += size) agg.feed(xml.slice(i, i + size));
      expect(agg.finish()).toEqual(whole);
    }
    expect(whole.map((d) => d.day)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07"]);
  });

  it("does not keep a runaway unfinished tag", () => {
    const agg = new AppleHealthAggregator(TODAY);
    agg.feed(`<Record type="${"x".repeat(100_000)}`);
    agg.feed(q("StepCount", 5));
    expect(agg.finish()[0]?.steps).toBe(5);
  });
});

describe("sanitizeAppleDays", () => {
  const row = (day: string, o: Partial<AppleDay> = {}): AppleDay => ({ ...emptyAppleDay(day), steps: 8000, ...o });

  it("accepts good rows, drops implausible numbers and empty rows, and keeps the last copy of a day", () => {
    const r = sanitizeAppleDays(
      [row("2026-11-05", { restingHr: 400, hrvSdnn: 45.123 }), row("2026-11-04", { steps: null }), row("2026-11-05", { steps: 9000 })],
      TODAY,
    );
    expect(r).toEqual({ ok: true, dropped: 1, days: [{ ...emptyAppleDay("2026-11-05"), steps: 9000 }] });
    const r2 = sanitizeAppleDays([row("2026-11-05", { restingHr: 400, hrvSdnn: 45.123 })], TODAY);
    expect(r2.ok && r2.days[0]).toMatchObject({ restingHr: null, hrvSdnn: 45.1, steps: 8000 });
  });

  it("refuses the wrong shape, bad dates and oversized requests; drops days outside 2000..tomorrow", () => {
    expect(sanitizeAppleDays("x", TODAY)).toEqual({ ok: false, error: "invalid" });
    expect(sanitizeAppleDays([null], TODAY)).toEqual({ ok: false, error: "invalid" });
    expect(sanitizeAppleDays([{ day: "2026-02-30", steps: 1 }], TODAY)).toEqual({ ok: false, error: "invalid" });
    expect(sanitizeAppleDays([{ day: "5 Nov", steps: 1 }], TODAY)).toEqual({ ok: false, error: "invalid" });
    const many = Array.from({ length: MAX_DAYS_PER_REQUEST + 1 }, () => row("2026-11-05"));
    expect(sanitizeAppleDays(many, TODAY)).toEqual({ ok: false, error: "too_many" });
    const r = sanitizeAppleDays([row("1999-12-31"), row("2026-11-11"), row("2026-11-10")], TODAY);
    expect(r).toMatchObject({ ok: true, dropped: 2 });
    expect(r.ok && r.days.map((d) => d.day)).toEqual(["2026-11-10"]);
  });

  it("ignores fields it does not know and values of the wrong type", () => {
    const r = sanitizeAppleDays([{ day: "2026-11-05", steps: "8000", heartRateSeries: [1, 2], restingHr: 60 }], TODAY);
    expect(r.ok && r.days[0]).toEqual({ ...emptyAppleDay("2026-11-05"), restingHr: 60 });
  });
});

describe("cleanValue, appleAverages, appleRange", () => {
  it("rounds and range-checks", () => {
    expect(cleanValue("spo2", 96.04)).toBe(96);
    expect(cleanValue("spo2", 12)).toBeNull();
    expect(cleanValue("steps", Number.NaN)).toBeNull();
    expect(cleanValue("steps", -1)).toBeNull();
  });

  it("averages the last 30 days that have a value", () => {
    const days = [
      { ...emptyAppleDay("2026-11-09"), steps: 10000, restingHr: 60 },
      { ...emptyAppleDay("2026-11-08"), steps: 6000 },
      { ...emptyAppleDay("2026-09-01"), steps: 1 },
    ];
    const a = appleAverages(days, TODAY);
    expect(a.steps).toEqual({ mean: 8000, n: 2 });
    expect(a.restingHr).toEqual({ mean: 60, n: 1 });
    expect(a.hrvSdnn).toEqual({ mean: null, n: 0 });
  });

  it("finds the first and last day", () => {
    expect(appleRange([])).toBeNull();
    expect(appleRange([{ day: "2026-11-05" }, { day: "2026-10-01" }, { day: "2026-11-09" }])).toEqual({ from: "2026-10-01", to: "2026-11-09", count: 3 });
  });
});

describe("reading a file", () => {
  const xml = doc(q("StepCount", 4321, { start: "2026-11-05 08:00:00 +0200" }), q("RestingHeartRate", 57, { unit: "count/min" }));

  it("reads export.xml from inside export.zip and skips the clinical copy", async () => {
    const zip = zipSync({
      "apple_health_export/export.xml": strToU8(xml),
      "apple_health_export/export_cda.xml": strToU8(doc(q("StepCount", 999999, { start: "2026-11-05 08:00:00 +0200" }))),
      "apple_health_export/workout-routes/route_1.gpx": strToU8("<gpx/>"),
    });
    const progress: number[] = [];
    const r = await readAppleHealthFile(new File([zip as BlobPart], "export.zip"), TODAY, { onProgress: (f) => progress.push(f) });
    expect(dayOf(r.days, "2026-11-05")).toMatchObject({ steps: 4321, restingHr: 57 });
    expect(progress.at(-1)).toBe(1);
  });

  it("reads a stored (uncompressed) zip entry and an unzipped export.xml", async () => {
    const stored = zipSync({ "apple_health_export/export.xml": [strToU8(xml), { level: 0 }] });
    const a = await readAppleHealthFile(new File([stored as BlobPart], "export.zip"), TODAY);
    expect(dayOf(a.days, "2026-11-05")?.steps).toBe(4321);
    const b = await readAppleHealthFile(new File([xml], "export.xml"), TODAY);
    expect(b.days).toEqual(a.days);
  });

  it("says what is wrong with a file that is not an Apple Health export", async () => {
    const code = async (blob: Blob) => readAppleHealthFile(blob, TODAY).then(() => "ok", (e: unknown) => (e instanceof AppleReadError ? e.code : "other"));
    expect(await code(new File([], "empty.zip"))).toBe("empty");
    expect(await code(new File(["hello world"], "notes.txt"))).toBe("not_export");
    expect(await code(new File([zipSync({ "photos/cat.jpg": strToU8("x") }) as BlobPart], "x.zip"))).toBe("not_export");
    // a real export with no usable day in the window
    expect(await code(new File([doc(q("StepCount", 5, { start: "2001-01-01 08:00:00 +0200" }))], "export.xml"))).toBe("empty");
  });

  it("can be cancelled", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(readAppleHealthFile(new File([xml], "export.xml"), TODAY, { signal: ac.signal })).rejects.toMatchObject({ code: "cancelled" });
  });

  it("picks the XML entries that matter", () => {
    expect(isHealthXmlEntry("apple_health_export/export.xml")).toBe(true);
    expect(isHealthXmlEntry("apple_health_export/Exportar.xml")).toBe(true);
    expect(isHealthXmlEntry("apple_health_export/export_cda.xml")).toBe(false);
    expect(isHealthXmlEntry("__MACOSX/apple_health_export/._export.xml")).toBe(false);
    expect(isHealthXmlEntry("apple_health_export/electrocardiograms/ecg_1.csv")).toBe(false);
  });
});
