import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { createDocument } from "@/lib/queries/documents";
import { logActivityTx } from "@/lib/queries/activity-log";
import { deliverInvitationLink } from "@/lib/invitations/issue";
import { consumeUpload, type verifyUpload } from "@/lib/storage/uploads";
import { captureLibraryDocument, captureQuietly } from "@/lib/vault/sources";
import { getTrialVault } from "@/lib/vault/capture";
import { applyChangeOwner, previewChangeOwner, type ChangeOwnerInput } from "./change-owner";
import { applyOwnerInvitation, planOwnerInvitation } from "./owner-invitation";
import { OwnerChangeConflict, decideOwnerChange, getPendingOwnerChange, lockLot, planFingerprint } from "./owner-change-requests";

/**
 * What a change of owner does once it is decided (25 Oct 2026), shared by the
 * Adviser's or StrataVerze's own change (changeOwnerAction) and the
 * confirmation of a committee member's held change (H-1, 31 Oct 2026), so a
 * confirmed change applies exactly what an Adviser's change applies. Callers
 * authorise, check the step-up and check the lot is the scheme's first.
 *
 * One transaction (reviews L2, L3) holds the lot's row, then checks nothing is
 * waiting (direct) or, for a confirmation, checks the plan is the one the
 * reviewer saw (L6) and claims the waiting change; applies the roll, access,
 * committee and delivery changes; makes the invitation (a new one, or an
 * earlier one reused) and withdraws the lot's other pending owner invitations
 * (M2, M3); and writes the OWNER_CHANGED (and OWNER_CHANGE_CONFIRMED)
 * activity entries. A failure anywhere rolls all of it back.
 *
 * After the commit nothing can report the change as not made (L1): the
 * notice of transfer, the invitation (its account and its /join link email, S2a,
 * deliverInvitationLink), the security events and the page
 * refresh each run quietly, a failure being logged and noted in the message.
 * The security events stay after the commit: the audit log is written outside
 * transactions by design (src/lib/queries/activity-log.ts, logActivityTx).
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

/** Steps after a commit: each runs, a failure is logged and remembered, nothing is thrown (review L1). */
export class AfterCommit {
  readonly failed: string[] = [];
  async run<T>(what: string, fn: () => Promise<T> | T): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.failed.push(what);
      console.error(`[change-owner] after commit, ${what} failed:`, err instanceof Error ? err.message : "error");
      return null;
    }
  }
  /** A note for the person, when something after the commit failed. */
  note(): string | null {
    return this.failed.length ? "The change itself is saved. Some follow-up steps could not be completed and have been logged for StrataVerze." : null;
  }
}

