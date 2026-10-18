"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import {
  requireAuth,
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { hasSupplierQuoted, getQuoteRequestById } from "@/lib/queries/supplier";
import { logActivity } from "@/lib/queries/activity-log";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

export async function submitQuoteAction(
  quoteRequestId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const profile = await requireAuth();

    // Validate inputs
    const amountStr = (formData.get("amount") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const estimatedDaysStr = (formData.get("estimatedDays") as string)?.trim();
    const validUntilStr = (formData.get("validUntil") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim();

    if (!amountStr) return { error: "Amount is required." };
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0)
      return { error: "Amount must be a positive number." };

    if (!description) return { error: "Description is required." };

    let estimatedDays: number | null = null;
    if (estimatedDaysStr) {
      estimatedDays = parseInt(estimatedDaysStr, 10);
      if (isNaN(estimatedDays) || estimatedDays < 1)
        return { error: "Estimated days must be a positive whole number." };
    }

    let validUntil: string | null = null;
    if (validUntilStr) {
      const d = new Date(validUntilStr);
      if (isNaN(d.getTime()))
        return { error: "Valid until must be a valid date." };
      validUntil = d.toISOString();
    }

    // Prevent duplicates
    const alreadyQuoted = await hasSupplierQuoted(quoteRequestId, profile.id);
    if (alreadyQuoted)
      return { error: "You have already submitted a quote for this request." };

    // Verify the request is OPEN
    const quoteRequest = await getQuoteRequestById(quoteRequestId);
    if (!quoteRequest) return { error: "Quote request not found." };
    if (quoteRequest.status !== "OPEN")
      return { error: "This quote request is no longer open." };

    // Verify supplier has membership on the scheme
    await requireSchemeMembership(quoteRequest.schemeId, ["SUPPLIER"]);

    // Create the quote
    const quote = await db.orm.public.Quote.create({
      quoteRequestId,
      supplierId: profile.id,
      amount: toNumeric(amount),
      description,
      estimatedDays,
      validUntil: validUntil ? toTimestamp(validUntil) : null,
      notes: notes || null,
      status: "SUBMITTED",
    });

    await logActivity({
      schemeId: quoteRequest.schemeId,
      actorId: profile.id,
      action: "QUOTE_SUBMITTED",
      entityType: "Quote",
      entityId: quote.id,
      metadata: { amount, quoteRequestId },
    });

    revalidatePath(`/supplier/quotes/${quoteRequestId}`);
    revalidatePath("/supplier/my-quotes");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit quote. Please try again." };
  }
}

export async function withdrawQuoteAction(
  quoteId: string,
): Promise<{ error?: string }> {
  try {
    const profile = await requireAuth();

    // Fetch the quote and verify ownership
    const quote = await db.orm.public.Quote.first({ id: quoteId });
    if (!quote) return { error: "Quote not found." };
    if (quote.supplierId !== profile.id)
      return { error: "You can only withdraw your own quotes." };

    if (quote.status !== "SUBMITTED")
      return { error: "Only submitted quotes can be withdrawn." };

    await db.orm.public.Quote.where({ id: quoteId }).update({ status: "WITHDRAWN" });

    // Get the quote request for scheme context
    const quoteRequest = await getQuoteRequestById(quote.quoteRequestId);
    if (quoteRequest) {
      await logActivity({
        schemeId: quoteRequest.schemeId,
        actorId: profile.id,
        action: "QUOTE_WITHDRAWN",
        entityType: "Quote",
        entityId: quoteId,
        metadata: { quoteRequestId: quote.quoteRequestId },
      });
    }

    revalidatePath(`/supplier/quotes/${quote.quoteRequestId}`);
    revalidatePath("/supplier/my-quotes");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to withdraw quote. Please try again." };
  }
}
