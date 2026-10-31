import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { createInvitation } from "@/lib/queries/invitations";

/**
 * The new owner's invitation when a change of owner applies (H-1 review M2,
 * M3, 31 Oct 2026), planned and then made inside the change's transaction.
 *
 * Kept apart from src/lib/queries/invitations.ts on purpose: remediation/s2a
 * rewrites that file (link tokens stored as hashes, a guarded resend). When
 * it merges, REFRESH and REOPEN below should issue a new link token the way
 * s2a's resend does; the status rules here already follow it.
 *
 * Invitations are unique per (scheme, email, role), so an earlier OWNER
 * invitation to the address is reused rather than blocking the change:
 *   - none: NEW;
 *   - PENDING and not expired: ALREADY (left as it is);
 *   - PENDING but expired, DECLINED or EXPIRED: REFRESH (PENDING again, for
 *     this lot, a fresh 30-day expiry, sent by the person applying);
 *   - ACCEPTED: REOPEN as above only if the person who accepted it no longer
 *     holds owner access in the building; otherwise SKIP_ACTIVE (never reopen
 *     an accepted invitation whose access is still active), and nothing is sent.
 * Every other PENDING OWNER invitation to this lot is withdrawn (EXPIRED): it
 * belongs to the lot's previous ownership.
 */

type Orm = typeof db.orm;
const ts = (v: string) => v as unknown as TimestampString<3>;

export type OwnerInvitationPlan = {
  kind: "NEW" | "REFRESH" | "REOPEN" | "ALREADY" | "SKIP_ACTIVE" | "NOT_ASKED" | "NO_EMAIL";
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
  return { ...base, kind: "REFRESH" };
}

/** The plan's parts that decide what happens, for the confirm fingerprint (review L6). */
export function invitationPlanFacts(plan: OwnerInvitationPlan) {
  return { kind: plan.kind, invitationId: plan.invitationId, fromStatus: plan.fromStatus, withdrawn: plan.withdrawn.map((w) => w.id).sort() };
}

/** Thrown inside the transaction when an invitation changed after it was planned. */
export class InvitationChanged extends Error {}

/**
 * Carry out the plan through the transaction's ORM. Returns the invitation to
 * email after the commit, if one is to be sent.
 */
export async function applyOwnerInvitation(
  orm: Orm,
  plan: OwnerInvitationPlan,
  p: { schemeId: string; lotId: string; email: string | null; invitedById: string; now?: Date },
): Promise<{ id: string; expiresAt: Date } | null> {
  const now = p.now ?? new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);
  let sent: { id: string; expiresAt: Date } | null = null;
  if (plan.kind === "NEW" && p.email) {
    const row = await createInvitation({ schemeId: p.schemeId, email: p.email, role: "OWNER", lotId: p.lotId, invitedById: p.invitedById, expiresAt: expiresAt.toISOString() }, orm);
    sent = { id: row.id, expiresAt };
  } else if ((plan.kind === "REFRESH" || plan.kind === "REOPEN") && plan.invitationId && plan.fromStatus) {
    const n = await orm.public.Invitation
      .where((i) => and(i.id.eq(plan.invitationId!), i.schemeId.eq(p.schemeId), i.role.eq("OWNER"), i.status.eq(plan.fromStatus!)))
      .updateAndCount({ status: "PENDING", lotId: p.lotId, expiresAt: ts(expiresAt.toISOString()), invitedById: p.invitedById, acceptedAt: null });
    if (n !== 1) throw new InvitationChanged("the invitation changed while the change of owner was applied");
    sent = { id: plan.invitationId, expiresAt };
  }
  for (const w of plan.withdrawn) {
    await orm.public.Invitation
      .where((i) => and(i.id.eq(w.id), i.schemeId.eq(p.schemeId), i.lotId.eq(p.lotId), i.status.eq("PENDING")))
      .update({ status: "EXPIRED" });
  }
  return sent;
}
