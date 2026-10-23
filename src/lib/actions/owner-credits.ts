"use server";
import { logError } from "@/lib/log";

import { headers } from "next/headers";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { PaymentControlError } from "@/lib/finance/invoice-approval";
import {
  applyOwnerCredit,
  authoriseOwnerCreditRefund,
  cancelOwnerCreditRefund,
  recordOwnerCreditRefundPaid,
  requestOwnerCreditRefund,
} from "@/lib/finance/owner-credits";
import { logActivity } from "@/lib/queries/activity-log";

export type CreditActionState = { error?: string; success?: boolean; message?: string };

const creditsPath = (schemeId: string) => `/adviser/schemes/${schemeId}/finance/owner-credits`;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function failure(err: unknown, fallback: string): CreditActionState {
  if (err instanceof AuthorisationError || err instanceof PaymentControlError) return { error: err.message };
  logError(fallback, err);
  return { error: fallback };
}

/** The adviser prepares a refund of an owner's credit. It then needs approval like a supplier payment. */
export async function requestOwnerCreditRefundAction(
  schemeId: string,
  lotId: string,
  fundId: string,
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const amount = Number(formData.get("amount") || 0);
    await requestOwnerCreditRefund({
      schemeId,
      lotId,
      fundId,
      amountCents: Math.round(amount * 100),
      payeeName: String(formData.get("payeeName") ?? ""),
      bsb: String(formData.get("bsb") ?? ""),
      accountNumber: String(formData.get("accountNumber") ?? ""),
      verificationMethod: String(formData.get("verificationMethod") ?? ""),
      reason: String(formData.get("reason") ?? "").trim() || null,
      actorId: profile.id,
    });
    revalidatePath(creditsPath(schemeId));
    revalidatePath("/owner/finance/approvals");
    return { success: true, message: "Refund requested. It now needs approval under the payment policy." };
  } catch (err) {
    return failure(err, "Failed to request the refund.");
  }
}

/** Approve a refund (treasurer, payment authoriser, or an adviser the committee has allowed). */
export async function approveOwnerCreditRefundAction(schemeId: string, refundId: string) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["COMMITTEE", "PAYMENT_AUTHORISER", "ADVISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const ip = (await headers()).get("x-forwarded-for");
    await authoriseOwnerCreditRefund({ schemeId, refundId, actorId: profile.id, ip });
    revalidatePath(creditsPath(schemeId));
    revalidatePath("/owner/finance/approvals");
    return { success: true as const };
  } catch (err) {
    return failure(err, "Failed to approve the refund.");
  }
}

/** Record that an approved refund was paid from the scheme's bank account. */
export async function recordOwnerCreditRefundPaidAction(
  schemeId: string,
  refundId: string,
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const paidOn = String(formData.get("paidOn") ?? "").trim();
    if (!ISO_DATE.test(paidOn)) return { error: "Enter the date the refund was paid." };
    await recordOwnerCreditRefundPaid({ schemeId, refundId, actorId: profile.id, paidOn });
    revalidatePath(creditsPath(schemeId));
    return { success: true, message: "Refund recorded as paid." };
  } catch (err) {
    return failure(err, "Failed to record the refund.");
  }
}

export async function cancelOwnerCreditRefundAction(schemeId: string, refundId: string) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await cancelOwnerCreditRefund({ schemeId, refundId, actorId: profile.id });
    revalidatePath(creditsPath(schemeId));
    revalidatePath("/owner/finance/approvals");
    return { success: true as const };
  } catch (err) {
    return failure(err, "Failed to cancel the refund.");
  }
}

/** Apply every lot's available credit to its open notices now. */
export async function applyOwnerCreditNowAction(schemeId: string) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const cents = await applyOwnerCredit({ schemeId, actorId: profile.id });
    revalidatePath(creditsPath(schemeId));
    revalidatePath(`/adviser/schemes/${schemeId}/finance`);
    return { success: true as const, appliedCents: cents };
  } catch (err) {
    return failure(err, "Failed to apply owner credit.");
  }
}

/** Whether credit is applied to new notices automatically. */
export async function setAutoApplyOwnerCreditAction(schemeId: string, enabled: boolean) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE"]);
    await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).update({ autoApplyOwnerCredit: enabled });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "OWNER_CREDIT_SETTING_CHANGED",
      entityType: "Scheme",
      entityId: schemeId,
      metadata: { autoApply: enabled },
    });
    revalidatePath(creditsPath(schemeId));
    return { success: true as const };
  } catch (err) {
    return failure(err, "Failed to save the setting.");
  }
}
