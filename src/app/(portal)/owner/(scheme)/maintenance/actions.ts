"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { getSchemeNameById, getMemberEmailsForScheme } from "@/lib/queries/schemes";
import { createWorkOrder } from "@/lib/queries/work-orders";
import { notifyWorkOrderCreated } from "@/lib/notifications";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export async function createOwnerWorkOrderAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
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

  let profile;
  try {
    ({ profile } = await requireSchemeMembership(schemeId, ["OWNER", "COMMITTEE"]));
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  try {
    const wo = await createWorkOrder({
      schemeId,
      raisedById: profile.id,
      title,
      description,
      priority,
    });

    // Send email notification to committee and adviser members (non-blocking)
    const schemeName = await getSchemeNameById(schemeId);
    const committeeEmails = await getMemberEmailsForScheme(schemeId, "COMMITTEE");
    const adviserEmails = await getMemberEmailsForScheme(schemeId, "ADVISER");
    const recipientEmails = [...committeeEmails, ...adviserEmails];
    const raisedByName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ") || "An owner";

    if (recipientEmails.length > 0) {
      notifyWorkOrderCreated({
        recipientEmails,
        workOrderId: wo.id,
        workOrderTitle: title,
        schemeName,
        raisedByName,
        priority,
        portalPath: "/owner/maintenance",
      }).catch(() => {});
    }

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
