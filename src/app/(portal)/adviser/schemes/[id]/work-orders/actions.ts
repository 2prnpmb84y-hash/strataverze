"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  addComment,
} from "@/lib/queries/work-orders";

export type WorkOrderFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const CATEGORIES = ["PLUMBING", "ELECTRICAL", "STRUCTURAL", "LANDSCAPING", "CLEANING", "SECURITY", "OTHER"];

export async function createWorkOrderAction(
  schemeId: string,
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const priority = formData.get("priority") as string;
  const category = (formData.get("category") as string) || undefined;
  const estimatedCost = (formData.get("estimatedCost") as string)?.trim();
  const assignedTo = (formData.get("assignedTo") as string)?.trim();

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!description) errors.description = "Description is required.";
  if (!priority || !PRIORITIES.includes(priority))
    errors.priority = "Select a valid priority.";
  if (category && !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (estimatedCost && isNaN(Number(estimatedCost)))
    errors.estimatedCost = "Must be a valid number.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const wo = await createWorkOrder({
      schemeId,
      raisedById: profile.id,
      title,
      description,
      priority,
      category: category || undefined,
      estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
      assignedTo: assignedTo || undefined,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/work-orders/${wo.id}`);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to create work order. Please try again." };
  }
}

export async function updateWorkOrderAction(
  schemeId: string,
  workOrderId: string,
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const priority = formData.get("priority") as string;
  const category = (formData.get("category") as string) || null;
  const estimatedCost = (formData.get("estimatedCost") as string)?.trim();
  const assignedTo = (formData.get("assignedTo") as string)?.trim();

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!description) errors.description = "Description is required.";
  if (!priority || !PRIORITIES.includes(priority))
    errors.priority = "Select a valid priority.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    await updateWorkOrder(workOrderId, {
      title,
      description,
      priority,
      category: category || null,
      estimatedCost: estimatedCost ? Number(estimatedCost) : null,
      assignedTo: assignedTo || null,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    return {};
  } catch {
    return { error: "Failed to update work order. Please try again." };
  }
}

export async function updateWorkOrderStatusAction(
  schemeId: string,
  workOrderId: string,
  status: string,
  actualCost?: number,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    const data: Parameters<typeof updateWorkOrder>[1] = { status };
    if (status === "COMPLETED") {
      data.completedAt = new Date().toISOString();
      if (actualCost != null) data.actualCost = actualCost;
    }
    await updateWorkOrder(workOrderId, data);
    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch {
    return { error: "Failed to update status." };
  }
}

export async function deleteWorkOrderAction(
  schemeId: string,
  workOrderId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteWorkOrder(workOrderId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}`);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete work order." };
  }
}

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
    return { error: "Failed to add comment." };
  }
}
