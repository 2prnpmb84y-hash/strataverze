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
import { decideOwnerChange, getPendingOwnerChange } from "./owner-change-requests";

/**
 * What a change of owner does once it is decided (25 Oct 2026), shared by the
 * Adviser's or StrataVerze's own change (changeOwnerAction) and the
 * confirmation of a committee member's held change (H-1, 31 Oct 2026), so a
 * confirmed change applies exactly what an Adviser's change applies. Callers
 * authorise, check the step-up and check the lot is the scheme's first.
 *
 * Atomic (review L2, L3): one transaction holds the lot's row, then checks
 * nothing is waiting (direct) or claims the waiting change (confirm), applies
 * the roll, access, committee and delivery changes and creates the invitation
 * row. Everything else happens only after it commits: the notice of transfer,
 * the invitation email, the activity entries and the security events.
 */

type Actor = { id: string; firstName?: string | null; lastName?: string | null };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type VerifiedUpload = Awaited<ReturnType<typeof verifyUpload>>;

/** The change could not go ahead as asked; nothing was changed (the transaction rolled back). */
export class OwnerChangeConflict extends Error {
  constructor(readonly kind: "PENDING" | "NOT_WAITING" | "LOT") {
    super(`change of owner: ${kind}`);
    this.name = "OwnerChangeConflict";
  }
}

/**
 * Hold the lot's row until the transaction ends, so every change of owner on
 * a lot (recorded, held or confirmed) runs one at a time (review L3).
 */
export async function lockLot(tx: Tx, schemeId: string, lotId: string) {
  const lot = await tx.orm.public.Lot.where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId))).forNoKeyUpdate().first();
  if (!lot) throw new OwnerChangeConflict("LOT");
  return lot;
}

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
 * Apply the change and tell people. `mode` is the Adviser's or StrataVerze's
 * own change (refused while a change is waiting for the lot) or the
 * confirmation of a waiting one (refused unless this call claims it).
 * Throws OwnerChangeConflict, with nothing changed, if it cannot go ahead.
 * Returns the message for the person who applied it.
 */
