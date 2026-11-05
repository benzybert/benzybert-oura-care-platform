"use server";

import { and, count, eq, isNull, or, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { MAX_LAB_REPORTS, parseLabReportForm } from "@/lib/biomarkers";
import { MAX_CUSTOM_VIEWS, parseCustomViewForm } from "@/lib/custom-views";
import { todayInIsrael } from "@/lib/dates";
import { parseLabText, type LabPdfDraft } from "@/lib/lab-pdf";
import { MAX_MEDICATIONS, parseMedicationForm } from "@/lib/medications";
import { pdfTextLines } from "@/lib/pdf-text";
import { getMemberForUser } from "@/lib/queries";
import { getOwnCustomView, getOwnLabReport, getOwnMedication } from "@/lib/records-data";
import { requireRole } from "@/lib/session";

/**
 * The member's own health records and custom views. Every action re-checks the role and that the row belongs to
 * the signed-in member; another member's id behaves like a missing one. Own data on the member's own pages: no
 * consent scope and no audit entry (like experiments and self-rewards). Nothing typed here goes in a URL or a log.
 */

const { medications, labReports, labResults, customViews } = schema;

async function currentMember() {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  return member;
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

const idOf = (fd: FormData, k = "id"): string | null => {
  const r = z.uuid().safeParse(fd.get(k));
  return r.success ? r.data : null;
};

function done(path: string) {
  revalidatePath("/member", "layout");
  redirect(path);
}

// ── Medications & supplements ───────────────────────────────────────────────────────────────

/** Adds an entry, or saves an existing one when the form carries its id. */
export async function saveMedication(formData: FormData): Promise<void> {
  const member = await currentMember();
  const db = getDb();
  const id = idOf(formData);
  const parsed = parseMedicationForm(
    {
      kind: str(formData, "kind"),
      name: str(formData, "name"),
      dose: str(formData, "dose"),
      times: formData.getAll("times"),
      reason: str(formData, "reason"),
      startedOn: str(formData, "startedOn"),
      stoppedOn: str(formData, "stoppedOn"),
      note: str(formData, "note"),
    },
    todayInIsrael(),
  );
  const back = id ? `/member/medications?edit=${id}&` : "/member/medications?";
  if (!parsed.ok) redirect(`${back}med=${parsed.error === "dates" ? "dates" : "invalid"}#form`);

  if (id) {
    const row = await getOwnMedication(db, member.id, id);
    if (!row) redirect("/member/medications?med=gone");
    await db
      .update(medications)
      .set({ ...parsed.value, updatedAt: new Date() })
      .where(and(eq(medications.id, row.id), eq(medications.memberId, member.id)));
  } else {
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(medications).where(eq(medications.memberId, member.id));
    if (n >= MAX_MEDICATIONS) redirect("/member/medications?med=limit");
    await db.insert(medications).values({ memberId: member.id, ...parsed.value });
  }
  done("/member/medications?med=saved");
}

/** "Stopped today": sets the stop day on an entry that is still taken. */
export async function stopMedication(formData: FormData): Promise<void> {
  const member = await currentMember();
  const id = idOf(formData);
  const today = todayInIsrael();
  if (id) {
    await getDb()
      .update(medications)
      .set({ stoppedOn: today, updatedAt: new Date() })
      .where(
        and(
          eq(medications.id, id),
          eq(medications.memberId, member.id),
          or(isNull(medications.stoppedOn), gt(medications.stoppedOn, today)),
        ),
      );
  }
  done("/member/medications?med=stopped");
}

/** Deleted, not hidden: it is the member's data. */
export async function deleteMedication(formData: FormData): Promise<void> {
  const member = await currentMember();
  const id = idOf(formData);
  if (id) await getDb().delete(medications).where(and(eq(medications.id, id), eq(medications.memberId, member.id)));
  done("/member/medications?med=deleted");
}

// ── Lab results ─────────────────────────────────────────────────────────────────────────────

/** One lab report with its results, written together or not at all. */
export async function createLabReport(formData: FormData): Promise<void> {
  const member = await currentMember();
  const fields: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") fields[k] = v;
  const parsed = parseLabReportForm(fields, todayInIsrael());
  if (!parsed.ok) redirect(`/member/labs?lab=${parsed.error}#add`);

  const db = getDb();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(labReports).where(eq(labReports.memberId, member.id));
  if (n >= MAX_LAB_REPORTS) redirect("/member/labs?lab=limit");

  const { results, ...report } = parsed.value;
  const reportId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(labReports).values({ memberId: member.id, ...report }).returning({ id: labReports.id });
    if (!created) throw new Error("lab report not created");
    await tx.insert(labResults).values(results.map((r) => ({ ...r, reportId: created.id, memberId: member.id })));
    return created.id;
  });
  done(`/member/labs/${reportId}?lab=saved`);
}

