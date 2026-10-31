import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { sendEmail } from "@/lib/email";
import { invitationLinkEmail } from "@/lib/email-templates/invitation";
import { siteUrl } from "@/lib/site-url";
import { hitRateLimits } from "@/lib/auth/rate-limit-db";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { getLotInScheme } from "@/lib/queries/lots";
import { getSchemeNameById } from "@/lib/queries/schemes";
import { withLockTimeout } from "@/lib/queries/invitations";
import { invitationExpiry, newLinkToken } from "./link-token";
import { isInvitableEmail } from "./invitable-email";
import { InviteeAccountError, provisionInviteeAccount, type InviteeAccount } from "./accounts";

/**
 * Issuing an invitation (security stage S2a). The caller has already
 * authorised the inviter for this building (authoriseInviter) and checked
 * their recent authenticator code. This does the rest, on the server:
 *
 *   1. checks the address, the role and, for an owner, that the lot is one
 *      of this building's;
 *   2. limits how many invitations one person sends, and how many one
 *      address gets for one building;
 *   3. makes sure the invitee has an account: if the address has none, one
 *      is created with the Supabase admin API, unconfirmed and with no
 *      password (src/lib/invitations/accounts.ts);
 *   4. stores the invitation with a new one-time link token, as its SHA-256
 *      only, valid for 14 days. Sending again to the same address and role
 *      replaces the token, so only the newest link works;
 *   5. emails the link through Resend (src/lib/email.ts).
 *
 * The result is the same whether or not the address already had an account,
 * so the inviter cannot use invitations to find out who uses StrataVerze.
 */

export { isInvitableEmail };

export const INVITABLE_ROLES = ["OWNER", "COMMITTEE", "ACCOUNTANT"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type IssueInvitationInput = {
  schemeId: string;
  email: string;
  role: string;
  lotId?: string | null;
  inviter: { id: string; firstName?: string | null; lastName?: string | null };
  /** For the security log: "ADVISER" or "platform_admin". */
  actorRole: string;
};

export type IssueInvitationResult =
  | { ok: true; invitationId: string; email: string; role: InvitableRole; expiresAt: Date; emailed: boolean }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

function ts(d: Date): TimestampString<3> {
  return d.toISOString() as unknown as TimestampString<3>;
}

const isUniqueViolation = (err: unknown) =>
  !!err && typeof err === "object" && (err as { code?: unknown }).code === "23505";

export async function issueInvitation(input: IssueInvitationInput): Promise<IssueInvitationResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const role = String(input.role ?? "");
  const lotIdRaw = String(input.lotId ?? "").trim();

  const fieldErrors: Record<string, string> = {};
  if (!isInvitableEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!(INVITABLE_ROLES as readonly string[]).includes(role)) fieldErrors.role = "Select a valid role.";
  if (role === "OWNER" && !lotIdRaw) fieldErrors.lotId = "Choose the owner's lot.";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // The lot must be this building's (SEC-004). Accountants are not tied to a lot.
  let lotId: string | null = null;
  let lotNumber: string | null = null;
  if (lotIdRaw && role !== "ACCOUNTANT") {
    const lot = await getLotInScheme(input.schemeId, lotIdRaw);
    if (!lot) return { ok: false, fieldErrors: { lotId: "Choose a lot of this building." } };
    lotId = lot.id;
    lotNumber = lot.lotNumber;
  }

  const allowed = await hitRateLimits([
    ["invitationSend", input.inviter.id],
    ["invitationRecipient", `${input.schemeId}|${email}`],
  ]);
  if (!allowed) {
    await recordSecurityEventLater({
      action: "invitation.send",
      outcome: "denied",
      actorProfileId: input.inviter.id,
      actorRole: input.actorRole,
      schemeId: input.schemeId,
      reason: "too many invitations",
    });
    return { ok: false, error: "Too many invitations have been sent. Please wait a while and try again." };
  }

  // One invitation per building, address and role (invitations_scheme_id_email_role_key).
  const existing = await db.orm.public.Invitation
    .where((i) => and(i.schemeId.eq(input.schemeId), i.email.eq(email), i.role.eq(role as InvitableRole)))
    .first();
  if (existing?.status === "ACCEPTED" && (await holdsActiveRole(input.schemeId, email, role))) {
    // The inviter can already see the building's members, so this says nothing new.
    return { ok: false, error: "This person already has this role on this building." };
  }

  const account = await prepareInviteeAccount(email, input.schemeId, input.inviter.id, input.actorRole);
  if (!account) return { ok: false, error: "The invitation could not be sent. Please try again." };

  const { token, hash } = newLinkToken();
  const expiresAt = invitationExpiry();
  const fields = {
    status: "PENDING",
    tokenHash: hash,
    tokenUsedAt: null,
    accountAuthId: account.kind === "new" ? account.authId : null,
    expiresAt: ts(expiresAt),
    invitedById: input.inviter.id,
    lotId,
    acceptedAt: null,
  };

  let invitationId: string;
  try {
    if (existing) {
      // Sent again: a new link replaces the old one, which stops working.
      // Decided by Matthew Wrigley, 31 Oct 2026 (second review, item 8):
      //   - PENDING or EXPIRED (revoked): sent again as before;
      //   - DECLINED: the Adviser may send it again; this explicit resend
      //     reopens it with a new link, and it is logged (invitation.sent,
      //     resent, previousStatus DECLINED);
      //   - ACCEPTED: reopened only when the access it gave has ended
      //     (someone invited back, checked above).
      // The update matches only while the invitation is still in the status
      // read above, so one accepted or declined in the meantime (by the
      // /join set-up, whose lock this waits for, at most 5 seconds) matches
      // nothing and is never reopened.
      const reopenable = ["PENDING", "EXPIRED", "DECLINED", "ACCEPTED"];
      if (!reopenable.includes(String(existing.status))) {
        return { ok: false, error: "The invitation could not be sent. Please try again." };
      }
      let n: number;
      try {
        n = await withLockTimeout((orm) =>
          orm.public.Invitation
            .where((i) => and(i.id.eq(existing.id), i.schemeId.eq(input.schemeId), i.status.eq(existing.status)))
            .updateAndCount(fields),
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw err;
        console.error("[invitations] resend did not complete:", err instanceof Error ? err.name : "error");
        n = 0;
      }
      if (n !== 1) {
        return { ok: false, error: "This invitation changed while it was being sent again. Please check the list and try again." };
      }
      invitationId = existing.id;
    } else {
      const created = await db.orm.public.Invitation.create({
        schemeId: input.schemeId,
        email,
        role: role as InvitableRole,
        ...fields,
      });
      invitationId = created.id;
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "An invitation to this address was being sent at the same time. Please check the list and try again." };
    }
    throw err;
  }

  await recordSecurityEventLater({
    action: "invitation.sent",
    outcome: "allowed",
    actorProfileId: input.inviter.id,
    actorRole: input.actorRole,
    schemeId: input.schemeId,
    resourceType: "Invitation",
    resourceId: invitationId,
    metadata: { role, resent: !!existing, previousStatus: existing ? String(existing.status) : null },
  });

  const emailed = await emailInvitationLink({ schemeId: input.schemeId, email, role, lotNumber, expiresAt, token, inviter: input.inviter });

  return { ok: true, invitationId, email, role: role as InvitableRole, expiresAt, emailed };
}

