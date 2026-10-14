"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile, searchProfiles } from "@/lib/queries/profiles";
import {
  createLot,
  updateLot,
  deleteLot,
  assignOwnerToLot,
  removeOwnerFromLot,
} from "@/lib/queries/lots";
import { logActivity } from "@/lib/queries/activity-log";

export type LotFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const LOT_TYPES = ["RESIDENTIAL", "COMMERCIAL", "PARKING", "STORAGE", "COMMON"];

function validateLotForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const lotNumber = formData.get("lotNumber") as string | null;
  const entitlement = formData.get("entitlement") as string | null;
  const lotType = formData.get("lotType") as string | null;
  const floorArea = formData.get("floorArea") as string | null;

  if (!lotNumber?.trim()) errors.lotNumber = "Lot number is required.";
  if (!entitlement || Number(entitlement) < 1)
    errors.entitlement = "Entitlement must be at least 1.";
  if (lotType && !LOT_TYPES.includes(lotType))
    errors.lotType = "Select a valid lot type.";
  if (floorArea && Number(floorArea) < 0)
    errors.floorArea = "Floor area cannot be negative.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      lotNumber: lotNumber?.trim() ?? "",
      unitNumber: (formData.get("unitNumber") as string)?.trim() || undefined,
      entitlement: Number(entitlement),
      floorArea: floorArea ? Number(floorArea) : undefined,
      lotType: lotType ?? "RESIDENTIAL",
    },
  };
}

export async function createLotAction(
  schemeId: string,
  _prev: LotFormState,
  formData: FormData,
): Promise<LotFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateLotForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    const lot = await createLot({ ...data, schemeId });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LOT_CREATED",
      entityType: "Lot",
      entityId: lot.id,
      metadata: { lotNumber: data.lotNumber, lotType: data.lotType },
    });

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
    return { error: "Failed to create lot. The lot number may already exist." };
  }
}

export async function updateLotAction(
  schemeId: string,
  lotId: string,
  _prev: LotFormState,
  formData: FormData,
): Promise<LotFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateLotForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    await updateLot(lotId, data);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch {
    return { error: "Failed to update lot. Please try again." };
  }
}

export async function deleteLotAction(schemeId: string, lotId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteLot(lotId);
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
    return { error: "Failed to delete lot." };
  }
}

/**
 * Search for profiles to assign as owners.
 */
export async function searchProfilesAction(query: string, schemeId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  return searchProfiles(query, schemeId);
}

/**
 * Assign an owner to a lot.
 */
export async function assignOwnerAction(
  schemeId: string,
  lotId: string,
  profileId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await assignOwnerToLot({ schemeId, lotId, profileId });
    revalidatePath(`/adviser/schemes/${schemeId}/lots/${lotId}`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch {
    return { error: "Failed to assign owner. They may already be assigned to this scheme." };
  }
}

/**
 * Remove an owner from a lot.
 */
export async function removeOwnerAction(
  schemeId: string,
  lotId: string,
  membershipId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await removeOwnerFromLot(membershipId);
    revalidatePath(`/adviser/schemes/${schemeId}/lots/${lotId}`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch {
    return { error: "Failed to remove owner." };
  }
}
