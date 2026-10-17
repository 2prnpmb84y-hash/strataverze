import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
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
 * Create a new insurance policy.
 */
export async function createInsurancePolicy(data: {
  schemeId: string;
  policyNumber: string;
  policyType: string;
  insurer: string;
  broker?: string;
  brokerContact?: string;
  coverageAmount: number;
  premium: number;
  excessAmount?: number;
  startDate: string;
  endDate: string;
  renewalDate?: string;
  notes?: string;
}) {
  return db.orm.public.InsurancePolicy.create({
    schemeId: data.schemeId,
    policyNumber: data.policyNumber,
    policyType: data.policyType,
    insurer: data.insurer,
    broker: data.broker ?? null,
    brokerContact: data.brokerContact ?? null,
    coverageAmount: toNumeric(data.coverageAmount),
    premium: toNumeric(data.premium),
    excessAmount: data.excessAmount !== undefined
      ? toNumeric(data.excessAmount)
      : null,
    startDate: toTimestamp(data.startDate),
    endDate: toTimestamp(data.endDate),
    renewalDate: data.renewalDate ? toTimestamp(data.renewalDate) : null,
    notes: data.notes ?? null,
  });
}

/**
 * Update an existing insurance policy.
 */
export async function updateInsurancePolicy(
  policyId: string,
  data: Partial<{
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
  }>,
) {
  const update: Record<string, unknown> = {};
  if (data.policyNumber !== undefined) update.policyNumber = data.policyNumber;
  if (data.policyType !== undefined) update.policyType = data.policyType;
  if (data.insurer !== undefined) update.insurer = data.insurer;
  if (data.broker !== undefined) update.broker = data.broker;
  if (data.brokerContact !== undefined)
    update.brokerContact = data.brokerContact;
  if (data.coverageAmount !== undefined)
    update.coverageAmount = toNumeric(data.coverageAmount);
  if (data.premium !== undefined) update.premium = toNumeric(data.premium);
  if (data.excessAmount !== undefined)
    update.excessAmount =
      data.excessAmount !== null ? toNumeric(data.excessAmount) : null;
  if (data.startDate !== undefined)
    update.startDate = toTimestamp(data.startDate);
  if (data.endDate !== undefined) update.endDate = toTimestamp(data.endDate);
  if (data.status !== undefined) update.status = data.status;
  if (data.renewalDate !== undefined)
    update.renewalDate = data.renewalDate
      ? toTimestamp(data.renewalDate)
      : null;
  if (data.notes !== undefined) update.notes = data.notes;

  return db.orm.public.InsurancePolicy.where({ id: policyId }).update(update);
}

/**
 * Soft-delete an insurance policy.
 */
export async function deleteInsurancePolicy(policyId: string) {
  return db.orm.public.InsurancePolicy
    .where({ id: policyId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}
