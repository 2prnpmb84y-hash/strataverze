"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getWorkOrderById, addComment } from "@/lib/queries/work-orders";

export async function addCommentAction(
  workOrderId: string,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  // Verify the user is an owner of the scheme this work order belongs to
  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder) return { error: "Work order not found." };

  const schemes = await getSchemesForOwner(profile.id);
  const isOwner = schemes.some((s) => s.id === workOrder.schemeId);
  if (!isOwner) return { error: "You do not have access to this work order." };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Comment cannot be empty." };

  try {
    await addComment({
      workOrderId,
      authorId: profile.id,
      content,
    });
    revalidatePath(`/owner/maintenance/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to add comment. Please try again." };
  }
}
