/**
 * Certificates (NSW s 184, the Queensland body corporate certificate) and
 * records inspections, server side. A certificate is drafted from
 * StrataVerze's records, completed by the adviser, then issued: from then on
 * its items and date are fixed and its fee (from the rule pack) is recorded.
 * Fees are collected outside StrataVerze; the date paid is recorded here.
 * An issued certificate also keeps what its PDF reads (issued_content).
 * Who may ask, the fees and the deadlines come from the building's pack
 * (`rules.CERTIFICATE`, `rules.INSPECTIONS`, stage 2, step 9).
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeTimeZone, schemeToday } from "@/lib/jurisdiction/scheme-time";
import { localToInstant } from "@/lib/jurisdiction/time-zone";
import { certificateDrafting, draftCertificateItems, type CertificateItem } from "./certificate-draft";
import { certificateDocument, certificateFileStem, keepCertificate } from "./issued-certificate";
import { PdfFontsUnavailableError } from "@/lib/pdf/document";
import { accessFee, certificateFeeFor, inspectionDeadlines, inspectionFee, type CertificateRule, type InspectionRule, type InspectorType } from "./fees";
import { needRule, type StatutoryRules } from "@/config/statutory";

export class RecordsError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "RecordsError";
  }
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The building's certificate rules, or RecordsError when its pack has no certificate. */
function certificateRules(rules: StatutoryRules): CertificateRule {
  if (!rules.FEATURES.strataInformationCertificate && !rules.FEATURES.bodyCorporateCertificate) throw new RecordsError("This is not available for this building.");
  return needRule(rules, "CERTIFICATE");
}

function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")} ${String((err as { code?: unknown }).code ?? "")}` : String(err);
  return /23505|unique|duplicate key/i.test(text);
}

export interface RequesterInput {
  requestedOn: string;
  requesterType: string;
  requesterName: string;
  requesterAddress: string;
  authorisedByType: string | null;
  authorisedByName: string | null;
  authorisedByAddress: string | null;
}

/** Who may ask for the building's certificate, and the type who acts for one of the others. */
function requesterProblems(r: RequesterInput, today: string, c: Pick<CertificateRule, "requesterTypes" | "agentType">) {
  const e: Record<string, string> = {};
  const requesters = Object.keys(c.requesterTypes);
  const authorisers = requesters.filter((t) => t !== c.agentType);
  if (!ISO.test(r.requestedOn) || r.requestedOn > today) e.requestedOn = "Enter the date the request was received (not in the future).";
  if (!requesters.includes(r.requesterType)) e.requesterType = "Choose who is asking.";
  if (!r.requesterName.trim()) e.requesterName = "Enter their name.";
  if (!r.requesterAddress.trim()) e.requesterAddress = "Enter their address.";
  if (r.requesterType === c.agentType) {
    if (!r.authorisedByType || !authorisers.includes(r.authorisedByType)) e.authorisedByType = "Choose who authorised them.";
    if (!(r.authorisedByName ?? "").trim()) e.authorisedByName = "Enter the name of the person who authorised them.";
    if (!(r.authorisedByAddress ?? "").trim()) e.authorisedByAddress = "Enter that person's address.";
  }
  return e;
}

/** Start a certificate for a lot, drafted from StrataVerze's records. */
export async function createCertificate(input: { schemeId: string; lotId: string; requester: RequesterInput; actorId: string }) {
  const [lot, today, { rules, label }] = await Promise.all([
    db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(),
    schemeToday(input.schemeId),
    rulesForScheme(input.schemeId),
  ]);
  if (!lot || lot.schemeId !== input.schemeId) throw new RecordsError("Lot not found.");
  const c = certificateRules(rules);
  const e = requesterProblems(input.requester, today, c);
  if (Object.keys(e).length) throw new RecordsError("Check the request details.", e);
  const items = await draftCertificateItems(input.schemeId, input.lotId);
  const r = input.requester;
  const authorised = r.requesterType === c.agentType;
  // The next number for the scheme; a clash with a certificate started at the same moment is tried again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.orm.public.SaleCertificate.where((c) => c.schemeId.eq(input.schemeId)).orderBy((c) => c.number.desc()).first();
    try {
      const created = await db.orm.public.SaleCertificate.create({
        schemeId: input.schemeId,
        lotId: input.lotId,
        number: (last?.number ?? 0) + 1,
        status: "DRAFT",
        requestedOn: r.requestedOn,
        requesterType: r.requesterType,
        requesterName: r.requesterName.trim(),
        requesterAddress: r.requesterAddress.trim(),
        authorisedByType: authorised ? r.authorisedByType : null,
        authorisedByName: authorised ? (r.authorisedByName ?? "").trim() : null,
        authorisedByAddress: authorised ? (r.authorisedByAddress ?? "").trim() : null,
        items: items as unknown as never,
        draftedOn: today,
        rulePack: label,
        createdBy: input.actorId,
      });
      return { id: (created as { id: string }).id };
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }
  throw new RecordsError("Could not number the certificate. Try again.");
}

