"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { createClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/auth/password-policy";
import { captchaTokenFrom } from "@/lib/auth/captcha";
import { clientIp, hitRateLimit, hitRateLimits } from "@/lib/auth/rate-limit-db";
import { decodeJwtPayload } from "@/lib/auth/mfa-policy";
import { afterSignIn, signInPortals } from "@/lib/auth/post-sign-in";
import { getCurrentSession } from "@/lib/auth/current-session";
import { recordSecurityEventLater, type SecurityOutcome } from "@/lib/audit/security-audit";
import { getAvailablePortals, getCurrentProfile } from "@/lib/queries/profiles";
import { logActivity } from "@/lib/queries/activity-log";
import {
  acceptInvitation,
  claimInvitationLink,
  claimLinkForAccountSetUp,
  getInvitationByTokenHash,
  releaseInvitationLink,
} from "@/lib/queries/invitations";
import { hashLinkToken, maskEmail } from "@/lib/invitations/link-token";
import { inviteeSetupState, setInviteePassword } from "@/lib/invitations/accounts";
import { ADDRESS_UNCONFIRMED, invitationAddressOf } from "@/lib/invitations/invitee-address";

/**
 * The /join page's server side (security stage S2a): someone opens the
 * one-time link from an invitation email.
 *
 * These actions are public: holding the emailed link is the credential. The
 * link's token comes in the POST body (the page reads it from the URL
 * fragment, which never reaches the server's logs). Every check is made here:
 *   - the token must hash to a pending, unexpired invitation whose link has
 *     not been used (one message for every way it can fail, so the page is
 *     no oracle);
 *   - a new account's password is set only for the Auth user the server
 *     made for that invitation, only if it carries the invited address and
 *     has never been set up;
 *   - an existing account accepts only when signed in with the invited
 *     address;
 *   - the link is claimed by a conditional update before anything changes,
 *     so it works once; a new account is set up one link at a time, with
 *     every pending invitation for it locked until the invitation is
 *     accepted (claimLinkForAccountSetUp);
 *   - lookups and uses are rate limited per address and per link, in the
 *     database.
 *
 * Security events (review finding L1): the building's Adviser can read the
 * events that carry the building (schemeId), so those never say whether
 * the invitee's account was new or already existed. They carry one neutral
 * reason per outcome and the same actor fields on both paths. The detail
 * goes in an `invitation.link_detail` event with no building.
 */

const INVALID = "This invitation link is not valid. It may have been used already, replaced by a newer invitation, or expired. Ask whoever invited you to send it again.";
const LIMITED = "Too many attempts. Please wait a few minutes and try again.";
const ROLE_LABELS: Record<string, string> = { OWNER: "Owner", COMMITTEE: "Committee member", ACCOUNTANT: "Accountant", ADVISER: "Adviser" };
const DONE_MESSAGE = "Your account is ready. Sign in with your new password.";

export type JoinDetails = {
  schemeName: string;
  roleLabel: string;
  lotNumber: string | null;
  maskedEmail: string;
  expiresOn: string;
};

export type JoinView =
  | { state: "invalid"; message: string }
  | { state: "set-password"; details: JoinDetails }
  | { state: "sign-in"; details: JoinDetails; signedIn: "invitee" | "someone-else" | "nobody" };

/**
 * A form's answer. `linkDone`: the link cannot be used again (the page then
 * forgets it); `signInInstead`: the page hands over to the sign-in page.
 */
export type JoinFormState = { error?: string; fieldErrors?: Record<string, string>; signInInstead?: boolean; linkDone?: boolean };

type Invitation = NonNullable<Awaited<ReturnType<typeof getInvitationByTokenHash>>>;

/** The invitation a link opens, if the link can still be used. */
async function usableInvitation(hash: string | null): Promise<Invitation | null> {
  if (!hash) return null;
  const invitation = await getInvitationByTokenHash(hash);
  if (!invitation || invitation.status !== "PENDING" || invitation.tokenUsedAt) return null;
  if (!(new Date(String(invitation.expiresAt)).getTime() > Date.now())) return null;
  return invitation;
}

