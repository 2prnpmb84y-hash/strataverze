"use server";

import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import {
  createInvitation,
  revokeInvitation,
} from "@/lib/queries/invitations";
import { logActivity } from "@/lib/queries/activity-log";
import { getSchemeNameById } from "@/lib/queries/schemes";
import { notifyInvitation } from "@/lib/notifications";

export type InvitationFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

const VALID_ROLES = ["OWNER", "COMMITTEE"];

export async function sendInvitationAction(
  schemeId: string,
  _prev: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const email = (formData.get("email") as string)?.trim().toLowerCase();
    const role = formData.get("role") as string;

    const errors: Record<string, string> = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!role || !VALID_ROLES.includes(role)) {
      errors.role = "Select a valid role.";
    }

    if (Object.keys(errors).length > 0) return { fieldErrors: errors };

    // Set expiry to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const invitation = await createInvitation({
      schemeId,
      email,
      role: role as "OWNER" | "COMMITTEE",
      invitedById: profile.id,
      expiresAt: expiresAt.toISOString(),
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INVITATION_SENT",
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: { email, role },
    });

    // Send email notification (non-blocking)
    const schemeName = await getSchemeNameById(schemeId);
    const inviterName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ") || "A scheme manager";

    notifyInvitation({
      recipientEmail: email,
      schemeName,
      role,
      inviterName,
      expiresAt: expiresAt,
      invitationToken: invitation.id,
    }).catch(() => {});

    revalidatePath(`/adviser/schemes/${schemeId}/members`);
    return { success: `Invitation sent to ${email}.` };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return {
      error:
        "Failed to send invitation. This person may already have a pending invitation for this role.",
    };
  }
}

export async function revokeInvitationAction(
  schemeId: string,
  invitationId: string,
) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await revokeInvitation(invitationId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INVITATION_REVOKED",
      entityType: "Invitation",
      entityId: invitationId,
    });

    revalidatePath(`/adviser/schemes/${schemeId}/members`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to revoke invitation." };
  }
}
