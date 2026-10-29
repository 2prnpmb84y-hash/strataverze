import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { downloadObject } from "@/lib/storage/server-storage";
import { toStoragePath } from "@/lib/queries/document-url";
import { LIBRARY_CATEGORY_TO_RECORD_TYPE, VAULT_CAPTURED_FINANCIAL_TYPES } from "@/config/vault";
import { appendVaultEvent, captureFile, getTrialVault, type CaptureResult } from "./capture";
import { canonicalJson } from "./chain";
import { messageTermsFor } from "@/lib/jurisdiction/scheme-rules";

/**
 * What goes into a building's vault, and from where (server side):
 *   - the document library (each upload, and each document already there
 *     when the vault was opened);
 *   - StrataVerze's own documents: levy notices, remittance advices,
 *     committee and statutory packs (as the PDF StrataVerze made), and
 *     confirmed minutes and issued meeting notices (as the exact JSON
 *     StrataVerze holds for them).
 * Each source is captured once (by its sourceRef). Captures that fail are
 * logged and listed as not yet in the vault, so nothing is lost quietly.
 */

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || name;

/** Each kind's name; a levy notice in the building's word for a levy (`levy`). */
const financialTitles = (levy: string): Record<string, string> => ({
  LEVY_NOTICE: `${levy ? levy[0].toUpperCase() + levy.slice(1) : levy} notice`,
  REMITTANCE_ADVICE: "Remittance advice",
  COMMITTEE_PACK: "Committee report",
  STATUTORY_PACK: "Statutory statements",
});

/**
 * "Levy notice LN 1001 Lot 1", not "Levy notice: Levy notice LN 1001 Lot 1".
 * `levy` is the building's word for a levy (TERMINOLOGY.levy), as its notice
 * PDFs are named.
 */
export function financialTitle(documentType: string, fileName: string, levy: string = "levy"): string {
  const kind = financialTitles(levy)[documentType] ?? "Document";
  const name = titleFromFile(fileName);
  return name.toLowerCase().startsWith(kind.toLowerCase()) ? name : `${kind}: ${name}`;
}

/** Run a StrataVerze capture without ever failing the action that made the document. */
export async function captureQuietly(schemeId: string, sourceRef: string, run: () => Promise<CaptureResult | null>): Promise<CaptureResult | null> {
  try {
    return await run();
  } catch (err) {
    console.error("[vault] capture failed:", sourceRef, err instanceof Error ? err.message : "error");
    await recordSecurityEvent({
      action: "vault.capture_failed",
      outcome: "failed",
      schemeId,
      resourceType: "VaultSource",
      resourceId: sourceRef.slice(0, 200),
      reason: err instanceof Error ? err.message.slice(0, 300) : "capture failed",
    });
    return null;
  }
}

/** A PDF StrataVerze just generated. Called from storeGeneratedPdf. */
export async function captureGeneratedPdf(input: {
  schemeId: string;
  financialDocumentId: string;
  documentType: string;
  fileName: string;
  bytes: Uint8Array;
  actorId: string | null;
  documentDate?: string | null;
}): Promise<CaptureResult | null> {
  if (!(VAULT_CAPTURED_FINANCIAL_TYPES as readonly string[]).includes(input.documentType)) return null;
  const sourceRef = `FinancialDocument:${input.financialDocumentId}`;
  return captureQuietly(input.schemeId, sourceRef, async () => {
    if (!(await getTrialVault(input.schemeId))) return null;
    return captureFile({
      schemeId: input.schemeId,
      actorId: input.actorId,
      bytes: input.bytes,
      fileName: input.fileName,
      mimeType: "application/pdf",
      source: "STRATAVERZE",
      sourceRef,
      record: { recordType: input.documentType, title: financialTitle(input.documentType, input.fileName, (await messageTermsFor(input.schemeId)).levy) },
      details: { documentDate: input.documentDate ? String(input.documentDate).slice(0, 10) : null },
    });
  });
}

/** For hooks in actions that have already done their work: a capture problem must not fail them. */
async function neverThrow<T>(run: () => Promise<T | null>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    console.error("[vault] capture skipped:", err instanceof Error ? err.message : "error");
    return null;
  }
}

async function meetingOf(meetingId: string) {
  return db.orm.public.Meeting.where((m) => m.id.eq(meetingId)).first();
}

