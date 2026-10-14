"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  acceptInvitation,
  declineInvitation,
} from "@/lib/queries/invitations";

export async function acceptInvitationAction(invitationId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    const result = await acceptInvitation(invitationId, profile.id);
    if (result.error) return { error: result.error };

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
    await declineInvitation(invitationId);
    revalidatePath("/invitations");
    return { success: true };
  } catch {
    return { error: "Failed to decline invitation. Please try again." };
  }
}
