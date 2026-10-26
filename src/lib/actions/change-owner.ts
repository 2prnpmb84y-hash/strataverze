"use server";

import { revalidatePath } from "next/cache";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { getLotInScheme } from "@/lib/queries/lots";
import { createDocument } from "@/lib/queries/documents";
import { createInvitation } from "@/lib/queries/invitations";
import { getSchemeNameById } from "@/lib/queries/schemes";
import { logActivity } from "@/lib/queries/activity-log";
import { notifyInvitation } from "@/lib/notifications";
import { consumeUpload, uploadErrorMessage, verifyUpload } from "@/lib/storage/uploads";
import { applyChangeOwner, checkChangeOwner } from "@/lib/owner/change-owner";
import { captureLibraryDocument, captureQuietly } from "@/lib/vault/sources";
import { getTrialVault } from "@/lib/vault/capture";

export type ChangeOwnerState = { error?: string; fieldErrors?: Record<string, string>; done?: string };

/**
 * Record a change of owner for a lot (25 Oct 2026). The Adviser and the
 * committee (roll.manage), with a recent authenticator check. Updates the
 * strata roll, ends the outgoing owner's portal access, files the notice
 * of transfer if one is attached, and invites the new owner by email.
 */
export async function changeOwnerAction(schemeId: string, lotId: string, _prev: ChangeOwnerState, formData: FormData): Promise<ChangeOwnerState> {
  try {
    const { profile, roles } = await requireSchemeAccess(schemeId, "roll.manage");
    await requireRecentMfa();
    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");

    const checked = checkChangeOwner(Object.fromEntries(formData.entries()), await schemeToday(schemeId));
    if (!checked.ok) return { fieldErrors: checked.fieldErrors };
    const input = checked.value;
    const invite = formData.get("invite") === "on" && !!input.email;

    // The notice of transfer, if attached: checked before anything changes.
    const uploadId = String(formData.get("uploadId") ?? "");
    let upload: Awaited<ReturnType<typeof verifyUpload>> | null = null;
    if (uploadId) {
      try {
        upload = await verifyUpload({ uploadId, schemeId, purpose: "committee_library", profileId: profile.id });
      } catch (err) {
        const message = uploadErrorMessage(err);
        if (message) return { fieldErrors: { notice: message } };
        throw err;
      }
    }

    const result = await applyChangeOwner(schemeId, lotId, input);
    const lotNumber = lot!.lotNumber;

    let noticeDocumentId: string | null = null;
    if (upload) {
      const u = upload;
      const doc = await consumeUpload(
        u.uploadId,
        () =>
          createDocument({
            schemeId,
            title: `Notice of transfer, Lot ${lotNumber}`,
            category: "OTHER",
            documentType: "NOTICE",
            fileUrl: u.path,
            fileName: u.fileName,
            fileSize: u.size,
            mimeType: u.mimeType,
            uploadedBy: profile.id,
            lotNumber,
            documentDate: input.settlementDate,
            // Personal details of buyer and seller: the managers only.
            visibility: "MANAGEMENT",
          }),
        (d) => `Document:${d.id}`,
      );
      noticeDocumentId = doc.id;
      // Into the building's vault, if it has one (trial).
      await captureQuietly(schemeId, `Document:${doc.id}`, async () => ((await getTrialVault(schemeId)) ? captureLibraryDocument(schemeId, doc.id, profile.id) : null));
    }

    let invited: "sent" | "already" | null = null;
    if (invite && input.email) {
      const pending = await db.orm.public.Invitation
        .where((i) => and(i.schemeId.eq(schemeId), i.email.eq(input.email!), i.role.eq("OWNER"), i.status.eq("PENDING")))
        .first();
      if (pending) invited = "already";
      else {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        const invitation = await createInvitation({ schemeId, email: input.email, role: "OWNER", lotId, invitedById: profile.id, expiresAt: expiresAt.toISOString() });
        invited = "sent";
        const inviterName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Your strata manager";
        notifyInvitation({
          recipientEmail: input.email,
          schemeName: await getSchemeNameById(schemeId),
          role: "OWNER",
          inviterName,
          expiresAt,
          invitationToken: invitation.id,
        }).catch(() => {});
      }
    }

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "OWNER_CHANGED",
      entityType: "Lot",
      entityId: lotId,
      metadata: {
        lotNumber,
        previousOwnerName: result.previousOwnerName,
        newOwnerName: input.ownerName,
        settlementDate: input.settlementDate,
        noticeDocumentId,
        invited: invited ?? "no",
        committeeSeatsEnded: result.endedCommitteeSeats.length,
        committeeSeatsKept: result.keptCommitteeSeats.map((k) => ({ profileId: k.profileId, otherLots: k.lotNumbers })),
      },
    });
    await recordSecurityEvent({
      action: "lot.owner_changed",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: roles.includes("ADVISER") ? "ADVISER" : "COMMITTEE",
      schemeId,
      resourceType: "Lot",
      resourceId: lotId,
      metadata: { endedMemberships: result.endedMemberships.length, endedCommitteeSeats: result.endedCommitteeSeats.length, invited: invited ?? "no" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
    revalidatePath("/owner/scheme", "layout");
    const parts = [`${input.ownerName} is now the owner of Lot ${lotNumber} on the strata roll, settled ${input.settlementDate.split("-").reverse().join("/")}.`];
    if (result.endedMemberships.length) parts.push(`The outgoing owner's portal access has ended.`);
    for (const m of result.movedAccess) parts.push(`The outgoing owner keeps portal access through Lot ${m.lotNumber}, which the strata roll shows they still own.`);
    if (result.endedCommitteeSeats.length) parts.push(`Their seat on the strata committee has ended from the settlement date, as they are no longer an owner (s 35(1)(a) SSMA 2015).`);
    for (const k of result.keptCommitteeSeats) {
      const lots = k.lotNumbers.map((n) => `Lot ${n}`).join(", ");
      parts.push(`Their committee seat continues, as the strata roll shows them as the owner of ${lots}. If that is wrong, the seat needs to be ended separately.`);
    }
    if (invited === "sent") parts.push(`An invitation has been sent to ${input.email}.`);
    if (invited === "already") parts.push(`${input.email} already has an invitation waiting.`);
    if (!input.email) parts.push("No email was given, so no invitation was sent.");
    return { done: parts.join(" ") };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("[change-owner] failed:", err instanceof Error ? err.message : "error");
    return { error: "The change of owner could not be saved. Nothing was sent. Please try again." };
  }
}
