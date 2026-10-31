import { revalidatePath } from "next/cache";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { createDocument } from "@/lib/queries/documents";
import { createInvitation } from "@/lib/queries/invitations";
import { getSchemeNameById } from "@/lib/queries/schemes";
import { logActivity } from "@/lib/queries/activity-log";
import { notifyInvitation } from "@/lib/notifications";
import { consumeUpload, type verifyUpload } from "@/lib/storage/uploads";
import { captureLibraryDocument, captureQuietly } from "@/lib/vault/sources";
import { getTrialVault } from "@/lib/vault/capture";
import { applyChangeOwner, type ChangeOwnerInput } from "./change-owner";

/**
 * What a change of owner does once it is decided (25 Oct 2026), shared by the
 * Adviser's or StrataVerze's own change (changeOwnerAction) and the
 * confirmation of a committee member's held change (H-1, 31 Oct 2026), so a
 * confirmed change applies exactly what an Adviser's change applies. Callers
 * authorise, check the step-up and check the lot is the scheme's first.
 */

type Actor = { id: string; firstName?: string | null; lastName?: string | null };
export type VerifiedUpload = Awaited<ReturnType<typeof verifyUpload>>;

/** File the notice of transfer in the document library (managers only) and the building's vault. */
export async function fileNoticeOfTransfer(p: { schemeId: string; lotNumber: string; settlementDate: string; upload: VerifiedUpload; uploadedBy: string }) {
  const u = p.upload;
  const doc = await consumeUpload(
    u.uploadId,
    () =>
      createDocument({
        schemeId: p.schemeId,
        title: `Notice of transfer, Lot ${p.lotNumber}`,
        category: "OTHER",
        documentType: "NOTICE",
        fileUrl: u.path,
        fileName: u.fileName,
        fileSize: u.size,
        mimeType: u.mimeType,
        uploadedBy: p.uploadedBy,
        lotNumber: p.lotNumber,
        documentDate: p.settlementDate,
        // Personal details of buyer and seller: the managers only.
        visibility: "MANAGEMENT",
      }),
    (d) => `Document:${d.id}`,
  );
  // Into the building's vault, if it has one (trial).
  await captureQuietly(p.schemeId, `Document:${doc.id}`, async () => ((await getTrialVault(p.schemeId)) ? captureLibraryDocument(p.schemeId, doc.id, p.uploadedBy) : null));
  return doc.id;
}

/**
 * Apply the change: the strata roll, the outgoing owner's access and
 * committee seat, delivery preferences, then the notice (`notice` runs after
 * the roll is saved, as before), the invitation, the activity entry and the
 * security event. Returns the message for the person who applied it.
 */
export async function completeChangeOwner(p: {
  schemeId: string;
  lotId: string;
  lotNumber: string;
  input: ChangeOwnerInput;
  invite: boolean;
  actor: Actor;
  actorRole: "ADVISER" | "platform_admin";
  notice: () => Promise<string | null>;
  /** A committee member's change confirmed by this actor. */
  confirmed?: { requestId: string; recordedBy: string };
}) {
  const { schemeId, lotId, lotNumber, input, actor } = p;
  // Looked up before the change is saved, so nothing after the write can fail on it.
  const { rules } = await rulesForScheme(schemeId);
  // The provision that ends the seat, where the pack has one (NSW s 35(1)(a)). Queensland's pack
  // has none: whether a seat ends on sale there is not confirmed (FOR_REVIEW), so no citation is given.
  const seatCitation = rules.CITATIONS?.committeeSeatEndsOnSale ?? null;
  const committee = rules.TERMINOLOGY.committee;
  const result = await applyChangeOwner(schemeId, lotId, input);
  const noticeDocumentId = await p.notice();

  let invited: "sent" | "already" | null = null;
  if (p.invite && input.email) {
    const pending = await db.orm.public.Invitation
      .where((i) => and(i.schemeId.eq(schemeId), i.email.eq(input.email!), i.role.eq("OWNER"), i.status.eq("PENDING")))
      .first();
    if (pending) invited = "already";
    else {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const invitation = await createInvitation({ schemeId, email: input.email, role: "OWNER", lotId, invitedById: actor.id, expiresAt: expiresAt.toISOString() });
      invited = "sent";
      const inviterName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || "Your strata manager";
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
    actorId: actor.id,
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
      ...(p.confirmed ? { requestId: p.confirmed.requestId, recordedBy: p.confirmed.recordedBy } : {}),
    },
  });
  await recordSecurityEvent({
    action: "lot.owner_changed",
    outcome: "allowed",
    actorProfileId: actor.id,
    actorRole: p.actorRole,
    schemeId,
    resourceType: "Lot",
    resourceId: lotId,
    metadata: {
      endedMemberships: result.endedMemberships.length,
      endedCommitteeSeats: result.endedCommitteeSeats.length,
      invited: invited ?? "no",
      ...(p.confirmed ? { requestId: p.confirmed.requestId } : {}),
    },
  });

  revalidateChangeOwner(schemeId);
  const parts = [`${input.ownerName} is now the owner of Lot ${lotNumber} on the strata roll, settled ${input.settlementDate.split("-").reverse().join("/")}.`];
  if (result.endedMemberships.length) parts.push(`The outgoing owner's portal access has ended.`);
  for (const m of result.movedAccess) parts.push(`The outgoing owner keeps portal access through Lot ${m.lotNumber}, which the strata roll shows they still own.`);
  if (result.endedCommitteeSeats.length) {
    parts.push(`Their seat on the ${committee} has ended from the settlement date, as they are no longer an owner${seatCitation ? ` (${seatCitation})` : ""}.`);
  }
  for (const k of result.keptCommitteeSeats) {
    const lots = k.lotNumbers.map((n) => `Lot ${n}`).join(", ");
    parts.push(`Their committee seat continues, as the strata roll shows them as the owner of ${lots}. If that is wrong, the seat needs to be ended separately.`);
  }
  if (invited === "sent") parts.push(`An invitation has been sent to ${input.email}.`);
  if (invited === "already") parts.push(`${input.email} already has an invitation waiting.`);
  if (!input.email) parts.push("No email was given, so no invitation was sent.");
  return parts.join(" ");
}

/** The pages that show a lot's owner or a change waiting for review. */
export function revalidateChangeOwner(schemeId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
  revalidatePath("/owner/scheme", "layout");
  revalidatePath("/admin/owner-changes");
}
