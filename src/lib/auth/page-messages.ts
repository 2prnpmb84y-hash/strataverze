import { PASSWORD_MIN_LENGTH } from "./password-policy";

/**
 * Messages the sign-in pages may show from their address (security stage
 * S7). The pages read `?error=` and `?message=`, so a crafted link could
 * otherwise show any text on the genuine page, such as a fake support
 * number. Only these fixed texts are shown; anything else shows a generic
 * message.
 */
const KNOWN = new Set<string>([
  "Could not authenticate",
  "Invalid email or password",
  "Please enter a valid email address.",
  "Please enter your password.",
  "Too many attempts. Please try again later.",
  "Unable to create account. Please try again.",
  "Check your email to confirm your account",
  "Please enter your email address",
  "If that address has an account, we have emailed a password reset link",
  `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  "Password must contain at least one uppercase letter.",
  "Password must contain at least one lowercase letter.",
  "Password must contain at least one number.",
  "Password must contain at least one special character.",
]);

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

/** The error to show, or undefined when there is none. */
export function authPageError(raw: string | string[] | undefined | null): string | undefined {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text) return undefined;
  return KNOWN.has(text) ? text : GENERIC_AUTH_ERROR;
}

/** An information message to show, or undefined (unknown text is dropped). */
export function authPageMessage(raw: string | string[] | undefined | null): string | undefined {
  const text = Array.isArray(raw) ? raw[0] : raw;
  return text && KNOWN.has(text) ? text : undefined;
}
