"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";

// ─── Types ──────────────────────────────────────────────────────

interface ActionResult {
  error: string | null;
  success?: true;
}

// ─── Helpers ────────────────────────────────────────────────────

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

// ─── Helpers ────────────────────────────────────────────────────

async function requireAuth() {
  const { getCurrentProfile } = await import("@/lib/queries/profiles");
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  return profile;
}

// ─── Approve Contractor Application ─────────────────────────────

export async function approveContractor(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!contractorId) return { error: "Contractor ID is required." };

    // Update business status
    await db.orm.public.ContractorBusiness
      .where({ id: contractorId })
      .update({
        status: "APPROVED",
      });

    // Update onboarding status
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update({ status: "APPROVED" });

    // Resolve any PENDING NEW_APPLICATION review items
    const pendingItems = await db.orm.public.ContractorReviewItem
      .where((r) =>
        and(
          r.contractorBusinessId.eq(contractorId),
          r.queueType.eq("NEW_APPLICATION"),
          r.status.eq("PENDING"),
        ),
      )
      .all();

    for (const item of pendingItems) {
      await db.orm.public.ContractorReviewItem
        .where({ id: item.id })
        .update({
          status: "APPROVED",
          outcome: toVarchar<100>("APPROVED"),
          outcomeNotes: notes,
          completedById: profile.id,
          completedAt: toTimestamp(new Date().toISOString()),
        });
    }

    revalidatePath("/adviser/contractors");
    revalidatePath(`/adviser/contractors/${contractorId}`);
    return { success: true, error: null };
  } catch {
    return { error: "Failed to approve contractor." };
  }
}

// ─── Reject Contractor Application ──────────────────────────────

export async function rejectContractor(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const reason = (formData.get("reason") as string)?.trim();

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!reason) return { error: "A reason for rejection is required." };

    // Update business status
    await db.orm.public.ContractorBusiness
      .where({ id: contractorId })
      .update({ status: "REJECTED" });

    // Update onboarding status
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update({ status: "REJECTED" });

    // Resolve any PENDING NEW_APPLICATION review items
    const pendingItems = await db.orm.public.ContractorReviewItem
      .where((r) =>
        and(
          r.contractorBusinessId.eq(contractorId),
          r.queueType.eq("NEW_APPLICATION"),
          r.status.eq("PENDING"),
        ),
      )
      .all();

    for (const item of pendingItems) {
      await db.orm.public.ContractorReviewItem
        .where({ id: item.id })
        .update({
          status: "REJECTED",
          outcome: toVarchar<100>("REJECTED"),
          outcomeNotes: reason,
          completedById: profile.id,
          completedAt: toTimestamp(new Date().toISOString()),
        });
    }

    revalidatePath("/adviser/contractors");
    revalidatePath(`/adviser/contractors/${contractorId}`);
    return { success: true, error: null };
  } catch {
    return { error: "Failed to reject contractor." };
  }
}

// ─── Request Clarification ──────────────────────────────────────

export async function requestClarification(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const message = (formData.get("message") as string)?.trim();

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!message) return { error: "A clarification message is required." };

    // Update business status
    await db.orm.public.ContractorBusiness
      .where({ id: contractorId })
      .update({ status: "UNDER_REVIEW" });

    // Create a review item for the clarification request
    await db.orm.public.ContractorReviewItem.create({
      contractorBusinessId: contractorId,
      queueType: "MISSING_INFORMATION",
      status: "AWAITING_RESPONSE",
      priority: "NORMAL",
      assignedToId: profile.id,
      clarificationRequest: message,
      notes: `Clarification requested by reviewer`,
    });

    revalidatePath("/adviser/contractors");
    revalidatePath(`/adviser/contractors/${contractorId}`);
    return { success: true, error: null };
  } catch {
    return { error: "Failed to request clarification." };
  }
}

// ─── Suspend Contractor ─────────────────────────────────────────

export async function suspendContractor(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const reason = (formData.get("reason") as string)?.trim();

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!reason) return { error: "A reason for suspension is required." };

    await db.orm.public.ContractorBusiness
      .where({ id: contractorId })
      .update({ status: "SUSPENDED" });

    revalidatePath("/adviser/contractors");
    revalidatePath(`/adviser/contractors/${contractorId}`);
    return { success: true, error: null };
  } catch {
    return { error: "Failed to suspend contractor." };
  }
}

// ─── Resolve Review Item ────────────────────────────────────────

export async function resolveReviewItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const reviewItemId = formData.get("reviewItemId") as string;
    const outcome = formData.get("outcome") as string;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!reviewItemId) return { error: "Review item ID is required." };
    if (!outcome) return { error: "Outcome is required." };

    await db.orm.public.ContractorReviewItem
      .where({ id: reviewItemId })
      .update({
        status: outcome === "APPROVED" ? "APPROVED" : "REJECTED",
        outcome: toVarchar<100>(outcome),
        outcomeNotes: notes,
        completedById: profile.id,
        completedAt: toTimestamp(new Date().toISOString()),
      });

    revalidatePath("/adviser/contractors");
    return { success: true, error: null };
  } catch {
    return { error: "Failed to resolve review item." };
  }
}
