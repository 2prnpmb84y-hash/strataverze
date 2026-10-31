"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, AuthorisationError } from "@/lib/auth/require-membership";
import {
  acceptInvitation,
  declineInvitation,
  getInvitationById,
} from "@/lib/queries/invitations";
import { logActivity } from "@/lib/queries/activity-log";
import { hitRateLimit } from "@/lib/auth/rate-limit-db";
import { getCurrentSession } from "@/lib/auth/current-session";
import { ADDRESS_UNCONFIRMED, invitationAddressOf } from "@/lib/invitations/invitee-address";

export async function acceptInvitationAction(invitationId: string) {
  let profile;
  try {
    profile = await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  if (!(await hitRateLimit("invitationAccept", profile.id))) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  try {
    const invitation = await getInvitationById(invitationId);
    if (!invitation) return { error: "Invitation not found." };

    // Verify the invitation was sent to this user's email, as the Auth
    // server holds it for this session, not the stored profile copy, which
    // can be stale (review finding L7). If the two differ, refuse.
    const address = invitationAddressOf(await getCurrentSession());
    if (!address) return { error: ADDRESS_UNCONFIRMED };
    const invitationEmail = String(invitation.email).toLowerCase();
    if (address !== invitationEmail) {
      return {
        error:
          "This invitation was sent to a different email address. " +
          "Please sign in with the correct account.",
      };
    }

    const result = await acceptInvitation(invitationId, profile.id, address);
    if (result.error) return { error: result.error };

    await logActivity({
      schemeId: invitation.schemeId,
      actorId: profile.id,
      action: "INVITATION_ACCEPTED",
      entityType: "Invitation",
      entityId: invitationId,
    });

    revalidatePath("/invitations");
    revalidatePath("/dashboard");
    return { success: true };
  } catch {
    return { error: "Failed to accept invitation. Please try again." };
  }
}

export async function declineInvitationAction(invitationId: string) {
  let profile;
  try {
    profile = await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  try {
    const invitation = await getInvitationById(invitationId);
    if (!invitation) return { error: "Invitation not found." };

    // Only the person the invitation was sent to may decline it, by the
    // session's Auth address (L7).
    const address = invitationAddressOf(await getCurrentSession());
    if (!address) return { error: ADDRESS_UNCONFIRMED };
    if (address !== String(invitation.email).toLowerCase()) {
      return { error: "Invitation not found." };
    }
    if (invitation.status !== "PENDING") {
      return { error: "This invitation is no longer pending." };
    }

    await declineInvitation(invitationId);

    await logActivity({
      schemeId: invitation.schemeId,
      actorId: profile.id,
      action: "INVITATION_DECLINED",
      entityType: "Invitation",
      entityId: invitationId,
    });

    revalidatePath("/invitations");
    return { success: true };
  } catch {
    return { error: "Failed to decline invitation. Please try again." };
  }
}
