import { safeNextPath } from "./mfa-policy";

/**
 * Where someone goes after signing in (25 Oct 2026: one sign-in screen).
 *
 * There is one sign-in form for everyone. Afterwards:
 *   - a safe "return to" link (from being sent to sign in) wins;
 *   - someone with exactly one portal goes straight there;
 *   - someone with more than one (a StrataVerze administrator, or an
 *     owner who is also an adviser) chooses on the sign-in page;
 *   - someone with none yet goes to the owner portal, as before.
 */

/** The portals a person can be sent to, in the order they are offered. */
export const SIGN_IN_PORTALS = ["owner", "adviser", "supplier", "accountant", "admin"] as const;
export type SignInPortal = (typeof SIGN_IN_PORTALS)[number];

/** The person's portals that exist as places to go, in offer order, without repeats. */
export function signInPortals(available: readonly string[], isPlatformAdmin: boolean): SignInPortal[] {
  const keys = new Set(available.map((k) => (k === "committee" || k === "payment_authoriser" ? "owner" : k)));
  if (isPlatformAdmin) keys.add("admin");
  return SIGN_IN_PORTALS.filter((p) => keys.has(p));
}

export type AfterSignIn = { kind: "go"; path: string } | { kind: "choose" };

export function afterSignIn(portals: readonly SignInPortal[], next: string | null | undefined): AfterSignIn {
  const back = safeNextPath(next ?? null);
  if (back) return { kind: "go", path: back };
  if (portals.length > 1) return { kind: "choose" };
  return { kind: "go", path: `/${portals[0] ?? "owner"}` };
}