/** Whether the invitation is for an account the server made and nobody has set up yet. */
async function isForNewAccount(invitation: Invitation): Promise<boolean> {
  if (!invitation.accountAuthId) return false;
  const profile = await db.orm.public.Profile.where((p) => p.authId.eq(invitation.accountAuthId!)).first();
  return !profile;
}

async function details(invitation: Invitation): Promise<JoinDetails> {
  const [scheme, lot] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(invitation.schemeId)).first(),
    invitation.lotId
      ? db.orm.public.Lot.where((l) => and(l.id.eq(invitation.lotId!), l.schemeId.eq(invitation.schemeId))).first()
      : Promise.resolve(null),
  ]);
  return {
    schemeName: scheme?.name ?? "a building",
    roleLabel: ROLE_LABELS[invitation.role] ?? invitation.role,
    lotNumber: lot?.lotNumber ?? null,
    maskedEmail: maskEmail(invitation.email),
    expiresOn: new Date(String(invitation.expiresAt)).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Australia/Sydney",
    }),
  };
}

type Actor = { actorAuthId?: string | null; actorProfileId?: string | null };

/**
 * A link that could not be used. Without an invitation (a made-up link, a
 * rate limit) there is no building, and the reason is kept as it is. With
 * one, the building's event says only "link not used", and the reason goes
 * in an event with no building.
 */
async function linkRefused(outcome: Exclude<SecurityOutcome, "allowed">, reason: string, invitation?: Invitation | null, actor: Actor = {}) {
  if (!invitation) {
    await recordSecurityEventLater({ action: "invitation.link", outcome, reason, ...actor });
    return;
  }
  await recordSecurityEventLater({
    action: "invitation.link",
    outcome,
    reason: "link not used",
    schemeId: invitation.schemeId,
    resourceType: "Invitation",
    resourceId: invitation.id,
  });
  await linkDetail(outcome, reason, invitation, actor);
}

/** What happened with a link, in detail, with no building: the Adviser cannot read it. */
async function linkDetail(outcome: SecurityOutcome, reason: string, invitation: Invitation, actor: Actor = {}) {
  await recordSecurityEventLater({
    action: "invitation.link_detail",
    outcome,
    reason,
    resourceType: "Invitation",
    resourceId: invitation.id,
    ...actor,
  });
}

/** The acceptance, in the building's log: the same on both paths. */
async function acceptEvent(accepted: boolean, invitation: Invitation, actor: { actorAuthId: string | null; actorProfileId: string }) {
  await recordSecurityEventLater({
    action: "invitation.accept",
    outcome: accepted ? "allowed" : "failed",
    ...actor,
    actorRole: invitation.role,
    schemeId: invitation.schemeId,
    resourceType: "Invitation",
    resourceId: invitation.id,
    reason: accepted ? "accepted from link" : "could not accept",
  });
}

/** A lock wait that ran past lock_timeout (55P03), anywhere in the error's causes. */
function waitedTooLong(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const x = e as { sqlState?: unknown; code?: unknown };
    if (x.sqlState === "55P03" || x.code === "55P03") return true;
  }
  return false;
}

/** Why a new account's set-up stopped before the password was set (the claim is then rolled back). */
class SetUpStopped extends Error {
  constructor(readonly why: "already-set-up" | "unavailable" | "weak_password" | "failed") {
    super(why);
    this.name = "SetUpStopped";
  }
}

/** What the /join page shows for a link. Opening it changes nothing. */
export async function lookupJoinLinkAction(token: string): Promise<JoinView> {
  const ip = clientIp(await headers());
  if (!(await hitRateLimit("joinLinkAddress", ip))) {
    await linkRefused("denied", "too many attempts");
    return { state: "invalid", message: LIMITED };
  }
  const invitation = await usableInvitation(hashLinkToken(token));
  if (!invitation) {
    await linkRefused("denied", "invalid or expired link");
    return { state: "invalid", message: INVALID };
  }
  const shown = await details(invitation);
  if (await isForNewAccount(invitation)) return { state: "set-password", details: shown };

  // Matched on the Auth address, not the stored profile copy (L7).
  const session = await getCurrentSession();
  const signedIn = !session
    ? "nobody"
    : invitationAddressOf(session) === invitation.email.toLowerCase()
      ? "invitee"
      : "someone-else";
  return { state: "sign-in", details: shown, signedIn };
}

