"use server";

import { revalidatePath } from "next/cache";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { revokeAllSessions } from "@/lib/auth/session-register";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { logActivity } from "@/lib/queries/activity-log";
import { toCents } from "@/lib/billing/money";
import { canVerifyBankChange, policyLoosening, type VerificationMethod } from "@/lib/finance/payment-controls";
import {
  bankDetailsDiffer,
  getBankDetailVersionById,
  getPaymentSettings,
  recordBankDetailChange,
  savePaymentPolicy,
} from "@/lib/queries/payment-controls";

export type ControlActionState = { error?: string; success?: string };

const METHODS: VerificationMethod[] = ["CALLBACK", "SUPPLIER_PORTAL_CONFIRMED", "DOCUMENT"];
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;

function revalidateScheme(schemeId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
  revalidatePath("/owner", "layout");
}

/**
 * Flag or unflag a committee member as treasurer. The treasurer approves
 * payments, so the committee appoints them (or StrataVerze staff, audited):
 * not the adviser, who is also a payee, and nobody may appoint themselves
 * (M3). Stepping down from your own treasurer role is allowed.
 */
export async function setTreasurerAction(schemeId: string, membershipId: string, isTreasurer: boolean): Promise<ControlActionState> {
  try {
    if (!schemeId || !membershipId) return { error: "Member not found." };
    const current = await getCurrentProfile();
    if (!current) throw new AuthorisationError("You must be signed in.");
    const asPlatformAdmin = !!current.isPlatformAdmin;
    const profile = asPlatformAdmin ? current : (await requireSchemeMembership(schemeId, ["COMMITTEE"])).profile;
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const membership = await db.orm.public.SchemeMembership
      .where((m) => and(m.id.eq(membershipId), m.schemeId.eq(schemeId)))
      .first();
    if (!membership || membership.schemeId !== schemeId) return { error: "Member not found." };
    if (membership.role !== "COMMITTEE") return { error: "Only a committee member can be the treasurer." };
    if (isTreasurer && membership.profileId === profile.id) {
      return { error: "You cannot make yourself the treasurer. Another committee member must do it." };
    }
    await db.orm.public.SchemeMembership
      .where((m) => and(m.id.eq(membershipId), m.schemeId.eq(schemeId)))
      .update({ isTreasurer });
    // Losing the treasurer office is a role change: end that person's
    // sessions (security stage S5). Gaining it needs no sign-out, as the
    // shorter session limits and MFA apply from the next request.
    if (!isTreasurer && membership.isTreasurer) {
      await revokeAllSessions(membership.profileId, { actorProfileId: profile.id, reason: "treasurer office removed" });
    }
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "TREASURER_SET",
      entityType: "SchemeMembership",
      entityId: membershipId,
      metadata: { isTreasurer, profileId: membership.profileId, asPlatformAdmin },
    });
    revalidateScheme(schemeId);
    return { success: isTreasurer ? "Treasurer flagged." : "Treasurer flag removed." };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update the treasurer." };
  }
}

/**
 * Save the scheme's payment policy. Committee only: the adviser is also a
 * supplier, so it cannot loosen the controls over its own approvals.
 */
export async function savePaymentPolicyAction(
  schemeId: string,
  _prev: ControlActionState,
  formData: FormData,
): Promise<ControlActionState> {
  try {
    const { profile, roles } = await requireSchemeMembership(schemeId, ["COMMITTEE"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const money = (name: string) => {
      const raw = String(formData.get(name) ?? "").trim();
      if (!raw) return null;
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`invalid:${name}`);
      return toCents(raw);
    };
    let limit: number | null;
    let second: number | null;
    try {
      limit = money("singleApproverLimit") ?? 0;
      second = money("requireSecondApproverAbove");
    } catch {
      return { error: "Enter amounts in dollars and cents, for example 500 or 500.00." };
    }
    const coolingOffDays = Number(formData.get("coolingOffDays") ?? 5);
    if (!Number.isInteger(coolingOffDays) || coolingOffDays < 0 || coolingOffDays > 30) {
      return { error: "The cooling-off period must be between 0 and 30 business days." };
    }
    const policy = {
      singleApproverLimitCents: limit ?? 0,
      requireSecondApproverAboveCents: second,
      allowSelfApproval: formData.get("allowSelfApproval") === "on",
      allowAdviserApproval: formData.get("allowAdviserApproval") === "on",
      coolingOffDays,
    };

    // Loosening the controls (M3): a committee member who is also the
    // scheme's adviser could otherwise free up their own approvals, so they
    // may tighten the policy but not loosen it. A second approver for
    // loosening changes is a follow-up.
    const loosened = policyLoosening(await getPaymentSettings(schemeId), policy);
    if (loosened.length > 0 && roles.includes("ADVISER")) {
      return {
        error:
          "You are also this scheme's adviser, so you cannot loosen the payment controls. Another committee member must make this change.",
      };
    }

    await savePaymentPolicy(schemeId, policy, profile.id);
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "PAYMENT_POLICY_UPDATED",
      entityType: "SchemePaymentPolicy",
      metadata: { ...policy, loosened },
    });
    revalidateScheme(schemeId);
    return { success: "Payment policy saved." };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save the payment policy." };
  }
}

