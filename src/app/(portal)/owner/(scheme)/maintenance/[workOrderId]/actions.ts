"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { rolesAllow } from "@/config/permissions";
import { committeeMayTransition } from "@/lib/work-orders/status-transitions";
import {
  getWorkOrderById,
  addComment,
  deleteComment,
  updateWorkOrder,
} from "@/lib/queries/work-orders";

/**
 * Verify the current user has an OWNER or COMMITTEE membership on the work
 * order's scheme. Returns the profile and whether they may manage work orders
 * on THAT scheme (every role they hold there is considered, so an owner who is
 * also on the committee counts as committee). Throws AuthorisationError.
 */
async function verifyAccess(workOrderSchemeId: string) {
  const { profile, roles } = await requireSchemeAccess(workOrderSchemeId, "maintenance.request");
  return { profile, canManage: rolesAllow(roles, "maintenance.manage") };
}

export async function addCommentAction(
  workOrderId: string,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  let access;
  try {
    access = await verifyAccess(workOrder.schemeId);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

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

  let access;
  try {
    access = await verifyAccess(workOrder.schemeId);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  // Only committee members can delete comments
  if (!access.canManage) {
    return { error: "Only committee members can delete comments." };
  }

  try {
    await deleteComment(commentId, workOrderId);
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

  let access;
  try {
    access = await verifyAccess(workOrder.schemeId);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  // Only committee members can update status, and only forward (F16).
  if (!access.canManage) {
    return { error: "Only committee members can update work order status." };
  }
  if (!committeeMayTransition(workOrder.status, status)) {
    return { error: "That status change is not allowed." };
  }

  try {
    const data: Parameters<typeof updateWorkOrder>[2] = { status };
    if (status === "COMPLETED") {
      data.completedAt = new Date().toISOString();
    }
    await updateWorkOrder(workOrder.schemeId, workOrderId, data);
    revalidatePath(`/owner/maintenance/${workOrderId}`);
    revalidatePath("/owner/maintenance");
    return {};
  } catch {
    return { error: "Failed to update status." };
  }
}
