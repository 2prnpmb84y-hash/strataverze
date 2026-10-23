/**
 * Budget versions (server side). A budget belongs to one fund and financial
 * year. Lines are edited only while it is DRAFT or PROPOSED; once ADOPTED at a
 * general meeting it is read-only and a change starts a new version. Adopting
 * a new version supersedes the old one.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { logActivity } from "@/lib/queries/activity-log";
import { budgetAdoptionProblem, budgetEditProblem, currentBudgets } from "./budget-status";
export { budgetEditable } from "./budget-status";
import { generalMeetingResolutionProblem } from "./resolutions";

export class BudgetError extends Error {}

const ts = (v: string) => v as unknown as TimestampString<3>;

export async function getBudgets(schemeId: string, financialYear?: number) {
  return db.orm.public.Budget
    .where((b) => (financialYear == null ? b.schemeId.eq(schemeId) : and(b.schemeId.eq(schemeId), b.financialYear.eq(financialYear))))
    .orderBy([(b) => b.financialYear.desc(), (b) => b.version.desc()])
    .limit(500)
    .all();
}

/** The budget in force for each fund in a year: the adopted version, else the latest. */
export async function getCurrentBudgets(schemeId: string, financialYear: number) {
  return currentBudgets(await getBudgets(schemeId, financialYear));
}

/** Ids of the budgets in force, for filtering budget lines. */
export async function currentBudgetIds(schemeId: string, financialYear: number): Promise<string[]> {
  return (await getCurrentBudgets(schemeId, financialYear)).map((b) => b.id);
}

/** The budget lines in force for a scheme and year. */
export async function currentBudgetLines(schemeId: string, financialYear: number, fundId?: string) {
  const ids = (await getCurrentBudgets(schemeId, financialYear)).filter((b) => !fundId || b.fundId === fundId).map((b) => b.id);
  if (ids.length === 0) return [];
  return db.orm.public.BudgetLine.where((l) => l.budgetId.in(ids)).include("fund").orderBy((l) => l.createdAt.asc()).limit(2000).all();
}

/**
 * The budget a new line goes into: the current draft or proposed version, or
 * a new draft version 1. Refuses when the budget in force is adopted.
 */
export async function editableBudgetFor(schemeId: string, fundId: string, financialYear: number, actorId: string) {
  const fund = await db.orm.public.Fund.where((f) => f.id.eq(fundId)).first();
  if (!fund || fund.schemeId !== schemeId) throw new BudgetError("Fund not found.");
  const versions = (await getBudgets(schemeId, financialYear)).filter((b) => b.fundId === fundId);
  const editing = versions.filter((b) => b.status === "DRAFT" || b.status === "PROPOSED").sort((a, b) => b.version - a.version)[0];
  if (editing) return editing;
  const adopted = versions.find((b) => b.status === "ADOPTED");
  if (adopted) throw new BudgetError(budgetEditProblem("ADOPTED")!);
  return db.orm.public.Budget.create({
    schemeId,
    fundId,
    financialYear,
    version: 1,
    status: "DRAFT",
    adoptedMeetingId: null,
    adoptedMotionId: null,
    adoptedAt: null,
    adoptedBy: null,
    createdBy: actorId,
  });
}

/** Refuse a change to a line whose budget is no longer editable. */
export async function assertLineEditable(schemeId: string, budgetLineId: string) {
  const line = await db.orm.public.BudgetLine.where((l) => l.id.eq(budgetLineId)).include("fund").first();
  if (!line || line.fund?.schemeId !== schemeId) throw new BudgetError("Budget line not found.");
  if (!line.budgetId) return line;
  const budget = await db.orm.public.Budget.where((b) => b.id.eq(line.budgetId!)).first();
  const problem = budget ? budgetEditProblem(budget.status) : null;
  if (problem) throw new BudgetError(problem);
  return line;
}

async function loadBudget(schemeId: string, budgetId: string) {
  const b = await db.orm.public.Budget.where((x) => x.id.eq(budgetId)).first();
  if (!b || b.schemeId !== schemeId) throw new BudgetError("Budget not found.");
  return b;
}

