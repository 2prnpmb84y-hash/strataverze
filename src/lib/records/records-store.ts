/**
 * Information certificates (s 184) and records inspections (s 182), server
 * side. A certificate is drafted from StrataVerze's records, completed by
 * the adviser, then issued: from then on its items and date are fixed and
 * its fee (from the rule pack) is recorded. Fees are collected outside
 * StrataVerze; the date paid is recorded here.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeTimeZone, schemeToday } from "@/lib/jurisdiction/scheme-time";
import { localToInstant } from "@/lib/jurisdiction/time-zone";
import { draftCertificateItems, type CertificateItem } from "./certificate-draft";
import { certificateFee, inspectionFee, type InspectorType } from "./fees";

export class RecordsError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "RecordsError";
  }
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const REQUESTERS = ["OWNER", "MORTGAGEE", "COVENANT_CHARGEE", "AUTHORISED_PERSON"];
const AUTHORISERS = ["OWNER", "MORTGAGEE", "COVENANT_CHARGEE"];

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

function requesterProblems(r: RequesterInput, today: string) {
  const e: Record<string, string> = {};
  if (!ISO.test(r.requestedOn) || r.requestedOn > today) e.requestedOn = "Enter the date the request was received (not in the future).";
  if (!REQUESTERS.includes(r.requesterType)) e.requesterType = "Choose who is asking.";
  if (!r.requesterName.trim()) e.requesterName = "Enter their name.";
  if (!r.requesterAddress.trim()) e.requesterAddress = "Enter their address.";
  if (r.requesterType === "AUTHORISED_PERSON") {
    if (!r.authorisedByType || !AUTHORISERS.includes(r.authorisedByType)) e.authorisedByType = "Choose who authorised them.";
    if (!(r.authorisedByName ?? "").trim()) e.authorisedByName = "Enter the name of the person who authorised them.";
    if (!(r.authorisedByAddress ?? "").trim()) e.authorisedByAddress = "Enter that person's address.";
  }
  return e;
}

/** Start a certificate for a lot, drafted from StrataVerze's records. */
export async function createCertificate(input: { schemeId: string; lotId: string; requester: RequesterInput; actorId: string }) {
  const [lot, today, { label }] = await Promise.all([
    db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(),
    schemeToday(input.schemeId),
    rulesForScheme(input.schemeId),
  ]);
  if (!lot || lot.schemeId !== input.schemeId) throw new RecordsError("Lot not found.");
  const e = requesterProblems(input.requester, today);
  if (Object.keys(e).length) throw new RecordsError("Check the request details.", e);
  const items = await draftCertificateItems(input.schemeId, input.lotId);
  const r = input.requester;
  const authorised = r.requesterType === "AUTHORISED_PERSON";
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
  const [c, today] = await Promise.all([draftOf(input.schemeId, input.certificateId), schemeToday(input.schemeId)]);
  const e = requesterProblems(input.requester, today);
  const items = (c.items as unknown as CertificateItem[]).map((i) => ({ ...i, text: (input.itemTexts[i.no] ?? i.text).trim() }));
  for (const i of items) if (!i.text) e[`item_${i.no}`] = "Complete this item (write “Nil” if it does not apply).";
  if (Object.keys(e).length) throw new RecordsError("Check the certificate.", e);
  const r = input.requester;
  const authorised = r.requesterType === "AUTHORISED_PERSON";
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
 * Issue a draft: its date is today, its items are fixed, and its fee is
 * recorded (the repeat fee when another certificate for the lot was issued
 * within the repeat period).
 */
export async function issueCertificate(input: { schemeId: string; certificateId: string; actorId: string; checkedAll: boolean }) {
  if (!input.checkedAll) throw new RecordsError("Confirm you have checked every item.", { checkedAll: "Confirm you have checked and completed every item." });
  const [c, today, { rules }] = await Promise.all([draftOf(input.schemeId, input.certificateId), schemeToday(input.schemeId), rulesForScheme(input.schemeId)]);
  if (c.status !== "DRAFT") throw new RecordsError("This certificate has already been issued or cancelled.");
  const unchecked = (c.items as unknown as CertificateItem[]).filter((i) => /check and complete/i.test(i.text));
  if (unchecked.length) {
    throw new RecordsError(`Items ${unchecked.map((i) => i.no).join(", ")} still say “check and complete”. Complete them and save first.`);
  }
  const earlier = await db.orm.public.SaleCertificate.where((x) => and(x.lotId.eq(c.lotId), x.status.eq("ISSUED"))).limit(500).all();
  const fee = certificateFee(today, earlier.map((x) => day(x.certificateDate)), rules.SALE_CERTIFICATE);
  const n = await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(c.id), x.status.eq("DRAFT"))).updateAndCount({
    status: "ISSUED",
    certificateDate: today,
    feeCents: fee.cents,
    feeRepeat: fee.repeat,
    issuedBy: input.actorId,
  });
  if (n !== 1) throw new RecordsError("This certificate has just been issued or cancelled. Reload the page.");
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
  const n =
    input.kind === "certificate"
      ? await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(input.id), x.schemeId.eq(input.schemeId), x.status.eq("ISSUED"))).updateAndCount({ feePaidOn: input.paidOn })
      : await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(input.id), x.schemeId.eq(input.schemeId), x.status.eq("COMPLETED"))).updateAndCount({ feePaidOn: input.paidOn });
  if (n !== 1) throw new RecordsError("Not found, or no fee is due yet.");
}