/**
 * Apply the change and tell people. `mode` is the Adviser's or StrataVerze's
 * own change (refused while a change is waiting for the lot) or the
 * confirmation of a waiting one (refused unless the plan is the one the
 * reviewer saw and this call claims it). Throws OwnerChangeConflict, with
 * nothing changed, if it cannot go ahead. Returns the message.
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
  mode:
    | { kind: "direct" }
    | { kind: "confirm"; requestId: string; recordedBy: string; noticeDocumentId: string | null; fingerprint: string; ownerName: string };
}) {
  const { schemeId, lotId, lotNumber, input, actor } = p;
  // Looked up before the change is saved, so nothing after the write can fail on it.
  const { rules } = await rulesForScheme(schemeId);
  // The provision that ends the seat, where the pack has one (NSW s 35(1)(a)). Queensland's pack
  // has none: whether a seat ends on sale there is not confirmed (FOR_REVIEW), so no citation is given.
  const seatCitation = rules.CITATIONS?.committeeSeatEndsOnSale ?? null;
  const committee = rules.TERMINOLOGY.committee;
  const confirmed = p.mode.kind === "confirm" ? { requestId: p.mode.requestId, recordedBy: p.mode.recordedBy } : null;

  const { result, invitation, sent, invited } = await db.transaction(async (tx) => {
    // A lock wait gives up after 5 seconds (S2a, review finding M-2): the /join set-up holds an
    // invitation's row while it calls Auth, and this transaction holds the lot's row meanwhile.
    await tx.execute(tx.raw.sql`SET LOCAL lock_timeout = '5s'`.affectedCount().build());
    await lockLot(tx, schemeId, lotId);
    const planned = await planOwnerInvitation(tx.orm, { schemeId, lotId, email: input.email, invite: p.invite });
    if (p.mode.kind === "direct") {
      if (await getPendingOwnerChange(schemeId, lotId, tx.orm)) throw new OwnerChangeConflict("PENDING");
    } else {
      // What the reviewer saw is what is applied (review L6).
      const now = planFingerprint(p.mode.requestId, await previewChangeOwner(tx.orm, schemeId, lotId), planned);
      if (now !== p.mode.fingerprint) throw new OwnerChangeConflict("PLAN_CHANGED");
      // Decided by someone else since it was read: of two decisions, one wins.
      if (!(await decideOwnerChange(tx.orm, schemeId, p.mode.requestId, "CONFIRMED", actor.id))) throw new OwnerChangeConflict("NOT_WAITING");
    }
    const applied = await applyChangeOwner(tx.orm, schemeId, lotId, input);
    const toSend = await applyOwnerInvitation(tx.orm, planned, { schemeId, lotId, email: input.email, invitedById: actor.id });
    const invited = toSend ? "sent" : planned.kind === "ALREADY" ? "already" : planned.kind === "SKIP_ACTIVE" ? "skipped_active" : "no";
    if (p.mode.kind === "confirm") {
      await logActivityTx(tx, {
        schemeId,
        actorId: actor.id,
        action: "OWNER_CHANGE_CONFIRMED",
        entityType: "Lot",
        entityId: lotId,
        metadata: { lotNumber, requestId: p.mode.requestId, newOwnerName: p.mode.ownerName, recordedBy: p.mode.recordedBy },
      });
    }
    await logActivityTx(tx, {
      schemeId,
      actorId: actor.id,
      action: "OWNER_CHANGED",
      entityType: "Lot",
      entityId: lotId,
      metadata: {
        lotNumber,
        previousOwnerName: applied.previousOwnerName,
        newOwnerName: input.ownerName,
        settlementDate: input.settlementDate,
        // A direct change's notice is filed after the commit; a held change's was filed when it was held.
        noticeDocumentId: p.mode.kind === "confirm" ? p.mode.noticeDocumentId : null,
        invited,
        invitationsWithdrawn: planned.withdrawn.length,
        endedAccess: applied.endedMemberships,
        committeeSeatsEnded: applied.endedCommitteeSeats.length,
        committeeSeatsKept: applied.keptCommitteeSeats.map((k) => ({ profileId: k.profileId, otherLots: k.lotNumbers })),
        ...(confirmed ?? {}),
      },
    });
    return { result: applied, invitation: planned, sent: toSend, invited };
  });

  // Committed. From here on nothing undoes the change or reports it as not made.
  const after = new AfterCommit();
  if (p.mode.kind === "direct") await after.run("notice of transfer", p.notice);
  // The invitee's account (Auth admin calls) and the email, only now that the change has committed
  // and its locks are released (S2a: no HTTP call while row locks are held). The link is the
  // one-time /join#<token> link whose hash the transaction stored.
  let delivered: Awaited<ReturnType<typeof deliverInvitationLink>> | null = null;
  if (sent && input.email) {
    delivered = await after.run("invitation email", () =>
      deliverInvitationLink({
        invitationId: sent.id,
        schemeId,
        email: input.email!,
        role: "OWNER",
        lotNumber,
        token: sent.token,
        hash: sent.hash,
        expiresAt: sent.expiresAt,
        inviter: actor,
        actorRole: p.actorRole,
        resent: sent.resent,
        previousStatus: sent.previousStatus,
        via: "owner_change",
      }),
    );
  }
  await after.run("security event", () =>
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
        invited,
        invitationsWithdrawn: invitation.withdrawn.length,
        ...(confirmed ? { requestId: confirmed.requestId } : {}),
      },
    }),
  );
  if (confirmed) {
    await after.run("security event", () =>
      recordSecurityEvent({
        action: "lot.owner_change_confirmed",
        outcome: "allowed",
        actorProfileId: actor.id,
        actorRole: p.actorRole,
        schemeId,
        resourceType: "Lot",
        resourceId: lotId,
        metadata: confirmed,
      }),
    );
  }
  await after.run("page refresh", () => revalidateChangeOwner(schemeId));

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
  if (sent && delivered?.emailed) parts.push(`An invitation has been sent to ${input.email}.`);
  if (sent && !delivered?.emailed) {
    parts.push(`An invitation to ${input.email} is saved, but it could not be emailed just now. Send it again from the Members page.`);
  }
  if (invitation.kind === "ALREADY") parts.push(`${input.email} already has an invitation waiting.`);
  if (invitation.kind === "NOT_REUSABLE") {
    parts.push(`An earlier invitation to ${input.email} could not be reused, so no invitation was sent. Check it on the Members page.`);
  }
  if (invitation.kind === "SKIP_ACTIVE") {
    parts.push(
      `${input.email} already holds owner access in this building${invitation.activeLotNumber ? ` through Lot ${invitation.activeLotNumber}` : ""}, so no invitation was sent.`,
    );
  }
  if (!input.email) parts.push("No email was given, so no invitation was sent.");
  if (invitation.withdrawn.length) {
    parts.push(`${invitation.withdrawn.length === 1 ? "An earlier invitation" : `${invitation.withdrawn.length} earlier invitations`} to this lot ${invitation.withdrawn.length === 1 ? "was" : "were"} withdrawn.`);
  }
  if (after.failed.includes("notice of transfer")) parts.push("The notice of transfer could not be filed. Please add it to the document library.");
  const note = after.note();
  if (note) parts.push(note);
  return parts.join(" ");
}

/** The pages that show a lot's owner or a change waiting for review. */
export function revalidateChangeOwner(schemeId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
  revalidatePath("/owner/scheme", "layout");
  revalidatePath("/admin/owner-changes");
}
