"use server";
import { logError } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { BudgetError, adoptBudget, proposeBudget, reviseBudget } from "@/lib/finance/budgets";

export type BudgetActionResult = { error?: string; success?: boolean };

const path = (schemeId: string) => `/adviser/schemes/${schemeId}/finance/budget`;

function failure(err: unknown, fallback: string): BudgetActionResult {
  if (err instanceof AuthorisationError || err instanceof BudgetError) return { error: err.message };
  logError(fallback, err);
  return { error: fallback };
}

export async function proposeBudgetAction(schemeId: string, budgetId: string): Promise<BudgetActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await proposeBudget(schemeId, budgetId, profile.id);
    revalidatePath(path(schemeId));
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to propose the budget.");
  }
}

export async function adoptBudgetAction(schemeId: string, budgetId: string, meetingId: string, motionId: string): Promise<BudgetActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await adoptBudget(schemeId, budgetId, meetingId || null, motionId || null, profile.id);
    revalidatePath(path(schemeId));
    revalidatePath(`/adviser/schemes/${schemeId}/finance/levies`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to record the budget's adoption.");
  }
}

export async function reviseBudgetAction(schemeId: string, budgetId: string): Promise<BudgetActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await reviseBudget(schemeId, budgetId, profile.id);
    revalidatePath(path(schemeId));
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to start a revision.");
  }
}
