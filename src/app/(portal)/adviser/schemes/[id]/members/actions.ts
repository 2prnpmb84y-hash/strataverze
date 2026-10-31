"use server";

import { revalidatePath } from "next/cache";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { revokeInvitation } from "@/lib/queries/invitations";
import { logActivity } from "@/lib/queries/activity-log";
import { authoriseInviter } from "@/lib/invitations/authorise";
import { issueInvitation } from "@/lib/invitations/issue";
import { quoteUsageFee } from "@/lib/billing/capture";
import { confirmedCentsFrom, feeErrorMessage, resolveDisclosure } from "@/lib/billing/disclosure";

export type InvitationFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

/**
 * Invite someone to the building (security stage S2a). The Adviser or a
 * StrataVerze platform admin, with a recent authenticator check. Owners are
 * invited to a lot. If the address has no StrataVerze account, one is made
 * on the server and the emailed one-time link lets them choose a password
 * and accept (src/lib/invitations/issue.ts). Every check is here, on the
 * server: the form only collects the fields.
 *
 * The reply is the same whether or not the address already had an account.
 */
export async function sendInvitationAction(
  schemeId: string,
  _prev: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  try {
    const { profile, actorRole } = await authoriseInviter(schemeId);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    const role = String(formData.get("role") ?? "");

    // An accountant seat is a monthly StrataVerze charge. The adviser confirms
    // it here; the confirmation is kept with the invitation and used when the
    // seat becomes active on acceptance.
    const seatFee = role === "ACCOUNTANT" ? await quoteUsageFee({ code: "ACCOUNTANT_SEAT" }) : null;
    const feeDisclosure = seatFee
      ? { code: seatFee.code, ...resolveDisclosure(seatFee, confirmedCentsFrom(formData), profile.id)! }
      : null;

    const result = await issueInvitation({
      schemeId,
      email: String(formData.get("email") ?? ""),
      role,
      lotId: String(formData.get("lotId") ?? "") || null,
      inviter: profile,
      actorRole,
    });
    if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INVITATION_SENT",
      entityType: "Invitation",
      entityId: result.invitationId,
      metadata: feeDisclosure
        ? { email: result.email, role: result.role, feeDisclosure }
        : { email: result.email, role: result.role },
    });

    revalidatePath(`/adviser/schemes/${schemeId}/members`);
    const expires = result.expiresAt.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });
    if (!result.emailed) {
      return {
        error: `The invitation for ${result.email} is saved, but the email could not be sent. Send the invitation again to retry.`,
      };
    }
    return { success: `Invitation sent to ${result.email}. The link works once and expires on ${expires}.` };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    console.error("[invitations] send failed:", err instanceof Error ? err.name : "error");
    return { error: "The invitation could not be sent. Please try again." };
  }
}

export async function revokeInvitationAction(
  schemeId: string,
  invitationId: string,
) {
  try {
    // The same people who may invite (the Adviser, or a platform admin).
    const { profile } = await authoriseInviter(schemeId);
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
