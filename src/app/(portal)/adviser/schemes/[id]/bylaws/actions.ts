"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import {
  createBylawAtomic,
  updateBylaw,
  deleteBylaw,
} from "@/lib/queries/bylaws";
import { logActivity } from "@/lib/queries/activity-log";

export type BylawFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const CATEGORIES = [
  "GENERAL",
  "SAFETY",
  "PARKING",
  "PETS",
  "NOISE",
  "APPEARANCE",
  "BEHAVIOUR",
  "OTHER",
];
const STATUSES = ["ACTIVE", "AMENDED", "REPEALED"];

export async function createBylawAction(
  schemeId: string,
  _prev: BylawFormState,
  formData: FormData,
): Promise<BylawFormState> {
  const title = (formData.get("title") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  const category = formData.get("category") as string;
  const effectiveDate = (formData.get("effectiveDate") as string)?.trim();
  const motionRef = (formData.get("motionRef") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!body) errors.body = "By-law text is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (!effectiveDate) errors.effectiveDate = "Effective date is required.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    // Atomic: assigns next number, creates by-law, and logs activity
    // in a single transaction to prevent duplicate numbers.
    const bylaw = await createBylawAtomic({
      schemeId,
      title,
      body,
      category,
      effectiveDate: new Date(effectiveDate).toISOString(),
      motionRef,
      notes,
      actorId: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/bylaws/${bylaw.id}`);
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
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create by-law. Please try again." };
  }
}

export async function updateBylawAction(
  schemeId: string,
  bylawId: string,
  _prev: BylawFormState,
  formData: FormData,
): Promise<BylawFormState> {
  const title = (formData.get("title") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  const category = formData.get("category") as string;
  const status = formData.get("status") as string;
  const effectiveDate = (formData.get("effectiveDate") as string)?.trim();
  const amendedDate =
    (formData.get("amendedDate") as string)?.trim() || undefined;
  const repealedDate =
    (formData.get("repealedDate") as string)?.trim() || undefined;
  const motionRef = (formData.get("motionRef") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!body) errors.body = "By-law text is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (!status || !STATUSES.includes(status))
    errors.status = "Select a valid status.";
  if (!effectiveDate) errors.effectiveDate = "Effective date is required.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await updateBylaw(bylawId, {
      title,
      body,
      category,
      status,
      effectiveDate: new Date(effectiveDate).toISOString(),
      amendedDate: amendedDate
        ? new Date(amendedDate).toISOString()
        : null,
      repealedDate: repealedDate
        ? new Date(repealedDate).toISOString()
        : null,
      motionRef: motionRef ?? null,
      notes: notes ?? null,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BYLAW_UPDATED",
      entityType: "ByLaw",
      entityId: bylawId,
      metadata: { title, status },
    });

    revalidatePath(
      `/adviser/schemes/${schemeId}/bylaws/${bylawId}`,
    );
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update by-law. Please try again." };
  }
}

export async function deleteBylawAction(
  schemeId: string,
  bylawId: string,
) {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    await deleteBylaw(bylawId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/governance`);
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
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete by-law." };
  }
}
