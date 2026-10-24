"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { getLotInScheme } from "@/lib/queries/lots";
import { logActivity } from "@/lib/queries/activity-log";
import {
  upsertLotDetail,
  upsertTenant,
  upsertPropertyManager,
  upsertDeliveryPreference,
  upsertDebtCollection,
  createPowerOfAttorney,
  revokePowerOfAttorney,
  createProxy,
  revokeProxy,
} from "@/lib/queries/lot-workflows";

/**
 * Authorise lot management on the scheme and confirm the lot belongs to it
 * (SEC-004). Lot workflow tables have no scheme_id, so the lot is the anchor.
 */
async function authoriseLot(schemeId: string, lotId: string) {
  const access = await requireSchemeAccess(schemeId, "lots.manage");
  const lot = await getLotInScheme(schemeId, lotId);
  assertInScheme(lot, schemeId, "Lot");
  return access;
}

function revalidateLot(schemeId: string, lotId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/lots/${lotId}`);
}

// ─── Lot Detail (Owner extended info) ────────────────────────────

export async function updateLotDetailAction(
  schemeId: string,
  lotId: string,
  formData: FormData,
) {
  try {
    // Owner details on the strata roll: the Adviser and the committee (24 Oct).
    await requireSchemeAccess(schemeId, "roll.manage");
    assertInScheme(await getLotInScheme(schemeId, lotId), schemeId, "Lot");

    await upsertLotDetail(lotId, {
      ownerPhone: (formData.get("ownerPhone") as string) || null,
      ownerMobile: (formData.get("ownerMobile") as string) || null,
      contactName: (formData.get("contactName") as string) || null,
      ownerAddress: (formData.get("ownerAddress") as string) || null,
      ownerEmail: (formData.get("ownerEmail") as string) || null,
      isCommitteeMember: formData.get("isCommitteeMember") === "on",
      paidToDate: formData.get("paidToDate")
        ? new Date(formData.get("paidToDate") as string).toISOString()
        : null,
      lastSettled: formData.get("lastSettled")
        ? new Date(formData.get("lastSettled") as string).toISOString()
        : null,
    });

    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update owner details." };
  }
}

// ─── Owner's name on the strata roll ─────────────────────────────

export type RollOwnerNameState = { error?: string; saved?: boolean };

/**
 * The owner's name exactly as it appears on the strata roll (onboarding,
 * 24 Oct). Kept up to date by the Adviser and the committee. Only leading
 * and trailing spaces are removed; blank clears it.
 */
export async function updateRollOwnerNameAction(
  schemeId: string,
  lotId: string,
  _prev: RollOwnerNameState,
  formData: FormData,
): Promise<RollOwnerNameState> {
  const value = String(formData.get("rollOwnerName") ?? "").trim();
  if (value.length > 500) return { error: "The owner name can be at most 500 characters." };
  if (/[\u0000-\u001F\u007F]/.test(value)) return { error: "The owner name cannot contain line breaks or control characters." };
  try {
    const { profile } = await requireSchemeAccess(schemeId, "roll.manage");
    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");
    await upsertLotDetail(lotId, { rollOwnerName: value || null });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "STRATA_ROLL_UPDATED",
      entityType: "Lot",
      entityId: lotId,
      metadata: { lotNumber: lot?.lotNumber ?? null },
    });
    revalidateLot(schemeId, lotId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return { saved: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update the owner name." };
  }
}

// ─── Tenancy ─────────────────────────────────────────────────────

export async function updateTenantAction(
  schemeId: string,
  lotId: string,
  tenantNumber: number,
  formData: FormData,
) {
  try {
    await authoriseLot(schemeId, lotId);

    await upsertTenant(lotId, tenantNumber, {
      isOwnerOccupier: formData.get("isOwnerOccupier") === "on",
      isFormalTenant: formData.get("isFormalTenant") === "on",
      dateReceived: formData.get("dateReceived")
        ? new Date(formData.get("dateReceived") as string).toISOString()
        : null,
      deliveryBy: (formData.get("deliveryBy") as string) || "EMAIL",
      salutation: (formData.get("salutation") as string) || null,
      name: (formData.get("name") as string) || null,
      contactName: (formData.get("contactName") as string) || null,
      mobile: (formData.get("mobile") as string) || null,
      email: (formData.get("email") as string) || null,
      leaseStart: formData.get("leaseStart")
        ? new Date(formData.get("leaseStart") as string).toISOString()
        : null,
      leaseExpiry: formData.get("leaseExpiry")
        ? new Date(formData.get("leaseExpiry") as string).toISOString()
        : null,
      notes: (formData.get("notes") as string) || null,
    });

    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update tenant details." };
  }
}

// ─── Property Manager ────────────────────────────────────────────

export async function updatePropertyManagerAction(
  schemeId: string,
  lotId: string,
  formData: FormData,
) {
  try {
    await authoriseLot(schemeId, lotId);

    await upsertPropertyManager(lotId, {
      agentName: (formData.get("agentName") as string) || null,
      company: (formData.get("company") as string) || null,
      address: (formData.get("address") as string) || null,
      agentEmail: (formData.get("agentEmail") as string) || null,
      phone: (formData.get("phone") as string) || null,
      fax: (formData.get("fax") as string) || null,
      email: (formData.get("email") as string) || null,
    });

    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update property manager." };
  }
}

// ─── Delivery Preferences ────────────────────────────────────────

export async function updateDeliveryPreferenceAction(
  schemeId: string,
  lotId: string,
  category: string,
  formData: FormData,
) {
  try {
    await authoriseLot(schemeId, lotId);

    await upsertDeliveryPreference(lotId, category, {
      deliveryMethod: (formData.get("deliveryMethod") as string) || "EMAIL",
      recipientType: (formData.get("recipientType") as string) || "OWNER",
      recipientName: (formData.get("recipientName") as string) || null,
      recipientEmail: (formData.get("recipientEmail") as string) || null,
      recipientAddress: (formData.get("recipientAddress") as string) || null,
      recipientSuburb: (formData.get("recipientSuburb") as string) || null,
      recipientState: (formData.get("recipientState") as string) || null,
      recipientPostcode: (formData.get("recipientPostcode") as string) || null,
    });

    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update delivery preferences." };
  }
}

// ─── Debt Collection ─────────────────────────────────────────────

export async function updateDebtCollectionAction(
  schemeId: string,
  lotId: string,
  formData: FormData,
) {
  try {
    await authoriseLot(schemeId, lotId);

    await upsertDebtCollection(lotId, {
      stage: (formData.get("stage") as string) || "NONE",
      notes: (formData.get("notes") as string) || null,
      excludeFromCollection: formData.get("excludeFromCollection") === "on",
      hasPaymentPlan: formData.get("hasPaymentPlan") === "on",
      buildingDebtCollection: formData.get("buildingDebtCollection") === "on",
      repaymentPlan: formData.get("repaymentPlan") === "on",
      legalAction: formData.get("legalAction") === "on",
    });

    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update debt collection." };
  }
}

// ─── Power of Attorney ───────────────────────────────────────────

export async function createPowerOfAttorneyAction(
  schemeId: string,
  lotId: string,
  formData: FormData,
) {
  try {
    await authoriseLot(schemeId, lotId);

    await createPowerOfAttorney(lotId, {
      attorneyName: (formData.get("attorneyName") as string) || "",
      attorneyEmail: (formData.get("attorneyEmail") as string) || null,
      attorneyPhone: (formData.get("attorneyPhone") as string) || null,
      attorneyAddress: (formData.get("attorneyAddress") as string) || null,
      startDate: formData.get("startDate")
        ? new Date(formData.get("startDate") as string).toISOString()
        : null,
      endDate: formData.get("endDate")
        ? new Date(formData.get("endDate") as string).toISOString()
        : null,
      notes: (formData.get("notes") as string) || null,
    });

    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add power of attorney." };
  }
}

export async function revokePowerOfAttorneyAction(
  schemeId: string,
  lotId: string,
  poaId: string,
) {
  try {
    await authoriseLot(schemeId, lotId);
    await revokePowerOfAttorney(lotId, poaId);
    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to revoke power of attorney." };
  }
}

// ─── Proxy ───────────────────────────────────────────────────────

export async function createProxyAction(
  schemeId: string,
  lotId: string,
  formData: FormData,
) {
  try {
    await authoriseLot(schemeId, lotId);

    await createProxy(lotId, {
      proxyName: (formData.get("proxyName") as string) || "",
      proxyEmail: (formData.get("proxyEmail") as string) || null,
      proxyPhone: (formData.get("proxyPhone") as string) || null,
      meetingDate: formData.get("meetingDate")
        ? new Date(formData.get("meetingDate") as string).toISOString()
        : null,
      meetingTitle: (formData.get("meetingTitle") as string) || null,
      notes: (formData.get("notes") as string) || null,
    });

    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add proxy." };
  }
}

export async function revokeProxyAction(
  schemeId: string,
  lotId: string,
  proxyId: string,
) {
  try {
    await authoriseLot(schemeId, lotId);
    await revokeProxy(lotId, proxyId);
    revalidateLot(schemeId, lotId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to revoke proxy." };
  }
}
