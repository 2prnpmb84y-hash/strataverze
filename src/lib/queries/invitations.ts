import { db } from "@/prisma/db";
import { captureUsageFee, quoteUsageFee } from "@/lib/billing/capture";
import type { Disclosure } from "@/lib/billing/fee-ledger";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Get pending invitations for a scheme.
 */
export async function getInvitationsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.Invitation
    .where((i) => i.schemeId.eq(schemeId))
    .orderBy((i) => i.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Get pending invitations for an email address.
 * Used when a user logs in to check if they have pending invitations.
 */
export async function getPendingInvitationsForEmail(email: string) {
  // Exact match on the lowercased address. Invitations are stored lowercased
  // (createInvitation), and ilike would treat % and _ in an address as
  // wildcards and match other people's invitations (SEC finding F14).
  const normalised = email.trim().toLowerCase();
  if (!normalised) return [];
  return db.orm.public.Invitation
    .where((i) =>
      and(
        i.email.eq(normalised),
        i.status.eq("PENDING"),
        i.expiresAt.gt(toTimestamp(new Date().toISOString())),
      ),
    )
    .all();
}

/**
 * The invitation a link is for, by the SHA-256 of the link's token (S2a).
 * The token itself is never stored.
 */
export async function getInvitationByTokenHash(tokenHash: string) {
  return db.orm.public.Invitation.where((i) => i.tokenHash.eq(tokenHash)).first();
}

/**
 * Claim an invitation link: it works once (S2a). Matches only a pending
 * invitation with this hash whose link is unused, so of two attempts at
 * once only one succeeds. Returns whether this call claimed it.
 */
export async function claimInvitationLink(invitationId: string, tokenHash: string): Promise<boolean> {
  const n = await db.orm.public.Invitation
    .where((i) =>
      and(i.id.eq(invitationId), i.tokenHash.eq(tokenHash), i.status.eq("PENDING"), i.tokenUsedAt.isNull()),
    )
    .updateAndCount({ tokenUsedAt: toTimestamp(new Date().toISOString()) });
  return n === 1;
}

/**
 * Give a claimed link back, when nothing could be done with it (the account
 * could not be set up), so the invitee can try again. Only while the
 * invitation is still pending and still has this link.
 */
export async function releaseInvitationLink(invitationId: string, tokenHash: string): Promise<void> {
  await db.orm.public.Invitation
    .where((i) => and(i.id.eq(invitationId), i.tokenHash.eq(tokenHash), i.status.eq("PENDING")))
    .updateAndCount({ tokenUsedAt: null });
}

/**
 * Create a new invitation.
 */
export async function createInvitation(data: {
  schemeId: string;
  email: string;
  role: "OWNER" | "COMMITTEE" | "ACCOUNTANT";
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

/** The invitation was accepted, declined or revoked by another request first. */
export class InvitationNoLongerPending extends Error {
  constructor() {
    super("This invitation is no longer pending.");
    this.name = "InvitationNoLongerPending";
  }
}

/**
 * Accept an invitation: mark it accepted and create a SchemeMembership.
 * Wrapped in a transaction so the invitation status and membership
 * creation are atomic.
 */
export async function acceptInvitation(
  invitationId: string,
  profileId: string,
  userEmail: string,
) {
  // Get the invitation details first (outside transaction is fine)
  const invitation = await db.orm.public.Invitation.first({ id: invitationId });
  if (!invitation) return { error: "Invitation not found." };

  // Verify the current user's email matches the invitation recipient
  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
    return { error: "This invitation was sent to a different email address." };
  }

  // Check invitation is still pending and not expired
  if (invitation.status !== "PENDING") {
    return { error: "This invitation is no longer pending." };
  }
  if (invitation.expiresAt && new Date(String(invitation.expiresAt)) < new Date()) {
    return { error: "This invitation has expired." };
  }

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

  if (existing?.isActive) {
    return { error: "You already have this role on this scheme." };
  }

  // The accountant seat fee the adviser confirmed when inviting. A seat is
  // only charged if that confirmation exists and matches today's price.
  const seatDisclosure =
    invitation.role === "ACCOUNTANT" ? await confirmedSeatDisclosure(invitationId) : null;

  // Wrap the status update and membership creation in a transaction
  try {
    await db.transaction(async (tx) => {
      // Only a pending invitation is accepted, once: of two acceptances at
      // the same moment, the second changes nothing and is rolled back.
      const accepted = await tx.orm.public.Invitation
        .where((i) => and(i.id.eq(invitationId), i.status.eq("PENDING")))
        .updateAndCount({
          status: "ACCEPTED",
          acceptedAt: toTimestamp(new Date().toISOString()),
        });
      if (accepted !== 1) throw new InvitationNoLongerPending();

      // Someone invited back (an owner who sold and bought again, say) has
      // their ended membership started again, as one membership per role is
      // allowed. It starts afresh: no treasurer flag carries over, which only
      // the committee can set (S1).
      const now = toTimestamp(new Date().toISOString());
      const restarted = existing
        ? await tx.orm.public.SchemeMembership
            .where((m) => and(m.id.eq(existing.id), m.isActive.eq(false)))
            .update({ isActive: true, lotId: invitation.lotId ?? null, isTreasurer: false, startDate: now, endDate: null })
        : null;
      if (existing && !restarted) throw new Error("The membership changed while the invitation was being accepted.");
      const membership =
        restarted ??
        (await tx.orm.public.SchemeMembership.create({
          schemeId: invitation.schemeId,
          profileId,
          role: invitation.role,
          lotId: invitation.lotId ?? null,
          isActive: true,
        }));

      // An external accountant or auditor seat is a StrataVerze charge per seat
      // per month; the first month is recorded when the seat becomes active.
      if (seatDisclosure) {
        await captureUsageFee(tx.orm, {
          schemeId: invitation.schemeId,
          code: "ACCOUNTANT_SEAT",
          sourceType: "AccountantSeatMonth",
          sourceId: `${membership.id}_${new Date().toISOString().slice(0, 7)}`,
          actorId: invitation.invitedById ?? null,
          disclosure: seatDisclosure,
        });
      }
    });
  } catch (err) {
    if (err instanceof InvitationNoLongerPending) return { error: err.message };
    throw err;
  }

  return { success: true };
}

/**
 * Decline an invitation.
 */
export async function declineInvitation(invitationId: string) {
  // Only a pending invitation can be declined; an accepted one stays accepted.
  await db.orm.public.Invitation
    .where((i) => and(i.id.eq(invitationId), i.status.eq("PENDING")))
    .update({ status: "DECLINED" });
}

/**
 * Revoke (cancel) a pending invitation. Scheme-scoped: an invitation on
 * another scheme matches nothing.
 */
export async function revokeInvitation(schemeId: string, invitationId: string) {
  await db.orm.public.Invitation
    .where((i) =>
      and(i.id.eq(invitationId), i.schemeId.eq(schemeId), i.status.eq("PENDING")),
    )
    .update({ status: "EXPIRED", tokenHash: null });
}

/**
 * The accountant seat fee disclosure recorded when the invitation was sent,
 * if it still matches the current price. Null means the seat is not charged.
 */
async function confirmedSeatDisclosure(invitationId: string): Promise<Disclosure | null> {
  const quote = await quoteUsageFee({ code: "ACCOUNTANT_SEAT" });
  if (!quote) return null;
  const sent = await db.orm.public.ActivityLog
    .where((a) => and(a.entityType.eq("Invitation"), a.entityId.eq(invitationId), a.action.eq("INVITATION_SENT")))
    .orderBy((a) => a.createdAt.desc())
    .first();
  const meta = (sent?.metadata ?? null) as { feeDisclosure?: Partial<Disclosure> & { code?: string } } | null;
  const d = meta?.feeDisclosure;
  if (!d || d.code !== "ACCOUNTANT_SEAT" || !d.shownToId || !d.shownAt) return null;
  if (d.amountCents !== quote.totalCents) return null;
  return { shownToId: d.shownToId, shownAt: d.shownAt, amountCents: d.amountCents };
}
