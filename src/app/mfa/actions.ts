"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current-session";
import { getMfaStatus, requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { AuthorisationError } from "@/lib/auth/errors";
import { MAX_TOTP_FACTORS, safeNextPath } from "@/lib/auth/mfa-policy";
import { rateLimit } from "@/lib/auth/rate-limit";
import { grantFactorEnrolment, grantFactorRemoval } from "@/lib/auth/mfa-grants";

/**
 * Authenticator (TOTP) enrolment and verification, security stage S4.
 *
 * These act only on the signed-in user's own account. They deliberately use
 * getCurrentSession rather than getCurrentProfile, because getCurrentProfile
 * would send a user who still has to verify straight back here.
 */

type Result = { error?: string; navigate?: string };

/**
 * Where to go after a successful check. Pages use a normal redirect. A route
 * handler (a download such as the audit export) is returned to the browser
 * to open itself, because a server action redirect to a route handler can
 * run it twice (once on the server, again in the browser).
 */
function finish(next: string | undefined): Result {
  const target = safeNextPath(next) ?? "/dashboard";
  revalidatePath("/", "layout");
  if (target.startsWith("/api/")) return { navigate: target };
  redirect(target);
}

const CODE = /^\d{6}$/;

/** The caller's own session; every action here acts on that account only. */
async function authoriseSelf() {
  const session = await getCurrentSession();
  if (!session) throw new AuthorisationError("You must be signed in.");
  return session;
}

/** Five code attempts per 15 minutes per user, on top of Supabase's own limits. */
function codeAttemptAllowed(userId: string): boolean {
  return rateLimit(`mfa-verify:${userId}`, 5, 15 * 60 * 1000).success;
}

function cleanCode(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, "");
}

/**
 * Start enrolling an authenticator app. Returns the QR code (an SVG data URL)
 * and the secret for manual entry. Adding a second authenticator needs a
 * recent check with the first.
 */
export async function startTotpEnrolmentAction(): Promise<
  Result & { factorId?: string; qrCode?: string; secret?: string }
> {
  try {
    const session = await authoriseSelf();
    if (session.verifiedFactors.length >= MAX_TOTP_FACTORS) {
      return { error: `You already have ${MAX_TOTP_FACTORS} authenticators. Remove one before adding another.` };
    }
    if (session.verifiedFactors.length > 0) {
      await requireRecentMfa();
      // The database refuses a second authenticator without this grant.
      await grantFactorEnrolment(session.user.id, session.profile.id);
    }

    const supabase = await createClient();
    // Clear any half-finished enrolment, so a fresh QR code can be issued.
    const stale = (session.user.factors ?? []).filter(
      (f) => f.factor_type === "totp" && f.status !== "verified",
    );
    for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id });

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "StrataVerze",
      // Names must be unique per user; the time keeps them distinct.
      friendlyName: `Authenticator added ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    });
    if (error || !data) {
      console.error("[mfa] enroll failed:", error?.code ?? error?.name);
      return { error: "Could not start setting up your authenticator. Please try again." };
    }
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
}

/** Confirm a new authenticator with its first code. Upgrades the session to aal2. */
export async function confirmTotpEnrolmentAction(factorId: string, rawCode: string, next?: string): Promise<Result> {
  let session;
  try {
    session = await authoriseSelf();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  const code = cleanCode(rawCode);
  if (!CODE.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const ownsFactor = (session.user.factors ?? []).some(
    (f) => f.id === factorId && f.factor_type === "totp" && f.status !== "verified",
  );
  if (!ownsFactor) return { error: "Start setting up your authenticator again." };

  // Check the rules again here, not only when enrolment started: two set-ups
  // started together must not end with more than the maximum, and a second
  // authenticator still needs a recent check with the first.
  const supabase = await createClient();
  if (session.verifiedFactors.length >= MAX_TOTP_FACTORS) {
    await supabase.auth.mfa.unenroll({ factorId });
    return { error: `You already have ${MAX_TOTP_FACTORS} authenticators. Remove one before adding another.` };
  }
  if (session.verifiedFactors.length > 0) {
    try {
      await requireRecentMfa();
    } catch (err) {
      if (err instanceof AuthorisationError) return { error: err.message };
      throw err;
    }
  }
  if (!codeAttemptAllowed(session.user.id)) return { error: "Too many attempts. Wait 15 minutes and try again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code did not match. Check the time on your phone is correct and try again." };

  return finish(next);
}

/** Verify with an enrolled authenticator, at sign-in or before a sensitive operation. */
export async function verifyTotpAction(factorId: string, rawCode: string, next?: string): Promise<Result> {
  let session;
  try {
    session = await authoriseSelf();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  const code = cleanCode(rawCode);
  if (!CODE.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  if (!session.verifiedFactors.some((f) => f.id === factorId)) return { error: "Choose one of your authenticators." };
  if (!codeAttemptAllowed(session.user.id)) return { error: "Too many attempts. Wait 15 minutes and try again." };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code did not match. Check the time on your phone is correct and try again." };

  return finish(next);
}

/**
 * Remove one of the caller's authenticators. Needs a check within the last
 * 15 minutes, and the last authenticator cannot be removed while MFA is
 * mandatory for the caller (a platform admin resets it instead).
 */
export async function removeTotpFactorAction(factorId: string): Promise<Result> {
  try {
    const session = await authoriseSelf();
    await requireRecentMfa();
    if (!session.verifiedFactors.some((f) => f.id === factorId)) return { error: "Authenticator not found." };
    const status = await getMfaStatus();
    if (status?.mandatory && session.verifiedFactors.length <= 1) {
      return { error: "Your role requires an authenticator. Add another one before removing this one." };
    }
    // The database refuses to remove a verified authenticator without this grant.
    await grantFactorRemoval(session.user.id, factorId, session.profile.id);
    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      console.error("[mfa] unenroll failed:", error.code ?? error.name);
      return { error: "Could not remove that authenticator. Please try again." };
    }
    // Pick up the lower assurance level straight away.
    await supabase.auth.refreshSession();
    revalidatePath("/settings");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
}
