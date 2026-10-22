"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import {
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  addComment,
  getWorkOrderById,
} from "@/lib/queries/work-orders";
import { logActivity } from "@/lib/queries/activity-log";
import { getSchemeNameById, getMemberEmailsForScheme } from "@/lib/queries/schemes";
import {
  notifyWorkOrderCreated,
  notifyWorkOrderStatusChange,
} from "@/lib/notifications";

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
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

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

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_CREATED",
      entityType: "WorkOrder",
      entityId: wo.id,
      metadata: { title, priority },
    });

    // Send email notification to all scheme members (non-blocking)
    const schemeName = await getSchemeNameById(schemeId);
    const memberEmails = await getMemberEmailsForScheme(schemeId);
    const raisedByName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ") || "A scheme member";

    notifyWorkOrderCreated({
      recipientEmails: memberEmails,
      workOrderId: wo.id,
      workOrderTitle: title,
      schemeName,
      raisedByName,
      priority,
      portalPath: "/owner/maintenance",
    }).catch(() => {});

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/work-orders/${wo.id}`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
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
    await requireSchemeMembership(schemeId, ["ADVISER"]);

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
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update work order. Please try again." };
  }
}

export async function updateWorkOrderStatusAction(
  schemeId: string,
  workOrderId: string,
  status: string,
  actualCost?: number,
) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const data: Parameters<typeof updateWorkOrder>[1] = { status };
    if (status === "COMPLETED") {
      data.completedAt = new Date().toISOString();
      if (actualCost != null) data.actualCost = actualCost;
    }
    await updateWorkOrder(workOrderId, data);

    if (status === "COMPLETED") {
      await logActivity({
        schemeId,
        actorId: profile.id,
        action: "WORK_ORDER_COMPLETED",
        entityType: "WorkOrder",
        entityId: workOrderId,
        metadata: { actualCost },
      });
    }

    // Notify the person who raised the work order about the status change
    const wo = await getWorkOrderById(workOrderId);
    if (wo?.raisedBy) {
      const schemeName = await getSchemeNameById(schemeId);
      const updatedByName = [profile.firstName, profile.lastName]
        .filter(Boolean)
        .join(" ") || "A scheme manager";

      notifyWorkOrderStatusChange({
        recipientEmail: wo.raisedBy.email,
        workOrderId,
        workOrderTitle: wo.title,
        schemeName,
        status,
        updatedByName,
        portalPath: "/owner/maintenance",
      }).catch(() => {});
    }

    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update status." };
  }
}

export async function deleteWorkOrderAction(
  schemeId: string,
  workOrderId: string,
) {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    await deleteWorkOrder(workOrderId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/work-orders`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
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
  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Comment cannot be empty." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await addComment({
      workOrderId,
      authorId: profile.id,
      content,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/work-orders/${workOrderId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add comment." };
  }
}
