import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /join link (security stage S2a): someone new sets a password and
 * accepts; someone with an account accepts when signed in as the invited
 * address. Supabase (admin API and sign-in), the database, rate limits and
 * the audit log are faked. Synthetic data only: SP 99999 and made-up owners
 * at example.test. The passwords are made-up test values.
 */

const limits = vi.hoisted(() => ({ allow: true }));
const audit = vi.hoisted(() => ({ events: [] as Record<string, unknown>[] }));
const who = vi.hoisted(() => ({ profile: null as null | Record<string, unknown> }));
const signIns = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], fail: false }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/supabase/admin", async () => {
  const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
  return { createAdminClient: () => sharedFakeAuth.client };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async (args: Record<string, unknown>) => {
        signIns.calls.push(args);
        if (signIns.fail) return { data: { user: null, session: null }, error: { code: "captcha_failed", message: "captcha" } };
        return { data: { user: { id: "u" }, session: { access_token: "x.e30.y" } }, error: null };
      },
    },
  }),
}));
vi.mock("@/lib/auth/rate-limit-db", () => ({
  clientIp: (h: Headers) => h.get("x-forwarded-for"),
  hitRateLimit: vi.fn(async () => limits.allow),
  hitRateLimits: vi.fn(async () => limits.allow),
}));
vi.mock("@/lib/audit/security-audit", () => ({
  recordSecurityEventLater: vi.fn(async (e: Record<string, unknown>) => {
    audit.events.push(e);
  }),
  recordSecurityEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/current-session", () => ({
  getCurrentSession: async () => (who.profile ? { profile: who.profile } : null),
}));
vi.mock("@/lib/queries/profiles", () => ({
  getCurrentProfile: async () => who.profile,
  getAvailablePortals: async () => ["owner"],
}));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/capture", () => ({ quoteUsageFee: vi.fn(async () => null), captureUsageFee: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
const { newLinkToken } = await import("@/lib/invitations/link-token");
const { lookupJoinLinkAction, completeJoinAction, acceptJoinAction } = await import("./actions");
const { acceptInvitationAction } = await import("@/app/(portal)/invitations/actions");

const SCHEME = "99999999-0000-4000-8000-000000000001";
const NEW_AUTH = "00000000-0000-4000-8000-0000000000aa";
const GOOD = "Harbour-View-2026!";
const inFuture = new Date(Date.now() + 7 * 86_400_000).toISOString();

let newLink: { token: string; hash: string };
let oldLink: { token: string; hash: string };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** The redirect an action ended with, or null. */
async function redirected(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    const m = err instanceof Error ? err.message.match(/^REDIRECT:(.*)$/) : null;
    if (m) return m[1];
    throw err;
  }
}

beforeEach(() => {
  limits.allow = true;
  audit.events = [];
  who.profile = null;
  signIns.calls = [];
  signIns.fail = false;
  newLink = newLinkToken();
  oldLink = newLinkToken();
  sharedFakeAuth.reset();
  sharedFakeAuth.addUser({ id: NEW_AUTH, email: "new.owner@example.test" });
  sharedFake.reset({
    Scheme: [{ id: SCHEME, name: "SP 99999 Test Towers" }],
    Lot: [{ id: "lot-1", schemeId: SCHEME, lotNumber: "1" }],
    Profile: [{ id: "p-existing", authId: "auth-existing", email: "existing.owner@example.test", isPlatformAdmin: false }],
    SchemeMembership: [],
    ActivityLog: [],
    Invitation: [
      // For someone new: the server made their Auth user.
      { id: "inv-new", schemeId: SCHEME, email: "new.owner@example.test", role: "OWNER", lotId: "lot-1", status: "PENDING", tokenHash: newLink.hash, tokenUsedAt: null, accountAuthId: NEW_AUTH, expiresAt: inFuture, invitedById: "p-adviser" },
      // For someone with an account already.
      { id: "inv-old", schemeId: SCHEME, email: "existing.owner@example.test", role: "COMMITTEE", lotId: null, status: "PENDING", tokenHash: oldLink.hash, tokenUsedAt: null, accountAuthId: null, expiresAt: inFuture, invitedById: "p-adviser" },
    ],
  });
});

const invitation = (id: string) => sharedFake.table("Invitation").find((i) => i.id === id)!;