async function draftOf(schemeId: string, certificateId: string) {
  const c = await db.orm.public.SaleCertificate.where((x) => x.id.eq(certificateId)).first();
  if (!c || c.schemeId !== schemeId) throw new RecordsError("Certificate not found.");
  return c;
}

/** Save the adviser's changes to a draft: the request details and each item's text. */
export async function saveCertificateDraft(input: { schemeId: string; certificateId: string; requester: RequesterInput; itemTexts: Record<string, string> }) {
  const [c, today, { rules }] = await Promise.all([draftOf(input.schemeId, input.certificateId), schemeToday(input.schemeId), rulesForScheme(input.schemeId)]);
  const certificate = certificateRules(rules);
  const e = requesterProblems(input.requester, today, certificate);
  const items = (c.items as unknown as CertificateItem[]).map((i) => ({ ...i, text: (input.itemTexts[i.no] ?? i.text).trim() }));
  for (const i of items) if (!i.text) e[`item_${i.no}`] = "Complete this item (write “Nil” if it does not apply).";
  if (Object.keys(e).length) throw new RecordsError("Check the certificate.", e);
  const r = input.requester;
  const authorised = r.requesterType === certificate.agentType;
  const n = await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(c.id), x.status.eq("DRAFT"))).updateAndCount({
    requestedOn: r.requestedOn,
    requesterType: r.requesterType,
    requesterName: r.requesterName.trim(),
    requesterAddress: r.requesterAddress.trim(),
    authorisedByType: authorised ? r.authorisedByType : null,
    authorisedByName: authorised ? (r.authorisedByName ?? "").trim() : null,
    authorisedByAddress: authorised ? (r.authorisedByAddress ?? "").trim() : null,
    items: items as unknown as never,
  });
  if (n !== 1) throw new RecordsError("Only a draft can be changed.");
}

/**
 * Take the figures again from StrataVerze's records (levies, interest,
 * arrears, meetings, by-laws, insurance) as at today. The items the adviser
 * completes are kept.
 */
export async function refreshCertificateFigures(input: { schemeId: string; certificateId: string }) {
  const [c, today, { rules }] = await Promise.all([draftOf(input.schemeId, input.certificateId), schemeToday(input.schemeId), rulesForScheme(input.schemeId)]);
  if (c.status !== "DRAFT") throw new RecordsError("Only a draft can be refreshed.");
  const fresh = await draftCertificateItems(input.schemeId, c.lotId);
  const figures = new Set<string>(certificateDrafting(rules).figureItems);
  const items = (c.items as unknown as CertificateItem[]).map((i) => (figures.has(i.no) ? fresh.find((f) => f.no === i.no) ?? i : i));
  const n = await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(c.id), x.status.eq("DRAFT"))).updateAndCount({ items: items as unknown as never, draftedOn: today });
  if (n !== 1) throw new RecordsError("Only a draft can be refreshed.");
}

/** Refuse items that still ask the adviser to check and complete them. */
function mustBeChecked(items: unknown) {
  const unchecked = (items as CertificateItem[]).filter((i) => /check and complete/i.test(i.text));
  if (unchecked.length) {
    throw new RecordsError(`Items ${unchecked.map((i) => i.no).join(", ")} still say “check and complete”. Complete them first.`);
  }
}

