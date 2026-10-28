/**
 * The insurance split of a contribution, from the building's data (server
 * side; QLD go-live gap, insurance in contributions, 27 Oct 2026). Gathers
 * what ./contribution-shares.ts needs: the building's plan format, the fund,
 * the insurance in the fund's adopted budget and each lot's separately held
 * entitlement (Queensland's interest schedule lot entitlement; each lot's
 * held fields are passed, so a pack reads only its own). The generate action
 * and the schedule page both use it, so the preview is what is issued.
 * Victoria has no CONTRIBUTION_INSURANCE yet, so a Victorian fee returns at
 * once like an NSW levy (stage 2, PR 4 review).
 *
 * For a building whose pack has no CONTRIBUTION_INSURANCE (NSW) it returns at
 * once, reading nothing more: the levy is shared by unit entitlement as it
 * always was.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { toCents, type PlanLot } from "./notice-plan";
import { ContributionShareError, insuranceSplit, type InsuranceSplit } from "./contribution-shares";

/**
 * The account sub type whose budget lines are the insurance part: the
 * Insurance account (5-1100) every building's chart of accounts is set up with
 * (src/lib/queries/seed-chart-of-accounts.ts). What counts as insurance is a
 * StrataVerze choice (Queensland FOR_REVIEW).
 */
export const INSURANCE_ACCOUNT_SUB_TYPE = "INSURANCE_EXPENSE";

export interface ContributionInsurance {
  /** The split, or null when the contribution is shared by one schedule. */
  split: InsuranceSplit | null;
  /** Why it cannot be shared as the building's pack requires, in plain words, or null. */
  problem: string | null;
}

/**
 * The insurance in a fund's adopted budget for a year, in cents: every line
 * of the latest adopted version on an insurance account. None adopted gives 0
 * (a budget levy is refused before this without one). It is counted for any
 * fund, so that an insurance line in a fund insurance is not paid from is
 * refused (contribution-shares.ts) rather than shared as insurance.
 */
export async function budgetedInsuranceCents(schemeId: string, fundId: string, financialYear: number): Promise<number> {
  const adopted = await db.orm.public.Budget
    .where((b) => and(b.schemeId.eq(schemeId), b.fundId.eq(fundId), b.financialYear.eq(financialYear), b.status.eq("ADOPTED")))
    .limit(50)
    .all();
  const budget = [...adopted].sort((a, b) => Number(b.version) - Number(a.version))[0];
  if (!budget) return 0;
  const lines = await db.orm.public.BudgetLine.where((l) => l.budgetId.eq(budget.id)).limit(2000).all();
  if (!lines.length) return 0;
  const accounts = await db.orm.public.AccountCode
    .where((a) => and(a.schemeId.eq(schemeId), a.id.in([...new Set(lines.map((l) => l.accountCodeId))])))
    .limit(2000)
    .all();
  const insurance = new Set(accounts.filter((a) => a.accountSubType === INSURANCE_ACCOUNT_SUB_TYPE).map((a) => a.id));
  return lines.filter((l) => insurance.has(l.accountCodeId)).reduce((sum, l) => sum + toCents(String(l.budgetAmount)), 0);
}

/**
 * How a schedule's contribution is shared between the lots: split into its
 * insurance part and the rest where the building's pack requires it, with
 * the reason in plain words where it cannot be.
 */
export async function contributionInsurance(
  schemeId: string,
  schedule: { fundId: string; financialYear: number | string; levyType?: string | null; budgetAmount: unknown },
  lots: readonly PlanLot[],
): Promise<ContributionInsurance> {
  const { rules } = await rulesForScheme(schemeId);
  if (!rules.CONTRIBUTION_INSURANCE) return { split: null, problem: null };
  const levyType = schedule.levyType === "SPECIAL" ? "SPECIAL" : "ORDINARY";
  if (levyType === "SPECIAL") return { split: null, problem: null };

  const [scheme, fund] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first(),
    db.orm.public.Fund.where((f) => and(f.id.eq(schedule.fundId), f.schemeId.eq(schemeId))).first(),
  ]);
  if (!fund) return { split: null, problem: "The fund was not found." };
  const financialYear = Number(schedule.financialYear);
  const insuranceCents = await budgetedInsuranceCents(schemeId, schedule.fundId, financialYear);
  const lotRows = await db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all();
  const held = new Map(lotRows.map((l) => [l.id, { interestScheduleEntitlement: l.interestScheduleEntitlement ?? null, lotEntitlement: l.lotEntitlement ?? null }]));

  try {
    const split = insuranceSplit({
      rules,
      planFormat: scheme?.planFormat ?? null,
      lots: lots.map((l) => ({ ...l, interestScheduleEntitlement: null, lotEntitlement: null, ...held.get(l.lotId) })),
      totalCents: toCents(String(schedule.budgetAmount)),
      insuranceCents,
      ledgerFund: String(fund.fundType),
      levyType,
    });
    return { split, problem: null };
  } catch (err) {
    if (err instanceof ContributionShareError) return { split: null, problem: err.message };
    throw err;
  }
}
