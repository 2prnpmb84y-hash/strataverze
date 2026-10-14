"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { createWorkOrder } from "@/lib/queries/work-orders";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export async function createOwnerWorkOrderAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const priority = formData.get("priority") as string;
  const schemeId = formData.get("schemeId") as string;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!description) errors.description = "Description is required.";
  if (!priority || !PRIORITIES.includes(priority))
    errors.priority = "Select a valid priority.";
  if (!schemeId) errors.schemeId = "Please select a scheme.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  // Verify the owner belongs to this scheme
  const schemes = await getSchemesForOwner(profile.id);
  const ownsScheme = schemes.some((s) => s.id === schemeId);
  if (!ownsScheme) return { error: "You do not belong to that scheme." };

  try {
    await createWorkOrder({
      schemeId,
      raisedById: profile.id,
      title,
      description,
      priority,
    });

    revalidatePath("/owner/maintenance");
    redirect("/owner/maintenance");
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
    return { error: "Failed to submit request. Please try again." };
  }
}
