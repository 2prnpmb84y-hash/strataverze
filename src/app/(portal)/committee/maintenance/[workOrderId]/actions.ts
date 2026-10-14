"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import {
  getWorkOrderById,
  addComment,
  deleteComment,
  updateWorkOrder,
} from "@/lib/queries/work-orders";

async function verifyCommitteeMember(profileId: string, workOrderSchemeId: string) {
  const schemes = await getSchemesForCommittee(profileId);
  return schemes.some((s) => s.id === workOrderSchemeId);
}

export async function addCommentAction(
  workOrderId: string,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  const isCommittee = await verifyCommitteeMember(profile.id, workOrder.schemeId);
  if (!isCommittee) return { error: "You do not have access to this work order." };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Comment cannot be empty." };

  try {
    await addComment({
      workOrderId,
      authorId: profile.id,
      content,
    });
    revalidatePath(`/committee/maintenance/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to add comment. Please try again." };
  }
}

export async function deleteCommentAction(
  workOrderId: string,
  commentId: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  const isCommittee = await verifyCommitteeMember(profile.id, workOrder.schemeId);
  if (!isCommittee) return { error: "You do not have access to this work order." };

  try {
    await deleteComment(commentId);
    revalidatePath(`/committee/maintenance/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to delete comment." };
  }
}

export async function updateWorkOrderStatusAction(
  workOrderId: string,
  status: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  const isCommittee = await verifyCommitteeMember(profile.id, workOrder.schemeId);
  if (!isCommittee) return { error: "You do not have access to this work order." };

  try {
    const data: Parameters<typeof updateWorkOrder>[1] = { status };
    if (status === "COMPLETED") {
      data.completedAt = new Date().toISOString();
    }
    await updateWorkOrder(workOrderId, data);
    revalidatePath(`/committee/maintenance/${workOrderId}`);
    revalidatePath("/committee/maintenance");
    return {};
  } catch {
    return { error: "Failed to update status." };
  }
}
