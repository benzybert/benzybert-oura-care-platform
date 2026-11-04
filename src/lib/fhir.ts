import { createHash } from "node:crypto";
import type { Bundle, BundleEntry, CodeableConcept, Device, Observation, Patient, Quantity } from "@medplum/fhirtypes";
import type { DayExtras, DayMetric } from "./types";

/**
 * The member's own data as a FHIR R4 Bundle (typed with Medplum's @medplum/fhirtypes), for a clinic system, a personal
 * health record or anything that imports FHIR. Member-initiated download only, own data, like the member PDF.
 *
 * What is in it: a Patient with no name, email, phone or birth date (only an opaque id), the ring as a Device, and one
 * Observation per day and measure. Standard LOINC codes where one fits exactly; otherwise a code from our own system
 * (Oura's HRV is RMSSD, for which LOINC has no code; the scores and the temperature deviation are Oura's own).
 * Pure: no database, no clock (the caller passes `generatedAt`).
 */

/** Windows the export offers: the data tab's 30/60/90 days and a year. */
export const FHIR_WINDOWS = [30, 60, 90, 365] as const;

export const OURA_CODE_SYSTEM = "https://oura-care-platform.vercel.app/fhir/CodeSystem/oura";
const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";
const CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category";

type Measure = {
  key: string;
  code: CodeableConcept;
  category: "vital-signs" | "activity";
  unit: string;
  ucum: string;
  pick: (m: DayMetric, x: DayExtras | undefined) => number | null | undefined;
  /** decimals kept in the export */
  digits: number;
};

const loinc = (code: string, display: string, text: string): CodeableConcept => ({ coding: [{ system: LOINC, code, display }], text });
const own = (code: string, display: string): CodeableConcept => ({ coding: [{ system: OURA_CODE_SYSTEM, code, display }], text: display });

export const MEASURES: Measure[] = [
  {
    key: "resting-hr",
    code: loinc("40443-4", "Heart rate --resting", "Lowest heart rate during sleep"),
    category: "vital-signs",
    unit: "/min",
    ucum: "/min",
    pick: (m) => m.lowestHeartRate,
    digits: 0,
  },
  {
    key: "sleep-hr",
    code: loinc("8867-4", "Heart rate", "Average heart rate during sleep"),
    category: "vital-signs",
    unit: "/min",
    ucum: "/min",
    pick: (m) => m.averageHeartRate,
    digits: 1,
  },
  {
    key: "hrv-rmssd",
    code: own("hrv-rmssd", "Heart rate variability, RMSSD, average during sleep"),
    category: "vital-signs",
    unit: "ms",
    ucum: "ms",
    pick: (m) => m.averageHrv,
    digits: 0,
  },
  {
    key: "resp-rate",
    code: loinc("9279-1", "Respiratory rate", "Breathing rate during sleep"),
    category: "vital-signs",
    unit: "/min",
    ucum: "/min",
    pick: (m) => m.averageBreath,
    digits: 1,
  },
  {
    key: "spo2",
    code: loinc("59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry", "Blood oxygen during sleep (average)"),
    category: "vital-signs",
    unit: "%",
    ucum: "%",
    pick: (_m, x) => x?.spo2Average,
    digits: 1,
  },
  {
    key: "temp-deviation",
    code: own("skin-temperature-deviation", "Skin temperature deviation from personal baseline"),
    category: "vital-signs",
    unit: "Cel",
    ucum: "Cel",
    pick: (m) => m.temperatureDeviation,
    digits: 2,
  },
  {
    key: "sleep-duration",
    code: loinc("93832-4", "Sleep duration", "Total sleep time"),
    category: "activity",
    unit: "h",
    ucum: "h",
    pick: (m) => m.totalSleepHours,
    digits: 2,
  },
  {
    key: "steps",
    code: loinc("41950-7", "Number of steps in 24 hour Measured", "Steps"),
    category: "activity",
    unit: "steps",
    ucum: "{steps}",
    pick: (m) => m.steps,
    digits: 0,
  },
  {
    key: "sleep-score",
    code: own("sleep-score", "Oura sleep score"),
    category: "activity",
    unit: "score",
    ucum: "{score}",
    pick: (m) => m.sleepScore,
    digits: 0,
  },
  {
    key: "readiness-score",
    code: own("readiness-score", "Oura readiness score"),
    category: "activity",
    unit: "score",
    ucum: "{score}",
    pick: (m) => m.readinessScore,
    digits: 0,
  },
];

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** An id that is stable for the member but says nothing about them (not the database id). */
export function opaquePatientId(memberId: string): string {
  return createHash("sha256").update(`fhir-patient:${memberId}`).digest("hex").slice(0, 32);
}

export function buildFhirBundle(input: {
  memberId: string;
  metrics: DayMetric[];
  extras: DayExtras[];
  generatedAt: Date;
  /** the site's FHIR base, e.g. https://example.org/fhir: full URLs are built on it so relative references resolve */
  baseUrl: string;
}): Bundle {
  const base = input.baseUrl.replace(/\/+$/, "");
  const patientId = opaquePatientId(input.memberId);
  const patient: Patient = {
    resourceType: "Patient",
    id: patientId,
    meta: { tag: [{ system: OURA_CODE_SYSTEM, code: "self-exported", display: "Exported by the person themselves" }] },
  };
  const device: Device = {
    resourceType: "Device",
    id: "oura-ring",
    manufacturer: "Oura Health",
    deviceName: [{ name: "Oura Ring", type: "user-friendly-name" }],
    patient: { reference: `Patient/${patientId}` },
  };
  const extrasByDay = new Map(input.extras.map((x) => [x.day, x]));
  const entries: BundleEntry[] = [
    { fullUrl: `${base}/Patient/${patientId}`, resource: patient },
    { fullUrl: `${base}/Device/oura-ring`, resource: device },
  ];

  for (const m of [...input.metrics].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    const x = extrasByDay.get(m.day);
    for (const measure of MEASURES) {
      const v = measure.pick(m, x);
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const value: Quantity = { value: round(v, measure.digits), unit: measure.unit, system: UCUM, code: measure.ucum };
      const obs: Observation = {
        resourceType: "Observation",
        id: `${measure.key}-${m.day}`,
        status: "final",
        category: [{ coding: [{ system: CATEGORY_SYSTEM, code: measure.category }] }],
        code: measure.code,
        subject: { reference: `Patient/${patientId}` },
        device: { reference: "Device/oura-ring" },
        // Oura files a night under the morning it ends; the day is that Oura day.
        effectiveDateTime: m.day,
        valueQuantity: value,
        note: [{ text: "Consumer wearable estimate (Oura Ring), not a medical measurement." }],
      };
      entries.push({ fullUrl: `${base}/Observation/${obs.id}`, resource: obs });
    }
  }

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: input.generatedAt.toISOString(),
    entry: entries,
  };
}
