"use server";

import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireRolesOrAdmin } from "@/lib/auth/building-lock";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { getLotInScheme } from "@/lib/queries/lots";
import { logActivity } from "@/lib/queries/activity-log";
import { completeChangeOwner, revalidateChangeOwner } from "@/lib/owner/change-owner-effects";
import { decideOwnerChange, getOwnerChangeRequest, heldInput, type OwnerChangeDecision } from "@/lib/owner/owner-change-requests";

export type OwnerChangeReviewState = { error?: string; done?: string };

const NOT_WAITING = "This change of owner is no longer waiting for review. Refresh the page to see where it stands.";

/**
 * Confirm a change of owner a committee member recorded (finding H-1, founder
 * decision 31 Oct 2026). The scheme's Adviser or a platform admin (the only
 * reviewer for a building with no Adviser), with a recent authenticator
 * check. Applies exactly what an Adviser's change of owner applies: the
 * strata roll, the outgoing owner's access and committee seat, delivery
 * preferences and, if asked for, the new owner's invitation (sent by the
 * person confirming).
 */
export async function confirmOwnerChangeAction(schemeId: string, requestId: string): Promise<OwnerChangeReviewState> {
  try {
    const { profile, isAdmin } = await requireRolesOrAdmin(schemeId, ["ADVISER"]);
    await requireRecentMfa();
    const claimed = await claim(schemeId, requestId, "CONFIRMED", profile.id, isAdmin);
    if ("error" in claimed) return claimed;
    const { request, lotNumber } = claimed;
    try {
      const done = await completeChangeOwner({
        schemeId,
        lotId: request.lotId,
        lotNumber,
        input: heldInput(request),
        invite: !!request.invite,
        actor: profile,
        actorRole: isAdmin ? "platform_admin" : "ADVISER",
        // Filed when the change was recorded.
        notice: async () => request.noticeDocumentId ?? null,
        confirmed: { requestId: request.id, recordedBy: request.recordedBy },
      });
      return { done: `Confirmed. ${done}` };
    } catch (err) {
      console.error("[change-owner-review] confirmed but not applied:", err instanceof Error ? err.message : "error");
      revalidateChangeOwner(schemeId);
      return {
        error: `The change of owner was confirmed but could not be applied in full. Please record the change of owner of Lot ${lotNumber} again from this lot's page and check the strata roll.`,
      };
    }
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
    const claimed = await claim(schemeId, requestId, "REJECTED", profile.id, isAdmin);
    if ("error" in claimed) return claimed;
    const { request, lotNumber } = claimed;
    revalidateChangeOwner(schemeId);
    const parts = [`The change of owner of Lot ${lotNumber} to ${request.ownerName} was rejected. Nothing on the strata roll changed and no invitation was sent.`];
    if (request.noticeDocumentId) parts.push("The notice of transfer filed with it stays in the document library; delete it there if it is wrong.");
    return { done: parts.join(" ") };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("[change-owner-review] reject failed:", err instanceof Error ? err.message : "error");
    return { error: "The change of owner could not be rejected. Nothing changed. Please try again." };
  }
}

/**
 * Find the waiting request in this scheme, check its lot is the scheme's,
 * decide it (one decision wins) and record the decision.
 */
async function claim(schemeId: string, requestId: string, decision: OwnerChangeDecision, actorId: string, isAdmin: boolean) {
  const request = await getOwnerChangeRequest(schemeId, requestId);
  if (!request || request.status !== "PENDING") return { error: NOT_WAITING };
  const lot = await getLotInScheme(schemeId, request.lotId);
  assertInScheme(lot, schemeId, "Lot");
  // Before anything changes: of two decisions at once, only one is applied.
  if (!(await decideOwnerChange(schemeId, request.id, decision, actorId))) return { error: NOT_WAITING };
  const lotNumber = String(lot!.lotNumber);
  const word = decision === "CONFIRMED" ? "confirmed" : "rejected";
  await logActivity({
    schemeId,
    actorId,
    action: decision === "CONFIRMED" ? "OWNER_CHANGE_CONFIRMED" : "OWNER_CHANGE_REJECTED",
    entityType: "Lot",
    entityId: request.lotId,
    metadata: { lotNumber, requestId: request.id, newOwnerName: request.ownerName, recordedBy: request.recordedBy },
  });
  await recordSecurityEvent({
    action: `lot.owner_change_${word}`,
    outcome: "allowed",
    actorProfileId: actorId,
    actorRole: isAdmin ? "platform_admin" : "ADVISER",
    schemeId,
    resourceType: "Lot",
    resourceId: request.lotId,
    metadata: { requestId: request.id, recordedBy: request.recordedBy },
  });
  return { request, lotNumber };
}