export type LabPdfState =
  | { status: "idle" }
  | { status: "error"; error: "missing" | "not_pdf" | "too_big" | "too_many_pages" | "unreadable" | "scanned"; at: number }
  | { status: "ok"; draft: LabPdfDraft; at: number };

/**
 * Reads an uploaded lab report PDF into a draft (used with useActionState). Nothing is stored: not the file, not the
 * text, not the draft. The draft goes back to the member's own browser in the action's response, is shown in the
 * review form, and only "save" (createLabReport) writes anything. Nothing about the file is logged.
 */
export async function readLabPdf(_prev: LabPdfState, formData: FormData): Promise<LabPdfState> {
  await currentMember();
  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) return { status: "error", error: "missing", at: Date.now() };
  const text = await pdfTextLines(new Uint8Array(await file.arrayBuffer()));
  if (!text.ok) return { status: "error", error: text.error, at: Date.now() };
  if (text.lines.join("").replace(/\s/g, "").length < 20) return { status: "error", error: "scanned", at: Date.now() };
  return { status: "ok", draft: parseLabText(text.lines, todayInIsrael()), at: Date.now() };
}

export async function deleteLabReport(formData: FormData): Promise<void> {
  const member = await currentMember();
  const id = idOf(formData);
  if (id) await getDb().delete(labReports).where(and(eq(labReports.id, id), eq(labReports.memberId, member.id)));
  done("/member/labs?lab=deleted");
}

/** One mistyped value out of a report; the report stays. */
export async function deleteLabResult(formData: FormData): Promise<void> {
  const member = await currentMember();
  const db = getDb();
  const reportId = idOf(formData, "reportId");
  const resultId = idOf(formData, "resultId");
  const report = reportId ? await getOwnLabReport(db, member.id, reportId) : null;
  if (!report || !resultId) redirect("/member/labs?lab=gone");
  await db
    .delete(labResults)
    .where(and(eq(labResults.id, resultId), eq(labResults.reportId, report.id), eq(labResults.memberId, member.id)));
  done(`/member/labs/${report.id}?lab=result_deleted`);
}

// ── Custom views ────────────────────────────────────────────────────────────────────────────

export async function saveCustomView(formData: FormData): Promise<void> {
  const member = await currentMember();
  const db = getDb();
  const id = idOf(formData);
  const positions: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith("pos_")) positions[k.slice(4)] = v;
  const parsed = parseCustomViewForm({ name: str(formData, "name"), widgets: formData.getAll("w"), days: str(formData, "days"), positions });
  if (!parsed.ok) redirect(`${id ? `/member/views/${id}?edit=1&` : "/member/views/new?"}cv=${parsed.error}`);

  if (id) {
    const row = await getOwnCustomView(db, member.id, id);
    if (!row) redirect("/member?cv=gone");
    await db
      .update(customViews)
      .set({ ...parsed.value, updatedAt: new Date() })
      .where(and(eq(customViews.id, row.id), eq(customViews.memberId, member.id)));
    done(`/member/views/${row.id}?cv=saved`);
  }

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(customViews).where(eq(customViews.memberId, member.id));
  if (n >= MAX_CUSTOM_VIEWS) redirect("/member/views/new?cv=limit");
  const [created] = await db.insert(customViews).values({ memberId: member.id, ...parsed.value }).returning({ id: customViews.id });
  done(`/member/views/${created?.id}?cv=saved`);
}

export async function deleteCustomView(formData: FormData): Promise<void> {
  const member = await currentMember();
  const id = idOf(formData);
  if (id) await getDb().delete(customViews).where(and(eq(customViews.id, id), eq(customViews.memberId, member.id)));
  done("/member?cv=deleted");
}
