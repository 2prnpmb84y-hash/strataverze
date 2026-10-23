/**
 * Server logs without personal details (security stage S7, finding SEC-026).
 *
 * Errors from the database, Supabase and libraries can carry the values
 * that caused them (an email address in a duplicate key, an account number
 * in a failed update, a line of a strata roll). `logError` writes the
 * error's name and code, its message with email addresses and long numbers
 * masked, and where it was thrown, but never the error object itself.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_NUMBER = /\d[\d\s-]{4,}\d/g;

/** Mask email addresses and runs of six or more digits (BSBs, account and phone numbers). */
export function redactText(text: string, max = 300): string {
  return String(text ?? "")
    .replace(EMAIL, "[email]")
    .replace(LONG_NUMBER, (m) => (m.replace(/\D/g, "").length >= 6 ? "[number]" : m))
    .slice(0, max);
}

/** A loggable summary of an error, with no personal details. */
export function errorSummary(err: unknown): Record<string, string> {
  if (!(err instanceof Error)) return { type: typeof err };
  const out: Record<string, string> = { name: err.name };
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") out.code = String(code).slice(0, 64);
  out.message = redactText(err.message);
  const frames = (err.stack ?? "").split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 3);
  if (frames.length) out.at = frames.map((f) => f.trim().slice(3)).join(" < ");
  return out;
}

export function logError(label: string, err: unknown): void {
  console.error(label, errorSummary(err));
}

export function logWarning(label: string, err: unknown): void {
  console.warn(label, errorSummary(err));
}