describe("opening the link", () => {
  it("shows the set-password form for an account the server made, with the address masked", async () => {
    const v = await lookupJoinLinkAction(newLink.token);
    expect(v).toMatchObject({ state: "set-password", details: { schemeName: "SP 99999 Test Towers", roleLabel: "Owner", lotNumber: "1", maskedEmail: "ne***@ex***.test" } });
    expect(JSON.stringify(v)).not.toContain("new.owner@example.test");
  });

  it("asks someone with an account to sign in, and knows if they already have", async () => {
    expect(await lookupJoinLinkAction(oldLink.token)).toMatchObject({ state: "sign-in", signedIn: "nobody" });
    who.profile = { id: "p-existing", email: "existing.owner@example.test" };
    expect(await lookupJoinLinkAction(oldLink.token)).toMatchObject({ state: "sign-in", signedIn: "invitee" });
    who.profile = { id: "p-other", email: "someone.else@example.test" };
    expect(await lookupJoinLinkAction(oldLink.token)).toMatchObject({ state: "sign-in", signedIn: "someone-else" });
  });

  it("gives one answer for a made-up, malformed, expired, used or revoked link", async () => {
    const invalid = async (t: string) => expect(await lookupJoinLinkAction(t)).toMatchObject({ state: "invalid" });
    await invalid(newLinkToken().token);
    await invalid("not-a-token");
    await invalid(newLink.hash); // the stored hash is not a working link
    invitation("inv-new").expiresAt = new Date(Date.now() - 1000).toISOString();
    await invalid(newLink.token);
    invitation("inv-old").tokenUsedAt = new Date().toISOString();
    await invalid(oldLink.token);
    const messages = new Set<string>();
    for (const t of [newLinkToken().token, "x", newLink.token, oldLink.token]) {
      const v = await lookupJoinLinkAction(t);
      if (v.state === "invalid") messages.add(v.message);
    }
    expect(messages.size).toBe(1);
  });

  it("is rate limited", async () => {
    limits.allow = false;
    const v = await lookupJoinLinkAction(newLink.token);
    expect(v).toMatchObject({ state: "invalid", message: expect.stringContaining("Too many") });
  });

  it("changes nothing", async () => {
    await lookupJoinLinkAction(newLink.token);
    expect(invitation("inv-new")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
  });
});

describe("someone new setting a password", () => {
  const submit = (fields: Record<string, string> = {}) =>
    completeJoinAction({}, form({ token: newLink.token, password: GOOD, confirmPassword: GOOD, ...fields }));

  it("sets the password on the invited account, accepts, signs them in and goes to their portal", async () => {
    expect(await redirected(submit())).toBe("/owner");

    expect(sharedFakeAuth.calls.updateUserById).toEqual([{ id: NEW_AUTH, attributes: { password: GOOD, email_confirm: true } }]);
    const profile = sharedFake.table("Profile").find((p) => p.authId === NEW_AUTH);
    expect(profile).toMatchObject({ email: "new.owner@example.test" });
    expect(sharedFake.table("SchemeMembership")).toEqual([
      expect.objectContaining({ schemeId: SCHEME, profileId: profile!.id, role: "OWNER", lotId: "lot-1", isActive: true }),
    ]);
    expect(invitation("inv-new")).toMatchObject({ status: "ACCEPTED" });
    expect(invitation("inv-new").tokenUsedAt).toBeTruthy();
    expect(signIns.calls).toEqual([{ email: "new.owner@example.test", password: GOOD }]);
    expect(audit.events.map((e) => `${e.action}:${e.outcome}`)).toEqual(
      expect.arrayContaining(["invitation.link:allowed", "invitation.accept:allowed", "auth.sign_in:allowed"]),
    );
    // No password or token in any security event.
    expect(JSON.stringify(audit.events)).not.toContain(GOOD);
    expect(JSON.stringify(audit.events)).not.toContain(newLink.token);
  });

  it("works once", async () => {
    await redirected(submit());
    const again = await submit({ password: "Another-Pass-2026!", confirmPassword: "Another-Pass-2026!" });
    expect(again.error).toContain("not valid");
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(1);
    expect(sharedFakeAuth.users.get(NEW_AUTH)?.password).toBe(GOOD);
  });

  it("checks the password on the server and uses nothing until it passes", async () => {
    expect((await submit({ password: "short", confirmPassword: "short" })).fieldErrors?.password).toBeTruthy();
    expect((await submit({ password: "alllowercase1!", confirmPassword: "alllowercase1!" })).fieldErrors?.password).toBeTruthy();
    expect((await submit({ confirmPassword: "Different-2026!" })).fieldErrors?.confirmPassword).toBeTruthy();
    expect(invitation("inv-new").tokenUsedAt).toBeNull();
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
  });

  it("refuses when the Auth user does not carry the invited address", async () => {
    sharedFakeAuth.users.get(NEW_AUTH)!.email = "attacker@example.test";
    const r = await submit();
    expect(r.error).toContain("not valid");
    expect(invitation("inv-new").tokenUsedAt).toBeNull();
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
  });

  it("never sets a password on an account someone has already set up", async () => {
    sharedFakeAuth.users.get(NEW_AUTH)!.email_confirmed_at = "2026-10-30T00:00:00Z";
    const r = await submit();
    expect(r).toMatchObject({ signInInstead: true });
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
  });

  it("never sets a password on an existing account through its link", async () => {
    const r = await completeJoinAction({}, form({ token: oldLink.token, password: GOOD, confirmPassword: GOOD }));
    expect(r).toMatchObject({ signInInstead: true });
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
    expect(invitation("inv-old").tokenUsedAt).toBeNull();
  });

  it("gives the link back if the password cannot be set, so they can try again", async () => {
    sharedFakeAuth.failures.updateUserById = "unexpected_failure";
    const r = await submit();
    expect(r.error).toBeTruthy();
    expect(invitation("inv-new")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    sharedFakeAuth.failures.updateUserById = null;
    expect(await redirected(submit())).toBe("/owner");
  });

  it("is rate limited", async () => {
    limits.allow = false;
    expect((await submit()).error).toContain("Too many");
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
  });

  it("sends them to sign in if signing in straight away fails (CAPTCHA on, say)", async () => {
    signIns.fail = true;
    expect(await redirected(submit())).toBe(`/login?message=${encodeURIComponent("Your account is ready. Sign in with your new password.")}`);
    expect(invitation("inv-new").status).toBe("ACCEPTED");
  });
});

describe("someone with an account accepting from the link", () => {
  const accept = (token = oldLink.token) => acceptJoinAction({}, form({ token }));

  it("accepts when signed in as the invited address", async () => {
    who.profile = { id: "p-existing", email: "existing.owner@example.test", isPlatformAdmin: false };
    expect(await redirected(accept())).toBe("/owner");
    expect(invitation("inv-old").status).toBe("ACCEPTED");
    expect(sharedFake.table("SchemeMembership")).toEqual([expect.objectContaining({ profileId: "p-existing", role: "COMMITTEE", isActive: true })]);
  });

  it("refuses anyone else, and leaves the link unused", async () => {
    who.profile = { id: "p-other", email: "someone.else@example.test", isPlatformAdmin: false };
    const r = await accept();
    expect(r.error).toContain("different email address");
    expect(invitation("inv-old")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    expect(sharedFake.table("SchemeMembership")).toHaveLength(0);
  });

  it("asks someone signed out to sign in", async () => {
    expect(await accept()).toMatchObject({ signInInstead: true });
  });

  it("starts an ended membership afresh, without the treasurer flag", async () => {
    sharedFake.table("SchemeMembership").push({ id: "m-old", schemeId: SCHEME, profileId: "p-existing", role: "COMMITTEE", isActive: false, isTreasurer: true, endDate: "2026-01-01T00:00:00.000Z" });
    who.profile = { id: "p-existing", email: "existing.owner@example.test", isPlatformAdmin: false };
    expect(await redirected(accept())).toBe("/owner");
    expect(sharedFake.table("SchemeMembership")).toEqual([expect.objectContaining({ id: "m-old", isActive: true, isTreasurer: false, endDate: null })]);
  });
});

describe("the existing Invitations page flow", () => {
  it("still accepts an S2a invitation by id for the signed-in invited address", async () => {
    who.profile = { id: "p-existing", email: "existing.owner@example.test", isPlatformAdmin: false };
    const r = await acceptInvitationAction("inv-old");
    expect(r).toEqual({ success: true });
    expect(invitation("inv-old").status).toBe("ACCEPTED");
  });

  it("still refuses another address", async () => {
    who.profile = { id: "p-other", email: "someone.else@example.test", isPlatformAdmin: false };
    const r = await acceptInvitationAction("inv-old");
    expect(r.error).toBeTruthy();
    expect(invitation("inv-old").status).toBe("PENDING");
  });
});