/**
 * Someone new: choose a password, which sets up the account the server made
 * for the invitation, accepts the invitation and signs them in.
 */
export async function completeJoinAction(_prev: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const ip = clientIp(await headers());
  const hash = hashLinkToken(formData.get("token"));
  if (!(await hitRateLimits([["joinLinkAddress", ip], ["joinLinkToken", hash ?? "malformed"]]))) {
    await linkRefused("denied", "too many attempts");
    return { error: LIMITED };
  }

  const invitation = await usableInvitation(hash);
  if (!invitation || !hash) {
    await linkRefused("denied", "invalid or expired link");
    return { error: INVALID, linkDone: true };
  }
  if (!(await isForNewAccount(invitation))) return { error: "This invitation is for an existing account. Sign in to accept it.", signInInstead: true };

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const passwordError = validatePassword(password) ?? (password.length > 72 ? "Password can be at most 72 characters." : null);
  if (passwordError) return { fieldErrors: { password: passwordError } };
  if (password !== confirm) return { fieldErrors: { confirmPassword: "The passwords do not match." } };

  const authId = invitation.accountAuthId!;

  // One set-up at a time for this account, whichever of its links is used,
  // and the link claimed before anything changes (L2). Everything below runs
  // while every pending invitation for the account is locked, so a revoke
  // waits until this one is accepted.
  let passwordSet = false;
  let done: { result: { profileId: string; isPlatformAdmin: boolean; accepted: boolean } } | null;
  try {
    done = await claimLinkForAccountSetUp({ invitationId: invitation.id, tokenHash: hash, accountAuthId: authId }, async (tx, locked) => {
      // Only the Auth user made (or adopted) for this invitation, carrying
      // the invited address, never set up: checked now, under the lock.
      const setup = await inviteeSetupState(authId, locked.email);
      if (setup !== "ready") throw new SetUpStopped(setup);

      const set = await setInviteePassword(authId, password);
      if (!set.ok) throw new SetUpStopped(set.reason);
      passwordSet = true;

      // Their profile, as a first sign-in makes it (src/lib/auth/session-state.ts).
      const profile =
        (await tx.orm.public.Profile.where((p) => p.authId.eq(authId)).first()) ??
        (await tx.orm.public.Profile.create({ authId, email: locked.email, firstName: "", lastName: "" }));

      const result = await acceptInvitation(locked.id, profile.id, locked.email, tx);
      return { profileId: profile.id, isPlatformAdmin: !!profile.isPlatformAdmin, accepted: !result.error };
    });
  } catch (err) {
    if (err instanceof SetUpStopped) {
      // Nothing was claimed: the transaction rolled back.
      if (err.why === "already-set-up") {
        await linkDetail("denied", "account already set up", invitation, { actorAuthId: authId });
        return { error: "This account is already set up. Sign in to accept the invitation.", signInInstead: true };
      }
      await linkRefused("failed", err.why === "unavailable" ? "account not available" : "password not set", invitation, { actorAuthId: authId });
      if (err.why === "unavailable") return { error: INVALID, linkDone: true };
      if (err.why === "weak_password") return { fieldErrors: { password: "Choose a stronger password." } };
      return { error: "Your account could not be set up just now. Please try again." };
    }
    if (!passwordSet && waitedTooLong(err)) {
      // Another set-up of this account held the lock for more than 5 seconds.
      return { error: "Your account is being set up from another window. Please wait a moment and try again." };
    }
    if (passwordSet) {
      // The password is set in Auth, but the database work did not commit
      // (a lock wait or a lost connection, say). The invitation is still
      // pending, with its link unused: they sign in and accept it from
      // Invitations.
      console.error("[join] account set up but the invitation was not accepted");
      await linkRefused("failed", "account set up, invitation not accepted", invitation, { actorAuthId: authId });
      redirect(`/login?message=${encodeURIComponent(DONE_MESSAGE)}`);
    }
    throw err;
  }
  if (!done) {
    await linkRefused("denied", "link already used", invitation);
    return { error: INVALID, linkDone: true };
  }

  const { profileId, isPlatformAdmin, accepted } = done.result;
  await linkDetail("allowed", "account set up", invitation, { actorAuthId: authId, actorProfileId: profileId });
  await acceptEvent(accepted, invitation, { actorAuthId: authId, actorProfileId: profileId });
  if (accepted) {
    await logActivity({
      schemeId: invitation.schemeId,
      actorId: profileId,
      action: "INVITATION_ACCEPTED",
      entityType: "Invitation",
      entityId: invitation.id,
    });
  }

  // Sign them in with the password they just chose.
  const supabase = await createClient();
  const captchaToken = captchaTokenFrom(formData);
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error || !signedIn.session) {
    // The account is set up either way (with CAPTCHA on, say, and the check
    // not passed): they sign in on the sign-in page, where the invitation
    // waits under Invitations if it was not accepted here.
    redirect(`/login?message=${encodeURIComponent(DONE_MESSAGE)}`);
  }
  const claims = decodeJwtPayload(signedIn.session.access_token);
  await recordSecurityEventLater({
    action: "auth.sign_in",
    outcome: "allowed",
    actorAuthId: authId,
    resourceType: "session",
    resourceId: typeof claims?.session_id === "string" ? claims.session_id : null,
    reason: "after invitation set-up",
  });

  revalidatePath("/", "layout");
  if (!accepted) redirect("/invitations");
  redirect(await portalFor(profileId, isPlatformAdmin));
}

