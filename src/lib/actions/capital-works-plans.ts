"use server";
import { logError } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import {
  CapitalWorksPlanError,
  addPlanItem,
  adoptPlan,
  copyPlanForReview,
  createPlan,
  generateLevyFromPlan,
  removePlanItem,
  updatePlanSettings,
} from "@/lib/finance/capital-works-plans";
import type { ContributionMethod } from "@/lib/finance/capital-works-plan";

export type PlanActionState = { error?: string; success?: boolean; id?: string };

const base = (schemeId: string) => `/adviser/schemes/${schemeId}/finance/capital-works`;
const cents = (v: FormDataEntryValue | null) => Math.round((parseFloat(String(v ?? "")) || 0) * 100);
const method = (v: FormDataEntryValue | null): ContributionMethod => (String(v) === "AVERAGE" ? "AVERAGE" : "LEVEL");

function failure(err: unknown, fallback: string): PlanActionState {
  if (err instanceof AuthorisationError || err instanceof CapitalWorksPlanError) return { error: err.message };
  logError(fallback, err);
  return { error: fallback };
}

export async function createPlanAction(schemeId: string, _prev: PlanActionState, formData: FormData): Promise<PlanActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const plan = await createPlan({
      schemeId,
      title: String(formData.get("title") ?? ""),
      preparedBy: String(formData.get("preparedBy") ?? "") || null,
      preparedAt: String(formData.get("preparedAt") ?? ""),
      periodStartYear: Number(formData.get("periodStartYear")),
      openingBalanceCents: cents(formData.get("openingBalance")),
      method: method(formData.get("method")),
      actorId: profile.id,
    });
    revalidatePath(base(schemeId));
    return { success: true, id: plan.id };
  } catch (err) {
    return failure(err, "Failed to create the plan.");
  }
}

export async function addPlanItemAction(schemeId: string, planId: string, _prev: PlanActionState, formData: FormData): Promise<PlanActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await addPlanItem(
      schemeId,
      planId,
      {
        description: String(formData.get("description") ?? ""),
        component: String(formData.get("component") ?? "") || null,
        plannedYear: Number(formData.get("plannedYear")),
        estimatedCostCents: cents(formData.get("estimatedCost")),
        notes: String(formData.get("notes") ?? "") || null,
      },
      profile.id,
    );
    revalidatePath(`${base(schemeId)}/${planId}`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to add the item.");
  }
}

export async function removePlanItemAction(schemeId: string, planId: string, itemId: string): Promise<PlanActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await removePlanItem(schemeId, planId, itemId, profile.id);
    revalidatePath(`${base(schemeId)}/${planId}`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to remove the item.");
  }
}

export async function updatePlanSettingsAction(schemeId: string, planId: string, _prev: PlanActionState, formData: FormData): Promise<PlanActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await updatePlanSettings(schemeId, planId, { openingBalanceCents: cents(formData.get("openingBalance")), method: method(formData.get("method")) }, profile.id);
    revalidatePath(`${base(schemeId)}/${planId}`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to save.");
  }
}

export async function adoptPlanAction(schemeId: string, planId: string, meetingId: string, motionId: string): Promise<PlanActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await adoptPlan(schemeId, planId, meetingId || null, motionId || null, profile.id);
    revalidatePath(base(schemeId));
    revalidatePath(`${base(schemeId)}/${planId}`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to record the plan's adoption.");
  }
}

export async function reviewPlanAction(schemeId: string, planId: string): Promise<PlanActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const draft = await copyPlanForReview(schemeId, planId, today, profile.id);
    revalidatePath(base(schemeId));
    return { success: true, id: draft.id };
  } catch (err) {
    return failure(err, "Failed to start the review.");
  }
}

export async function generateLevyFromPlanAction(schemeId: string, _prev: PlanActionState, formData: FormData): Promise<PlanActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const schedule = await generateLevyFromPlan({
      schemeId,
      financialYear: Number(formData.get("financialYear")),
      frequency: String(formData.get("frequency") ?? "QUARTERLY"),
      actorId: profile.id,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/finance/levies`);
    return { success: true, id: schedule.id };
  } catch (err) {
    return failure(err, "Failed to create the levy schedule.");
  }
}
