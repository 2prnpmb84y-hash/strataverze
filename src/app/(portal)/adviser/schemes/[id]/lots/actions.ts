"use server";

import { redirect } from "next/navigation";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { revalidatePath } from "next/cache";
import { searchProfiles } from "@/lib/queries/profiles";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { requirePlatformAdmin } from "@/lib/auth/require-membership";
import {
  LOCKED_LOT_FIELDS,
  LOCKED_MESSAGE,
  changedLockedFields,
  requireSchemeAccessOrAdmin,
} from "@/lib/auth/building-lock";
import { db as schemeDb } from "@/prisma/db";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import {
  getLotInScheme,
  createLot,
  updateLot,
  deleteLot,
  assignOwnerToLot,
  removeOwnerFromLot,
} from "@/lib/queries/lots";
import { logActivity } from "@/lib/queries/activity-log";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { revokeAllSessions } from "@/lib/auth/session-register";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

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
  try {
    // Lots are part of the locked building record: StrataVerze only (24 Oct).
    const profile = await requirePlatformAdmin();
    const scheme = await schemeDb.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    if (!scheme) throw new AuthorisationError("Scheme not found.");

    const { errors, isValid, data } = validateLotForm(formData);
    if (!isValid) return { fieldErrors: errors };

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
    redirect(`/adviser/schemes/${schemeId}/lots`);
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
    return { error: "Failed to create lot. The lot number may already exist." };
  }
}

export async function updateLotAction(
  schemeId: string,
  lotId: string,
  _prev: LotFormState,
  formData: FormData,
): Promise<LotFormState> {
  try {
    const { profile: actor, isAdmin } = await requireSchemeAccessOrAdmin(schemeId, "lots.manage");

    const { errors, isValid, data } = validateLotForm(formData);
    if (!isValid) return { fieldErrors: errors };

    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");

    // The lot number and unit entitlement are locked: StrataVerze only (24 Oct).
    const locked = changedLockedFields(LOCKED_LOT_FIELDS, lot as Record<string, unknown>, data);
    if (locked.length && !isAdmin) {
      await recordSecurityEvent({
        action: "access.denied",
        outcome: "denied",
        actorProfileId: actor.id,
        schemeId,
        resourceType: "Lot",
        resourceId: lotId,
        reason: "locked building record",
      });
      return { error: LOCKED_MESSAGE };
    }

    await updateLot(schemeId, lotId, data);
    await recordSecurityEvent({
      action: "lot.updated",
      outcome: "allowed",
      actorProfileId: actor.id,
      actorRole: isAdmin ? "platform_admin" : "ADVISER",
      schemeId,
      resourceType: "Lot",
      resourceId: lotId,
    });
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update lot. Please try again." };
  }
}

export async function deleteLotAction(schemeId: string, lotId: string) {
  try {
    // Removing a lot changes the strata plan: StrataVerze only (24 Oct).
    const actor = await requirePlatformAdmin();

    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");

    await deleteLot(schemeId, lotId);
    await recordSecurityEvent({
      action: "lot.deleted",
      outcome: "allowed",
      actorProfileId: actor.id,
      actorRole: "ADVISER",
      schemeId,
      resourceType: "Lot",
      resourceId: lotId,
    });
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/lots`);
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
    return { error: "Failed to delete lot." };
  }
}

/**
 * Search for profiles to assign as owners.
 */
export async function searchProfilesAction(query: string, schemeId: string) {
  try {
    await requireSchemeAccess(schemeId, "roll.manage");
    return searchProfiles(query, schemeId);
  } catch {
    return [];
  }
}

/**
 * Assign an owner to a lot.
 */
export async function assignOwnerAction(
  schemeId: string,
  lotId: string,
  profileId: string,
) {
  try {
    // The strata roll's owners: the Adviser and the committee (24 Oct).
    const { profile: actor, roles } = await requireSchemeAccess(schemeId, "roll.manage");
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");

    await assignOwnerToLot({ schemeId, lotId, profileId });
    await recordSecurityEvent({
      action: "membership.owner_assigned",
      outcome: "allowed",
      actorProfileId: actor.id,
      actorRole: roles.includes("ADVISER") ? "ADVISER" : "COMMITTEE",
      schemeId,
      resourceType: "Lot",
      resourceId: lotId,
      metadata: { profileId },
    });
    revalidatePath(`/adviser/schemes/${schemeId}/lots/${lotId}`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
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
  try {
    const { profile: actor, roles } = await requireSchemeAccess(schemeId, "roll.manage");
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    // Verify the membership belongs to this scheme before removing
    const target = await db.orm.public.SchemeMembership
      .where((m) =>
        and(
          m.id.eq(membershipId),
          m.schemeId.eq(schemeId),
          m.lotId.eq(lotId),
        ),
      )
      .first();

    if (!target) {
      return { error: "Membership not found on this scheme." };
    }

    await removeOwnerFromLot(membershipId);
    await recordSecurityEvent({
      action: "membership.owner_removed",
      outcome: "allowed",
      actorProfileId: actor.id,
      actorRole: roles.includes("ADVISER") ? "ADVISER" : "COMMITTEE",
      schemeId,
      resourceType: "Lot",
      resourceId: lotId,
      metadata: { profileId: target.profileId },
    });
    // A role was removed: end the person's sessions so every device signs in
    // again under their remaining access (security stage S5).
    if (target.profileId !== actor.id) {
      await revokeAllSessions(target.profileId, { actorProfileId: actor.id, reason: "owner role removed" });
    }
    revalidatePath(`/adviser/schemes/${schemeId}/lots/${lotId}`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to remove owner." };
  }
}
