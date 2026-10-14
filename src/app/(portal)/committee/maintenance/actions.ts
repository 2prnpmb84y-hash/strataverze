"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee, getSchemeNameById, getMemberEmailsForScheme } from "@/lib/queries/schemes";
import { createWorkOrder } from "@/lib/queries/work-orders";
import { notifyWorkOrderCreated } from "@/lib/notifications";

export type CommitteeWorkOrderFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const CATEGORIES = ["PLUMBING", "ELECTRICAL", "STRUCTURAL", "LANDSCAPING", "CLEANING", "SECURITY", "OTHER"];

export async function createCommitteeWorkOrderAction(
  _prev: CommitteeWorkOrderFormState,
  formData: FormData,
): Promise<CommitteeWorkOrderFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) return { error: "You are not on any scheme committees." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const priority = formData.get("priority") as string;
  const category = (formData.get("category") as string) || undefined;
  const schemeId = formData.get("schemeId") as string | null;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!description) errors.description = "Description is required.";
  if (!priority || !PRIORITIES.includes(priority))
    errors.priority = "Select a valid priority.";
  if (category && !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (!schemeId || !schemes.some((s) => s.id === schemeId))
    errors.schemeId = "Select a valid scheme.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const wo = await createWorkOrder({
      schemeId: schemeId!,
      raisedById: profile.id,
      title,
      description,
      priority,
      category: category || undefined,
    });

    // Send email notification to all scheme members (non-blocking)
    const schemeName = await getSchemeNameById(schemeId!);
    const memberEmails = await getMemberEmailsForScheme(schemeId!);
    const raisedByName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ") || "A committee member";

    notifyWorkOrderCreated({
      recipientEmails: memberEmails,
      workOrderId: wo.id,
      workOrderTitle: title,
      schemeName,
      raisedByName,
      priority,
      portalPath: "/committee/maintenance",
    }).catch(() => {});

    revalidatePath("/committee/maintenance");
    redirect("/committee/maintenance");
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
