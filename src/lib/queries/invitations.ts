import { db } from "@/prisma/db";
import { captureUsageFee, quoteUsageFee } from "@/lib/billing/capture";
import type { Disclosure } from "@/lib/billing/fee-ledger";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { restartOwnerAccess } from "@/lib/queries/owner-access";

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

/** A transaction, as db.transaction passes it. */
export type InvitationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type InvitationRow = NonNullable<Awaited<ReturnType<typeof getInvitationByTokenHash>>>;

/**
 * Claim a link to set up a new account, one set-up at a time per account
 * (review finding L2), then run `work` in the same transaction.
 *
 * Several pending invitations (one per building, say) can be for the same
 * Auth user the server made. Claiming per link would let two of their links,
 * used at once, both pass the "never set up" check and both set a password.
 * So, in one transaction:
 *   1. every pending invitation for the account is locked (FOR NO KEY
 *      UPDATE, in id order, so two set-ups cannot deadlock). A second
 *      set-up of the same account, through this link or any other, waits
 *      here (at most 5 seconds) until the first commits, then sees what it
 *      did;
 *   2. this link must be among them: pending, this hash, unused, unexpired;
 *   3. the link is claimed (token_used_at), and `work` runs while the locks
 *      are held. It sets the password and accepts the invitation.
 *
 * A revoke, resend or decline of a locked invitation waits for the commit
 * (each with its own 5-second lock timeout, after which it fails and the
 * person is asked to try again). By then the invitation is accepted, and
 * each of them changes only an invitation still in the status it expects
 * (revoke and decline: PENDING; resend: the status it read before it
 * waited, never ACCEPTED with active access), so none of them reopens or
 * ends an invitation the set-up has just accepted, and a revoke cannot land
 * between the password being set and the invitation being accepted. If `work` throws, the claim is rolled back and
 * the link can be used again.
 *
 * Returns null, having changed nothing, when the link cannot be claimed.
 * `work` must use tx for every write: a write through the global db would
 * wait for the locks this transaction holds.
 */
export async function claimLinkForAccountSetUp<T>(
  link: { invitationId: string; tokenHash: string; accountAuthId: string },
  work: (tx: InvitationTx, invitation: InvitationRow) => Promise<T>,
): Promise<{ result: T } | null> {
  return db.transaction(async (tx) => {
    // Bounded on every side (review finding M-2): a lock wait gives up after
    // 5 seconds, one statement after 10, and the transaction is ended by
    // Postgres if it sits idle for 20 seconds (the Auth calls in `work`, each
    // limited to 8 seconds, are where it is idle), so nothing can hold the
    // locks or a pooled connection indefinitely.
    await tx.execute(tx.raw.sql`SET LOCAL lock_timeout = '5s'`.affectedCount().build());
    await tx.execute(tx.raw.sql`SET LOCAL statement_timeout = '10s'`.affectedCount().build());
    await tx.execute(tx.raw.sql`SET LOCAL idle_in_transaction_session_timeout = '20s'`.affectedCount().build());
    const pending = await tx.orm.public.Invitation
      .where((i) => and(i.accountAuthId.eq(link.accountAuthId), i.status.eq("PENDING")))
      .orderBy((i) => i.id.asc())
      .forNoKeyUpdate()
      .all();
    const current = pending.find(
      (i) =>
        i.id === link.invitationId &&
        i.tokenHash === link.tokenHash &&
        !i.tokenUsedAt &&
        new Date(String(i.expiresAt)).getTime() > Date.now(),
    );
    if (!current) return null;
    const claimed = await tx.orm.public.Invitation
      .where((i) =>
        and(i.id.eq(current.id), i.tokenHash.eq(link.tokenHash), i.status.eq("PENDING"), i.tokenUsedAt.isNull()),
      )
      .updateAndCount({ tokenUsedAt: toTimestamp(new Date().toISOString()) });
    if (claimed !== 1) return null;
    return { result: await work(tx, current) };
  });
}

