import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString, Numeric } from "@prisma/orm-postgres/target/codec-types";

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}
function num12(value: number): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}
function num14(value: number): Numeric<14, 2> {
  return String(value) as unknown as Numeric<14, 2>;
}

export async function createRenewal(data: {
  schemeId: string;
  expiringPolicyId: string;
  ownerId?: string | null;
  dueDate?: string | null;
  reminderLeadDays?: number | null;
}) {
  return db.orm.public.InsuranceRenewal.create({
    schemeId: data.schemeId,
    expiringPolicyId: data.expiringPolicyId,
    stage: "NOT_STARTED",
    ownerId: data.ownerId ?? null,
    dueDate: data.dueDate ? toTimestamp(data.dueDate) : null,
    reminderLeadDays: data.reminderLeadDays ?? null,
  } as never);
}

export async function getRenewalById(renewalId: string) {
  return db.orm.public.InsuranceRenewal
    .where((r) => and(r.id.eq(renewalId), r.deletedAt.eq(null)))
    .include("expiringPolicy")
    .include("quotes")
    .first();
}

export async function getRenewalsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.InsuranceRenewal
    .where((r) => and(r.schemeId.eq(schemeId), r.deletedAt.eq(null)))
    .include("expiringPolicy")
    .orderBy((r) => r.createdAt.desc())
    .limit(limit)
    .all();
}

export async function getActiveRenewalForPolicy(policyId: string) {
  return db.orm.public.InsuranceRenewal
    .where((r) =>
      and(
        r.expiringPolicyId.eq(policyId),
        r.deletedAt.eq(null),
        r.stage.notIn(["COMPLETED", "NOT_PROCEEDING"]),
      ),
    )
    .first();
}

/** The scheme's live (not deleted) renewal with this id, or null. */
export async function getSchemeRenewal(schemeId: string, renewalId: string) {
  if (!schemeId || !renewalId) return null;
  return db.orm.public.InsuranceRenewal
    .where((r) => and(r.id.eq(renewalId), r.schemeId.eq(schemeId), r.deletedAt.eq(null)))
    .first();
}

/** Update a renewal. Scheme-scoped: returns null when the renewal is not this scheme's. */
export async function updateRenewal(
  schemeId: string,
  renewalId: string,
  data: Partial<{
    ownerId: string | null;
    dueDate: string | null;
    reminderLeadDays: number | null;
    declaredChanges: string | null;
    outstandingInfo: string | null;
    declaration: Record<string, unknown> | null;
    selectedQuoteId: string | null;
    selectionRationale: string | null;
    approvedBy: string | null;
    placementInstructions: string | null;
    notes: string | null;
    notProceedingReason: string | null;
  }>,
) {
  const u: Record<string, unknown> = {};
  const s = (k: string, v: unknown) => {
    u[k] = v;
  };
  if (data.ownerId !== undefined) s("ownerId", data.ownerId);
  if (data.dueDate !== undefined)
    s("dueDate", data.dueDate ? toTimestamp(data.dueDate) : null);
  if (data.reminderLeadDays !== undefined) s("reminderLeadDays", data.reminderLeadDays);
  if (data.declaredChanges !== undefined) s("declaredChanges", data.declaredChanges);
  if (data.outstandingInfo !== undefined) s("outstandingInfo", data.outstandingInfo);
  if (data.declaration !== undefined) s("declaration", data.declaration as never);
  if (data.selectedQuoteId !== undefined) s("selectedQuoteId", data.selectedQuoteId);
  if (data.selectionRationale !== undefined) s("selectionRationale", data.selectionRationale);
  if (data.approvedBy !== undefined) s("approvedBy", data.approvedBy);
  if (data.placementInstructions !== undefined) s("placementInstructions", data.placementInstructions);
  if (data.notes !== undefined) s("notes", data.notes);
  if (data.notProceedingReason !== undefined) s("notProceedingReason", data.notProceedingReason);
  return db.orm.public.InsuranceRenewal
    .where((r) => and(r.id.eq(renewalId), r.schemeId.eq(schemeId), r.deletedAt.eq(null)))
    .update(u);
}

export async function setRenewalStage(
  renewalId: string,
  stage: string,
  opts: { coverConfirmedAt?: string | null } = {},
) {
  const u: Record<string, unknown> = { stage };
  if (opts.coverConfirmedAt !== undefined)
    u.coverConfirmedAt = opts.coverConfirmedAt
      ? toTimestamp(opts.coverConfirmedAt)
      : null;
  return db.orm.public.InsuranceRenewal.where({ id: renewalId }).update(u);
}

export async function setSuccessorPolicy(renewalId: string, policyId: string) {
  return db.orm.public.InsuranceRenewal
    .where({ id: renewalId })
    .update({ successorPolicyId: policyId });
}

export async function softDeleteRenewal(renewalId: string) {
  return db.orm.public.InsuranceRenewal
    .where({ id: renewalId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

// ─── Quotes ──────────────────────────────────────────────────────

export interface QuoteInput {
  insurer: string;
  broker?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  premium?: number | null;
  sumInsured?: number | null;
  excesses?: string | null;
  exclusions?: string | null;
  conditions?: string | null;
  endorsements?: string | null;
  materialDifferences?: string | null;
  validUntil?: string | null;
  notes?: string | null;
}

export async function addQuote(renewalId: string, data: QuoteInput) {
  return db.orm.public.InsuranceRenewalQuote.create({
    renewalId,
    insurer: data.insurer,
    broker: data.broker ?? null,
    periodStart: data.periodStart ? toTimestamp(data.periodStart) : null,
    periodEnd: data.periodEnd ? toTimestamp(data.periodEnd) : null,
    premium: data.premium != null ? num12(data.premium) : null,
    sumInsured: data.sumInsured != null ? num14(data.sumInsured) : null,
    excesses: (data.excesses ? { text: data.excesses } : null) as never,
    exclusions: data.exclusions ?? null,
    conditions: data.conditions ?? null,
    endorsements: data.endorsements ?? null,
    materialDifferences: data.materialDifferences ?? null,
    validUntil: data.validUntil ? toTimestamp(data.validUntil) : null,
    notes: data.notes ?? null,
  } as never);
}

export async function getQuoteById(quoteId: string) {
  return db.orm.public.InsuranceRenewalQuote.where({ id: quoteId }).first();
}

export async function deleteQuote(quoteId: string) {
  return db.orm.public.InsuranceRenewalQuote.where({ id: quoteId }).delete();
}