/**
 * Issue a draft: its date is today, its items are fixed, and its fee is
 * recorded (the repeat fee when another certificate for the lot was issued
 * within the repeat period). The figures must have been taken today, so
 * they are as at the certificate's date. What its PDF reads (the pack's
 * wording, the building's details, the items and the date) is kept with it
 * in the same transaction (issued_content), with its layout and the SHA-256
 * of its PDF, so it reads the same ever after. The draft is checked again as
 * held in the transaction: a save made since the first check is what is
 * issued, kept and charged for, or refused.
 */
export async function issueCertificate(input: { schemeId: string; certificateId: string; actorId: string; checkedAll: boolean }) {
  if (!input.checkedAll) throw new RecordsError("Confirm you have checked every item.", { checkedAll: "Confirm you have checked and completed every item." });
  const [c, today, { rules, label }] = await Promise.all([draftOf(input.schemeId, input.certificateId), schemeToday(input.schemeId), rulesForScheme(input.schemeId)]);
  const certificate = certificateRules(rules);
  if (c.status !== "DRAFT") throw new RecordsError("This certificate has already been issued or cancelled.");
  if (day(c.draftedOn) < today) {
    throw new RecordsError(`The figures were taken from the records on ${day(c.draftedOn)}. Refresh them from the records, check them, then issue.`);
  }
  mustBeChecked(c.items);
  let fee = { cents: 0, repeat: false };
  await db.transaction(async (tx) => {
    // Hold the lot's row until this commits, so two certificates for the lot issued at once see each other (repeat fee).
    const lot = await tx.orm.public.Lot.where((l) => l.id.eq(c.lotId)).forNoKeyUpdate().first();
    if (!lot) throw new RecordsError("Lot not found.");
    // Hold the certificate too, and check it again as held: what is kept, and the fee, are those of the draft as issued.
    // A save of the draft waits, then finds it issued.
    const held = await tx.orm.public.SaleCertificate.where((x) => x.id.eq(c.id)).forNoKeyUpdate().first();
    if (!held || held.status !== "DRAFT") throw new RecordsError("This certificate has just been issued or cancelled. Reload the page.");
    if (day(held.draftedOn) < today) {
      throw new RecordsError(`The figures were taken from the records on ${day(held.draftedOn)}. Refresh them from the records, check them, then issue.`);
    }
    mustBeChecked(held.items);
    const earlier = await tx.orm.public.SaleCertificate.where((x) => and(x.lotId.eq(c.lotId), x.status.eq("ISSUED"))).limit(500).all();
    // The dollar amounts are those for the year the written request was received (Queensland; NSW fees are fixed).
    const due = certificateFeeFor(certificate.fee, today, earlier.map((x) => ({ issuedOn: day(x.certificateDate), requesterName: String(x.requesterName ?? "") })), String(held.requesterName ?? ""), day(held.requestedOn));
    if (!due) throw new RecordsError(`StrataVerze does not hold the fee for a request received on ${day(held.requestedOn)} yet. Ask StrataVerze to add that financial year's fees, then issue.`);
    fee = due;
    // What the certificate reads today (the pack's wording, the building's details, its items and date), kept with it,
    // with the SHA-256 of its PDF drawn from that, in its own fonts.
    const scheme = await tx.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first();
    let issuedContent;
    try {
      issuedContent = await keepCertificate(certificateDocument({ cert: { ...held, status: "ISSUED", certificateDate: today }, rules, scheme, lot, today }), { source: "ISSUE", rulePack: label, fileStem: certificateFileStem(rules) });
    } catch (err) {
      if (err instanceof PdfFontsUnavailableError) throw new RecordsError("The certificate cannot be issued now: StrataVerze cannot produce its PDF in its fonts. Nothing was changed. Try again later.");
      throw err;
    }
    const n = await tx.orm.public.SaleCertificate.where((x) => and(x.id.eq(c.id), x.status.eq("DRAFT"))).updateAndCount({
      status: "ISSUED",
      certificateDate: today,
      feeCents: fee.cents,
      feeRepeat: fee.repeat,
      rulePack: label,
      issuedBy: input.actorId,
      issuedContent: issuedContent as unknown as never,
    });
    if (n !== 1) throw new RecordsError("This certificate has just been issued or cancelled. Reload the page.");
  });
  return fee;
}

