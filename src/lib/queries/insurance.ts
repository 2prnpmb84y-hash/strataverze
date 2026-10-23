import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a number or string to the Prisma 8 Numeric branded type (12,2). */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast to the wider Numeric(14,2) used for sums insured. */
function toNumeric14(value: number | string): Numeric<14, 2> {
  return String(value) as unknown as Numeric<14, 2>;
}

/** Fields shared by create and update beyond the original flat policy. */
export interface PolicyDetailFields {
  insuredEntityName?: string | null;
  insuredAddress?: string | null;
  additionalInsured?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  claimsContact?: string | null;
  referenceNumbers?: string | null;
  coverageSummary?: string | null;
  exclusions?: string | null;
  conditions?: string | null;
  endorsements?: string | null;
  currency?: string | null;
  totalPremium?: number | null;
  paymentDueDate?: string | null;
  paymentStatus?: string | null;
  paymentDate?: string | null;
  paymentReference?: string | null;
}

/**
 * Fetch all insurance policies for a scheme, ordered by end date descending.
 */
export async function getInsuranceForScheme(schemeId: string, limit = 200) {
  return db.orm.public.InsurancePolicy
    .where((p) => and(p.schemeId.eq(schemeId), p.deletedAt.eq(null)))
    .orderBy((p) => p.endDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch active insurance policies for a scheme (excludes expired and cancelled).
 */
export async function getActiveInsuranceForScheme(schemeId: string, limit = 200) {
  return db.orm.public.InsurancePolicy
    .where((p) =>
      and(
        p.schemeId.eq(schemeId),
        p.status.notIn(["EXPIRED", "CANCELLED"]),
        p.deletedAt.eq(null),
      ),
    )
    .orderBy((p) => p.endDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch insurance policies across multiple schemes.
 */
export async function getInsuranceForSchemes(
  schemeIds: string[],
  options?: { includeExpired?: boolean },
  limit = 200,
) {
  if (schemeIds.length === 0) return [];

  if (options?.includeExpired) {
    return db.orm.public.InsurancePolicy
      .where((p) => and(p.schemeId.in(schemeIds), p.deletedAt.eq(null)))
      .include("scheme")
      .orderBy((p) => p.endDate.desc())
      .limit(limit)
      .all();
  }

  return db.orm.public.InsurancePolicy
    .where((p) =>
      and(
        p.schemeId.in(schemeIds),
        p.status.notIn(["EXPIRED", "CANCELLED"]),
        p.deletedAt.eq(null),
      ),
    )
    .include("scheme")
    .orderBy((p) => p.endDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single insurance policy by ID.
 */
export async function getInsurancePolicyById(policyId: string) {
  return db.orm.public.InsurancePolicy
    .where((p) => and(p.id.eq(policyId), p.deletedAt.eq(null)))
    .include("scheme")
    .first();
}

/**
 * Fetch a policy with its coverage items and premium line items.
 */
export async function getPolicyWithItems(policyId: string) {
  return db.orm.public.InsurancePolicy
    .where((p) => and(p.id.eq(policyId), p.deletedAt.eq(null)))
    .include("scheme")
    .include("coverageItems")
    .include("premiumLineItems")
    .first();
}

export interface CreatePolicyData extends PolicyDetailFields {
  schemeId: string;
  policyNumber: string;
  policyType: string;
  insurer: string;
  broker?: string | null;
  brokerContact?: string | null;
  coverageAmount: number;
  premium: number;
  excessAmount?: number | null;
  startDate: string;
  endDate: string;
  status?: string;
  renewalDate?: string | null;
  notes?: string | null;
}

function detailCreatePayload(data: PolicyDetailFields): Record<string, unknown> {
  return {
    insuredEntityName: data.insuredEntityName ?? null,
    insuredAddress: data.insuredAddress ?? null,
    additionalInsured: data.additionalInsured ?? null,
    contactPerson: data.contactPerson ?? null,
    contactEmail: data.contactEmail ?? null,
    contactPhone: data.contactPhone ?? null,
    claimsContact: data.claimsContact ?? null,
    referenceNumbers: data.referenceNumbers ?? null,
    coverageSummary: data.coverageSummary ?? null,
    exclusions: data.exclusions ?? null,
    conditions: data.conditions ?? null,
    endorsements: data.endorsements ?? null,
    currency: data.currency ?? "AUD",
    totalPremium:
      data.totalPremium != null ? toNumeric(data.totalPremium) : null,
    paymentDueDate: data.paymentDueDate ? toTimestamp(data.paymentDueDate) : null,
    paymentStatus: data.paymentStatus ?? null,
    paymentDate: data.paymentDate ? toTimestamp(data.paymentDate) : null,
    paymentReference: data.paymentReference ?? null,
  };
}

/**
 * Create a new insurance policy.
 */
export async function createInsurancePolicy(data: CreatePolicyData) {
  return db.orm.public.InsurancePolicy.create({
    schemeId: data.schemeId,
    policyNumber: data.policyNumber,
    policyType: data.policyType,
    insurer: data.insurer,
    broker: data.broker ?? null,
    brokerContact: data.brokerContact ?? null,
    coverageAmount: toNumeric14(data.coverageAmount),
    premium: toNumeric(data.premium),
    excessAmount:
      data.excessAmount != null ? toNumeric(data.excessAmount) : null,
    startDate: toTimestamp(data.startDate),
    endDate: toTimestamp(data.endDate),
    status: data.status ?? "ACTIVE",
    renewalDate: data.renewalDate ? toTimestamp(data.renewalDate) : null,
    notes: data.notes ?? null,
    ...detailCreatePayload(data),
  } as never);
}

export type UpdatePolicyData = Partial<
  PolicyDetailFields & {
    policyNumber: string;
    policyType: string;
    insurer: string;
    broker: string | null;
    brokerContact: string | null;
    coverageAmount: number;
    premium: number;
    excessAmount: number | null;
    startDate: string;
    endDate: string;
    status: string;
    renewalDate: string | null;
    notes: string | null;
  }
>;

/** The scheme's live (not deleted) policy with this id, or null. */
export async function getSchemePolicy(schemeId: string, policyId: string) {
  if (!schemeId || !policyId) return null;
  return db.orm.public.InsurancePolicy
    .where((p) => and(p.id.eq(policyId), p.schemeId.eq(schemeId), p.deletedAt.eq(null)))
    .first();
}

/**
 * Update an existing insurance policy. Only provided fields are changed.
 * Scheme-scoped: returns null when the policy is not this scheme's.
 */
export async function updateInsurancePolicy(
  schemeId: string,
  policyId: string,
  data: UpdatePolicyData,
) {
  const u: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    u[k] = v;
  };

  if (data.policyNumber !== undefined) set("policyNumber", data.policyNumber);
  if (data.policyType !== undefined) set("policyType", data.policyType);
  if (data.insurer !== undefined) set("insurer", data.insurer);
  if (data.broker !== undefined) set("broker", data.broker);
  if (data.brokerContact !== undefined) set("brokerContact", data.brokerContact);
  if (data.coverageAmount !== undefined)
    set("coverageAmount", toNumeric14(data.coverageAmount));
  if (data.premium !== undefined) set("premium", toNumeric(data.premium));
  if (data.excessAmount !== undefined)
    set("excessAmount", data.excessAmount !== null ? toNumeric(data.excessAmount) : null);
  if (data.startDate !== undefined) set("startDate", toTimestamp(data.startDate));
  if (data.endDate !== undefined) set("endDate", toTimestamp(data.endDate));
  if (data.status !== undefined) set("status", data.status);
  if (data.renewalDate !== undefined)
    set("renewalDate", data.renewalDate ? toTimestamp(data.renewalDate) : null);
  if (data.notes !== undefined) set("notes", data.notes);

  // Extended detail fields
  if (data.insuredEntityName !== undefined) set("insuredEntityName", data.insuredEntityName);
  if (data.insuredAddress !== undefined) set("insuredAddress", data.insuredAddress);
  if (data.additionalInsured !== undefined) set("additionalInsured", data.additionalInsured);
  if (data.contactPerson !== undefined) set("contactPerson", data.contactPerson);
  if (data.contactEmail !== undefined) set("contactEmail", data.contactEmail);
  if (data.contactPhone !== undefined) set("contactPhone", data.contactPhone);
  if (data.claimsContact !== undefined) set("claimsContact", data.claimsContact);
  if (data.referenceNumbers !== undefined) set("referenceNumbers", data.referenceNumbers);
  if (data.coverageSummary !== undefined) set("coverageSummary", data.coverageSummary);
  if (data.exclusions !== undefined) set("exclusions", data.exclusions);
  if (data.conditions !== undefined) set("conditions", data.conditions);
  if (data.endorsements !== undefined) set("endorsements", data.endorsements);
  if (data.currency !== undefined) set("currency", data.currency ?? "AUD");
  if (data.totalPremium !== undefined)
    set("totalPremium", data.totalPremium != null ? toNumeric(data.totalPremium) : null);
  if (data.paymentDueDate !== undefined)
    set("paymentDueDate", data.paymentDueDate ? toTimestamp(data.paymentDueDate) : null);
  if (data.paymentStatus !== undefined) set("paymentStatus", data.paymentStatus);
  if (data.paymentDate !== undefined)
    set("paymentDate", data.paymentDate ? toTimestamp(data.paymentDate) : null);
  if (data.paymentReference !== undefined) set("paymentReference", data.paymentReference);

  return db.orm.public.InsurancePolicy
    .where((p) => and(p.id.eq(policyId), p.schemeId.eq(schemeId), p.deletedAt.eq(null)))
    .update(u);
}

/**
 * Soft-delete an insurance policy. Scheme-scoped: returns null when the
 * policy is not this scheme's.
 */
export async function deleteInsurancePolicy(schemeId: string, policyId: string) {
  return db.orm.public.InsurancePolicy
    .where((p) => and(p.id.eq(policyId), p.schemeId.eq(schemeId), p.deletedAt.eq(null)))
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

// ─── Coverage items ──────────────────────────────────────────────

export interface CoverageItemInput {
  category: string;
  description?: string | null;
  sumInsured?: number | null;
  excess?: number | null;
  conditions?: string | null;
}

export async function getCoverageItems(policyId: string) {
  return db.orm.public.InsuranceCoverageItem
    .where((c) => c.policyId.eq(policyId))
    .orderBy((c) => c.position.asc())
    .all();
}

/**
 * Replace all coverage items for a policy (delete then recreate in order).
 * Scheme-scoped: changes nothing and returns false when the policy is not
 * this scheme's.
 */
export async function replaceCoverageItems(
  schemeId: string,
  policyId: string,
  items: CoverageItemInput[],
): Promise<boolean> {
  if (!(await getSchemePolicy(schemeId, policyId))) return false;
  await db.orm.public.InsuranceCoverageItem
    .where((c) => c.policyId.eq(policyId))
    .delete();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await db.orm.public.InsuranceCoverageItem.create({
      policyId,
      category: it.category,
      description: it.description ?? null,
      sumInsured: it.sumInsured != null ? toNumeric14(it.sumInsured) : null,
      excess: it.excess != null ? toNumeric(it.excess) : null,
      conditions: it.conditions ?? null,
      position: i,
    } as never);
  }
  return true;
}

// ─── Premium line items ──────────────────────────────────────────

export interface PremiumLineItemInput {
  label: string;
  kind: string;
  amount: number;
}

export async function getPremiumLineItems(policyId: string) {
  return db.orm.public.InsurancePremiumLineItem
    .where((l) => l.policyId.eq(policyId))
    .orderBy((l) => l.position.asc())
    .all();
}

/**
 * Replace all premium line items for a policy. Scheme-scoped: changes nothing
 * and returns false when the policy is not this scheme's.
 */
export async function replacePremiumLineItems(
  schemeId: string,
  policyId: string,
  items: PremiumLineItemInput[],
): Promise<boolean> {
  if (!(await getSchemePolicy(schemeId, policyId))) return false;
  await db.orm.public.InsurancePremiumLineItem
    .where((l) => l.policyId.eq(policyId))
    .delete();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await db.orm.public.InsurancePremiumLineItem.create({
      policyId,
      label: it.label,
      kind: it.kind,
      amount: toNumeric(it.amount),
      position: i,
    } as never);
  }
  return true;
}

// ─── Overview ────────────────────────────────────────────────────

/** Policies, open claims and in-progress renewals for a scheme overview. */
export async function getInsuranceOverview(schemeId: string) {
  const policies = await db.orm.public.InsurancePolicy
    .where((p) => and(p.schemeId.eq(schemeId), p.deletedAt.eq(null)))
    .orderBy((p) => p.endDate.desc())
    .all();

  const claims = await db.orm.public.InsuranceClaim
    .where((c) => and(c.schemeId.eq(schemeId), c.deletedAt.eq(null)))
    .orderBy((c) => c.createdAt.desc())
    .all();

  const renewals = await db.orm.public.InsuranceRenewal
    .where((r) => and(r.schemeId.eq(schemeId), r.deletedAt.eq(null)))
    .orderBy((r) => r.createdAt.desc())
    .all();

  return { policies, claims, renewals };
}
