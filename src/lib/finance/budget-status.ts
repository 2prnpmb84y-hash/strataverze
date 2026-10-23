/**
 * Budget lifecycle (pure): DRAFT, PROPOSED, ADOPTED, SUPERSEDED. An adopted
 * budget is read-only; changing it means a new version. A budget levy
 * schedule can only be activated against an adopted budget for its fund and
 * year. Special levies are resolved separately and do not need one.
 */

export type BudgetStatus = "DRAFT" | "PROPOSED" | "ADOPTED" | "SUPERSEDED";

export function budgetEditable(status: string): boolean {
  return status === "DRAFT" || status === "PROPOSED";
}

export function budgetEditProblem(status: string): string | null {
  if (budgetEditable(status)) return null;
  if (status === "ADOPTED") return "This budget was adopted and cannot be changed. Start a revision to make changes.";
  return "This budget has been replaced by a later version and cannot be changed.";
}

export function budgetAdoptionProblem(input: { status: string; meetingId: string | null; motionId: string | null }): string | null {
  if (input.status !== "DRAFT" && input.status !== "PROPOSED") return "Only a draft or proposed budget can be adopted.";
  if (!input.meetingId || !input.motionId) return "Choose the general meeting and the motion that adopted the budget.";
  return null;
}

/** Why a levy schedule cannot be activated, or null. */
export function levyScheduleActivationProblem(input: {
  levyType: string;
  financialYear: number;
  fundName: string;
  budgets: { financialYear: number; status: string }[];
}): string | null {
  if (input.levyType === "SPECIAL") return null;
  const adopted = input.budgets.some((b) => b.financialYear === input.financialYear && b.status === "ADOPTED");
  if (adopted) return null;
  return `The ${input.fundName} budget for FY ${input.financialYear} has not been adopted. Record its adoption at the general meeting before issuing these levies.`;
}

/** Pick the budget in force for each fund and year: the adopted one, else the latest version. */
export function currentBudgets<T extends { fundId: string; financialYear: number; version: number; status: string }>(budgets: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const b of budgets) {
    if (b.status === "SUPERSEDED") continue;
    const key = `${b.fundId}:${b.financialYear}`;
    const cur = byKey.get(key);
    const rank = (x: T) => (x.status === "ADOPTED" ? 1 : 0);
    if (!cur || rank(b) > rank(cur) || (rank(b) === rank(cur) && b.version > cur.version)) byKey.set(key, b);
  }
  return [...byKey.values()];
}

/** The version being worked on for each fund and year: the latest that is not superseded. */
export function workingBudgets<T extends { fundId: string; financialYear: number; version: number; status: string }>(budgets: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const b of budgets) {
    if (b.status === "SUPERSEDED") continue;
    const key = `${b.fundId}:${b.financialYear}`;
    const cur = byKey.get(key);
    if (!cur || b.version > cur.version) byKey.set(key, b);
  }
  return [...byKey.values()];
}