/** Cancel a draft (an issued certificate stays as issued). */
export async function cancelCertificateDraft(input: { schemeId: string; certificateId: string }) {
  const c = await draftOf(input.schemeId, input.certificateId);
  const n = await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(c.id), x.status.eq("DRAFT"))).updateAndCount({ status: "CANCELLED" });
  if (n !== 1) throw new RecordsError("Only a draft can be cancelled.");
}

/** Record the date a certificate's or inspection's fee was paid (collected outside StrataVerze). */
export async function recordFeePaid(input: { schemeId: string; kind: "certificate" | "inspection"; id: string; paidOn: string }) {
  const today = await schemeToday(input.schemeId);
  if (!ISO.test(input.paidOn) || input.paidOn > today) throw new RecordsError("Enter the date it was paid.", { paidOn: "Enter a date up to today." });
  // Recorded once; not before the request was received.
  const n =
    input.kind === "certificate"
      ? await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(input.id), x.schemeId.eq(input.schemeId), x.status.eq("ISSUED"), x.feePaidOn.isNull(), x.requestedOn.lte(input.paidOn))).updateAndCount({ feePaidOn: input.paidOn })
      : await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(input.id), x.schemeId.eq(input.schemeId), x.status.eq("COMPLETED"), x.feePaidOn.isNull(), x.requestedOn.lte(input.paidOn))).updateAndCount({ feePaidOn: input.paidOn });
  if (n !== 1) throw new RecordsError("Not recorded: no fee is due yet, it is already recorded as paid, or the date is before the request.", { paidOn: "Check the date." });
}

// ─── Records inspections ────────────────────────────────────────────

/** The building's inspection rules, or RecordsError when its pack has no inspections. */
function inspectionRules(rules: StatutoryRules): InspectionRule {
  if (!rules.FEATURES.recordsInspections) throw new RecordsError("This is not available for this building.");
  return needRule(rules, "INSPECTIONS");
}

export async function createInspection(input: { schemeId: string; lotId: string; inspectorType: string; inspectorName: string; authorisedBy: string | null; requestedOn: string; notes: string | null; actorId: string }) {
  const [lot, today, { rules }] = await Promise.all([db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(), schemeToday(input.schemeId), rulesForScheme(input.schemeId)]);
  const r = inspectionRules(rules);
  const hourly = r.basis === "HOURLY";
  const agent = input.inspectorType === r.agentType;
  const e: Record<string, string> = {};
  if (!lot || lot.schemeId !== input.schemeId) e.lotId = hourly ? "Choose the lot whose owner is inspecting or authorised it." : "Choose the lot the request is about.";
  if (!Object.keys(r.requesterTypes).includes(input.inspectorType)) e.inspectorType = hourly ? "Choose the owner or a person they authorised." : "Choose who is asking.";
  if (!input.inspectorName.trim()) e.inspectorName = hourly ? "Enter the name of the person inspecting." : "Enter the name of the person asking.";
  if (agent && !(input.authorisedBy ?? "").trim()) e.authorisedBy = hourly ? "Enter the owner who authorised it." : "Enter who they act for.";
  if (!ISO.test(input.requestedOn) || input.requestedOn > today) e.requestedOn = "Enter the date of the request (not in the future).";
  if (Object.keys(e).length) throw new RecordsError("Check the request.", e);
  await db.orm.public.RecordsInspection.create({
    schemeId: input.schemeId,
    lotId: input.lotId,
    inspectorType: input.inspectorType,
    inspectorName: input.inspectorName.trim(),
    authorisedBy: agent ? (input.authorisedBy ?? "").trim() : null,
    requestedOn: input.requestedOn,
    status: "REQUESTED",
    notes: input.notes?.trim() || null,
    createdBy: input.actorId,
  });
}

async function inspectionOf(schemeId: string, id: string) {
  const r = await db.orm.public.RecordsInspection.where((x) => x.id.eq(id)).first();
  if (!r || r.schemeId !== schemeId) throw new RecordsError("Inspection not found.");
  return r;
}

