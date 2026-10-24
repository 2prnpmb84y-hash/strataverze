/**
 * The password rules, enforced on the server at sign-up and password reset.
 * Supabase Auth enforces the same rules (minimum 8 characters; lowercase,
 * uppercase, digits and symbols) as a second check. Passwords are never
 * stored or logged by the app: Supabase Auth holds them as bcrypt hashes.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** An error message, or null if the password meets the rules. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/\d/.test(password)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character.";
  return null;
}
