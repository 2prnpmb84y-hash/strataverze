"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError, requirePlatformAdmin } from "@/lib/auth/require-membership";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { chargeComplianceVerification } from "@/lib/billing/contractor-fees";
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

/**
 * Contractor applications are reviewed by StrataVerze staff only (platform
 * admins). Previously any signed-in user, including the contractor, could.
 * Each review action also needs an authenticator check in the last 15
 * minutes (S4 step-up).
 */
async function requireReviewer() {
  const profile = await requirePlatformAdmin();
  await requireRecentMfa();
  return profile;
}

/** Whether the reviewer is a contact of the contractor they are reviewing. */
async function isOwnContractor(profileId: string, contractorId: string) {
  const contact = await db.orm.public.ContractorContact
    .where((c) => and(c.profileId.eq(profileId), c.contractorBusinessId.eq(contractorId)))
    .first();
  return !!contact;
}

// ─── Approve Contractor Application ─────────────────────────────

export async function approveContractor(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireReviewer();
    const contractorId = formData.get("contractorId") as string;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!contractorId) return { error: "Contractor ID is required." };
    if (await isOwnContractor(profile.id, contractorId)) {
      return { error: "You cannot approve your own business." };
    }

    // Approval and the first compliance verification charge together.
    // The charge is only raised if the contractor confirmed it.
    await db.transaction(async (tx) => {
      await tx.orm.public.ContractorBusiness
        .where({ id: contractorId })
        .update({ status: "APPROVED" });
      await chargeComplianceVerification(tx.orm, { contractorBusinessId: contractorId, year: 1, actorId: profile.id });
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
    await recordSecurityEvent({ action: "contractor.approved", outcome: "allowed", actorProfileId: profile.id, actorRole: "platform_admin", resourceType: "ContractorBusiness", resourceId: contractorId });
    return { success: true, error: null };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to approve contractor." };
  }
}

// ─── Reject Contractor Application ──────────────────────────────

export async function rejectContractor(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireReviewer();
    const contractorId = formData.get("contractorId") as string;
    const reason = (formData.get("reason") as string)?.trim();

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!reason) return { error: "A reason for rejection is required." };
    if (await isOwnContractor(profile.id, contractorId)) {
      return { error: "You cannot review your own business." };
    }

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
    await recordSecurityEvent({ action: "contractor.rejected", outcome: "allowed", actorProfileId: profile.id, actorRole: "platform_admin", resourceType: "ContractorBusiness", resourceId: contractorId });
    return { success: true, error: null };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to reject contractor." };
  }
}

// ─── Request Clarification ──────────────────────────────────────

export async function requestClarification(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireReviewer();
    const contractorId = formData.get("contractorId") as string;
    const message = (formData.get("message") as string)?.trim();

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!message) return { error: "A clarification message is required." };
    if (await isOwnContractor(profile.id, contractorId)) {
      return { error: "You cannot review your own business." };
    }

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
    await recordSecurityEvent({ action: "contractor.clarification_requested", outcome: "allowed", actorProfileId: profile.id, actorRole: "platform_admin", resourceType: "ContractorBusiness", resourceId: contractorId });
    return { success: true, error: null };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to request clarification." };
  }
}

// ─── Suspend Contractor ─────────────────────────────────────────

export async function suspendContractor(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const reviewer = await requireReviewer();
    const contractorId = formData.get("contractorId") as string;
    const reason = (formData.get("reason") as string)?.trim();

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!reason) return { error: "A reason for suspension is required." };

    await db.orm.public.ContractorBusiness
      .where({ id: contractorId })
      .update({ status: "SUSPENDED" });

    revalidatePath("/adviser/contractors");
    revalidatePath(`/adviser/contractors/${contractorId}`);
    await recordSecurityEvent({ action: "contractor.suspended", outcome: "allowed", actorProfileId: reviewer.id, actorRole: "platform_admin", resourceType: "ContractorBusiness", resourceId: contractorId });
    return { success: true, error: null };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to suspend contractor." };
  }
}

// ─── Resolve Review Item ────────────────────────────────────────

export async function resolveReviewItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireReviewer();
    const reviewItemId = formData.get("reviewItemId") as string;
    const outcome = formData.get("outcome") as string;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!reviewItemId) return { error: "Review item ID is required." };
    if (!outcome) return { error: "Outcome is required." };

    // A reviewer cannot resolve review items about their own business (L3).
    const item = await db.orm.public.ContractorReviewItem
      .where((r) => r.id.eq(reviewItemId))
      .first();
    if (!item) return { error: "Review item not found." };
    if (await isOwnContractor(profile.id, item.contractorBusinessId)) {
      return { error: "You cannot review your own business." };
    }

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
    await recordSecurityEvent({ action: "contractor.review_item_resolved", outcome: "allowed", actorProfileId: profile.id, actorRole: "platform_admin", resourceType: "ContractorReviewItem", resourceId: reviewItemId });
    return { success: true, error: null };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to resolve review item." };
  }
}
