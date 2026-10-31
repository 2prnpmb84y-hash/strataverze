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
  getInvitationByTokenHash,
  releaseInvitationLink,
} from "@/lib/queries/invitations";
import { hashLinkToken, maskEmail } from "@/lib/invitations/link-token";
import { inviteeSetupState, setInviteePassword } from "@/lib/invitations/accounts";

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
 *     so it works once;
 *   - lookups and uses are rate limited per address and per link, in the
 *     database.
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

export type JoinFormState = { error?: string; fieldErrors?: Record<string, string>; signInInstead?: boolean };

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

async function linkEvent(outcome: SecurityOutcome, reason: string, invitation?: Invitation | null, extra: { actorAuthId?: string | null; actorProfileId?: string | null } = {}) {
  await recordSecurityEventLater({
    action: "invitation.link",
    outcome,
    reason,
    schemeId: invitation?.schemeId ?? null,
    resourceType: invitation ? "Invitation" : null,
    resourceId: invitation?.id ?? null,
    ...extra,
  });
}

/** What the /join page shows for a link. Opening it changes nothing. */
export async function lookupJoinLinkAction(token: string): Promise<JoinView> {
  const ip = clientIp(await headers());
  if (!(await hitRateLimit("joinLinkAddress", ip))) {
    await linkEvent("denied", "too many attempts");
    return { state: "invalid", message: LIMITED };
  }
  const invitation = await usableInvitation(hashLinkToken(token));
  if (!invitation) {
    await linkEvent("denied", "invalid or expired link");
    return { state: "invalid", message: INVALID };
  }
  const shown = await details(invitation);
  if (await isForNewAccount(invitation)) return { state: "set-password", details: shown };

  const session = await getCurrentSession();
  const signedIn = !session
    ? "nobody"
    : String(session.profile.email).toLowerCase() === invitation.email.toLowerCase()
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
    await linkEvent("denied", "too many attempts");
    return { error: LIMITED };
  }

  const invitation = await usableInvitation(hash);
  if (!invitation || !hash) {
    await linkEvent("denied", "invalid or expired link");
    return { error: INVALID };
  }
  if (!(await isForNewAccount(invitation))) return { error: "This invitation is for an existing account. Sign in to accept it.", signInInstead: true };

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const passwordError = validatePassword(password) ?? (password.length > 72 ? "Password can be at most 72 characters." : null);
  if (passwordError) return { fieldErrors: { password: passwordError } };
  if (password !== confirm) return { fieldErrors: { confirmPassword: "The passwords do not match." } };

  const authId = invitation.accountAuthId!;
  const setup = await inviteeSetupState(authId, invitation.email);
  if (setup === "already-set-up") return { error: "This account is already set up. Sign in to accept the invitation.", signInInstead: true };
  if (setup !== "ready") {
    await linkEvent("failed", "account not available", invitation);
    return { error: INVALID };
  }

  // The link works once: claimed before anything changes.
  if (!(await claimInvitationLink(invitation.id, hash))) {
    await linkEvent("denied", "link already used", invitation);
    return { error: INVALID };
  }

  const set = await setInviteePassword(authId, password);
  if (!set.ok) {
    await releaseInvitationLink(invitation.id, hash);
    await linkEvent("failed", "password not set", invitation, { actorAuthId: authId });
    if (set.reason === "weak_password") return { fieldErrors: { password: "Choose a stronger password." } };
    return { error: "Your account could not be set up just now. Please try again." };
  }
  await linkEvent("allowed", "account set up", invitation, { actorAuthId: authId });

  // Their profile, as a first sign-in makes it (src/lib/auth/session-state.ts).
  let profile = await db.orm.public.Profile.where((p) => p.authId.eq(authId)).first();
  if (!profile) {
    try {
      profile = await db.orm.public.Profile.create({ authId, email: invitation.email, firstName: "", lastName: "" });
    } catch {
      profile = await db.orm.public.Profile.where((p) => p.authId.eq(authId)).first();
    }
  }

  let accepted = false;
  if (profile) {
    const result = await acceptInvitation(invitation.id, profile.id, invitation.email);
    accepted = !result.error;
    if (accepted) {
      await logActivity({
        schemeId: invitation.schemeId,
        actorId: profile.id,
        action: "INVITATION_ACCEPTED",
        entityType: "Invitation",
        entityId: invitation.id,
      });
    }
    await recordSecurityEventLater({
      action: "invitation.accept",
      outcome: accepted ? "allowed" : "failed",
      actorProfileId: profile.id,
      actorAuthId: authId,
      actorRole: invitation.role,
      schemeId: invitation.schemeId,
      resourceType: "Invitation",
      resourceId: invitation.id,
      reason: accepted ? "new account" : "could not accept",
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
  if (!accepted || !profile) redirect("/invitations");
  redirect(await portalFor(profile.id, !!profile.isPlatformAdmin));
}

/**
 * Someone who already has an account, signed in with the invited address,
 * accepts from the link.
 */
export async function acceptJoinAction(_prev: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in to accept this invitation.", signInInstead: true };

  const ip = clientIp(await headers());
  const hash = hashLinkToken(formData.get("token"));
  if (
    !(await hitRateLimits([
      ["joinLinkAddress", ip],
      ["joinLinkToken", hash ?? "malformed"],
      ["invitationAccept", profile.id],
    ]))
  ) {
    await linkEvent("denied", "too many attempts", null, { actorProfileId: profile.id });
    return { error: LIMITED };
  }

  const invitation = await usableInvitation(hash);
  if (!invitation || !hash) {
    await linkEvent("denied", "invalid or expired link", null, { actorProfileId: profile.id });
    return { error: INVALID };
  }
  // Only the invited address may accept (checked against the account, not the form).
  if (String(profile.email).toLowerCase() !== invitation.email.toLowerCase()) {
    await linkEvent("denied", "signed in as a different address", invitation, { actorProfileId: profile.id });
    return { error: "This invitation was sent to a different email address. Sign out, then sign in with the address the invitation was sent to." };
  }

  if (!(await claimInvitationLink(invitation.id, hash))) {
    await linkEvent("denied", "link already used", invitation, { actorProfileId: profile.id });
    return { error: INVALID };
  }
  const result = await acceptInvitation(invitation.id, profile.id, invitation.email);
  if (result.error) {
    await releaseInvitationLink(invitation.id, hash);
    await linkEvent("failed", "could not accept", invitation, { actorProfileId: profile.id });
    return { error: result.error };
  }

  await logActivity({
    schemeId: invitation.schemeId,
    actorId: profile.id,
    action: "INVITATION_ACCEPTED",
    entityType: "Invitation",
    entityId: invitation.id,
  });
  await recordSecurityEventLater({
    action: "invitation.accept",
    outcome: "allowed",
    actorProfileId: profile.id,
    actorRole: invitation.role,
    schemeId: invitation.schemeId,
    resourceType: "Invitation",
    resourceId: invitation.id,
    reason: "existing account",
  });

  revalidatePath("/", "layout");
  redirect(await portalFor(profile.id, !!profile.isPlatformAdmin));
}

async function portalFor(profileId: string, isPlatformAdmin: boolean): Promise<string> {
  const next = afterSignIn(signInPortals(await getAvailablePortals(profileId), isPlatformAdmin), null);
  return next.kind === "go" ? next.path : "/login";
}
