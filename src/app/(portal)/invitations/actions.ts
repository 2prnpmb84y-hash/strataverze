"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  acceptInvitation,
  declineInvitation,
  getInvitationById,
} from "@/lib/queries/invitations";
import { logActivity } from "@/lib/queries/activity-log";

export async function acceptInvitationAction(invitationId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    const invitation = await getInvitationById(invitationId);
    if (!invitation) return { error: "Invitation not found." };

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
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

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