/**
 * The invitee's account (S2a), made with the Supabase admin API if the
 * address has none. Records the neutral events: a failure in the building's
 * log with no detail of the address, and a new or adopted account in an event
 * with no building. Null when the account could not be prepared. Makes Auth
 * HTTP calls: never call it while holding row locks.
 */
async function prepareInviteeAccount(
  email: string,
  schemeId: string,
  inviterId: string,
  actorRole: string,
): Promise<InviteeAccount | null> {
  let account: InviteeAccount;
  try {
    account = await provisionInviteeAccount(email);
  } catch (err) {
    const code = err instanceof InviteeAccountError ? err.code : "error";
    console.error("[invitations] account could not be prepared:", code);
    await recordSecurityEventLater({
      action: "invitation.send",
      outcome: "failed",
      actorProfileId: inviterId,
      actorRole,
      schemeId,
      reason: "account could not be prepared",
      metadata: { code },
    });
    return null;
  }
  if (account.kind === "new") {
    // Kept apart from the building's events, which the building's Adviser can
    // read: whether an address already had an account is not theirs to know.
    await recordSecurityEventLater({
      action: account.adopted ? "account.adopted_for_invitation" : "account.created_for_invitation",
      outcome: "allowed",
      actorProfileId: inviterId,
      actorRole,
      resourceType: "auth_user",
      resourceId: account.authId,
    });
  }
  return account;
}

/** Email the one-time /join link. The token goes only in the link's fragment. */
async function emailInvitationLink(p: {
  schemeId: string;
  email: string;
  role: string;
  lotNumber: string | null;
  expiresAt: Date;
  token: string;
  inviter: { firstName?: string | null; lastName?: string | null };
}): Promise<boolean> {
  const inviterName = [p.inviter.firstName, p.inviter.lastName].filter(Boolean).join(" ") || "Your strata manager";
  return sendEmail(
    invitationLinkEmail({
      recipientEmail: p.email,
      schemeName: await getSchemeNameById(p.schemeId),
      role: p.role,
      inviterName,
      expiresAt: p.expiresAt,
      lotNumber: p.lotNumber,
      acceptUrl: `${siteUrl()}/join#${p.token}`,
    }),
  );
}

