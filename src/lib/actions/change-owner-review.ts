"use server";

import { db } from "@/prisma/db";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireRolesOrAdmin } from "@/lib/auth/building-lock";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { getLotInScheme } from "@/lib/queries/lots";
import { logActivityTx } from "@/lib/queries/activity-log";
import { AfterCommit, completeChangeOwner, revalidateChangeOwner } from "@/lib/owner/change-owner-effects";
import { OwnerChangeConflict, decideOwnerChange, getOwnerChangeRequest, heldInput, lockLot } from "@/lib/owner/owner-change-requests";
import { isOwnAddress } from "@/lib/owner/own-address";
import { currentAddressesOf } from "@/lib/owner/recorder-addresses";

export type OwnerChangeReviewState = { error?: string; done?: string };

const NOT_WAITING = "This change of owner is no longer waiting for review. Refresh the page to see where it stands.";
const PLAN_CHANGED =
  "What confirming would do has changed since this page was opened (the lot's owners, committee seats or invitations). Nothing changed. Reload the page, check it again, then confirm.";

/**
 * Confirm a change of owner a committee member recorded (finding H-1, founder
 * decision 31 Oct 2026). The scheme's Adviser or a platform admin (the only
 * reviewer for a building with no Adviser), with a recent authenticator
 * check. Refused if the new owner's email is now one of the recorder's own
 * addresses (their profile and Auth addresses as they are now, plus tags
 * ignored; review L1). Applies exactly what an Adviser's change of owner
 * applies, in one transaction with the decision (review L2): the strata roll,
 * the outgoing owner's access to the lot, committee seats, delivery
 * preferences and, if asked for, the new owner's invitation (sent by the
 * person confirming, by email after the commit). `fingerprint` is the plan the
 * reviewer was shown (PendingOwnerChangeView.fingerprint): confirming refuses
 * if what it would do has changed since (review L6).
 */
export async function confirmOwnerChangeAction(schemeId: string, requestId: string, fingerprint: string): Promise<OwnerChangeReviewState> {
  try {
    const { profile, isAdmin } = await requireRolesOrAdmin(schemeId, ["ADVISER"]);
    await requireRecentMfa();
    const found = await waitingRequest(schemeId, requestId);
    if ("error" in found) return found;
    const { request, lotNumber } = found;
    const actorRole = isAdmin ? "platform_admin" : "ADVISER";

    // The recorder cannot have made themselves the owner, even with an address added since.
    if (request.ownerEmail) {
      let theirs: Set<string>;
      try {
        theirs = await currentAddressesOf(request.recordedBy);
      } catch (err) {
        console.error("[change-owner-review] recorder addresses:", err instanceof Error ? err.message : "error");
        return { error: "The recorder's email addresses could not be checked, so the change was not confirmed. Nothing changed. Please try again." };
      }
      if (isOwnAddress(request.ownerEmail, theirs)) {
        await recordSecurityEvent({
          action: "lot.owner_change_refused",
          outcome: "denied",
          actorProfileId: profile.id,
          actorRole,
          schemeId,
          resourceType: "Lot",
          resourceId: request.lotId,
          reason: "new owner email is one of the recorder's own addresses",
          metadata: { requestId: request.id, recordedBy: request.recordedBy },
        });
        return {
          error: `The new owner's email is one of the addresses of the committee member who recorded this change, so it cannot be confirmed. Reject it, and record the change yourself if they have bought Lot ${lotNumber}.`,
        };
      }
    }

    if (typeof fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(fingerprint)) return { error: PLAN_CHANGED };
    let done: string;
    try {
      done = await completeChangeOwner({
        schemeId,
        lotId: request.lotId,
        lotNumber,
        input: heldInput(request),
        invite: !!request.invite,
        actor: profile,
        actorRole,
        notice: async () => null,
        // The decision is made in the same transaction as the change (one decision wins).
        mode: {
          kind: "confirm",
          requestId: request.id,
          recordedBy: request.recordedBy,
          noticeDocumentId: request.noticeDocumentId ?? null,
          fingerprint,
          ownerName: request.ownerName,
        },
      });
    } catch (err) {
      if (err instanceof OwnerChangeConflict) return { error: err.kind === "PLAN_CHANGED" ? PLAN_CHANGED : NOT_WAITING };
      throw err;
    }
    // The decision's activity entry and security event are written by completeChangeOwner (the entry in its transaction).
    return { done: `Confirmed. ${done}` };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("[change-owner-review] confirm failed:", err instanceof Error ? err.message : "error");
    return { error: "The change of owner could not be confirmed. Nothing changed. Please try again." };
  }
}

/**
 * Reject a change of owner a committee member recorded (H-1). The same people
 * and step-up check as confirming. Nothing on the strata roll or anyone's
 * access changes, and no invitation is sent.
 */
export async function rejectOwnerChangeAction(schemeId: string, requestId: string): Promise<OwnerChangeReviewState> {
  try {
    const { profile, isAdmin } = await requireRolesOrAdmin(schemeId, ["ADVISER"]);
    await requireRecentMfa();
    const found = await waitingRequest(schemeId, requestId);
    if ("error" in found) return found;
    const { request, lotNumber } = found;
    const actorRole = isAdmin ? "platform_admin" : "ADVISER";
    let decided = false;
    try {
      decided = await db.transaction(async (tx) => {
        await lockLot(tx, schemeId, request.lotId);
        if (!(await decideOwnerChange(tx.orm, schemeId, request.id, "REJECTED", profile.id))) return false;
        // In the transaction, so the decision and its entry are saved together (review L1).
        await logActivityTx(tx, {
          schemeId,
          actorId: profile.id,
          action: "OWNER_CHANGE_REJECTED",
          entityType: "Lot",
          entityId: request.lotId,
          metadata: { lotNumber, requestId: request.id, newOwnerName: request.ownerName, recordedBy: request.recordedBy },
        });
        return true;
      });
    } catch (err) {
      if (err instanceof OwnerChangeConflict) return { error: NOT_WAITING };
      throw err;
    }
    if (!decided) return { error: NOT_WAITING };
    // Committed: nothing below can report the rejection as not made.
    const after = new AfterCommit();
    await after.run("security event", () =>
      recordSecurityEvent({
        action: "lot.owner_change_rejected",
        outcome: "allowed",
        actorProfileId: profile.id,
        actorRole,
        schemeId,
        resourceType: "Lot",
        resourceId: request.lotId,
        metadata: { requestId: request.id, recordedBy: request.recordedBy },
      }),
    );
    await after.run("page refresh", () => revalidateChangeOwner(schemeId));
    const parts = [`The change of owner of Lot ${lotNumber} to ${request.ownerName} was rejected. Nothing on the strata roll changed and no invitation was sent.`];
    if (request.noticeDocumentId) parts.push("The notice of transfer filed with it stays in the document library; delete it there if it is wrong.");
    const note = after.note();
    if (note) parts.push(note);
    return { done: parts.join(" ") };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("[change-owner-review] reject failed:", err instanceof Error ? err.message : "error");
    return { error: "The change of owner could not be rejected. Nothing changed. Please try again." };
  }
}

/** The waiting request of this scheme, and its lot (checked to be the scheme's). */
async function waitingRequest(schemeId: string, requestId: string) {
  const request = await getOwnerChangeRequest(schemeId, requestId);
  if (!request || request.status !== "PENDING") return { error: NOT_WAITING };
  const lot = await getLotInScheme(schemeId, request.lotId);
  assertInScheme(lot, schemeId, "Lot");
  return { request, lotNumber: String(lot!.lotNumber) };
}