/**
 * Someone who already has an account, signed in with the invited address,
 * accepts from the link.
 */
export async function acceptJoinAction(_prev: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in to accept this invitation.", signInInstead: true };
  const actor = { actorAuthId: profile.authId ?? null, actorProfileId: profile.id };

  const ip = clientIp(await headers());
  const hash = hashLinkToken(formData.get("token"));
  if (
    !(await hitRateLimits([
      ["joinLinkAddress", ip],
      ["joinLinkToken", hash ?? "malformed"],
      ["invitationAccept", profile.id],
    ]))
  ) {
    await linkRefused("denied", "too many attempts", null, actor);
    return { error: LIMITED };
  }

  const invitation = await usableInvitation(hash);
  if (!invitation || !hash) {
    await linkRefused("denied", "invalid or expired link", null, actor);
    return { error: INVALID, linkDone: true };
  }
  // Only the invited address may accept, as the Auth server holds it for
  // this session; a stale profile copy that differs is refused (L7).
  const address = invitationAddressOf(await getCurrentSession());
  if (!address) {
    await linkRefused("denied", "session address differs from profile", invitation, actor);
    return { error: ADDRESS_UNCONFIRMED };
  }
  if (address !== invitation.email.toLowerCase()) {
    await linkRefused("denied", "signed in as a different address", invitation, actor);
    return { error: "This invitation was sent to a different email address. Sign out, then sign in with the address the invitation was sent to." };
  }

  if (!(await claimInvitationLink(invitation.id, hash))) {
    await linkRefused("denied", "link already used", invitation, actor);
    return { error: INVALID, linkDone: true };
  }
  const result = await acceptInvitation(invitation.id, profile.id, address);
  if (result.error) {
    await releaseInvitationLink(invitation.id, hash);
    await linkDetail("failed", "existing account, could not accept", invitation, actor);
    await acceptEvent(false, invitation, actor);
    return { error: result.error };
  }

  await logActivity({
    schemeId: invitation.schemeId,
    actorId: profile.id,
    action: "INVITATION_ACCEPTED",
    entityType: "Invitation",
    entityId: invitation.id,
  });
  await linkDetail("allowed", "existing account", invitation, actor);
  await acceptEvent(true, invitation, actor);

  revalidatePath("/", "layout");
  redirect(await portalFor(profile.id, !!profile.isPlatformAdmin));
}

async function portalFor(profileId: string, isPlatformAdmin: boolean): Promise<string> {
  const next = afterSignIn(signInPortals(await getAvailablePortals(profileId), isPlatformAdmin), null);
  return next.kind === "go" ? next.path : "/login";
}
