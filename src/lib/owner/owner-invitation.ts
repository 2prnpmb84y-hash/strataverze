import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { createInvitation } from "@/lib/queries/invitations";
import { invitationExpiry, newLinkToken } from "@/lib/invitations/link-token";

/**
 * The new owner's invitation when a change of owner applies (H-1 review M2,
 * M3, 31 Oct 2026), planned and then made inside the change's transaction.
 *
 * The invitation is security stage S2a's (src/lib/invitations/issue.ts): a
 * fresh one-time link token of 256 bits, stored only as its SHA-256, valid
 * for INVITATION_TTL_DAYS (14 days), and emailed as a /join#<token> link. A
 * new invitation, a reused one and a reopened one all get a new token, so any
 * earlier link stops working. Only the database writes happen here, under the
 * lot's lock. The invitee's account (Supabase Auth admin calls) and the email
 * come after the commit (deliverInvitationLink, from change-owner-effects.ts),
 * so no HTTP call is made while row locks are held.
 *
 * Invitations are unique per (scheme, email, role), so an earlier OWNER
 * invitation to the address is reused rather than blocking the change. The
 * rules are S2a's resend rules (issueInvitation; Matthew Wrigley's decision
 * of 31 Oct 2026, second review item 8):
 *   - none: NEW;
 *   - PENDING and not expired: ALREADY (left as it is, nothing sent);
 *   - PENDING but expired, or EXPIRED (revoked): REFRESH, sent again as
 *     before (PENDING again, for this lot, a new link and expiry, sent by the
 *     person applying);
 *   - DECLINED: REFRESH too: confirming or recording the change with
 *     "invite" ticked is the Adviser's (or StrataVerze's) explicit resend,
 *     and the security event records the previous status;
 *   - ACCEPTED: REOPEN as above only if the person who accepted it no longer
 *     holds owner access in the building; otherwise SKIP_ACTIVE (never reopen
 *     an accepted invitation whose access is still active), and nothing is sent;
 *   - any other status: NOT_REUSABLE, nothing is sent (S2a refuses to resend it).
 * Each reuse changes the row only while it is still in the status planned, so
 * one accepted or declined in the meantime is never reopened.
 * Every other PENDING OWNER invitation to this lot is withdrawn (EXPIRED, its
 * link cleared, as a revoke does): it belongs to the lot's previous ownership.
 */

type Orm = typeof db.orm;
const ts = (v: string) => v as unknown as TimestampString<3>;

export type OwnerInvitationPlan = {
  kind: "NEW" | "REFRESH" | "REOPEN" | "ALREADY" | "SKIP_ACTIVE" | "NOT_REUSABLE" | "NOT_ASKED" | "NO_EMAIL";
  /** The existing invitation reused or left as it is. */
  invitationId: string | null;
  /** Its status when planned (the reuse only changes it from this status). */
  fromStatus: string | null;
  /** SKIP_ACTIVE: the lot the person already holds owner access through. */
  activeLotNumber: string | null;
  /** PENDING OWNER invitations to this lot that will be withdrawn. */
  withdrawn: Array<{ id: string; email: string }>;
};

export async function planOwnerInvitation(
  orm: Orm,
  p: { schemeId: string; lotId: string; email: string | null; invite: boolean; now?: Date },
): Promise<OwnerInvitationPlan> {
  const now = (p.now ?? new Date()).getTime();
  const email = p.email?.trim().toLowerCase() || null;
  const existing = email
    ? await orm.public.Invitation.where((i) => and(i.schemeId.eq(p.schemeId), i.email.eq(email), i.role.eq("OWNER"))).first()
    : null;
  const forLot = await orm.public.Invitation
    .where((i) => and(i.schemeId.eq(p.schemeId), i.lotId.eq(p.lotId), i.role.eq("OWNER"), i.status.eq("PENDING")))
    .limit(50)
    .all();
  const withdrawn = forLot.filter((i) => i.id !== existing?.id).map((i) => ({ id: i.id, email: String(i.email) }));
  const base = { invitationId: existing?.id ?? null, fromStatus: existing ? String(existing.status) : null, activeLotNumber: null, withdrawn };

  if (!email) return { ...base, kind: "NO_EMAIL" };
  if (!p.invite) return { ...base, kind: "NOT_ASKED" };
  if (!existing) return { ...base, kind: "NEW" };
  if (existing.status === "PENDING" && new Date(String(existing.expiresAt)).getTime() > now) return { ...base, kind: "ALREADY" };
  if (existing.status === "ACCEPTED") {
    const profiles = await orm.public.Profile.where((x) => x.email.eq(email)).limit(5).all();
    const active = profiles.length
      ? await orm.public.SchemeMembership
          .where((m) => and(m.schemeId.eq(p.schemeId), m.role.eq("OWNER"), m.isActive.eq(true), m.profileId.in(profiles.map((x) => x.id))))
          .first()
      : null;
    if (active) {
      const lot = active.lotId ? await orm.public.Lot.where((l) => and(l.id.eq(active.lotId!), l.schemeId.eq(p.schemeId))).first() : null;
      return { ...base, kind: "SKIP_ACTIVE", activeLotNumber: lot ? String(lot.lotNumber) : null };
    }
    return { ...base, kind: "REOPEN" };
  }
  if (existing.status === "PENDING" || existing.status === "EXPIRED" || existing.status === "DECLINED") return { ...base, kind: "REFRESH" };
  return { ...base, kind: "NOT_REUSABLE" };
}

