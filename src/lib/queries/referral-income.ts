import { db } from "@/prisma/db";
import { toCents } from "@/lib/billing/money";

const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const isoTime = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));

export interface ReferralIncomeRow {
  id: string;
  schemeId: string;
  insurancePolicyId: string | null;
  partnerName: string;
  amountCents: number;
  receivedAt: string;
  disclosedAt: string;
  disclosureText: string;
}

function toRow(r: Awaited<ReturnType<typeof db.orm.public.ReferralIncome.all>>[number]): ReferralIncomeRow {
  return {
    id: r.id,
    schemeId: r.schemeId,
    insurancePolicyId: r.insurancePolicyId ?? null,
    partnerName: r.partnerName,
    amountCents: toCents(String(r.amount)),
    receivedAt: isoDay(r.receivedAt),
    disclosedAt: isoTime(r.disclosedAt),
    disclosureText: r.disclosureText,
  };
}

/** Referral income recorded against a scheme, newest first. */
export async function getReferralIncomeForScheme(schemeId: string): Promise<ReferralIncomeRow[]> {
  const rows = await db.orm.public.ReferralIncome.where((r) => r.schemeId.eq(schemeId))
    .orderBy((r) => r.receivedAt.desc())
    .limit(500)
    .all();
  return rows.map(toRow);
}

/** Referral income recorded against any of the given policies. */
export async function getReferralIncomeForPolicies(policyIds: string[]): Promise<ReferralIncomeRow[]> {
  const ids = policyIds.filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await db.orm.public.ReferralIncome.where((r) => r.insurancePolicyId.in(ids))
    .orderBy((r) => r.receivedAt.desc())
    .limit(500)
    .all();
  return rows.map(toRow);
}

/** The most recent referral income records across the platform, for the admin screen. */
export async function getRecentReferralIncome(limit = 100): Promise<ReferralIncomeRow[]> {
  const rows = await db.orm.public.ReferralIncome.orderBy((r) => r.createdAt.desc()).limit(limit).all();
  return rows.map(toRow);
}
