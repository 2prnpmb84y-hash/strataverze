"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { db } from "@/prisma/db";
import { logActivity } from "@/lib/queries/activity-log";
import type { Varchar, TimestampString, Numeric } from "@prisma/orm-postgres/target/codec-types";

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

function toNumeric(value: number): Numeric<12, 2> {
  return value as unknown as Numeric<12, 2>;
}

type ActionState = { error?: string; success?: boolean; data?: Record<string, unknown> };

/**
 * Upload a payment confirmation document for an owner's levy notice.
 */
export async function uploadPaymentConfirmationAction(
  schemeId: string,
  data: {
    levyNoticeId?: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    amount?: number;
    documentDate?: string;
    payerName?: string;
    payeeReference?: string;
  },
): Promise<ActionState> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated." };

    // Verify the owner belongs to this scheme
    const schemes = await getSchemesForOwner(profile.id);
    const scheme = schemes.find((s) => s.id === schemeId);
    if (!scheme) return { error: "You do not have access to this scheme." };

    // Find the owner's lot in this scheme
    const lotMembership = scheme.memberships.find(
      (m) => m.role === "OWNER" && m.lotId,
    );
    const lotId = lotMembership?.lotId ?? null;

    const doc = await db.orm.public.FinancialDocument.create({
      schemeId,
      documentType: "PAYMENT_CONFIRMATION",
      uploadedBy: profile.id,
      fileName: toVarchar<500>(data.fileName),
      fileUrl: data.fileUrl,
      fileSize: data.fileSize,
      mimeType: toVarchar<100>(data.mimeType),
      lotId: lotId ?? undefined,
      levyNoticeId: data.levyNoticeId ?? undefined,
      amount: data.amount !== undefined ? toNumeric(data.amount) : undefined,
      documentDate: data.documentDate
        ? toTimestamp(data.documentDate)
        : undefined,
      payerName: data.payerName
        ? toVarchar<200>(data.payerName)
        : undefined,
      payeeReference: data.payeeReference
        ? toVarchar<200>(data.payeeReference)
        : undefined,
      documentStatus: "UPLOADED",
      verificationStatus: "PENDING",
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "PAYMENT_CONFIRMATION_UPLOADED",
      entityType: "FinancialDocument",
      entityId: doc.id,
      metadata: {
        fileName: data.fileName,
        levyNoticeId: data.levyNoticeId ?? null,
      },
    });

    revalidatePath("/owner/finance");
    return { success: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to upload payment confirmation.";
    return { error: msg };
  }
}
