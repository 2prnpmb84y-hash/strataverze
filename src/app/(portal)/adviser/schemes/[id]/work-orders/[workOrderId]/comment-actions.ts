"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { addComment, deleteComment } from "@/lib/queries/work-orders";

export async function addCommentAction(
  schemeId: string,
  workOrderId: string,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Comment cannot be empty." };

  try {
    await addComment({
      workOrderId,
      authorId: profile.id,
      content,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to add comment. Please try again." };
  }
}

export async function deleteCommentAction(
  schemeId: string,
  workOrderId: string,
  commentId: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteComment(commentId);
    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to delete comment." };
  }
}