/** Confirmed minutes, as the exact content StrataVerze holds. */
export async function captureConfirmedMinutes(minutesId: string, actorId: string | null): Promise<CaptureResult | null> {
  return neverThrow(() => captureConfirmedMinutesInner(minutesId, actorId));
}
async function captureConfirmedMinutesInner(minutesId: string, actorId: string | null): Promise<CaptureResult | null> {
  const minutes = await db.orm.public.Minutes.where((m) => m.id.eq(minutesId)).first();
  if (!minutes || minutes.state !== "CONFIRMED") return null;
  const meeting = await meetingOf(minutes.meetingId);
  if (!meeting) return null;
  const sourceRef = `Minutes:${minutes.id}`;
  return captureQuietly(meeting.schemeId, sourceRef, async () => {
    if (!(await getTrialVault(meeting.schemeId))) return null;
    const body = canonicalJson({
      kind: "minutes",
      meeting: { id: meeting.id, title: meeting.title, meetingType: meeting.meetingType, scheduledAt: String(meeting.scheduledAt) },
      minutes: { id: minutes.id, version: minutes.version, state: minutes.state, confirmedAt: minutes.confirmedAt ? String(minutes.confirmedAt) : null, confirmedById: minutes.confirmedById ?? null, content: minutes.content },
    });
    return captureFile({
      schemeId: meeting.schemeId,
      actorId,
      bytes: new TextEncoder().encode(body),
      fileName: `Minutes-${meeting.title}-v${minutes.version}.json`.replace(/[^A-Za-z0-9._-]+/g, "-"),
      mimeType: "application/json",
      source: "STRATAVERZE",
      sourceRef,
      record: { recordType: "MINUTES", title: `Minutes: ${meeting.title} (version ${minutes.version}, confirmed)` },
      details: { meetingId: meeting.id },
    });
  });
}

/** An issued meeting notice, as the exact content StrataVerze holds. */
export async function captureMeetingNotice(noticeId: string, actorId: string | null): Promise<CaptureResult | null> {
  return neverThrow(() => captureMeetingNoticeInner(noticeId, actorId));
}
async function captureMeetingNoticeInner(noticeId: string, actorId: string | null): Promise<CaptureResult | null> {
  const notice = await db.orm.public.Notice.where((n) => n.id.eq(noticeId)).first();
  if (!notice) return null;
  const meeting = await meetingOf(notice.meetingId);
  if (!meeting) return null;
  const sourceRef = `Notice:${notice.id}`;
  return captureQuietly(meeting.schemeId, sourceRef, async () => {
    if (!(await getTrialVault(meeting.schemeId))) return null;
    const body = canonicalJson({
      kind: "meeting_notice",
      meeting: { id: meeting.id, title: meeting.title, meetingType: meeting.meetingType, scheduledAt: String(meeting.scheduledAt) },
      notice: {
        id: notice.id,
        version: notice.version,
        status: notice.status,
        issuedAt: String(notice.issuedAt),
        issuedById: notice.issuedById ?? null,
        noticePeriodDays: notice.noticePeriodDays ?? null,
        compliant: notice.compliant,
        // Not compliant with no period: its notice period was not checked (decision D12; VIC, ACT and WA stage 2,
        // PR 8b-iii, a Victorian committee or Western Australian council meeting). Never set for NSW or Queensland,
        // whose notices with no period were always recorded as compliant, so their vault copies are unchanged.
        ...(!notice.compliant && notice.noticePeriodDays == null ? { periodNotChecked: true } : {}),
        content: notice.content,
      },
    });
    return captureFile({
      schemeId: meeting.schemeId,
      actorId,
      bytes: new TextEncoder().encode(body),
      fileName: `Notice-${meeting.title}-v${notice.version}.json`.replace(/[^A-Za-z0-9._-]+/g, "-"),
      mimeType: "application/json",
      source: "STRATAVERZE",
      sourceRef,
      record: { recordType: "MEETING_NOTICE", title: `Meeting notice: ${meeting.title} (version ${notice.version})` },
      details: { meetingId: meeting.id },
    });
  });
}

/**
 * A document in the library. Its date, if it has one, is the date the
 * uploader entered, kept as reported. Throws on failure (the person is
 * there to see it); callers decide whether to fail their own action.
 */
export async function captureLibraryDocument(schemeId: string, documentId: string, actorId: string | null, opts: { addedBeforeVault?: boolean } = {}) {
  const doc = await db.orm.public.Document.where((d) => and(d.id.eq(documentId), d.schemeId.eq(schemeId))).first();
  if (!doc) return null;
  const path = toStoragePath(doc.fileUrl);
  if (!path || !path.startsWith(`schemes/${schemeId}/`)) throw new Error("This document's file is not in the building's folder.");
  const bytes = await downloadObject(path);
  if (!bytes) throw new Error("This document's file could not be read from storage.");
  return captureFile({
    schemeId,
    actorId,
    bytes,
    fileName: doc.fileName,
    mimeType: doc.mimeType || "application/octet-stream",
    source: "UPLOAD",
    sourceRef: `Document:${doc.id}`,
    record: {
      recordType: LIBRARY_CATEGORY_TO_RECORD_TYPE[doc.category] ?? "OTHER",
      title: doc.title,
      reportedDate: doc.documentDate ? String(doc.documentDate).slice(0, 10) : null,
      reportedBy: doc.documentDate ? "the person who added it to the library" : null,
    },
    details: {
      documentId: doc.id,
      category: doc.category,
      visibility: doc.visibility,
      uploadedBy: doc.uploadedBy,
      libraryAddedAt: String(doc.createdAt),
      ...(opts.addedBeforeVault ? { addedBeforeVault: true } : {}),
    },
  });
}