export async function completeChangeOwner(p: {
  schemeId: string;
  lotId: string;
  lotNumber: string;
  input: ChangeOwnerInput;
  invite: boolean;
  actor: Actor;
  actorRole: "ADVISER" | "platform_admin";
  /** Run after the change commits: files the notice of transfer, if any (direct path). */
  notice: () => Promise<string | null>;
  mode: { kind: "direct" } | { kind: "confirm"; requestId: string; recordedBy: string; noticeDocumentId: string | null };
}) {
  const { schemeId, lotId, lotNumber, input, actor } = p;
  // Looked up before the change is saved, so nothing after the write can fail on it.
  const { rules } = await rulesForScheme(schemeId);
  // The provision that ends the seat, where the pack has one (NSW s 35(1)(a)). Queensland's pack
  // has none: whether a seat ends on sale there is not confirmed (FOR_REVIEW), so no citation is given.
  const seatCitation = rules.CITATIONS?.committeeSeatEndsOnSale ?? null;
  const committee = rules.TERMINOLOGY.committee;

  const { result, invitation } = await db.transaction(async (tx) => {
    await lockLot(tx, schemeId, lotId);
    if (p.mode.kind === "direct") {
      if (await getPendingOwnerChange(schemeId, lotId, tx.orm)) throw new OwnerChangeConflict("PENDING");
    } else if (!(await decideOwnerChange(tx.orm, schemeId, p.mode.requestId, "CONFIRMED", actor.id))) {
      // Decided by someone else since it was read: of two decisions, one wins.
      throw new OwnerChangeConflict("NOT_WAITING");
    }
    const applied = await applyChangeOwner(tx.orm, schemeId, lotId, input);
    let made: { kind: "sent"; id: string; expiresAt: Date } | { kind: "already" } | null = null;
    if (p.invite && input.email) {
      const waiting = await tx.orm.public.Invitation
        .where((i) => and(i.schemeId.eq(schemeId), i.email.eq(input.email!), i.role.eq("OWNER"), i.status.eq("PENDING")))
        .first();
      if (waiting) made = { kind: "already" };
      else {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        const row = await createInvitation({ schemeId, email: input.email, role: "OWNER", lotId, invitedById: actor.id, expiresAt: expiresAt.toISOString() }, tx.orm);
        made = { kind: "sent", id: row.id, expiresAt };
      }
    }
    return { result: applied, invitation: made };
  });

  // Committed. From here on nothing undoes the change.
  const filed = p.mode.kind === "confirm" ? p.mode.noticeDocumentId : await quietly("notice", p.notice);
  const noticeFailed = filed === QUIET_FAILURE;
  const noticeDocumentId = noticeFailed ? null : filed;
  const invited = invitation?.kind ?? null;
  if (invitation?.kind === "sent" && input.email) {
    const inviterName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || "Your strata manager";
    notifyInvitation({
      recipientEmail: input.email,
      schemeName: await getSchemeNameById(schemeId),
      role: "OWNER",
      inviterName,
      expiresAt: invitation.expiresAt,
      invitationToken: invitation.id,
    }).catch(() => {});
  }
  const confirmed = p.mode.kind === "confirm" ? { requestId: p.mode.requestId, recordedBy: p.mode.recordedBy } : null;
  await quietly("activity", () =>
    logActivity({
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
        endedAccess: result.endedMemberships,
        committeeSeatsEnded: result.endedCommitteeSeats.length,
        committeeSeatsKept: result.keptCommitteeSeats.map((k) => ({ profileId: k.profileId, otherLots: k.lotNumbers })),
        ...(confirmed ?? {}),
      },
    }),
  );
  await quietly("audit", () =>
    recordSecurityEvent({
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
        ...(confirmed ? { requestId: confirmed.requestId } : {}),
      },
    }),
  );

  revalidateChangeOwner(schemeId);
  const parts = [`${input.ownerName} is now the owner of Lot ${lotNumber} on the strata roll, settled ${input.settlementDate.split("-").reverse().join("/")}.`];
  if (result.endedMemberships.length) {
    parts.push(
      `The outgoing owner's portal access to Lot ${lotNumber} has ended. If they own another lot in this building, the Adviser assigns them to it from that lot's page.`,
    );
  }
  if (result.endedCommitteeSeats.length) {
    parts.push(
      `Their seat on the ${committee} has ended from the settlement date${seatCitation ? ` (${seatCitation})` : ""}, as they no longer hold owner access in this building. If they still own another lot here, the seat must be reinstated separately.`,
    );
  }
  for (const k of result.keptCommitteeSeats) {
    const lots = k.lotNumbers.map((n) => `Lot ${n}`).join(", ");
    parts.push(`A committee seat continues, as that member holds owner access to ${lots}.`);
  }
  if (invited === "sent") parts.push(`An invitation has been sent to ${input.email}.`);
  if (invited === "already") parts.push(`${input.email} already has an invitation waiting.`);
  if (!input.email) parts.push("No email was given, so no invitation was sent.");
  if (noticeFailed) {
    parts.push("The notice of transfer could not be filed. Please add it to the document library.");
  }
  return parts.join(" ");
}

const QUIET_FAILURE = "__failed__";

/** After the commit: a failure is logged, never reported as the change failing (it has been made). */
async function quietly<T>(what: string, fn: () => Promise<T>): Promise<T | typeof QUIET_FAILURE> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[change-owner] ${what} after commit failed:`, err instanceof Error ? err.message : "error");
    return QUIET_FAILURE;
  }
}

/** The pages that show a lot's owner or a change waiting for review. */
export function revalidateChangeOwner(schemeId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
  revalidatePath("/owner/scheme", "layout");
  revalidatePath("/admin/owner-changes");
}
