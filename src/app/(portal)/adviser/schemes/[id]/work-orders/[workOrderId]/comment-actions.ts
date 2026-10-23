"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError, requireSchemeMembership } from "@/lib/auth/require-membership";
import { addComment, deleteComment, getWorkOrderById } from "@/lib/queries/work-orders";

/**
 * The caller must be an adviser on the scheme, and the work order must
 * belong to that scheme (SEC-004). Previously these actions checked only
 * that someone was signed in.
 */
async function authoriseWorkOrder(schemeId: string, workOrderId: string) {
  const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder || workOrder.schemeId !== schemeId) {
    throw new AuthorisationError("Work order not found.");
  }
  return { profile, workOrder };
}

export async function addCommentAction(
  schemeId: string,
  workOrderId: string,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Comment cannot be empty." };
  if (content.length > 5000) return { error: "Comment is too long." };

  try {
    const { profile } = await authoriseWorkOrder(schemeId, workOrderId);
    await addComment({
      workOrderId,
      authorId: profile.id,
      content,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add comment. Please try again." };
  }
}

export async function deleteCommentAction(
  schemeId: string,
  workOrderId: string,
  commentId: string,
): Promise<{ error?: string }> {
  try {
    await authoriseWorkOrder(schemeId, workOrderId);
    await deleteComment(commentId, workOrderId);
    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete comment." };
  }
}
