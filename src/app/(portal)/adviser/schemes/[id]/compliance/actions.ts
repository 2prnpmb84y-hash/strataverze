"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  createComplianceItem,
  updateComplianceItem,
  deleteComplianceItem,
} from "@/lib/queries/compliance";

export type ComplianceFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const CATEGORIES = ["INSURANCE", "FIRE_SAFETY", "OHS", "BUILDING", "OTHER"];

export async function createComplianceAction(
  schemeId: string,
  _prev: ComplianceFormState,
  formData: FormData,
): Promise<ComplianceFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = formData.get("category") as string;
  const dueDate = (formData.get("dueDate") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim();

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const item = await createComplianceItem({
      schemeId,
      title,
      description: description || undefined,
      category,
      dueDate: dueDate || undefined,
      notes: notes || undefined,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath("/adviser/compliance");
    redirect(`/adviser/schemes/${schemeId}/compliance/${item.id}`);
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
    return { error: "Failed to create compliance item. Please try again." };
  }
}

export async function updateComplianceAction(
  schemeId: string,
  itemId: string,
  _prev: ComplianceFormState,
  formData: FormData,
): Promise<ComplianceFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = formData.get("category") as string;
  const dueDate = (formData.get("dueDate") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim();

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    await updateComplianceItem(itemId, {
      title,
      description: description || null,
      category,
      dueDate: dueDate || null,
      notes: notes || null,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/compliance/${itemId}`);
    revalidatePath("/adviser/compliance");
    return {};
  } catch {
    return { error: "Failed to update compliance item. Please try again." };
  }
}

export async function updateComplianceStatusAction(
  schemeId: string,
  itemId: string,
  status: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    const data: { status: string; lastChecked?: string } = { status };
    if (status === "COMPLIANT") {
      data.lastChecked = new Date().toISOString();
    }
    await updateComplianceItem(itemId, data);
    revalidatePath(`/adviser/schemes/${schemeId}/compliance/${itemId}`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath("/adviser/compliance");
    return {};
  } catch {
    return { error: "Failed to update status." };
  }
}

export async function deleteComplianceAction(
  schemeId: string,
  itemId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteComplianceItem(itemId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath("/adviser/compliance");
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
    return { error: "Failed to delete compliance item." };
  }
}
