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
  requireRolesOrAdmin,
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
import { rulesForScheme, rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { UnsupportedJurisdictionError } from "@/config/statutory";
import {
  SEPARATE_ENTITLEMENT_FIELDS,
  entitlementInputProblem,
  onLotEntitlementWords,
  parseEntitlement,
  separateEntitlement,
  type SeparateEntitlement,
} from "@/lib/jurisdiction/building-data";
import type { StatutoryRules } from "@/config/statutory";
import { LOT_TYPES } from "@/lib/lots/lot-types";

export type LotFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};


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

/**
 * The second schedule's entitlement from the lot form, for a pack whose lots
 * hold one: a positive whole number, required for a new lot. An existing lot
 * may be saved without it (it stays flagged). Fails closed for a schedule
 * StrataVerze does not hold. The form sends it under the lot field the pack's
 * schedule is held in (Queensland's interestScheduleEntitlement, stage 2,
 * step 10; Victoria's lotEntitlement, stage 2, PR 4).
 */
function readSeparateEntitlement(
  formData: FormData,
  separate: SeparateEntitlement,
  required: boolean,
): { error: string } | { value: number | null } {
  if (!separate.field) return { error: `StrataVerze does not hold each lot's ${separate.name} yet, so this lot cannot be saved here.` };
  const text = formData.get(separate.field);
  const problem = entitlementInputProblem(separate.label, text, required);
  if (problem) return { error: problem };
  const parsed = parseEntitlement(text);
  return { value: parsed.ok ? parsed.value : null };
}

/**
 * The whole-number check for each lot's entitlement where the pack names it
 * (Queensland's contribution schedule lot entitlement: a whole number, not 0,
 * Act s 46), so 12.5 is refused, not sent to the integer column. A pack that
 * does not name it (NSW) keeps validateLotForm's check and words alone.
 */
function namedEntitlementProblem(rules: Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES">, formData: FormData): string | null {
  const { label } = onLotEntitlementWords(rules);
  return label ? entitlementInputProblem(label, formData.get("entitlement"), true) : null;
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
    const rules = rulesForState(scheme.state).rules;
    const named = errors.entitlement ? null : namedEntitlementProblem(rules, formData);
    if (named) errors.entitlement = named;
    // A pack whose lots hold a second schedule (Queensland's interest
    // schedule, Victoria's lot entitlement): required for a new lot.
    const separate = separateEntitlement(rules);
    const second = separate ? readSeparateEntitlement(formData, separate, true) : null;
    if (second && "error" in second) {
      if (!separate?.field) return { error: second.error };
      errors[separate.field] = second.error;
    }
    if (Object.keys(errors).length || !isValid) return { fieldErrors: errors };

    const lot = await createLot({ ...data, ...(separate?.field && second && "value" in second ? { [separate.field]: second.value } : {}), schemeId });

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
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
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
    // Only an entitlement that is not a whole number needs the pack: NSW
    // accepts it as before, Queensland refuses it (namedEntitlementProblem).
    if (!parseEntitlement(formData.get("entitlement")).ok) {
      const named = namedEntitlementProblem((await rulesForScheme(schemeId)).rules, formData);
      if (named) return { fieldErrors: { entitlement: named } };
    }

    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");

    // The second schedule's entitlement, only when the form sends it (a pack
    // whose lots hold one, stage 2, step 10). An NSW lot form never does. A
    // value sent under another pack's field is refused, never saved.
    let update: typeof data & { interestScheduleEntitlement?: number | null; lotEntitlement?: number | null } = data;
    const sent = SEPARATE_ENTITLEMENT_FIELDS.filter((f) => formData.has(f));
    if (sent.length) {
      const separate = separateEntitlement((await rulesForScheme(schemeId)).rules);
      if (!separate) return { error: "This building's lots hold one lot entitlement only." };
      const second = readSeparateEntitlement(formData, separate, false);
      if ("error" in second) return separate.field ? { fieldErrors: { [separate.field]: second.error } } : { error: second.error };
      if (sent.some((f) => f !== separate.field)) return { error: `This building's lots hold their ${separate.name} only, so this lot cannot be saved here.` };
      update = { ...data, [separate.field!]: second.value };
    }

    // The lot number and unit entitlement are locked: StrataVerze only (24 Oct).
    // So is a Queensland lot's interest schedule lot entitlement (stage 2, step 10)
    // and a Victorian lot's lot entitlement (stage 2, PR 4).
    const locked = changedLockedFields(LOCKED_LOT_FIELDS, lot as Record<string, unknown>, update);
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

    await updateLot(schemeId, lotId, update);
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
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
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
 * Search for profiles to assign as owners. Only for assigning an owner
 * directly, so the same people as assignOwnerAction: the building's Adviser
 * or StrataVerze (finding L-1, 31 Oct 2026). With roll.manage the committee
 * could look up any account on the platform by its exact email.
 */
export async function searchProfilesAction(query: string, schemeId: string) {
  try {
    await requireRolesOrAdmin(schemeId, ["ADVISER"]);
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
    // Assigning an owner directly: the building's Adviser or StrataVerze only
    // (founder decision, 31 Oct 2026, finding S-01). The committee keeps every
    // other roll.manage action, but cannot make anyone (themselves included)
    // an owner of a lot, which would give that person the lot's vote and
    // documents.
    const { profile: actor, isAdmin } = await requireRolesOrAdmin(schemeId, ["ADVISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");

    await assignOwnerToLot({ schemeId, lotId, profileId });
    await recordSecurityEvent({
      action: "membership.owner_assigned",
      outcome: "allowed",
      actorProfileId: actor.id,
      actorRole: isAdmin ? "platform_admin" : "ADVISER",
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
