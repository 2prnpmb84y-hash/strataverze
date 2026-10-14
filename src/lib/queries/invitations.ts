import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Get pending invitations for a scheme.
 */
export async function getInvitationsForScheme(schemeId: string) {
  return db.orm.public.Invitation
    .where((i) => i.schemeId.eq(schemeId))
    .orderBy((i) => i.createdAt.desc())
    .all();
}

/**
 * Get pending invitations for an email address.
 * Used when a user logs in to check if they have pending invitations.
 */
export async function getPendingInvitationsForEmail(email: string) {
  return db.orm.public.Invitation
    .where((i) =>
      and(
        i.email.ilike(email),
        i.status.eq("PENDING"),
        i.expiresAt.gt(toTimestamp(new Date().toISOString())),
      ),
    )
    .all();
}

/**
 * Get an invitation by its token.
 */
export async function getInvitationByToken(token: string) {
  return db.orm.public.Invitation.first({ token });
}

/**
 * Create a new invitation.
 */
export async function createInvitation(data: {
  schemeId: string;
  email: string;
  role: "OWNER" | "COMMITTEE";
  lotId?: string;
  invitedById: string;
  expiresAt: string;
}) {
  // Generate a UUID token for the invitation link
  return db.orm.public.Invitation.create({
    schemeId: data.schemeId,
    email: data.email.toLowerCase(),
    role: data.role,
    lotId: data.lotId ?? null,
    invitedById: data.invitedById,
    expiresAt: toTimestamp(data.expiresAt),
  });
}

/**
 * Get a single invitation by ID.
 */
export async function getInvitationById(invitationId: string) {
  return db.orm.public.Invitation.first({ id: invitationId });
}

/**
 * Accept an invitation: mark it accepted and create a SchemeMembership.
 */
export async function acceptInvitation(
  invitationId: string,
  profileId: string,
) {
  // Mark invitation as accepted
  await db.orm.public.Invitation
    .where({ id: invitationId })
    .update({
      status: "ACCEPTED",
      acceptedAt: toTimestamp(new Date().toISOString()),
    });

  // Get the invitation details to create membership
  const invitation = await db.orm.public.Invitation.first({ id: invitationId });
  if (!invitation) return { error: "Invitation not found." };

  // Check if membership already exists
  const existing = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.schemeId.eq(invitation.schemeId),
        m.profileId.eq(profileId),
        m.role.eq(invitation.role),
      ),
    )
    .first();

  if (existing) {
    return { error: "You already have this role on this scheme." };
  }

  // Create the membership
  await db.orm.public.SchemeMembership.create({
    schemeId: invitation.schemeId,
    profileId,
    role: invitation.role,
    lotId: invitation.lotId ?? null,
    isActive: true,
  });

  return { success: true };
}

/**
 * Decline an invitation.
 */
export async function declineInvitation(invitationId: string) {
  await db.orm.public.Invitation
    .where({ id: invitationId })
    .update({ status: "DECLINED" });
}

/**
 * Revoke (cancel) a pending invitation.
 */
export async function revokeInvitation(invitationId: string) {
  await db.orm.public.Invitation
    .where((i) =>
      and(i.id.eq(invitationId), i.status.eq("PENDING")),
    )
    .update({ status: "EXPIRED" });
}
