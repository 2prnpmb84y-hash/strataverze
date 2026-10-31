"use server";

import { revalidatePath } from "next/cache";
import { validatePassword } from "@/lib/auth/password-policy";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { anyRateLimitReached, clientIp, recordRateLimitHits, type RateLimitName } from "@/lib/auth/rate-limit-db";
import { decodeJwtPayload } from "@/lib/auth/mfa-policy";
import { auditHash, recordSecurityEventLater } from "@/lib/audit/security-audit";
import { afterSignIn, signInPortals } from "@/lib/auth/post-sign-in";
import { getAvailablePortals } from "@/lib/queries/profiles";
import { db } from "@/prisma/db";
import { CAPTCHA_FAILED_MESSAGE, captchaTokenFrom, isCaptchaFailure } from "@/lib/auth/captcha";
import { siteUrl } from "@/lib/site-url";

/** The session id in an access token (not verified: it was just issued to us). */
function sessionIdOf(token: string): string | null {
  const claims = decodeJwtPayload(token);
  return typeof claims?.session_id === "string" ? claims.session_id : null;
}

/** Basic email format check — prevents obviously invalid submissions. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function login(formData: FormData) {
  const ip = clientIp(await headers());
  const email = String(formData.get("email")).trim().toLowerCase();

  if (!isValidEmail(email)) {
    redirect("/login?error=Please+enter+a+valid+email+address.");
  }

  const password = String(formData.get("password"));
  if (!password || password.length < 6) {
    redirect("/login?error=Please+enter+your+password.");
  }

  // Failed sign-ins per address and account, per account, and per address,
  // across every server instance (S7, SEC-020). Only failures count, so
  // nobody can lock an account by signing in correctly or by being refused.
  const limits: [RateLimitName, string | null][] = [
    ["signIn", ip ? `${ip}|${email}` : null],
    ["signInAccount", email],
    ["signInAddress", ip],
  ];
  if (await anyRateLimitReached(limits)) {
    await recordSecurityEventLater({
      action: "auth.sign_in",
      outcome: "denied",
      reason: "too many attempts",
      // A keyed hash links attempts on one account without storing the address.
      metadata: { subject: auditHash(email) },
    });
    redirect("/login?error=Too+many+attempts.+Please+try+again+later.");
  }

  const supabase = await createClient();

  // The Turnstile token, when CAPTCHA is set up (SEC-020); Supabase checks it.
  const captchaToken = captchaTokenFrom(formData);
  const data = {
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  };

  const { data: signedIn, error } = await supabase.auth.signInWithPassword(data);

  if (isCaptchaFailure(error)) {
    // Not a wrong password: no attempt is counted against the account.
    await recordSecurityEventLater({ action: "auth.sign_in", outcome: "denied", reason: "captcha failed", metadata: { subject: auditHash(email) } });
    redirect(`/login?error=${encodeURIComponent(CAPTCHA_FAILED_MESSAGE)}`);
  }

  if (error) {
    await recordRateLimitHits(limits);
    await recordSecurityEventLater({
      action: "auth.sign_in",
      outcome: "failed",
      reason: "wrong email or password",
      metadata: { subject: auditHash(email) },
    });
    redirect("/login?error=Invalid+email+or+password");
  }

  await recordSecurityEventLater({
    action: "auth.sign_in",
    outcome: "allowed",
    actorAuthId: signedIn.user?.id ?? null,
    resourceType: "session",
    resourceId: signedIn.session ? sessionIdOf(signedIn.session.access_token) : null,
  });

  revalidatePath("/", "layout");

  // One sign-in for everyone: a safe return-to link wins, one portal goes
  // straight there, more than one is chosen on the sign-in page.
  const authId = signedIn.user?.id ?? null;
  const profile = authId ? await db.orm.public.Profile.where((p) => p.authId.eq(authId)).first() : null;
  const portals = profile ? signInPortals(await getAvailablePortals(profile.id), !!profile.isPlatformAdmin) : [];
  const next = afterSignIn(portals, String(formData.get("next") ?? ""));
  redirect(next.kind === "go" ? next.path : "/login");
}


export async function signup(formData: FormData) {
  const ip = clientIp(await headers());
  const email = String(formData.get("email")).trim().toLowerCase();

  if (!isValidEmail(email)) {
    redirect("/login?error=Please+enter+a+valid+email+address.");
  }

  // Sign-up attempts per address and account, and per address (S7).
  const signUpLimits: [RateLimitName, string | null][] = [
    ["signUp", ip ? `${ip}|${email}` : email],
    ["signUpAddress", ip],
  ];
  if (await anyRateLimitReached(signUpLimits)) {
    await recordSecurityEventLater({ action: "auth.sign_up", outcome: "denied", reason: "too many attempts", metadata: { subject: auditHash(email) } });
    redirect("/login?error=Too+many+attempts.+Please+try+again+later.");
  }

  const supabase = await createClient();

  const captchaToken = captchaTokenFrom(formData);
  const data = {
    email,
    password: String(formData.get("password")),
    options: {
      // The confirmation link comes back to the code exchange, not the
      // Site URL (the app root, which would send it on to the public site).
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      ...(captchaToken ? { captchaToken } : {}),
    },
  };

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    redirect(`/login?error=${encodeURIComponent(passwordError)}`);
  }

  await recordRateLimitHits(signUpLimits);
  const { data: created, error } = await supabase.auth.signUp(data);

  if (isCaptchaFailure(error)) {
    await recordSecurityEventLater({ action: "auth.sign_up", outcome: "denied", reason: "captcha failed", metadata: { subject: auditHash(email) } });
    redirect(`/login?error=${encodeURIComponent(CAPTCHA_FAILED_MESSAGE)}`);
  }

  if (error) {
    await recordSecurityEventLater({ action: "auth.sign_up", outcome: "failed", metadata: { subject: auditHash(email) } });
    // Map to a generic message so Supabase internals are not exposed
    redirect("/login?error=Unable+to+create+account.+Please+try+again.");
  }
  await recordSecurityEventLater({ action: "auth.sign_up", outcome: "allowed", actorAuthId: created.user?.id ?? null });

  revalidatePath("/", "layout");
  redirect("/login?message=Check+your+email+to+confirm+your+account");
}