/** Put a draft budget to the owners for adoption. */
export async function proposeBudget(schemeId: string, budgetId: string, actorId: string) {
  const b = await loadBudget(schemeId, budgetId);
  if (b.status !== "DRAFT") throw new BudgetError("Only a draft budget can be proposed.");
  await db.orm.public.Budget.where((x) => x.id.eq(b.id)).update({ status: "PROPOSED", updatedAt: ts(new Date().toISOString()) });
  await logActivity({ schemeId, actorId, action: "BUDGET_PROPOSED", entityType: "Budget", entityId: b.id, metadata: { financialYear: b.financialYear, version: b.version } });
}

/** Record adoption at a general meeting. Any earlier adopted version for the fund and year is superseded. */
export async function adoptBudget(schemeId: string, budgetId: string, meetingId: string | null, motionId: string | null, actorId: string) {
  const b = await loadBudget(schemeId, budgetId);
  const problem = budgetAdoptionProblem({ status: b.status, meetingId, motionId }) ?? (await generalMeetingResolutionProblem(schemeId, meetingId, motionId));
  if (problem) throw new BudgetError(problem);
  await db.transaction(async (tx) => {
    await tx.orm.public.Budget
      .where((x) => and(x.fundId.eq(b.fundId), x.financialYear.eq(b.financialYear), x.status.eq("ADOPTED")))
      .update({ status: "SUPERSEDED", updatedAt: ts(new Date().toISOString()) });
    await tx.orm.public.Budget.where((x) => x.id.eq(b.id)).update({
      status: "ADOPTED",
      adoptedMeetingId: meetingId,
      adoptedMotionId: motionId,
      adoptedAt: ts(new Date().toISOString()),
      adoptedBy: actorId,
      updatedAt: ts(new Date().toISOString()),
    });
    // Older drafts for the same fund and year are replaced by the adopted version.
    await tx.orm.public.Budget
      .where((x) => and(x.fundId.eq(b.fundId), x.financialYear.eq(b.financialYear), x.status.in(["DRAFT", "PROPOSED"]), x.version.lt(b.version)))
      .update({ status: "SUPERSEDED", updatedAt: ts(new Date().toISOString()) });
  });
  await logActivity({ schemeId, actorId, action: "BUDGET_ADOPTED", entityType: "Budget", entityId: b.id, metadata: { meetingId, motionId, version: b.version } });
}

/** Start a revision of an adopted budget: a new draft version with a copy of its lines. */
export async function reviseBudget(schemeId: string, budgetId: string, actorId: string) {
  const b = await loadBudget(schemeId, budgetId);
  if (b.status !== "ADOPTED") throw new BudgetError("Only an adopted budget is revised. Edit a draft directly.");
  const versions = await db.orm.public.Budget.where((x) => and(x.fundId.eq(b.fundId), x.financialYear.eq(b.financialYear))).limit(100).all();
  if (versions.some((v) => v.status === "DRAFT" || v.status === "PROPOSED")) throw new BudgetError("A revision of this budget is already in progress.");
  const next = Math.max(...versions.map((v) => v.version)) + 1;
  const lines = await db.orm.public.BudgetLine.where((l) => l.budgetId.eq(b.id)).limit(2000).all();
  const created = await db.transaction(async (tx) => {
    const nb = await tx.orm.public.Budget.create({
      schemeId,
      fundId: b.fundId,
      financialYear: b.financialYear,
      version: next,
      status: "DRAFT",
      adoptedMeetingId: null,
      adoptedMotionId: null,
      adoptedAt: null,
      adoptedBy: null,
      createdBy: actorId,
    });
    for (const l of lines) {
      await tx.orm.public.BudgetLine.create({
        fundId: l.fundId,
        accountCodeId: l.accountCodeId,
        financialYear: l.financialYear,
        budgetId: nb.id,
        budgetAmount: l.budgetAmount,
        notes: l.notes,
      });
    }
    return nb;
  });
  await logActivity({ schemeId, actorId, action: "BUDGET_REVISION_STARTED", entityType: "Budget", entityId: created.id, metadata: { from: b.id, version: next } });
  return created;
}
