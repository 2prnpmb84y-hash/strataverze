/**
 * Whether an address may be sent an invitation (security stage S2a). Pure,
 * so the change-of-owner form check can use it too (src/lib/owner/change-owner.ts).
 */

/**
 * An address the invitation may go to (review finding L6). ASCII only.
 * The local part is dot-separated runs of letters, digits and _ % + ' -
 * (no leading, trailing or double dots, no quotes, comments or spaces); the
 * domain is labels that start and end with a letter or digit, ending in a
 * letter TLD. Control characters and < > , ; " \ are refused outright, so
 * nothing can split a header or a list of recipients. Internationalised and
 * unusual-but-valid RFC 5322 addresses are refused for now; the inviter is
 * told to enter a valid address.
 */
const EMAIL = /^[A-Za-z0-9_%+'-]+(?:\.[A-Za-z0-9_%+'-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** Whether an address (already trimmed and lower-cased) may be invited. */
export function isInvitableEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  // Anything outside printable ASCII (control characters, spaces, non-ASCII
  // letters) or any of < > , ; " \ : refused before the pattern, which
  // refuses them too.
  if (/[^\x21-\x7e]/.test(email) || /[<>,;"\\]/.test(email)) return false;
  if (email.lastIndexOf("@") > 64) return false;
  return EMAIL.test(email);
}
