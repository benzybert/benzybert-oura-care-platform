/**
 * Queries for the member's own health records (medications, lab reports and results) and custom views. Every
 * function takes the member's id and filters by it: these tables are member-only, and no staff, org, doctor-link,
 * family or aggregate code reads them.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db";
import type { DatedResult } from "./biomarkers";

const { medications, labReports, labResults, customViews } = schema;

export type MedicationRow = typeof medications.$inferSelect;
export type LabReportRow = typeof labReports.$inferSelect;
export type CustomViewRow = typeof customViews.$inferSelect;

export function getMedications(db: Db, memberId: string): Promise<MedicationRow[]> {
  return db.select().from(medications).where(eq(medications.memberId, memberId)).orderBy(asc(medications.name));
}

export async function getOwnMedication(db: Db, memberId: string, id: string): Promise<MedicationRow | null> {
  const [row] = await db
    .select()
    .from(medications)
    .where(and(eq(medications.id, id), eq(medications.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

export function getLabReports(db: Db, memberId: string): Promise<LabReportRow[]> {
  return db.select().from(labReports).where(eq(labReports.memberId, memberId)).orderBy(desc(labReports.takenOn), desc(labReports.createdAt));
}

export async function getOwnLabReport(db: Db, memberId: string, id: string): Promise<LabReportRow | null> {
  const [row] = await db
    .select()
    .from(labReports)
    .where(and(eq(labReports.id, id), eq(labReports.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

/** Every result of the member with its report's date: the input of biomarkerSeries. */
export function getLabResults(db: Db, memberId: string): Promise<DatedResult[]> {
  return db
    .select({
      id: labResults.id,
      reportId: labResults.reportId,
      takenOn: labReports.takenOn,
      biomarker: labResults.biomarker,
      name: labResults.name,
      value: labResults.value,
      unit: labResults.unit,
      refLow: labResults.refLow,
      refHigh: labResults.refHigh,
    })
    .from(labResults)
    .innerJoin(labReports, eq(labReports.id, labResults.reportId))
    .where(and(eq(labResults.memberId, memberId), eq(labReports.memberId, memberId)))
    .orderBy(asc(labReports.takenOn), asc(labResults.createdAt));
}

export function getCustomViews(db: Db, memberId: string): Promise<CustomViewRow[]> {
  return db.select().from(customViews).where(eq(customViews.memberId, memberId)).orderBy(asc(customViews.createdAt));
}

export async function getOwnCustomView(db: Db, memberId: string, id: string): Promise<CustomViewRow | null> {
  const [row] = await db
    .select()
    .from(customViews)
    .where(and(eq(customViews.id, id), eq(customViews.memberId, memberId)))
    .limit(1);
  return row ?? null;
}
