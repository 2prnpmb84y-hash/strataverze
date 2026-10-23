"use server";

import { revalidatePath } from "next/cache";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import {
  createInvitation,
  revokeInvitation,
} from "@/lib/queries/invitations";
import { logActivity } from "@/lib/queries/activity-log";
import { getSchemeNameById } from "@/lib/queries/schemes";
import { notifyInvitation } from "@/lib/notifications";
import { quoteUsageFee } from "@/lib/billing/capture";
import { confirmedCentsFrom, feeErrorMessage, resolveDisclosure } from "@/lib/billing/disclosure";

export type InvitationFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

const VALID_ROLES = ["OWNER", "COMMITTEE", "ACCOUNTANT"];

export async function sendInvitationAction(
  schemeId: string,
  _prev: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "members.manage");
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

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

    // An accountant seat is a monthly StrataVerze charge. The adviser confirms
    // it here; the confirmation is kept with the invitation and used when the
    // seat becomes active on acceptance.
    const seatFee = role === "ACCOUNTANT" ? await quoteUsageFee({ code: "ACCOUNTANT_SEAT" }) : null;
    const feeDisclosure = seatFee
      ? { code: seatFee.code, ...resolveDisclosure(seatFee, confirmedCentsFrom(formData), profile.id)! }
      : null;

    // Set expiry to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const invitation = await createInvitation({
      schemeId,
      email,
      role: role as "OWNER" | "COMMITTEE" | "ACCOUNTANT",
      invitedById: profile.id,
      expiresAt: expiresAt.toISOString(),
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INVITATION_SENT",
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: feeDisclosure ? { email, role, feeDisclosure } : { email, role },
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
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
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
    const { profile } = await requireSchemeAccess(schemeId, "members.manage");
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    // The invitation must belong to this scheme (SEC-004).
    const invitation = await db.orm.public.Invitation
      .where((i) => and(i.id.eq(invitationId), i.schemeId.eq(schemeId)))
      .first();
    assertInScheme(invitation, schemeId, "Invitation");

    await revokeInvitation(schemeId, invitationId);

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
