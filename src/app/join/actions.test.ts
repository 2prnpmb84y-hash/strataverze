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
/** The signed-in person: their profile, and the address the Auth server holds (the profile's, unless a test sets authEmail). */
const who = vi.hoisted(() => ({ profile: null as null | Record<string, unknown>, authEmail: null as null | string }));
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
  getCurrentSession: async () =>
    who.profile ? { profile: who.profile, user: { id: who.profile.authId ?? "auth-x", email: who.authEmail ?? who.profile.email } } : null,
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
const { acceptInvitationAction, declineInvitationAction } = await import("@/app/(portal)/invitations/actions");
const { revokeInvitation } = await import("@/lib/queries/invitations");

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
  who.authEmail = null;
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
    // Revoked by the Adviser: revoking really clears the hash, so the link matches nothing.
    const revoked = newLinkToken();
    sharedFake.table("Invitation").push({ id: "inv-rev", schemeId: SCHEME, email: "revoked@example.test", role: "OWNER", lotId: "lot-1", status: "PENDING", tokenHash: revoked.hash, tokenUsedAt: null, accountAuthId: null, expiresAt: inFuture, invitedById: "p-adviser" });
    expect(await lookupJoinLinkAction(revoked.token)).toMatchObject({ state: "sign-in" });
    await revokeInvitation(SCHEME, "inv-rev");
    expect(invitation("inv-rev")).toMatchObject({ status: "EXPIRED", tokenHash: null });
    await invalid(revoked.token);
    const messages = new Set<string>();
    for (const t of [newLinkToken().token, "x", newLink.token, oldLink.token, revoked.token]) {
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
      expect.arrayContaining(["invitation.link_detail:allowed", "invitation.accept:allowed", "auth.sign_in:allowed"]),
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
    expect(invitation("inv-new").tokenUsedAt).toBeNull();
  });

  // isUnclaimed: any one of these marks the account as set up.
  for (const field of ["email_confirmed_at", "confirmed_at", "last_sign_in_at"] as const) {
    it(`treats an account with ${field} as set up, and sets no password`, async () => {
      sharedFakeAuth.users.get(NEW_AUTH)![field] = "2026-10-30T00:00:00Z";
      expect(await submit()).toMatchObject({ signInInstead: true });
      expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
      expect(invitation("inv-new")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    });
  }

  it("treats an account with none of them as not yet set up", async () => {
    const { inviteeSetupState } = await import("@/lib/invitations/accounts");
    expect(await inviteeSetupState(NEW_AUTH, "new.owner@example.test")).toBe("ready");
    expect(await inviteeSetupState(NEW_AUTH, "someone.else@example.test")).toBe("unavailable");
    expect(await inviteeSetupState("00000000-0000-4000-8000-0000000000ff", "new.owner@example.test")).toBe("unavailable");
  });

  it("of two uses of the same link at once, exactly one succeeds", async () => {
    const results = await Promise.allSettled([submit(), submit({ password: "Another-Pass-2026!", confirmPassword: "Another-Pass-2026!" })]);
    const outcomes = await Promise.all(results.map(async (r) => (r.status === "rejected" ? `redirect:${String(r.reason?.message).replace(/^REDIRECT:/, "")}` : `error:${r.value.error}`)));
    expect(outcomes.filter((o) => o === "redirect:/owner")).toHaveLength(1);
    expect(outcomes.filter((o) => o.startsWith("error:") && o.includes("not valid"))).toHaveLength(1);
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(1);
    expect(sharedFake.table("SchemeMembership")).toHaveLength(1);
    expect(sharedFake.table("Profile").filter((p) => p.authId === NEW_AUTH)).toHaveLength(1);
  });

  it("of two links for the same new account used at once, only one sets the password (L2)", async () => {
    // A second building invited the same new address: the same Auth user, another link.
    const OTHER = "88888888-0000-4000-8000-000000000002";
    const second = newLinkToken();
    sharedFake.table("Scheme").push({ id: OTHER, name: "SP 88888 Other House" });
    sharedFake.table("Invitation").push({ id: "inv-new-2", schemeId: OTHER, email: "new.owner@example.test", role: "COMMITTEE", lotId: null, status: "PENDING", tokenHash: second.hash, tokenUsedAt: null, accountAuthId: NEW_AUTH, expiresAt: inFuture, invitedById: "p-adviser" });
    const viaSecond = completeJoinAction({}, form({ token: second.token, password: "Second-Pass-2026!", confirmPassword: "Second-Pass-2026!" }));
    const results = await Promise.allSettled([submit(), viaSecond]);
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(1);
    const ok = results.filter((r) => r.status === "rejected" && /^REDIRECT:\/owner$/.test(String(r.reason?.message)));
    expect(ok).toHaveLength(1);
    const refused = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ signInInstead?: boolean }>[];
    expect(refused).toHaveLength(1);
    expect(refused[0].value).toMatchObject({ signInInstead: true });
    // The other invitation is untouched, and waits under Invitations once they sign in.
    const loser = ["inv-new", "inv-new-2"].map(invitation).find((i) => i.status === "PENDING")!;
    expect(loser.tokenUsedAt).toBeNull();
  });

  it("locks every pending invitation for the account, with a lock timeout, before claiming", async () => {
    await redirected(submit());
    expect(sharedFake.statements).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sharedFake.statements).toContain("SET LOCAL statement_timeout = '10s'");
    expect(sharedFake.statements).toContain("SET LOCAL idle_in_transaction_session_timeout = '20s'");
    expect(sharedFake.locks).toContainEqual({ table: "Invitation", ids: ["inv-new"], inTransaction: true });
  });

  it("a revoke that lands while the password is being set waits, and finds the invitation accepted", async () => {
    let revoking: Promise<unknown> | null = null;
    sharedFakeAuth.hooks.duringUpdateUserById = () => {
      revoking = revokeInvitation(SCHEME, "inv-new");
    };
    expect(await redirected(submit())).toBe("/owner");
    expect(revoking).not.toBeNull();
    await revoking;
    expect(invitation("inv-new")).toMatchObject({ status: "ACCEPTED" });
    expect(invitation("inv-new").tokenHash).toBe(newLink.hash);
    expect(sharedFake.table("SchemeMembership")).toEqual([expect.objectContaining({ role: "OWNER", isActive: true })]);
  });

  it("a revoke cannot wait on the set-up for ever: it gives up at its lock timeout (M-2)", async () => {
    sharedFake.setLockTimeoutMs(20);
    let revokeResult: Promise<unknown> | null = null;
    sharedFakeAuth.hooks.duringUpdateUserById = async () => {
      revokeResult = revokeInvitation(SCHEME, "inv-new").then(
        () => "revoked",
        (err: { sqlState?: string }) => err.sqlState,
      );
      // Auth is slow to answer while the set-up holds the lock.
      await new Promise((r) => setTimeout(r, 80));
    };
    expect(await redirected(submit())).toBe("/owner");
    expect(await revokeResult).toBe("55P03");
    expect(invitation("inv-new").status).toBe("ACCEPTED");
  });

  it("treats an Auth error after the password took as ambiguous: reads again, and sends them to sign in (M-2)", async () => {
    sharedFakeAuth.failures.updateUserByIdAfterApplying = "request_timeout";
    const r = await submit();
    expect(r).toMatchObject({ signInInstead: true, error: expect.stringContaining("may have been set") });
    // Nothing claimed or accepted here: the invitation waits under Invitations.
    expect(invitation("inv-new")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    expect(sharedFake.table("SchemeMembership")).toHaveLength(0);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "invitation.link_detail", reason: "password may be set, invitation not accepted" }));
  });

  it("asks them to try again when Auth cannot be reached, and changes nothing (M-2)", async () => {
    sharedFakeAuth.failures.getUserById = "request_timeout";
    const r = await submit();
    expect(r.error).toContain("try again");
    expect(r.linkDone).toBeFalsy();
    expect(invitation("inv-new")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    expect(sharedFakeAuth.calls.updateUserById).toHaveLength(0);
  });

  it("a revoke that lands first leaves the account with no password", async () => {
    await revokeInvitation(SCHEME, "inv-new");
    expect((await submit()).error).toContain("not valid");
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
    expect(r.linkDone).toBeFalsy();
    expect(invitation("inv-new")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    expect(sharedFake.table("Profile").filter((p) => p.authId === NEW_AUTH)).toHaveLength(0);
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

  it("matches the Auth address, not a stale profile copy (L7)", async () => {
    // The profile still says the invited address; the Auth account has moved on.
    who.profile = { id: "p-existing", authId: "auth-existing", email: "existing.owner@example.test", isPlatformAdmin: false };
    who.authEmail = "moved.on@example.test";
    const r = await accept();
    expect(r.error).toContain("cannot be shown or accepted");
    expect(r.error).not.toContain("existing.owner");
    expect(invitation("inv-old")).toMatchObject({ status: "PENDING", tokenUsedAt: null });
    expect(sharedFake.table("SchemeMembership")).toHaveLength(0);
    // The page says the address cannot be confirmed (L-d).
    expect(await lookupJoinLinkAction(oldLink.token)).toMatchObject({ state: "sign-in", signedIn: "unconfirmed" });
  });

  it("refuses when the Auth address is the invited one but the profile copy is not (L7)", async () => {
    who.profile = { id: "p-other", authId: "auth-other", email: "someone.else@example.test", isPlatformAdmin: false };
    who.authEmail = "existing.owner@example.test";
    expect((await accept()).error).toContain("cannot be shown or accepted");
    expect(invitation("inv-old").status).toBe("PENDING");
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

  it("refuses, neutrally, when the profile's address differs from the Auth address (L7)", async () => {
    who.profile = { id: "p-existing", email: "existing.owner@example.test", isPlatformAdmin: false };
    who.authEmail = "moved.on@example.test";
    expect((await acceptInvitationAction("inv-old")).error).toContain("cannot be shown or accepted");
    expect((await declineInvitationAction("inv-old")).error).toContain("cannot be shown or accepted");
    expect(invitation("inv-old").status).toBe("PENDING");
  });
});

describe("the building's security events (L1)", () => {
  /** The events the building's Adviser can read: those carrying the building. */
  const scoped = () => audit.events.filter((e) => e.schemeId);
  const shape = (e: Record<string, unknown>) =>
    `${e.action}:${e.outcome}:${e.reason}:${e.actorProfileId ? "profile" : "-"}:${e.actorAuthId ? "auth" : "-"}`;

  it("look the same whether the invitee's account was new or existing", async () => {
    await redirected(completeJoinAction({}, form({ token: newLink.token, password: GOOD, confirmPassword: GOOD })));
    const forNew = scoped().map(shape);
    audit.events = [];
    who.profile = { id: "p-existing", authId: "auth-existing", email: "existing.owner@example.test", isPlatformAdmin: false };
    await redirected(acceptJoinAction({}, form({ token: oldLink.token })));
    const forExisting = scoped().map(shape);
    expect(forNew).toEqual(forExisting);
    expect(forNew).toEqual(["invitation.accept:allowed:accepted from link:profile:auth"]);
  });

  it("refused links look the same too, outcome included (L-a)", async () => {
    // New account: Auth refuses the password (a failure).
    sharedFakeAuth.failures.updateUserById = "unexpected_failure";
    await completeJoinAction({}, form({ token: newLink.token, password: GOOD, confirmPassword: GOOD }));
    const forNew = scoped().map(shape);
    audit.events = [];
    // Existing account: signed in as someone else (a denial).
    who.profile = { id: "p-other", authId: "auth-other", email: "someone.else@example.test", isPlatformAdmin: false };
    await acceptJoinAction({}, form({ token: oldLink.token }));
    const forExisting = scoped().map(shape);
    expect(forNew).toEqual(forExisting);
    expect(forNew).toEqual(["invitation.link:denied:link not used:-:-"]);
    // The real outcomes are kept, with no building.
    const detail = audit.events.filter((e) => e.action === "invitation.link_detail");
    expect(detail.map((e) => `${e.outcome}:${e.reason}`)).toEqual(["denied:signed in as a different address"]);
  });

  it("never say new, existing, account or password in an event with the building", async () => {
    // Failures on both paths.
    sharedFakeAuth.failures.updateUserById = "unexpected_failure";
    await completeJoinAction({}, form({ token: newLink.token, password: GOOD, confirmPassword: GOOD }));
    sharedFakeAuth.failures.updateUserById = null;
    sharedFakeAuth.users.get(NEW_AUTH)!.email = "attacker@example.test";
    await completeJoinAction({}, form({ token: newLink.token, password: GOOD, confirmPassword: GOOD }));
    who.profile = { id: "p-other", authId: "auth-other", email: "someone.else@example.test", isPlatformAdmin: false };
    await acceptJoinAction({}, form({ token: oldLink.token }));
    expect(scoped().length).toBeGreaterThan(0);
    for (const e of scoped()) {
      const { resourceId: _id, ...rest } = e;
      expect(JSON.stringify(rest)).not.toMatch(/new|existing|account|password|address/i);
      expect(["link not used", "accepted from link", "could not accept"]).toContain(e.reason);
    }
    // The detail is kept, in events with no building.
    const detail = audit.events.filter((e) => e.action === "invitation.link_detail").map((e) => e.reason);
    expect(detail).toEqual(expect.arrayContaining(["password not set", "account not available", "signed in as a different address"]));
    expect(audit.events.filter((e) => e.action === "invitation.link_detail").every((e) => !e.schemeId)).toBe(true);
  });
});
