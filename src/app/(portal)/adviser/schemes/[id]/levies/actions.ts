"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  createLevy,
  updateLevy,
  deleteLevy,
  issueLevy,
  markLevyItemPaid,
} from "@/lib/queries/levies";

export type LevyFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const LEVY_TYPES = ["ORDINARY", "SPECIAL"];

function validateLevyForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const title = formData.get("title") as string | null;
  const totalAmount = formData.get("totalAmount") as string | null;
  const dueDate = formData.get("dueDate") as string | null;
  const levyType = formData.get("levyType") as string | null;

  if (!title?.trim()) errors.title = "Title is required.";
  if (!totalAmount || Number(totalAmount) <= 0)
    errors.totalAmount = "Total amount must be greater than zero.";
  if (!dueDate) errors.dueDate = "Due date is required.";
  if (levyType && !LEVY_TYPES.includes(levyType))
    errors.levyType = "Select a valid levy type.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      title: title?.trim() ?? "",
      description: (formData.get("description") as string)?.trim() || undefined,
      totalAmount: Number(totalAmount),
      dueDate: new Date(dueDate ?? "").toISOString(),
      levyType: levyType ?? "ORDINARY",
    },
  };
}

export async function createLevyAction(
  schemeId: string,
  _prev: LevyFormState,
  formData: FormData,
): Promise<LevyFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateLevyForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    const levy = await createLevy({ ...data, schemeId });
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/levies/${levy.id}`);
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
    return { error: "Failed to create levy. Please try again." };
  }
}

export async function updateLevyAction(
  schemeId: string,
  levyId: string,
  _prev: LevyFormState,
  formData: FormData,
): Promise<LevyFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateLevyForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    await updateLevy(levyId, data);
    revalidatePath(`/adviser/schemes/${schemeId}/levies/${levyId}`);
    return {};
  } catch {
    return { error: "Failed to update levy. Please try again." };
  }
}

export async function deleteLevyAction(schemeId: string, levyId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteLevy(levyId);
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
    return { error: "Failed to delete levy." };
  }
}

export async function issueLevyAction(schemeId: string, levyId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await issueLevy(levyId);
    revalidatePath(`/adviser/schemes/${schemeId}/levies/${levyId}`);
    return {};
  } catch {
    return { error: "Failed to issue levy." };
  }
}

export async function markItemPaidAction(
  schemeId: string,
  levyId: string,
  itemId: string,
  amount: number,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await markLevyItemPaid(itemId, amount);
    revalidatePath(`/adviser/schemes/${schemeId}/levies/${levyId}`);
    return {};
  } catch {
    return { error: "Failed to record payment." };
  }
}
