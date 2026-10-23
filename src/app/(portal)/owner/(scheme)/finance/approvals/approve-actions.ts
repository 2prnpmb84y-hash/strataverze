"use server";

import { headers } from "next/headers";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { PaymentControlError, authoriseSupplierInvoice } from "@/lib/finance/invoice-approval";

/** Approve a supplier invoice from the owner portal (treasurer or payment authoriser). */
export async function ownerApproveSupplierInvoiceAction(schemeId: string, invoiceId: string) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["COMMITTEE", "PAYMENT_AUTHORISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const ip = (await headers()).get("x-forwarded-for");
    await authoriseSupplierInvoice({ schemeId, invoiceId, actorId: profile.id, ip });
    revalidatePath("/owner/finance/approvals");
    return { success: true as const };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof PaymentControlError) return { error: err.message };
    console.error("ownerApproveSupplierInvoiceAction error:", err);
    return { error: "Failed to approve the invoice." };
  }
}
