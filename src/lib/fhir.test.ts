import { describe, expect, it } from "vitest";
import type { Observation } from "@medplum/fhirtypes";
import { MEASURES, OURA_CODE_SYSTEM, buildFhirBundle, opaquePatientId } from "./fhir";
import type { DayExtras, DayMetric } from "./types";

const day = (d: string, over: Partial<DayMetric> = {}): DayMetric => ({
  day: d,
  sleepScore: 80,
  readinessScore: 75,
  averageHrv: 48.4,
  lowestHeartRate: 55,
  totalSleepHours: 7.25,
  steps: 9000,
  bedtimeStartMinute: 1380,
  averageBreath: 14.2,
  averageHeartRate: 59.6,
  temperatureDeviation: -0.12,
  ...over,
});

const BASE = "https://example.test/fhir";

describe("buildFhirBundle", () => {
  const bundle = buildFhirBundle({
    memberId: "11111111-2222-3333-4444-555555555555",
    metrics: [day("2026-11-02"), day("2026-11-01", { steps: null, averageHrv: null })],
    extras: [{ day: "2026-11-02", spo2Average: 96.4 } as DayExtras],
    generatedAt: new Date("2026-11-04T08:00:00Z"),
    baseUrl: `${BASE}/`,
  });
  const obs = (bundle.entry ?? []).map((e) => e.resource).filter((r): r is Observation => r?.resourceType === "Observation");

  it("is a collection with a Patient that carries no identity and the ring as a Device", () => {
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    const patient = bundle.entry?.[0]?.resource;
    expect(patient?.resourceType).toBe("Patient");
    expect(JSON.stringify(patient)).not.toMatch(/name|telecom|birthDate|address/);
    expect(patient?.id).toBe(opaquePatientId("11111111-2222-3333-4444-555555555555"));
    expect(patient?.id).not.toContain("1111");
    expect(bundle.entry?.[1]?.resource?.resourceType).toBe("Device");
  });

  it("writes one Observation per day and measure, skipping missing values, oldest first", () => {
    expect(obs.length).toBe(MEASURES.length * 2 - 2 - 1); // day 1 lacks steps, HRV and SpO2
    expect(obs[0]?.effectiveDateTime).toBe("2026-11-01");
    const rhr = obs.find((o) => o.id === "resting-hr-2026-11-02");
    expect(rhr?.code.coding?.[0]).toMatchObject({ system: "http://loinc.org", code: "40443-4" });
    expect(rhr?.valueQuantity).toMatchObject({ value: 55, code: "/min", system: "http://unitsofmeasure.org" });
    expect(rhr?.subject?.reference).toBe(`Patient/${opaquePatientId("11111111-2222-3333-4444-555555555555")}`);
    const hrv = obs.find((o) => o.id === "hrv-rmssd-2026-11-02");
    expect(hrv?.code.coding?.[0]?.system).toBe(OURA_CODE_SYSTEM);
    expect(hrv?.valueQuantity?.value).toBe(48);
    expect(obs.find((o) => o.id === "spo2-2026-11-02")?.valueQuantity?.value).toBe(96.4);
  });

  it("builds full URLs on the base so relative references resolve", () => {
    expect(bundle.entry?.[0]?.fullUrl).toBe(`${BASE}/Patient/${bundle.entry?.[0]?.resource?.id}`);
    expect(bundle.entry?.at(-1)?.fullUrl).toMatch(new RegExp(`^${BASE}/Observation/`));
  });
});
