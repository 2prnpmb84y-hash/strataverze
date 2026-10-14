"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  createScheme,
  updateScheme,
  deleteScheme,
} from "@/lib/queries/schemes";
import { logActivity } from "@/lib/queries/activity-log";

export type SchemeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const AUSTRALIAN_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

function validateSchemeForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const name = formData.get("name") as string | null;
  const planNumber = formData.get("planNumber") as string | null;
  const address = formData.get("address") as string | null;
  const suburb = formData.get("suburb") as string | null;
  const state = formData.get("state") as string | null;
  const postcode = formData.get("postcode") as string | null;
  const totalLots = formData.get("totalLots") as string | null;
  const totalEntitlement = formData.get("totalEntitlement") as string | null;

  if (!name?.trim()) errors.name = "Scheme name is required.";
  if (!planNumber?.trim()) errors.planNumber = "Plan number is required.";
  if (!address?.trim()) errors.address = "Address is required.";
  if (!suburb?.trim()) errors.suburb = "Suburb is required.";
  if (!state || !AUSTRALIAN_STATES.includes(state))
    errors.state = "Select a valid state.";
  if (!postcode?.trim() || !/^\d{4}$/.test(postcode.trim()))
    errors.postcode = "Enter a valid 4-digit postcode.";
  if (!totalLots || Number(totalLots) < 1)
    errors.totalLots = "Must have at least 1 lot.";
  if (!totalEntitlement || Number(totalEntitlement) < 1)
    errors.totalEntitlement = "Total entitlement must be at least 1.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      name: name?.trim() ?? "",
      planNumber: planNumber?.trim() ?? "",
      address: address?.trim() ?? "",
      suburb: suburb?.trim() ?? "",
      state: state ?? "VIC",
      postcode: postcode?.trim() ?? "",
      totalLots: Number(totalLots),
      totalEntitlement: Number(totalEntitlement),
      financialYearEnd: (formData.get("financialYearEnd") as string) || "06-30",
      abnNumber: (formData.get("abnNumber") as string)?.trim() || undefined,
    },
  };
}

export async function createSchemeAction(
  _prev: SchemeFormState,
  formData: FormData,
): Promise<SchemeFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateSchemeForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    const scheme = await createScheme(data, profile.id);
    redirect(`/adviser/schemes/${scheme.id}`);
  } catch (err) {
    // redirect() throws a NEXT_REDIRECT error — rethrow it
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // Also check for the Next.js redirect digest
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to create scheme. Please try again." };
  }
}

export async function updateSchemeAction(
  schemeId: string,
  _prev: SchemeFormState,
  formData: FormData,
): Promise<SchemeFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateSchemeForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    await updateScheme(schemeId, data);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SCHEME_UPDATED",
      entityType: "Scheme",
      entityId: schemeId,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath("/adviser/schemes");
    return {};
  } catch {
    return { error: "Failed to update scheme. Please try again." };
  }
}

export async function deleteSchemeAction(schemeId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteScheme(schemeId);
    revalidatePath("/adviser/schemes");
    redirect("/adviser/schemes");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete scheme." };
  }
}
