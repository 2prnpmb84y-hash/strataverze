"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, hasCommitteeRole } from "@/lib/queries/profiles";
import { getSchemesForOwner, getSchemesForCommittee } from "@/lib/queries/schemes";
import {
  getWorkOrderById,
  addComment,
  deleteComment,
  updateWorkOrder,
} from "@/lib/queries/work-orders";

/**
 * Check whether the current user has access to the work order's scheme,
 * either as an owner or as a committee member. Returns the profile and
 * access flags, or null if no access.
 */
async function verifyAccess(workOrderSchemeId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const ownerSchemes = await getSchemesForOwner(profile.id);
  const isOwner = ownerSchemes.some((s) => s.id === workOrderSchemeId);

  let isCommittee = false;
  if (!isOwner) {
    isCommittee = await hasCommitteeRole(profile.id);
    if (isCommittee) {
      const committeeSchemes = await getSchemesForCommittee(profile.id);
      isCommittee = committeeSchemes.some((s) => s.id === workOrderSchemeId);
    }
  } else {
    isCommittee = await hasCommitteeRole(profile.id);
  }

  if (!isOwner && !isCommittee) return null;

  return { profile, isOwner, isCommittee };
}

export async function addCommentAction(
  workOrderId: string,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  const access = await verifyAccess(workOrder.schemeId);
  if (!access) return { error: "You do not have access to this work order." };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Comment cannot be empty." };

  try {
    await addComment({
      workOrderId,
      authorId: access.profile.id,
      content,
    });
    revalidatePath(`/owner/maintenance/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to add comment. Please try again." };
  }
}

export async function deleteCommentAction(
  workOrderId: string,
  commentId: string,
): Promise<{ error?: string }> {
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  const access = await verifyAccess(workOrder.schemeId);
  if (!access) return { error: "You do not have access to this work order." };

  // Only committee members can delete comments
  if (!access.isCommittee) {
    return { error: "Only committee members can delete comments." };
  }

  try {
    await deleteComment(commentId);
    revalidatePath(`/owner/maintenance/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to delete comment." };
  }
}

export async function updateWorkOrderStatusAction(
  workOrderId: string,
  status: string,
): Promise<{ error?: string }> {
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  const access = await verifyAccess(workOrder.schemeId);
  if (!access) return { error: "You do not have access to this work order." };

  // Only committee members can update status
  if (!access.isCommittee) {
    return { error: "Only committee members can update work order status." };
  }

  try {
    const data: Parameters<typeof updateWorkOrder>[1] = { status };
    if (status === "COMPLETED") {
      data.completedAt = new Date().toISOString();
    }
    await updateWorkOrder(workOrderId, data);
    revalidatePath(`/owner/maintenance/${workOrderId}`);
    revalidatePath("/owner/maintenance");
    return {};
  } catch {
    return { error: "Failed to update status." };
  }
}