/**
 * Create a new invitation with a one-time link (S2a). `tokenHash` is the
 * SHA-256 of the link's token (newLinkToken in
 * src/lib/invitations/link-token.ts); the token itself is never stored, and
 * the email must carry it as a /join#<token> link. There is no way to create
 * an invitation without one. Invitations from the Members page are made by
 * issueInvitation (src/lib/invitations/issue.ts); this is for a change of
 * owner, whose invitation commits with the change (H-1 review L2).
 */
export async function createInvitation(
  data: {
    schemeId: string;
    email: string;
    role: "OWNER" | "COMMITTEE" | "ACCOUNTANT";
    lotId?: string;
    invitedById: string;
    expiresAt: string;
    tokenHash: string;
    /** The Auth user made for the invitee, when known; a change of owner sets it after the commit. */
    accountAuthId?: string | null;
  },
  /** A transaction's ORM, when the invitation must commit with other changes (change of owner, H-1 review L2). */
  orm: typeof db.orm = db.orm,
) {
  if (!/^[0-9a-f]{64}$/.test(data.tokenHash)) throw new Error("An invitation needs the SHA-256 of its link token.");
  return orm.public.Invitation.create({
    schemeId: data.schemeId,
    email: data.email.toLowerCase(),
    role: data.role,
    status: "PENDING",
    lotId: data.lotId ?? null,
    invitedById: data.invitedById,
    expiresAt: toTimestamp(data.expiresAt),
    tokenHash: data.tokenHash,
    tokenUsedAt: null,
    accountAuthId: data.accountAuthId ?? null,
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
 * creation are atomic. Given `tx`, it runs inside that transaction instead
 * (the /join set-up, which holds the invitation's lock), and every read and
 * write goes through it.
 */
export async function acceptInvitation(
  invitationId: string,
  profileId: string,
  userEmail: string,
  tx?: InvitationTx,
): Promise<{ error: string; success?: undefined } | { success: true; error?: undefined }> {
  const orm = tx?.orm ?? db.orm;
  const invitation = await orm.public.Invitation.first({ id: invitationId });
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
  const existing = await orm.public.SchemeMembership
    .where((m) =>
      and(
        m.schemeId.eq(invitation.schemeId),
        m.profileId.eq(profileId),
        m.role.eq(invitation.role),
      ),
    )
    .first();

  // Someone invited back after their access ended is accepted below: their
  // ended membership is started again (S2a). Only active access is refused.
  if (existing?.isActive) {
    return { error: "You already have this role on this scheme." };
  }

  // The accountant seat fee the adviser confirmed when inviting. A seat is
  // only charged if that confirmation exists and matches today's price.
  const seatDisclosure =
    invitation.role === "ACCOUNTANT" ? await confirmedSeatDisclosure(invitationId, orm) : null;

  const apply = async (t: { orm: typeof db.orm }) => {
    // Only a pending invitation is accepted, once: of two acceptances at
    // the same moment, the second changes nothing and is rolled back.
    const accepted = await t.orm.public.Invitation
      .where((i) => and(i.id.eq(invitationId), i.status.eq("PENDING")))
      .updateAndCount({
        status: "ACCEPTED",
        acceptedAt: toTimestamp(new Date().toISOString()),
      });
    if (accepted !== 1) throw new InvitationNoLongerPending();

    // Someone invited back (an owner who sold and bought again, say) has
    // their ended membership started again, as one membership per role is
    // allowed. It starts afresh: no treasurer flag carries over, which only
    // the committee can set (S1). An OWNER membership is restarted through
    // restartOwnerAccess (H-1 review M2, L3), which first keeps the lot and
    // dates it held in owner_lot_history (migration 20261201), so the history
    // the 30-day own-lot check reads is not rewritten. Other roles restart
    // here, as S2a does.
    const now = toTimestamp(new Date().toISOString());
    let restarted: { id: string } | null = null;
    if (existing && invitation.role === "OWNER") {
      // Read again, locked, inside this transaction (review L2): the history row records the lot
      // and dates the membership holds now, not those read before the transaction began.
      const current = await t.orm.public.SchemeMembership
        .where((m) => and(m.id.eq(existing.id), m.schemeId.eq(invitation.schemeId), m.role.eq("OWNER")))
        .forUpdate()
        .first();
      if (!current || current.isActive) throw new Error("The membership changed while the invitation was being accepted.");
      await restartOwnerAccess(t.orm, current, invitation.lotId ?? null);
      restarted = current;
    } else if (existing) {
      restarted = await t.orm.public.SchemeMembership
        .where((m) => and(m.id.eq(existing.id), m.isActive.eq(false)))
        .update({ isActive: true, lotId: invitation.lotId ?? null, isTreasurer: false, startDate: now, endDate: null });
    }
    if (existing && !restarted) throw new Error("The membership changed while the invitation was being accepted.");
    const membership =
      restarted ??
      (await t.orm.public.SchemeMembership.create({
        schemeId: invitation.schemeId,
        profileId,
        role: invitation.role,
        lotId: invitation.lotId ?? null,
        isActive: true,
      }));

    // An external accountant or auditor seat is a StrataVerze charge per seat
    // per month; the first month is recorded when the seat becomes active.
    if (seatDisclosure) {
      await captureUsageFee(t.orm, {
        schemeId: invitation.schemeId,
        code: "ACCOUNTANT_SEAT",
        sourceType: "AccountantSeatMonth",
        sourceId: `${membership.id}_${new Date().toISOString().slice(0, 7)}`,
        actorId: invitation.invitedById ?? null,
        disclosure: seatDisclosure,
      });
    }
  };

  try {
    // Inside the caller's transaction, the status update matches nothing
    // rather than failing, so nothing has been written when it throws.
    if (tx) await apply(tx);
    else await db.transaction(async (t) => apply(t));
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
  await withLockTimeout((orm) =>
    orm.public.Invitation
      .where((i) => and(i.id.eq(invitationId), i.status.eq("PENDING")))
      .update({ status: "DECLINED" }),
  );
}

/**
 * A single write to invitations that waits at most 5 seconds for a row
 * lock (the /join set-up holds the invitation's lock while it calls Auth),
 * so it cannot pin a connection indefinitely (review finding M-2). On a
 * timeout it throws (SQLSTATE 55P03) and the caller reports a failure.
 */
export async function withLockTimeout<T>(write: (orm: typeof db.orm) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(tx.raw.sql`SET LOCAL lock_timeout = '5s'`.affectedCount().build());
    return write(tx.orm);
  });
}

/**
 * Revoke (cancel) a pending invitation. Scheme-scoped: an invitation on
 * another scheme matches nothing.
 */
export async function revokeInvitation(schemeId: string, invitationId: string) {
  await withLockTimeout((orm) =>
    orm.public.Invitation
      .where((i) =>
        and(i.id.eq(invitationId), i.schemeId.eq(schemeId), i.status.eq("PENDING")),
      )
      .update({ status: "EXPIRED", tokenHash: null }),
  );
}

/**
 * The accountant seat fee disclosure recorded when the invitation was sent,
 * if it still matches the current price. Null means the seat is not charged.
 */
async function confirmedSeatDisclosure(invitationId: string, orm: typeof db.orm = db.orm): Promise<Disclosure | null> {
  const quote = await quoteUsageFee({ code: "ACCOUNTANT_SEAT" }, orm);
  if (!quote) return null;
  const sent = await orm.public.ActivityLog
    .where((a) => and(a.entityType.eq("Invitation"), a.entityId.eq(invitationId), a.action.eq("INVITATION_SENT")))
    .orderBy((a) => a.createdAt.desc())
    .first();
  const meta = (sent?.metadata ?? null) as { feeDisclosure?: Partial<Disclosure> & { code?: string } } | null;
  const d = meta?.feeDisclosure;
  if (!d || d.code !== "ACCOUNTANT_SEAT" || !d.shownToId || !d.shownAt) return null;
  if (d.amountCents !== quote.totalCents) return null;
  return { shownToId: d.shownToId, shownAt: d.shownAt, amountCents: d.amountCents };
}
