"use server";

import { revalidatePath } from "next/cache";
import { siteUrl } from "@/lib/site-url";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { db } from "@/prisma/db";
import { logActivity } from "@/lib/queries/activity-log";
import { and } from "@prisma/orm-postgres/orm-client";
import { sendEmail } from "@/lib/email";
import { possibleDuplicatePaymentEmail } from "@/lib/email-templates/payment-confirmation";
import { findDuplicateConfirmation } from "@/lib/finance/payment-confirmations";
import { paymentUploadPathProblem } from "@/lib/owner/payment-upload";
import { markUploadUsed, uploadErrorMessage, verifyUpload } from "@/lib/storage/uploads";
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
    /** From prepareUploadAction: the file is already in storage (S3). */
    uploadId: string;
    amount?: number;
    documentDate?: string;
    payerName?: string;
    payeeReference?: string;
  },
): Promise<ActionState> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated." };

    if (typeof data?.uploadId !== "string" || !data.uploadId) return { error: "Choose a file to upload." };

    // Verify the owner belongs to this scheme
    const schemes = await getSchemesForOwner(profile.id);
    const scheme = schemes.find((s) => s.id === schemeId);
    if (!scheme) return { error: "You do not have access to this scheme." };

    // What actually arrived in storage, checked: the server chose the path
    // (directly in this scheme's payments folder), and the size and type
    // come from the stored file, never from the browser (S3, F16).
    let upload;
    try {
      upload = await verifyUpload({ uploadId: data.uploadId, schemeId, purpose: "payment_confirmation", profileId: profile.id });
    } catch (err) {
      const message = uploadErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
    const pathProblem = paymentUploadPathProblem(schemeId, upload.path);
    if (pathProblem) return { error: pathProblem };
    const fileSize = upload.size;
    const mimeType = upload.mimeType;

    // The owner's own lots. A notice, when chosen, must be on one of them.
    const ownLots = scheme.memberships.filter((m) => m.profileId === profile.id && m.role === "OWNER" && m.lotId).map((m) => m.lotId!);
    let lotId: string | null = ownLots.length === 1 ? ownLots[0] : null;
    let noticeNumber: string | null = null;
    if (data.levyNoticeId) {
      const notice = await db.orm.public.LevyNotice.where((n) => and(n.id.eq(data.levyNoticeId!), n.schemeId.eq(schemeId))).first();
      if (!notice || !ownLots.includes(notice.lotId)) return { error: "Choose one of your own levy notices." };
      lotId = notice.lotId;
      noticeNumber = String(notice.noticeNumber);
    }

    // TC-001: the same owner, notice, amount and date as an earlier upload is a possible duplicate.
    const amountCents = data.amount !== undefined && Number.isFinite(data.amount) ? Math.round(data.amount * 100) : null;
    const documentDate = data.documentDate ? String(data.documentDate).slice(0, 10) : null;
    const earlier = await db.orm.public.FinancialDocument.where((d) =>
      and(d.schemeId.eq(schemeId), d.documentType.eq("PAYMENT_CONFIRMATION"), d.uploadedBy.eq(profile.id)),
    )
      .limit(500)
      .all();
    const duplicate = findDuplicateConfirmation(
      { uploadedBy: profile.id, levyNoticeId: data.levyNoticeId ?? null, lotId, amountCents, documentDate },
      earlier.map((e) => ({
        id: e.id,
        uploadedBy: e.uploadedBy,
        levyNoticeId: e.levyNoticeId ?? null,
        lotId: e.lotId ?? null,
        amountCents: e.amount == null ? null : Math.round(Number(e.amount) * 100),
        documentDate: e.documentDate ? String(e.documentDate).slice(0, 10) : null,
        documentStatus: String(e.documentStatus),
        uploadedAt: String(e.uploadedAt),
      })),
    );

    const doc = await db.orm.public.FinancialDocument.create({
      schemeId,
      documentType: "PAYMENT_CONFIRMATION",
      uploadedBy: profile.id,
      fileName: toVarchar<500>(upload.fileName),
      fileUrl: upload.path,
      fileSize,
      mimeType: toVarchar<100>(mimeType),
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
      duplicateOfId: duplicate?.id ?? null,
      reviewNotes: duplicate ? "Possible duplicate of an earlier upload with the same notice, amount and date." : null,
    });

    await markUploadUsed(data.uploadId, `FinancialDocument:${doc.id}`);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "PAYMENT_CONFIRMATION_UPLOADED",
      entityType: "FinancialDocument",
      entityId: doc.id,
      metadata: {
        fileName: upload.fileName,
        levyNoticeId: data.levyNoticeId ?? null,
        possibleDuplicateOf: duplicate?.id ?? null,
      },
    });

    if (duplicate) {
      await logActivity({
        schemeId,
        actorId: profile.id,
        action: "PAYMENT_CONFIRMATION_POSSIBLE_DUPLICATE",
        entityType: "FinancialDocument",
        entityId: doc.id,
        metadata: { duplicateOf: duplicate.id, levyNoticeId: data.levyNoticeId ?? null, amountCents, documentDate },
      });
      // Tell the scheme's advisers. A failure to email never stops the upload.
      try {
        const advisers = await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.eq("ADVISER"), m.isActive.eq(true)))
          .include("profile")
          .limit(20)
          .all();
        const emails = advisers.map((a) => (a.profile?.email ? String(a.profile.email) : "")).filter(Boolean);
        const lot = lotId ? scheme.memberships.find((m) => m.lotId === lotId)?.lot : null;
        if (emails.length) {
          await sendEmail(
            possibleDuplicatePaymentEmail({
              recipientEmails: emails,
              schemeName: String(scheme.name),
              lotLabel: lot ? `Lot ${String(lot.lotNumber)}` : "a lot",
              noticeNumber,
              amount: amountCents != null ? (amountCents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" }) : "",
              documentDate: documentDate ? new Date(`${documentDate}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "",
              earlierUploadedAt: new Date(duplicate.uploadedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" }),
              reviewUrl: `${siteUrl()}/adviser/schemes/${schemeId}/finance/documents/${doc.id}`,
            }),
          );
        }
      } catch (err) {
        console.error("Could not email advisers about a possible duplicate:", err);
      }
    }

    revalidatePath("/owner/finance");
    return { success: true, data: { possibleDuplicate: !!duplicate } };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to upload payment confirmation.";
    return { error: msg };
  }
}
