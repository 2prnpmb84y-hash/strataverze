"use server";

import { revalidatePath } from "next/cache";
import { updateProfile } from "@/lib/queries/profiles";
import { requireAuth, AuthorisationError } from "@/lib/auth/require-membership";

export type ProfileFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  let profile;
  try {
    profile = await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  const firstName = (formData.get("firstName") as string | null)?.trim() ?? "";
  const lastName = (formData.get("lastName") as string | null)?.trim() ?? "";
  const phone = (formData.get("phone") as string | null)?.trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!firstName) fieldErrors.firstName = "First name is required.";
  if (!lastName) fieldErrors.lastName = "Last name is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  try {
    await updateProfile(profile.id, { firstName, lastName, phone });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { error: "Failed to update profile. Please try again." };
  }
}
