/**
 * CAPTCHA on sign-in, sign-up and password reset (SEC-020, decided 24 Oct
 * 2026), with Cloudflare Turnstile through Supabase Auth's Attack Protection.
 *
 * The forms show the Turnstile check when NEXT_PUBLIC_TURNSTILE_SITE_KEY is
 * set; the check puts its token in the form as `cf-turnstile-response`, and
 * the server actions pass it to Supabase as `captchaToken`. Supabase verifies
 * it with the secret key, which is entered only in the Supabase dashboard
 * (Authentication, Attack Protection), never in this app. Order to turn it
 * on: deploy with the site key, check the forms show the check, then enable
 * CAPTCHA in Supabase. With no site key nothing changes.
 */

/** The public Turnstile site key, or null when CAPTCHA is not set up. */
export function captchaSiteKey(): string | null {
  const key = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
  return /^[0-9A-Za-z_-]{10,100}$/.test(key) ? key : null;
}

/** The Turnstile token a form carried, if any. */
export function captchaTokenFrom(formData: FormData): string | undefined {
  const token = String(formData.get("cf-turnstile-response") ?? "").trim();
  // Turnstile tokens are at most 2048 characters.
  return token && token.length <= 2048 ? token : undefined;
}

/** Whether Supabase refused the call because the CAPTCHA check failed or was missing. */
export function isCaptchaFailure(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "captcha_failed" || /captcha/i.test(error.message ?? "");
}

export const CAPTCHA_FAILED_MESSAGE = "Please complete the security check and try again.";