// ─── Records inspections ────────────────────────────────────────────

export async function createInspection(input: { schemeId: string; lotId: string; inspectorType: string; inspectorName: string; authorisedBy: string | null; requestedOn: string; notes: string | null; actorId: string }) {
  const [lot, today] = await Promise.all([db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(), schemeToday(input.schemeId)]);
  const e: Record<string, string> = {};
  if (!lot || lot.schemeId !== input.schemeId) e.lotId = "Choose the lot whose owner is inspecting or authorised it.";
  if (input.inspectorType !== "OWNER" && input.inspectorType !== "AUTHORISED_PERSON") e.inspectorType = "Choose the owner or a person they authorised.";
  if (!input.inspectorName.trim()) e.inspectorName = "Enter the name of the person inspecting.";
  if (input.inspectorType === "AUTHORISED_PERSON" && !(input.authorisedBy ?? "").trim()) e.authorisedBy = "Enter the owner who authorised it.";
  if (!ISO.test(input.requestedOn) || input.requestedOn > today) e.requestedOn = "Enter the date of the request (not in the future).";
  if (Object.keys(e).length) throw new RecordsError("Check the request.", e);
  await db.orm.public.RecordsInspection.create({
    schemeId: input.schemeId,
    lotId: input.lotId,
    inspectorType: input.inspectorType,
    inspectorName: input.inspectorName.trim(),
    authorisedBy: input.inspectorType === "AUTHORISED_PERSON" ? (input.authorisedBy ?? "").trim() : null,
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

/** Record the agreed time and place, or the one the owners corporation set by written notice. */
export async function scheduleInspection(input: { schemeId: string; id: string; when: string; place: string; setByNotice: boolean }) {
  const r = await inspectionOf(input.schemeId, input.id);
  const tz = await schemeTimeZone(input.schemeId);
  const at = localToInstant(tz, input.when);
  const e: Record<string, string> = {};
  if (!at) e.when = "Enter the date and time.";
  if (!input.place.trim()) e.place = "Enter the place (or how it will be given electronically).";
  if (Object.keys(e).length) throw new RecordsError("Check the time and place.", e);
  const n = await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(r.id), x.status.in(["REQUESTED", "SCHEDULED"]))).updateAndCount({
    status: "SCHEDULED",
    scheduledFor: at!,
    place: input.place.trim(),
    setByNotice: input.setByNotice,
  });
  if (n !== 1) throw new RecordsError("This inspection is already completed or cancelled.");
}

/** Record how long the inspection took; the fee follows from the rule pack. */
export async function completeInspection(input: { schemeId: string; id: string; minutes: number }) {
  const [r, { rules }] = await Promise.all([inspectionOf(input.schemeId, input.id), rulesForScheme(input.schemeId)]);
  if (!(Number.isInteger(input.minutes) && input.minutes > 0 && input.minutes <= 24 * 60)) throw new RecordsError("Enter how long it took.", { minutes: "Enter the minutes it took." });
  const fee = inspectionFee(r.inspectorType as InspectorType, input.minutes, rules.RECORDS_INSPECTION);
  const n = await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(r.id), x.status.in(["REQUESTED", "SCHEDULED"]))).updateAndCount({ status: "COMPLETED", minutes: input.minutes, feeCents: fee });
  if (n !== 1) throw new RecordsError("This inspection is already completed or cancelled.");
  return fee;
}

export async function cancelInspection(input: { schemeId: string; id: string }) {
  const r = await inspectionOf(input.schemeId, input.id);
  const n = await db.orm.public.RecordsInspection.where((x) => and(x.id.eq(r.id), x.status.in(["REQUESTED", "SCHEDULED"]))).updateAndCount({ status: "CANCELLED" });
  if (n !== 1) throw new RecordsError("Only an open inspection can be cancelled.");
}