/** A change to a library document that is in the vault: logged, never applied to the original. */
export async function logLibraryChange(schemeId: string, documentId: string, actorId: string, change: "metadata_changed" | "removed" | "new_file", details: Record<string, unknown>) {
  // Never fails the library change itself; a failure is logged.
  try {
    if (!(await getTrialVault(schemeId))) return;
    // Only the document's own record: a document that is a second copy of
    // another's file must not log against that other record.
    const own = await db.orm.public.VaultRecord.where((r) => and(r.schemeId.eq(schemeId), r.sourceRef.eq(`Document:${documentId}`))).first();
    if (!own) return;
    const found = { recordId: own.id };
    await appendVaultEvent({ schemeId, eventType: `library.${change}`, actorId, recordId: found.recordId, details: { documentId, ...details } });
  } catch (err) {
    console.error("[vault] could not log a library change:", err instanceof Error ? err.message : "error");
    await recordSecurityEvent({
      action: "vault.capture_failed",
      outcome: "failed",
      actorProfileId: actorId,
      schemeId,
      resourceType: "VaultSource",
      resourceId: `Document:${documentId}`,
      reason: `library ${change} not logged in the vault`,
    });
  }
}

/** Sources that should be in the vault but are not yet: for the "bring them in" step. */
export async function pendingSources(schemeId: string): Promise<Array<{ sourceRef: string; title: string; kind: "library" | "financial" | "minutes" | "notice"; id: string }>> {
  const [docs, fin, meetings, records, receipts] = await Promise.all([
    db.orm.public.Document.where((d) => and(d.schemeId.eq(schemeId), d.deletedAt.eq(null))).all(),
    db.orm.public.FinancialDocument.where((d) => and(d.schemeId.eq(schemeId), d.documentType.in([...VAULT_CAPTURED_FINANCIAL_TYPES]))).all(),
    db.orm.public.Meeting.where((m) => m.schemeId.eq(schemeId)).all(),
    db.orm.public.VaultRecord.where((r) => r.schemeId.eq(schemeId)).all(),
    db.orm.public.VaultReceipt.where((r) => r.schemeId.eq(schemeId)).all(),
  ]);
  const done = new Set<string>([...records.map((r) => r.sourceRef), ...receipts.map((r) => r.sourceRef)].filter((s): s is string => !!s));
  // Only documents StrataVerze generated (their bytes are held); a levy
  // notice an adviser uploaded is not one StrataVerze issued.
  const finIds = fin.map((d) => d.id);
  const generated = new Set(
    finIds.length ? (await db.orm.public.FinancialDocumentFile.where((f) => f.financialDocumentId.in(finIds)).select("financialDocumentId").all()).map((f) => f.financialDocumentId) : [],
  );
  const meetingIds = meetings.map((m) => m.id);
  const titleOf = new Map(meetings.map((m) => [m.id, m.title]));
  const [minutes, notices] = meetingIds.length
    ? await Promise.all([
        db.orm.public.Minutes.where((m) => and(m.meetingId.in(meetingIds), m.state.eq("CONFIRMED"))).all(),
        db.orm.public.Notice.where((n) => n.meetingId.in(meetingIds)).all(),
      ])
    : [[], []];
  const levy = (await messageTermsFor(schemeId)).levy;
  const out: Array<{ sourceRef: string; title: string; kind: "library" | "financial" | "minutes" | "notice"; id: string }> = [];
  for (const d of docs) if (!done.has(`Document:${d.id}`)) out.push({ sourceRef: `Document:${d.id}`, title: d.title, kind: "library", id: d.id });
  for (const d of fin) if (generated.has(d.id) && !done.has(`FinancialDocument:${d.id}`)) out.push({ sourceRef: `FinancialDocument:${d.id}`, title: financialTitle(d.documentType, d.fileName, levy), kind: "financial", id: d.id });
  for (const m of minutes) if (!done.has(`Minutes:${m.id}`)) out.push({ sourceRef: `Minutes:${m.id}`, title: `Minutes: ${titleOf.get(m.meetingId) ?? "meeting"} (version ${m.version})`, kind: "minutes", id: m.id });
  for (const n of notices) if (!done.has(`Notice:${n.id}`)) out.push({ sourceRef: `Notice:${n.id}`, title: `Meeting notice: ${titleOf.get(n.meetingId) ?? "meeting"} (version ${n.version})`, kind: "notice", id: n.id });
  return out;
}