/** Change a finance supplier's bank details. The change must be verified by someone else before payment. */
export async function changeSupplierBankDetailsAction(
  schemeId: string,
  supplierId: string,
  _prev: ControlActionState,
  formData: FormData,
): Promise<ControlActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE"]);
    await requireRecentMfa();
    const supplier = await db.orm.public.Supplier.where((s) => s.id.eq(supplierId)).first();
    if (!supplier || supplier.schemeId !== schemeId) return { error: "Supplier not found." };

    const bsb = String(formData.get("bankBsb") ?? "").trim();
    const accountNumber = String(formData.get("bankAccountNumber") ?? "").replace(/\s/g, "");
    const accountName = String(formData.get("bankAccountName") ?? "").trim();
    if (!/^\d{3}-?\d{3}$/.test(bsb)) return { error: "BSB must be in NNN-NNN format." };
    if (!/^\d{4,10}$/.test(accountNumber)) return { error: "Enter an account number of 4 to 10 digits." };
    if (!accountName) return { error: "Enter the account name." };

    const previous = {
      bsb: supplier.bankBsb ?? null,
      accountNumber: supplier.bankAccountNumber ?? null,
      accountName: supplier.bankAccountName ?? null,
    };
    const next = { bsb, accountNumber, accountName };
    if (!bankDetailsDiffer(previous, next)) return { error: "These are the same bank details already on file." };

    await db.transaction(async (tx) => {
      await tx.orm.public.Supplier.where((s) => s.id.eq(supplierId)).update({
        bankBsb: varchar<7>(bsb),
        bankAccountNumber: varchar<20>(accountNumber),
        bankAccountName: varchar<200>(accountName),
      });
      await recordBankDetailChange(tx.orm, { supplierId, schemeId, previous, next, changedBy: profile.id });
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_BANK_DETAILS_CHANGED",
      entityType: "Supplier",
      entityId: supplierId,
      metadata: { bsbLast3: bsb.slice(-3), accountLast3: accountNumber.slice(-3) },
    });
    revalidateScheme(schemeId);
    return { success: "Bank details changed. Payments are blocked until someone else verifies them." };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to change the bank details." };
  }
}

/** Verify (first or second verification) or reject a supplier bank detail change. */
export async function verifySupplierBankDetailsAction(
  schemeId: string,
  versionId: string,
  _prev: ControlActionState,
  formData: FormData,
): Promise<ControlActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE", "PAYMENT_AUTHORISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const version = await getBankDetailVersionById(versionId);
    if (!version) return { error: "Bank detail change not found." };
    const row = await db.orm.public.SupplierBankDetailVersion.where((v) => v.id.eq(versionId)).first();
    if (!row || row.schemeId !== schemeId) return { error: "Bank detail change not found." };

    const decision = String(formData.get("decision") ?? "VERIFY");
    const now = new Date().toISOString() as never;

    if (decision === "REJECT") {
      // Only a change still waiting for verification can be rejected (L6):
      // verified details on file are replaced by a new change, not rejected.
      if (version.status !== "PENDING") {
        return { error: version.status === "REJECTED" ? "These bank details were already rejected." : "Only a change waiting for verification can be rejected." };
      }
      if (profile.id === version.changedById) return { error: "The person who changed the bank details cannot reject them." };
      const reason = String(formData.get("reason") ?? "").trim();
      if (!reason) return { error: "Give a reason for rejecting the change." };
      await db.orm.public.SupplierBankDetailVersion
        .where((v) => and(v.id.eq(versionId), v.status.eq("PENDING")))
        .update({ status: "REJECTED", rejectionReason: reason });
      await logActivity({
        schemeId,
        actorId: profile.id,
        action: "SUPPLIER_BANK_DETAILS_REJECTED",
        entityType: "Supplier",
        entityId: version.supplierId,
        metadata: { versionId, reason },
      });
      revalidateScheme(schemeId);
      return { success: "Bank detail change rejected. Payments to this supplier stay blocked." };
    }

    const method = String(formData.get("method") ?? "") as VerificationMethod;
    if (!METHODS.includes(method)) return { error: "Choose how you verified the bank details." };
    const check = canVerifyBankChange(version, profile.id);
    if (!check.ok) return { error: check.reason };

    if (check.slot === "FIRST") {
      await db.orm.public.SupplierBankDetailVersion.where((v) => v.id.eq(versionId)).update({
        status: "VERIFIED",
        verifiedBy: profile.id,
        verifiedAt: now,
        verificationMethod: method,
      });
    } else {
      await db.orm.public.SupplierBankDetailVersion.where((v) => v.id.eq(versionId)).update({
        secondVerifiedBy: profile.id,
        secondVerifiedAt: now,
        secondVerificationMethod: method,
      });
    }
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_BANK_DETAILS_VERIFIED",
      entityType: "Supplier",
      entityId: version.supplierId,
      metadata: { versionId, method, slot: check.slot },
    });
    revalidateScheme(schemeId);
    return { success: check.slot === "FIRST" ? "Bank details verified." : "Second verification recorded." };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record the verification." };
  }
}
