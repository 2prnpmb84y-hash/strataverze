"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { StatutoryPackError, adoptStatutoryPack } from "@/lib/finance/statutory-pack";
import { logActivity } from "@/lib/queries/activity-log";
import { generateStatutoryPackPdf } from "@/lib/pdf/generate";

export type StatutoryActionResult = { error?: string; success?: boolean };

const path = (schemeId: string) => `/adviser/schemes/${schemeId}/finance/reports/statutory-pack`;

export async function adoptStatutoryPackAction(schemeId: string, financialYear: number, meetingId: string, motionId: string): Promise<StatutoryActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (!meetingId || !motionId) return { error: "Choose the annual general meeting and the motion that adopted the statements." };
    await adoptStatutoryPack({ schemeId, financialYear, meetingId, motionId, actorId: profile.id });
    // Keep the adopted statements as a PDF too, linked to the meeting.
    try {
      await generateStatutoryPackPdf({ schemeId, financialYear, actorId: profile.id });
    } catch (err) {
      console.error("[statutory] Could not store the PDF of the adopted statements:", err);
    }
    revalidatePath(path(schemeId));
    revalidatePath(`/adviser/schemes/${schemeId}/finance/documents`);
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof StatutoryPackError) return { error: err.message };
    console.error("adoptStatutoryPackAction", err);
    return { error: "Failed to record the adoption." };
  }
}

/** Set whether a fund's reports are on a cash or accrual basis. Posting is not affected. */
export async function setFundAccountingBasisAction(schemeId: string, fundId: string, basis: string): Promise<StatutoryActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (basis !== "CASH" && basis !== "ACCRUAL") return { error: "Choose cash or accrual." };
    const fund = await db.orm.public.Fund.where((f) => f.id.eq(fundId)).first();
    if (!fund || fund.schemeId !== schemeId) return { error: "Fund not found." };
    await db.orm.public.Fund.where((f) => f.id.eq(fundId)).update({ accountingBasis: basis });
    await logActivity({ schemeId, actorId: profile.id, action: "FUND_ACCOUNTING_BASIS_CHANGED", entityType: "Fund", entityId: fundId, metadata: { from: fund.accountingBasis, to: basis } });
    revalidatePath(path(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save the accounting basis." };
  }
}
