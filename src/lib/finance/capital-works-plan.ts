/**
 * Capital works fund plan (pure). SSMA 2015 s 80: a plan of anticipated
 * major expenditure for at least the next 10 years, reviewed at least every
 * 5 years. The horizon and review period come from the building's rule pack
 * (`rules.CAPITAL_WORKS_PLAN`); nothing here assumes a jurisdiction.
 */
import type { StatutoryRules } from "@/config/statutory";

/** The capital works plan rule of a building's rule pack (`rules.CAPITAL_WORKS_PLAN`). */
export type CapitalWorksRule = StatutoryRules["CAPITAL_WORKS_PLAN"];

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
export function spendByYear(items: PlanItem[], startYear: number, years: number): number[] {
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
  /** The plan's horizon in years (`rules.CAPITAL_WORKS_PLAN.horizonYears`). */
  years: number;
}): number {
  const years = input.years;
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
  /** The plan's horizon in years (`rules.CAPITAL_WORKS_PLAN.horizonYears`). */
  years: number;
}) {
  const spend = spendByYear(input.items, input.startYear, input.years);
  let balance = input.openingBalanceCents;
  return spend.map((s, k) => {
    const opening = balance;
    balance = opening + input.annualContributionCents - s;
    return { year: input.startYear + k, openingCents: opening, contributionCents: input.annualContributionCents, spendCents: s, closingCents: balance };
  });
}

/** When the plan must next be reviewed: `everyYears` (`rules.CAPITAL_WORKS_PLAN.reviewEveryYears`) from preparation (YYYY-MM-DD). */
export function reviewDueDate(preparedOn: string, everyYears: number): string {
  const y = Number(preparedOn.slice(0, 4)) + everyYears;
  const md = preparedOn.slice(5, 10) === "02-29" ? "02-28" : preparedOn.slice(5, 10);
  return `${y}-${md}`;
}

/** Why a plan cannot be adopted yet, or null. */
export function planAdoptionProblem(input: {
  status: string;
  items: PlanItem[];
  startYear: number;
  /** The plan's horizon in years (`rules.CAPITAL_WORKS_PLAN.horizonYears`). */
  horizonYears: number;
  meetingId: string | null;
  motionId: string | null;
}): string | null {
  if (input.status !== "DRAFT") return "Only a draft plan can be adopted.";
  if (input.items.length === 0) return "Add the anticipated major expenditure before adopting the plan.";
  const last = input.startYear + input.horizonYears - 1;
  if (input.items.some((i) => i.plannedYear < input.startYear || i.plannedYear > last)) {
    return `Every item must fall within the plan's ${input.horizonYears} years (FY ${input.startYear} to FY ${last}).`;
  }
  if (!input.meetingId || !input.motionId) return "Choose the general meeting and the motion that adopted the plan.";
  return null;
}
