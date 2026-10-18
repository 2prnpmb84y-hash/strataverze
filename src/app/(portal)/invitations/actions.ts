"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, AuthorisationError } from "@/lib/auth/require-membership";
import {
  acceptInvitation,
  declineInvitation,
  getInvitationById,
} from "@/lib/queries/invitations";
import { logActivity } from "@/lib/queries/activity-log";

export async function acceptInvitationAction(invitationId: string) {
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

    // Verify the invitation was sent to this user's email
    const profileEmail = String(profile.email).toLowerCase();
    const invitationEmail = String(invitation.email).toLowerCase();
    if (profileEmail !== invitationEmail) {
      return {
        error:
          "This invitation was sent to a different email address. " +
          "Please sign in with the correct account.",
      };
    }

    const result = await acceptInvitation(invitationId, profile.id);
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
