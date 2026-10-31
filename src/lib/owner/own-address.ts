/**
 * A committee member cannot record a change of owner to themselves (finding
 * H-1, founder decision 31 Oct 2026; review L1, L4). An address is compared
 * trimmed, in lower case, without a plus tag (local+tag@domain matches
 * local@domain) and without a trailing dot on the domain; Gmail addresses
 * also without dots in the name, with googlemail.com read as gmail.com.
 */

export function normaliseAddress(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const a = v.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at <= 0 || at === a.length - 1) return a || null;
  let local = a.slice(0, at).split("+")[0] || a.slice(0, at);
  // A trailing dot on the domain is the same domain (review L4).
  let domain = a.slice(at + 1).replace(/\.+$/, "");
  // Gmail ignores dots in the name, and googlemail.com is gmail.com.
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "") || local;
  return `${local}@${domain}`;
}

type AuthUserLike = {
  email?: string | null;
  new_email?: string | null;
  identities?: Array<{ identity_data?: Record<string, unknown> | null }> | null;
} | null | undefined;

/**
 * Every address on an account, normalised: the profile's email (what
 * invitations are matched against), the sign-in email, an email change
 * waiting for confirmation, and each linked sign-in identity's email.
 */
export function accountAddresses(profileEmail: string | null | undefined, user: AuthUserLike): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    const n = normaliseAddress(v);
    if (n) out.add(n);
  };
  add(profileEmail);
  add(user?.email);
  add(user?.new_email);
  for (const identity of user?.identities ?? []) add(identity?.identity_data?.email);
  return out;
}

export function isOwnAddress(email: string | null | undefined, addresses: Set<string>): boolean {
  const n = normaliseAddress(email);
  return !!n && addresses.has(n);
}

/** Common public mail providers: a shared domain there says nothing. */
const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.com.au", "hotmail.com", "hotmail.com.au", "live.com", "live.com.au",
  "yahoo.com", "yahoo.com.au", "icloud.com", "me.com", "bigpond.com", "bigpond.net.au", "optusnet.com.au", "proton.me", "protonmail.com",
]);

/**
 * For the reviewer: whether the new owner's email looks like one of the
 * recorder's addresses (all of their sign-in addresses, normalised), sharing
 * the part before the @ or a domain that is not a public mail provider. Null
 * when it does not.
 */
export function addressResemblance(newOwnerEmail: string | null | undefined, recorderAddresses: Iterable<string | null | undefined>): "local" | "domain" | null {
  const a = normaliseAddress(newOwnerEmail);
  if (!a || !a.includes("@")) return null;
  const [al, ad] = [a.slice(0, a.lastIndexOf("@")), a.slice(a.lastIndexOf("@") + 1)];
  let found: "local" | "domain" | null = null;
  for (const raw of recorderAddresses) {
    const b = normaliseAddress(raw);
    if (!b || !b.includes("@")) continue;
    const [bl, bd] = [b.slice(0, b.lastIndexOf("@")), b.slice(b.lastIndexOf("@") + 1)];
    if (al === bl) return "local";
    if (ad === bd && !PUBLIC_DOMAINS.has(ad)) found = "domain";
  }
  return found;
}