export type DeliverInvitationLinkInput = {
  invitationId: string;
  schemeId: string;
  email: string;
  role: InvitableRole;
  lotNumber: string | null;
  /** The link token made with the invitation (newLinkToken); the row holds only `hash`. */
  token: string;
  hash: string;
  expiresAt: Date;
  inviter: { id: string; firstName?: string | null; lastName?: string | null };
  actorRole: string;
  resent: boolean;
  previousStatus: string | null;
  /** What made the invitation, for the security event (e.g. "owner_change"). */
  via: string;
};

export type DeliverInvitationLinkResult =
  | { emailed: true }
  | { emailed: false; reason: "address" | "rate_limited" | "account" | "changed" | "email" };

/**
 * Finish an invitation that was written inside another transaction (a change
 * of owner, src/lib/owner/change-owner-effects.ts) with its link token already
 * stored as a hash: the steps of issueInvitation that make Auth or email
 * calls, run after that transaction has committed, so no HTTP call is made
 * while its row locks are held.
 *
 *   1. the same sending limits as issueInvitation (per inviter, and per
 *      building and address);
 *   2. the invitee's account, made on the server if the address has none
 *      (provisionInviteeAccount), with the same neutral events;
 *   3. the account recorded on the invitation, only while it still holds
 *      this link (same hash, PENDING, unused): if it was sent again,
 *      revoked or withdrawn in the meantime, nothing is emailed, as this
 *      link no longer works;
 *   4. invitation.sent, as issueInvitation records it;
 *   5. the /join#<token> link emailed.
 *
 * Never throws for an expected failure: the invitation stays PENDING and the
 * Adviser can send it again from the Members page, which issues a new link.
 */
export async function deliverInvitationLink(input: DeliverInvitationLinkInput): Promise<DeliverInvitationLinkResult> {
  const email = input.email.trim().toLowerCase();
  // The same address rule as issueInvitation (review finding L6): nothing goes to an address it refuses.
  if (!isInvitableEmail(email)) {
    await recordSecurityEventLater({
      action: "invitation.send",
      outcome: "denied",
      actorProfileId: input.inviter.id,
      actorRole: input.actorRole,
      schemeId: input.schemeId,
      resourceType: "Invitation",
      resourceId: input.invitationId,
      reason: "address not accepted",
    });
    return { emailed: false, reason: "address" };
  }
  const allowed = await hitRateLimits([
    ["invitationSend", input.inviter.id],
    ["invitationRecipient", `${input.schemeId}|${email}`],
  ]);
  if (!allowed) {
    await recordSecurityEventLater({
      action: "invitation.send",
      outcome: "denied",
      actorProfileId: input.inviter.id,
      actorRole: input.actorRole,
      schemeId: input.schemeId,
      resourceType: "Invitation",
      resourceId: input.invitationId,
      reason: "too many invitations",
    });
    return { emailed: false, reason: "rate_limited" };
  }

  const account = await prepareInviteeAccount(email, input.schemeId, input.inviter.id, input.actorRole);
  if (!account) return { emailed: false, reason: "account" };

  let n: number;
  try {
    n = await withLockTimeout((orm) =>
      orm.public.Invitation
        .where((i) =>
          and(
            i.id.eq(input.invitationId),
            i.schemeId.eq(input.schemeId),
            i.tokenHash.eq(input.hash),
            i.status.eq("PENDING"),
            i.tokenUsedAt.isNull(),
          ),
        )
        .updateAndCount({ accountAuthId: account.kind === "new" ? account.authId : null }),
    );
  } catch (err) {
    console.error("[invitations] invitation account not recorded:", err instanceof Error ? err.name : "error");
    n = 0;
  }
  if (n !== 1) return { emailed: false, reason: "changed" };

  await recordSecurityEventLater({
    action: "invitation.sent",
    outcome: "allowed",
    actorProfileId: input.inviter.id,
    actorRole: input.actorRole,
    schemeId: input.schemeId,
    resourceType: "Invitation",
    resourceId: input.invitationId,
    metadata: { role: input.role, resent: input.resent, previousStatus: input.previousStatus, via: input.via },
  });

  const emailed = await emailInvitationLink({
    schemeId: input.schemeId,
    email,
    role: input.role,
    lotNumber: input.lotNumber,
    expiresAt: input.expiresAt,
    token: input.token,
    inviter: input.inviter,
  });
  return emailed ? { emailed: true } : { emailed: false, reason: "email" };
}

/** Whether the address's account holds this role on the building now. */
async function holdsActiveRole(schemeId: string, email: string, role: string): Promise<boolean> {
  const profile = await db.orm.public.Profile.where((p) => p.email.eq(email)).first();
  if (!profile) return false;
  const m = await db.orm.public.SchemeMembership
    .where((x) =>
      and(x.schemeId.eq(schemeId), x.profileId.eq(profile.id), x.role.eq(role as InvitableRole), x.isActive.eq(true)),
    )
    .first();
  return !!m;
}