/** Record the agreed time and place, or (NSW) the one the owners corporation set by written notice. */
export async function scheduleInspection(input: { schemeId: string; id: string; when: string; place: string; setByNotice: boolean }) {
  const [r, tz, { rules }] = await Promise.all([inspectionOf(input.schemeId, input.id), schemeTimeZone(input.schemeId), rulesForScheme(input.schemeId)]);
  const inspection = inspectionRules(rules);
  // Only the NSW rules let the body set the time by notice.
  const setByNotice = inspection.basis === "HOURLY" && input.setByNotice;
  const at = localToInstant(tz, input.when);
  const e: Record<string, string> = {};
  if (!at) e.when = "Enter the date and time.";
  else {
    const on = input.when.slice(0, 10);
    if (on < day(r.requestedOn)) e.when = "The inspection cannot be before the request.";
    else if (inspection.basis === "HOURLY" && setByNotice) {
      const { setBy } = inspectionDeadlines(day(r.requestedOn), inspection);
      if (on > setBy) e.when = `A date set by notice must be within ${inspection.setWithinDays} days of the request (by ${setBy}).`;
    }
  }
  if (!input.place.trim()) e.place = "Enter the place (or how it will be given electronically).";
  if (Object.keys(e).length) throw new RecordsError("Check the time and place.", e);
  const n = await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(r.id), x.status.in(["REQUESTED", "SCHEDULED"]))).updateAndCount({
    status: "SCHEDULED",
    scheduledFor: at!,
    place: input.place.trim(),
    setByNotice,
  });
  if (n !== 1) throw new RecordsError("This inspection is already completed or cancelled.");
}

/**
 * Record the inspection as made; the fee follows from the rule pack. NSW: how
 * long it took (`minutes`). Queensland: whether the records were inspected
 * and how many pages were copied, at the dollar amounts for the year the
 * request was received.
 */
export async function completeInspection(input: { schemeId: string; id: string; minutes?: number; inspected?: boolean; copyPages?: number }): Promise<{ cents: number; gstIncluded: boolean }> {
  const [r, { rules }] = await Promise.all([inspectionOf(input.schemeId, input.id), rulesForScheme(input.schemeId)]);
  const inspection = inspectionRules(rules);
  if (inspection.basis === "HOURLY") {
    const minutes = input.minutes ?? Number.NaN;
    if (!(Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60)) throw new RecordsError("Enter how long it took.", { minutes: "Enter the minutes it took." });
    const fee = inspectionFee(r.inspectorType as InspectorType, minutes, inspection);
    const n = await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(r.id), x.status.in(["REQUESTED", "SCHEDULED"]))).updateAndCount({ status: "COMPLETED", minutes, feeCents: fee });
    if (n !== 1) throw new RecordsError("This inspection is already completed or cancelled.");
    return { cents: fee, gstIncluded: inspection.feesIncludeGst };
  }
  const copyPages = input.copyPages ?? Number.NaN;
  const inspected = input.inspected === true;
  if (!(Number.isInteger(copyPages) && copyPages >= 0 && copyPages <= 100_000)) throw new RecordsError("Enter the pages copied.", { copyPages: "Enter the number of pages copied (0 if none)." });
  if (!inspected && copyPages === 0) throw new RecordsError("Record an inspection or copies.", { inspected: "Tick this, or enter the pages copied." });
  // The dollar amounts are those for the year the written request was received.
  const requestedOn = day(r.requestedOn);
  const fee = accessFee(inspection, { requesterType: r.inspectorType, inspected, copyPages, feeOn: requestedOn });
  if (fee == null) throw new RecordsError(`StrataVerze does not hold the fees for a request received on ${requestedOn} yet. Ask StrataVerze to add that financial year's fees, then record it.`);
  const n = await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(r.id), x.status.in(["REQUESTED", "SCHEDULED"]))).updateAndCount({ status: "COMPLETED", inspected, copyPages, feeCents: fee });
  if (n !== 1) throw new RecordsError("This inspection is already completed or cancelled.");
  return { cents: fee, gstIncluded: inspection.feesIncludeGst };
}

export async function cancelInspection(input: { schemeId: string; id: string }) {
  const r = await inspectionOf(input.schemeId, input.id);
  const n = await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(r.id), x.status.in(["REQUESTED", "SCHEDULED"]))).updateAndCount({ status: "CANCELLED" });
  if (n !== 1) throw new RecordsError("Only an open inspection can be cancelled.");
}
