/**
 * Capital works fund plan (pure). SSMA 2015 s 80: a plan of anticipated
 * major expenditure for at least the next 10 years, reviewed at least every
 * 5 years. See CAPITAL_WORKS_PLAN in src/config/statutory.ts.
 */
import { CAPITAL_WORKS_PLAN } from "@/config/statutory";

export interface PlanItem {
  plannedYear: number;
  estimatedCostCents: number;
}

export type ContributionMethod = "LEVEL" | "AVERAGE";

export const CONTRIBUTION_METHOD_LABELS: Record<ContributionMethod, string> = {
  LEVEL: "Level contribution: the smallest equal yearly amount that keeps the fund from going below zero in any year of the plan",
  AVERAGE: "Average: planned expenditure over the plan, less the opening balance, spread evenly across the years",
};

/** Planned spending for each year of the plan, starting at `startYear`. */
export function spendByYear(items: PlanItem[], startYear: number, years: number = CAPITAL_WORKS_PLAN.horizonYears): number[] {
  const out = Array<number>(years).fill(0);
  for (const i of items) {
    const k = i.plannedYear - startYear;
    if (k >= 0 && k < years) out[k] += Math.max(0, i.estimatedCostCents);
  }
  return out;
}

/**
 * The yearly contribution the plan needs, in cents (rounded up to the dollar).
 * Contributions are assumed to arrive before that year's spending.
 */
export function requiredAnnualContribution(input: {
  items: PlanItem[];
  startYear: number;
  openingBalanceCents: number;
  method: ContributionMethod;
  years?: number;
}): number {
  const years = input.years ?? CAPITAL_WORKS_PLAN.horizonYears;
  const spend = spendByYear(input.items, input.startYear, years);
  let needed = 0;
  if (input.method === "AVERAGE") {
    const total = spend.reduce((s, x) => s + x, 0);
    needed = Math.max(0, (total - input.openingBalanceCents) / years);
  } else {
    let cumulative = 0;
    spend.forEach((x, k) => {
      cumulative += x;
      needed = Math.max(needed, (cumulative - input.openingBalanceCents) / (k + 1));
    });
  }
  return Math.ceil(Math.max(0, needed) / 100) * 100;
}

/** Year by year balance with a given yearly contribution. */
export function projectPlan(input: {
  items: PlanItem[];
  startYear: number;
  openingBalanceCents: number;
  annualContributionCents: number;
  years?: number;
}) {
  const spend = spendByYear(input.items, input.startYear, input.years ?? CAPITAL_WORKS_PLAN.horizonYears);
  let balance = input.openingBalanceCents;
  return spend.map((s, k) => {
    const opening = balance;
    balance = opening + input.annualContributionCents - s;
    return { year: input.startYear + k, openingCents: opening, contributionCents: input.annualContributionCents, spendCents: s, closingCents: balance };
  });
}

/** When the plan must next be reviewed: at least every 5 years from preparation (YYYY-MM-DD). */
export function reviewDueDate(preparedOn: string, everyYears: number = CAPITAL_WORKS_PLAN.reviewEveryYears): string {
  const y = Number(preparedOn.slice(0, 4)) + everyYears;
  const md = preparedOn.slice(5, 10) === "02-29" ? "02-28" : preparedOn.slice(5, 10);
  return `${y}-${md}`;
}

/** Why a plan cannot be adopted yet, or null. */
export function planAdoptionProblem(input: { status: string; items: PlanItem[]; startYear: number; meetingId: string | null; motionId: string | null }): string | null {
  if (input.status !== "DRAFT") return "Only a draft plan can be adopted.";
  if (input.items.length === 0) return "Add the anticipated major expenditure before adopting the plan.";
  const last = input.startYear + CAPITAL_WORKS_PLAN.horizonYears - 1;
  if (input.items.some((i) => i.plannedYear < input.startYear || i.plannedYear > last)) {
    return `Every item must fall within the plan's ${CAPITAL_WORKS_PLAN.horizonYears} years (FY ${input.startYear} to FY ${last}).`;
  }
  if (!input.meetingId || !input.motionId) return "Choose the general meeting and the motion that adopted the plan.";
  return null;
}