/** The plan's parts that decide what happens, for the confirm fingerprint (review L6). */
export function invitationPlanFacts(plan: OwnerInvitationPlan) {
  return { kind: plan.kind, invitationId: plan.invitationId, fromStatus: plan.fromStatus, withdrawn: plan.withdrawn.map((w) => w.id).sort() };
}

/** Thrown inside the transaction when an invitation changed after it was planned. */
export class InvitationChanged extends Error {}

/** An invitation made or reused by the change, to be emailed after the commit. */
export type OwnerInvitationToSend = {
  id: string;
  /** The link's token: only ever in the email, never stored (the row holds `hash`). */
  token: string;
  hash: string;
  expiresAt: Date;
  /** Whether an earlier invitation was reused, and the status it had (for the security event). */
  resent: boolean;
  previousStatus: string | null;
};

/**
 * Carry out the plan through the transaction's ORM: database writes only.
 * Returns the invitation to email after the commit, if one is to be sent,
 * with its new link token.
 */
export async function applyOwnerInvitation(
  orm: Orm,
  plan: OwnerInvitationPlan,
  p: { schemeId: string; lotId: string; email: string | null; invitedById: string; now?: Date },
): Promise<OwnerInvitationToSend | null> {
  const expiresAt = invitationExpiry(p.now ?? new Date());
  let sent: OwnerInvitationToSend | null = null;
  if (plan.kind === "NEW" && p.email) {
    const { token, hash } = newLinkToken();
    const row = await createInvitation(
      { schemeId: p.schemeId, email: p.email, role: "OWNER", lotId: p.lotId, invitedById: p.invitedById, expiresAt: expiresAt.toISOString(), tokenHash: hash },
      orm,
    );
    sent = { id: row.id, token, hash, expiresAt, resent: false, previousStatus: null };
  } else if ((plan.kind === "REFRESH" || plan.kind === "REOPEN") && plan.invitationId && plan.fromStatus) {
    // A new link replaces the old one, which stops working. The account the
    // invitation was made for (account_auth_id) is left as it is here and
    // settled after the commit, with the Auth calls.
    const { token, hash } = newLinkToken();
    const n = await orm.public.Invitation
      .where((i) => and(i.id.eq(plan.invitationId!), i.schemeId.eq(p.schemeId), i.role.eq("OWNER"), i.status.eq(plan.fromStatus!)))
      .updateAndCount({
        status: "PENDING",
        lotId: p.lotId,
        expiresAt: ts(expiresAt.toISOString()),
        invitedById: p.invitedById,
        acceptedAt: null,
        tokenHash: hash,
        tokenUsedAt: null,
      });
    if (n !== 1) throw new InvitationChanged("the invitation changed while the change of owner was applied");
    sent = { id: plan.invitationId, token, hash, expiresAt, resent: true, previousStatus: plan.fromStatus };
  }
  for (const w of plan.withdrawn) {
    // As a revoke does (revokeInvitation): its link stops working too.
    await orm.public.Invitation
      .where((i) => and(i.id.eq(w.id), i.schemeId.eq(p.schemeId), i.lotId.eq(p.lotId), i.status.eq("PENDING")))
      .update({ status: "EXPIRED", tokenHash: null });
  }
  return sent;
}
