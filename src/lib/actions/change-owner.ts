"use server";

import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccessOrAdmin } from "@/lib/auth/building-lock";
import { getCurrentSession } from "@/lib/auth/current-session";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { getLotInScheme } from "@/lib/queries/lots";
import { logActivity } from "@/lib/queries/activity-log";
import { uploadErrorMessage, verifyUpload } from "@/lib/storage/uploads";
import { checkChangeOwner, type ChangeOwnerInput } from "@/lib/owner/change-owner";
import { completeChangeOwner, fileNoticeOfTransfer, revalidateChangeOwner, type VerifiedUpload } from "@/lib/owner/change-owner-effects";
import { getPendingOwnerChange, holdOwnerChange, schemeHasAdviser } from "@/lib/owner/owner-change-requests";

export type ChangeOwnerState = { error?: string; fieldErrors?: Record<string, string>; done?: string };

const OWN_ADDRESS =
  "You cannot record yourself as the new owner. If you have bought this lot, ask the Adviser to record the change of owner.";

/**
 * Record a change of owner for a lot (25 Oct 2026), with a recent
 * authenticator check. Open to roll.manage (the Adviser and the committee)
 * and StrataVerze.
 *
 * The Adviser or StrataVerze: applied straight away. Updates the strata roll,
 * ends the outgoing owner's portal access, files the notice of transfer if
 * one is attached, and invites the new owner by email.
 *
 * A committee member (finding H-1, founder decision 31 Oct 2026): the new
 * owner's email cannot be one of their own addresses, and the change is held
 * for the Adviser (or StrataVerze, where the building has no Adviser) to
 * confirm or reject (change-owner-review.ts). While it waits nothing changes
 * on the strata roll, the outgoing owner keeps their access and any committee
 * seat, and no invitation exists. Only the notice of transfer, if attached,
 * is filed now (managers only), so the reviewer can read it.
 *
 * A lot with a change waiting cannot have another recorded, by anyone, until
 * that one is confirmed or rejected.
 */
export async function changeOwnerAction(schemeId: string, lotId: string, _prev: ChangeOwnerState, formData: FormData): Promise<ChangeOwnerState> {
  try {
    const { profile, isAdmin, roles } = await requireSchemeAccessOrAdmin(schemeId, "roll.manage");
    // Applied straight away only for the Adviser or StrataVerze (H-1).
    const direct = isAdmin || roles.includes("ADVISER");
    await requireRecentMfa();
    const lot = await getLotInScheme(schemeId, lotId);
    assertInScheme(lot, schemeId, "Lot");
    const lotNumber = lot!.lotNumber;

    const checked = checkChangeOwner(Object.fromEntries(formData.entries()), await schemeToday(schemeId));
    if (!checked.ok) return { fieldErrors: checked.fieldErrors };
    const input = checked.value;
    const invite = formData.get("invite") === "on" && !!input.email;

    // A committee member cannot make themselves the owner (H-1).
    if (!direct && input.email && (await callerAddresses(profile.email)).has(input.email.trim().toLowerCase())) {
      await recordSecurityEvent({
        action: "lot.owner_change_refused",
        outcome: "denied",
        actorProfileId: profile.id,
        actorRole: "COMMITTEE",
        schemeId,
        resourceType: "Lot",
        resourceId: lotId,
        reason: "new owner email is the caller's own address",
      });
      return { fieldErrors: { email: OWN_ADDRESS } };
    }

    // One change at a time for each lot.
    if (await getPendingOwnerChange(schemeId, lotId)) return { error: await waitingMessage(schemeId, lotNumber) };

    // The notice of transfer, if attached: checked before anything changes.
    const uploadId = String(formData.get("uploadId") ?? "");
    let upload: VerifiedUpload | null = null;
    if (uploadId) {
      try {
        upload = await verifyUpload({ uploadId, schemeId, purpose: "committee_library", profileId: profile.id });
      } catch (err) {
        const message = uploadErrorMessage(err);
        if (message) return { fieldErrors: { notice: message } };
        throw err;
      }
    }
    const notice = async () =>
      upload ? fileNoticeOfTransfer({ schemeId, lotNumber, settlementDate: input.settlementDate, upload, uploadedBy: profile.id }) : null;

    if (!direct) return await holdForReview({ schemeId, lotId, lotNumber, input, invite, actorId: profile.id, notice });

    const done = await completeChangeOwner({
      schemeId,
      lotId,
      lotNumber,
      input,
      invite,
      actor: profile,
      actorRole: isAdmin ? "platform_admin" : "ADVISER",
      notice,
    });
    return { done };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("[change-owner] failed:", err instanceof Error ? err.message : "error");
    return { error: "The change of owner could not be saved. Nothing was sent. Please try again." };
  }
}

/** A committee member's change: stored for review, nothing else changes. */
async function holdForReview(p: {
  schemeId: string;
  lotId: string;
  lotNumber: string;
  input: ChangeOwnerInput;
  invite: boolean;
  actorId: string;
  notice: () => Promise<string | null>;
}): Promise<ChangeOwnerState> {
  const { schemeId, lotId, lotNumber, input } = p;
  const noticeDocumentId = await p.notice();
  let request;
  try {
    request = await holdOwnerChange({ schemeId, lotId, input, invite: p.invite, noticeDocumentId, recordedBy: p.actorId });
  } catch (err) {
    // Another change for this lot was recorded at the same moment (one waiting per lot).
    if ((err as { code?: string })?.code === "23505") return { error: await waitingMessage(schemeId, lotNumber) };
    throw err;
  }
  await logActivity({
    schemeId,
    actorId: p.actorId,
    action: "OWNER_CHANGE_HELD",
    entityType: "Lot",
    entityId: lotId,
    metadata: { lotNumber, requestId: request.id, newOwnerName: input.ownerName, settlementDate: input.settlementDate, noticeDocumentId, invite: p.invite },
  });
  await recordSecurityEvent({
    action: "lot.owner_change_held",
    outcome: "allowed",
    actorProfileId: p.actorId,
    actorRole: "COMMITTEE",
    schemeId,
    resourceType: "Lot",
    resourceId: lotId,
    metadata: { requestId: request.id, invite: p.invite, notice: !!noticeDocumentId },
  });
  revalidateChangeOwner(schemeId);
  const reviewer = (await schemeHasAdviser(schemeId)) ? "the Adviser" : "StrataVerze";
  const parts = [
    `The change of owner of Lot ${lotNumber} to ${input.ownerName} is waiting for ${reviewer} to confirm it.`,
    `Until then nothing changes: the strata roll still shows the current owner, who keeps their portal access, and no invitation has been sent.`,
  ];
  if (noticeDocumentId) parts.push("The notice of transfer has been filed in the document library, visible to the managers only.");
  return { done: parts.join(" ") };
}

async function waitingMessage(schemeId: string, lotNumber: string) {
  const reviewer = (await schemeHasAdviser(schemeId)) ? "the Adviser" : "StrataVerze";
  return `A change of owner of Lot ${lotNumber} is already waiting for ${reviewer} to confirm it. It must be confirmed or rejected before another is recorded.`;
}

/**
 * Every address on the signed-in person's account, trimmed and lower case:
 * the profile's email (what invitations are matched against), the sign-in
 * email, an email change waiting for confirmation, and the email of each
 * linked sign-in identity.
 */
async function callerAddresses(profileEmail: string | null | undefined) {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.add(v.trim().toLowerCase());
  };
  add(profileEmail);
  const user = (await getCurrentSession())?.user;
  add(user?.email);
  add(user?.new_email);
  for (const identity of user?.identities ?? []) add(identity.identity_data?.email);
  return out;
}
