"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { requirePlatformAdmin, AuthorisationError } from "@/lib/auth/require-membership";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { toCents } from "@/lib/billing/money";
import { referralIncomeEnabled, referralIncomeProblem, renderReferralDisclosure } from "@/lib/billing/referral";

export type ReferralFormState = { error?: string; success?: string };

/**
 * Record commission a partner paid StrataVerze on a scheme's policy.
 * StrataVerze staff only, and only while the feature flag is on.
 */
export async function recordReferralIncomeAction(_prev: ReferralFormState, formData: FormData): Promise<ReferralFormState> {
  try {
    const profile = await requirePlatformAdmin();
    if (!referralIncomeEnabled()) return { error: "Referral income is switched off." };

    const schemeId = String(formData.get("schemeId") ?? "");
    const policyId = String(formData.get("insurancePolicyId") ?? "") || null;
    const partnerName = String(formData.get("partnerName") ?? "").trim();
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const amountCents = /^\d+(\.\d{1,2})?$/.test(amountRaw) ? toCents(amountRaw) : NaN;
    const receivedAt = String(formData.get("receivedAt") ?? "");
    const template = String(formData.get("disclosureTemplate") ?? "");
    const disclosureText = renderReferralDisclosure(template, { partnerName, amountCents: Number.isNaN(amountCents) ? 0 : amountCents });
    const today = new Date().toISOString().slice(0, 10);

    const problem = referralIncomeProblem(
      { schemeId, insurancePolicyId: policyId, partnerName, amountCents, receivedAt, disclosureText },
      today,
    );
    if (problem) return { error: problem };

    const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    if (!scheme) return { error: "Scheme not found." };
    if (policyId) {
      const policy = await db.orm.public.InsurancePolicy.where((p) => p.id.eq(policyId)).first();
      if (!policy || policy.schemeId !== schemeId) return { error: "That policy does not belong to the scheme." };
    }

    await db.orm.public.ReferralIncome.create({
      schemeId,
      insurancePolicyId: policyId,
      partnerName,
      amount: String(amountCents / 100) as unknown as Numeric<12, 2>,
      receivedAt: receivedAt as unknown as TimestampString<3>,
      disclosureText,
      notes: String(formData.get("notes") ?? "").trim() || null,
      recordedById: profile.id,
    });

    revalidatePath("/admin/referral-income");
    revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
    revalidatePath("/owner/finance/platform-fees");
    await recordSecurityEvent({
      action: "admin.referral_income_recorded",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: "platform_admin",
      schemeId,
      resourceType: "Scheme",
      resourceId: schemeId,
    });
    return { success: `Recorded ${partnerName} for ${scheme.name}.` };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("recordReferralIncomeAction error:", err);
    return { error: "Failed to record the referral income." };
  }
}
