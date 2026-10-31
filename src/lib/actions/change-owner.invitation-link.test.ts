import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A change of owner's invitation under security stage S2a (merge of
 * remediation/s2a into fix/s9-tenant-boundary, 31 Oct 2026). A new, reused or
 * reopened OWNER invitation is emailed with a fresh one-time /join#<token>
 * link whose token is stored only as its SHA-256, never with a plain id. The
 * invitee's account is prepared, and the email sent, only after the change
 * commits, so no Auth call is made while a transaction holds row locks. Its
 * acceptance from the link restarts an ended owner access through
 * restartOwnerAccess, so the earlier lot is kept in owner_lot_history.
 *
 * The real change-of-owner and /join actions run against the in-memory ORM
 * and the stand-in Auth admin API; Resend, rate limits, the audit log and the
 * Supabase sign-in are faked. Synthetic data only (made-up owners at x.test).
 */

const who = vi.hoisted(() => ({ profile: null as null | Record<string, unknown> }));
const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; html: string }> }));
const limits = vi.hoisted(() => ({ allow: true }));
const audit = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));
/** Open transactions, and every Auth admin call made while one was open (must stay empty). */
const tx = vi.hoisted(() => ({ depth: 0, authCallsInTransaction: [] as string[] }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword: async () => ({ data: { user: { id: "u" }, session: { access_token: "x.e30.y" } }, error: null }) },
  }),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
  // Every Auth admin call notes whether a transaction was open at the time.
  const watched = (name: string, fn: (...a: never[]) => unknown) => (...a: never[]) => {
    if (tx.depth > 0) tx.authCallsInTransaction.push(name);
    return fn(...a);
  };
  return {
    createAdminClient: () => {
      const a = sharedFakeAuth.client.auth.admin;
      return {
        auth: {
          admin: {
            createUser: watched("createUser", a.createUser as never),
            getUserById: watched("getUserById", a.getUserById as never),
            updateUserById: watched("updateUserById", a.updateUserById as never),
            deleteUser: watched("deleteUser", a.deleteUser as never),
          },
        },
      };
    },
  };
});
vi.mock("@/lib/invitations/auth-users", async () => {
  const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
  return {
    findAuthUsersByEmail: (email: string) => {
      if (tx.depth > 0) tx.authCallsInTransaction.push("findAuthUsersByEmail");
      return sharedFakeAuth.findByEmail(email);
    },
  };
});
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { to: string; subject: string; html: string }) => {
    if (tx.depth > 0) tx.authCallsInTransaction.push("sendEmail");
    mail.sent.push(e);
    return true;
  }),
}));
vi.mock("@/lib/auth/rate-limit-db", () => ({
  clientIp: (h: Headers) => h.get("x-forwarded-for"),
  hitRateLimit: vi.fn(async () => limits.allow),
  hitRateLimits: vi.fn(async () => limits.allow),
}));
vi.mock("@/lib/audit/security-audit", () => ({
  recordSecurityEvent: vi.fn(async (e: Record<string, unknown>) => {
    audit.events.push(e);
  }),
  recordSecurityEventLater: vi.fn(async (e: Record<string, unknown>) => {
    audit.events.push(e);
  }),
  recordActionInvocation: vi.fn(async () => {}),
}));
vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(async () => {}),
  logActivityTx: vi.fn(async (t: { orm: { public: { ActivityLog: { create: (r: Record<string, unknown>) => Promise<unknown> } } } }, a: Record<string, unknown>) => {
    await t.orm.public.ActivityLog.create({ ...a });
  }),
}));
vi.mock("@/lib/queries/profiles", () => ({
  getCurrentProfile: vi.fn(async () => who.profile),
  getAvailablePortals: async () => ["owner"],
}));
vi.mock("@/lib/auth/current-session", () => ({
  getCurrentSession: vi.fn(async () => (who.profile ? { profile: who.profile, user: { id: who.profile.authId, email: who.profile.email } } : null)),
}));
vi.mock("@/lib/auth/mfa-enforcement", () => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeNameById: async () => "Opera House" }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: async () => "2026-10-31" }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const { statutoryRulesFor } = await import("@/config/statutory");
  return { rulesForScheme: async () => ({ rules: statutoryRulesFor("NSW"), label: "AU-NSW test" }) };
});
vi.mock("@/lib/storage/uploads", () => ({ verifyUpload: vi.fn(), consumeUpload: vi.fn(), uploadErrorMessage: () => null }));
vi.mock("@/lib/vault/capture", () => ({ getTrialVault: async () => null }));
vi.mock("@/lib/vault/sources", () => ({ captureLibraryDocument: vi.fn(), captureQuietly: vi.fn(async () => null) }));
vi.mock("@/lib/billing/capture", () => ({ quoteUsageFee: vi.fn(async () => null), captureUsageFee: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
const { newLinkToken } = await import("@/lib/invitations/link-token");
const { changeOwnerAction } = await import("./change-owner");
const realTransaction = sharedFake.db.transaction;
const { lookupJoinLinkAction, completeJoinAction, acceptJoinAction } = await import("@/app/join/actions");

const ADVISER = { id: "p-adviser", authId: "a-adviser", email: "adviser@x.test", firstName: "Ada", lastName: "Adviser", isPlatformAdmin: false };
/** Someone who owned Lot 2 before, sold it, and is now buying Lot 1. */
const RETURNING = { id: "p-new", authId: "00000000-0000-4000-8000-0000000000ff", email: "new@x.test", firstName: "Nia", lastName: "New", isPlatformAdmin: false };
const valid = { ownerName: "Ms Nia New", email: "new@x.test", settlementDate: "2026-10-30", invite: "on" };
const GOOD = "Harbour-View-2026!";

const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
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
const invitation = () => sharedFake.table("Invitation").find((i) => i.email === "new@x.test")!;

/** The one email sent, and the token in its link. */
function theEmail() {
  expect(mail.sent).toHaveLength(1);
  const [email] = mail.sent;
  const links = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const join = links.filter((l) => /\/join#/.test(l));
  expect(join).toHaveLength(1);
  const token = join[0].match(/\/join#([A-Za-z0-9_-]{43})$/)?.[1] ?? null;
  expect(token).not.toBeNull();
  return { email, token: token!, links };
}

/** Never a plain id: neither the invitation's id, nor its stored hash, nor any uuid, nor the old /invitations link. */
function expectNoPlainId(html: string, links: string[]) {
  const row = invitation();
  expect(html).not.toContain(String(row.id));
  expect(html).not.toContain(String(row.tokenHash));
  expect(html).not.toMatch(UUID);
  expect(links.some((l) => /\/invitations/.test(l) || /[?&](token|id|invitation)=/.test(l))).toBe(false);
}

function expectNoAuthCallInTransaction() {
  expect(tx.authCallsInTransaction).toEqual([]);
}

beforeEach(() => {
  who.profile = ADVISER;
  mail.sent = [];
  limits.allow = true;
  audit.events = [];
  tx.depth = 0;
  tx.authCallsInTransaction = [];
  sharedFakeAuth.reset();
  sharedFake.reset({
    Scheme: [{ id: "S1", name: "Opera House" }],
    Lot: [{ id: "L1", schemeId: "S1", lotNumber: "1" }, { id: "L2", schemeId: "S1", lotNumber: "2" }],
    LotDetail: [{ id: "ld1", lotId: "L1", rollOwnerName: "Ms Cate Blanchett", ownerEmail: "cate@x.test" }],
    Profile: [ADVISER, { id: "p-cate", email: "cate@x.test", firstName: "Cate", lastName: "Blanchett" }],
    SchemeMembership: [
      { id: "m1", schemeId: "S1", lotId: "L1", role: "OWNER", isActive: true, profileId: "p-cate" },
      { id: "m-adviser", schemeId: "S1", lotId: null, role: "ADVISER", isActive: true, profileId: ADVISER.id },
    ],
    LotDeliveryPreference: [],
    Invitation: [],
    OwnerChangeRequest: [],
    OwnerLotHistory: [],
    ActivityLog: [],
  });
  sharedFake.setUniqueKeys({ Invitation: [["schemeId", "email", "role"]] });
  // Count open transactions, to show the Auth calls and the email come after the commit.
  const real = realTransaction;
  vi.spyOn(sharedFake.db, "transaction").mockImplementation((async (fn: never) => {
    tx.depth++;
    try {
      return await real(fn);
    } finally {
      tx.depth--;
    }
  }) as never);
});

describe("a change of owner's invitation uses the S2a one-time link", () => {
  it("NEW: emailed as /join#<token>, stored only as its SHA-256, with the account made after the commit; the link sets up the account once", async () => {
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("An invitation has been sent to new@x.test.");

    const row = invitation();
    expect(row).toMatchObject({ schemeId: "S1", role: "OWNER", lotId: "L1", status: "PENDING", tokenUsedAt: null, invitedById: ADVISER.id });
    expect(row).not.toHaveProperty("token");
    const { email, token, links } = theEmail();
    expect(email.to).toBe("new@x.test");
    expect(token).toHaveLength(43); // 32 random bytes, base64url: 256 bits
    expect(row.tokenHash).toBe(sha(token));
    expectNoPlainId(email.html, links);

    // The account was made on the server, unconfirmed and without a password, and recorded on the invitation.
    const [user] = [...sharedFakeAuth.users.values()];
    expect(user).toMatchObject({ email: "new@x.test" });
    expect(user.password).toBeUndefined();
    expect(user.email_confirmed_at).toBeUndefined();
    expect(row.accountAuthId).toBe(user.id);
    expectNoAuthCallInTransaction();

    // S2a's neutral events: the building's says only that it was sent; the new account's has no building.
    expect(audit.events).toContainEqual(
      expect.objectContaining({ action: "invitation.sent", schemeId: "S1", resourceId: row.id, metadata: expect.objectContaining({ via: "owner_change", resent: false }) }),
    );
    const created = audit.events.find((e) => e.action === "account.created_for_invitation");
    expect(created).toBeDefined();
    expect(created).not.toHaveProperty("schemeId");

    // The link sets the password and accepts, once.
    who.profile = null;
    expect(await lookupJoinLinkAction(token)).toMatchObject({ state: "set-password" });
    expect(await redirected(completeJoinAction({}, form({ token, password: GOOD, confirmPassword: GOOD })))).not.toBeNull();
    expect(invitation()).toMatchObject({ status: "ACCEPTED" });
    expect(sharedFake.table("SchemeMembership").filter((m) => m.role === "OWNER" && m.isActive)).toEqual([
      expect.objectContaining({ lotId: "L1", profileId: expect.any(String) }),
    ]);
    expect(await lookupJoinLinkAction(token)).toMatchObject({ state: "invalid" });
  });

  it.each(["DECLINED", "EXPIRED", "PENDING"])(
    "reused (%s): a new token replaces the old one; only the new link works, and the email carries no plain id",
    async (status) => {
      const old = newLinkToken();
      sharedFake.table("Invitation").push({
        id: "i-old",
        schemeId: "S1",
        email: "new@x.test",
        role: "OWNER",
        status,
        lotId: "L2",
        expiresAt: "2020-01-01T00:00:00.000Z",
        invitedById: "p-x",
        tokenHash: old.hash,
        tokenUsedAt: null,
        accountAuthId: null,
      });
      const r = await changeOwnerAction("S1", "L1", {}, form(valid));
      expect(r.done).toContain("An invitation has been sent to new@x.test.");

      const { email, token, links } = theEmail();
      expect(sharedFake.table("Invitation")).toHaveLength(1);
      expect(invitation()).toMatchObject({ id: "i-old", status: "PENDING", lotId: "L1", tokenHash: sha(token), tokenUsedAt: null });
      expect(token).not.toBe(old.token);
      expectNoPlainId(email.html, links);
      expect(email.html).not.toContain("i-old");
      expectNoAuthCallInTransaction();
      expect(audit.events).toContainEqual(
        expect.objectContaining({ action: "invitation.sent", metadata: expect.objectContaining({ resent: true, previousStatus: status, via: "owner_change" }) }),
      );

      who.profile = null;
      expect(await lookupJoinLinkAction(old.token)).toMatchObject({ state: "invalid" });
      expect(await lookupJoinLinkAction(token)).toMatchObject({ state: "set-password" });
    },
  );

  it("REOPEN: an accepted invitation whose access ended is reopened with a new link; accepting from it restarts the access on this lot and writes owner_lot_history", async () => {
    sharedFakeAuth.addUser({ id: RETURNING.authId, email: RETURNING.email, email_confirmed_at: "2025-01-01T00:00:00Z", last_sign_in_at: "2025-01-02T00:00:00Z" });
    sharedFake.table("Profile").push({ ...RETURNING });
    sharedFake.table("SchemeMembership").push({
      id: "m-new",
      schemeId: "S1",
      lotId: "L2",
      role: "OWNER",
      isActive: false,
      profileId: RETURNING.id,
      startDate: "2025-01-01T00:00:00.000Z",
      endDate: "2026-10-20T00:00:00.000Z",
    });
    sharedFake.table("Invitation").push({
      id: "i-acc",
      schemeId: "S1",
      email: "new@x.test",
      role: "OWNER",
      status: "ACCEPTED",
      lotId: "L2",
      expiresAt: "2025-01-15T00:00:00.000Z",
      acceptedAt: "2025-01-01T00:00:00.000Z",
      invitedById: "p-x",
      tokenHash: "b".repeat(64),
      tokenUsedAt: "2025-01-01T00:00:00.000Z",
      accountAuthId: null,
    });

    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("An invitation has been sent to new@x.test.");
    const { email, token, links } = theEmail();
    expect(invitation()).toMatchObject({ id: "i-acc", status: "PENDING", lotId: "L1", acceptedAt: null, tokenHash: sha(token), tokenUsedAt: null });
    // They already have an account: none is made, and the invitation is not tied to one.
    expect(sharedFakeAuth.calls.createUser).toEqual([]);
    expect(invitation().accountAuthId).toBeNull();
    expectNoPlainId(email.html, links);
    expect(email.html).not.toContain("i-acc");
    expectNoAuthCallInTransaction();

    // Signed in with the invited address, they accept from the link.
    who.profile = RETURNING;
    expect(await lookupJoinLinkAction(token)).toMatchObject({ state: "sign-in", signedIn: "invitee" });
    expect(await redirected(acceptJoinAction({}, form({ token })))).not.toBeNull();
    expect(invitation()).toMatchObject({ status: "ACCEPTED", tokenUsedAt: expect.any(String) });
    expect(sharedFake.table("SchemeMembership").filter((m) => m.profileId === RETURNING.id)).toEqual([
      expect.objectContaining({ id: "m-new", lotId: "L1", isActive: true, endDate: null, isTreasurer: false }),
    ]);
    expect(sharedFake.table("OwnerLotHistory")).toEqual([
      expect.objectContaining({ schemeId: "S1", lotId: "L2", profileId: RETURNING.id, membershipId: "m-new", startedAt: "2025-01-01T00:00:00.000Z", endedAt: "2026-10-20T00:00:00.000Z" }),
    ]);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "invitation.accept", outcome: "allowed", resourceId: "i-acc" }));
  });
});

describe("after the commit, the link is emailed only while it still works", () => {
  it("an invitation sent again before the email goes out (its link replaced) is not emailed with the dead link", async () => {
    // Between the commit and the account step, the Adviser sends it again from the Members page.
    const createUser = sharedFakeAuth.client.auth.admin.createUser;
    const spy = vi.spyOn(sharedFakeAuth.client.auth.admin, "createUser").mockImplementationOnce(async (attrs) => {
      Object.assign(invitation(), { tokenHash: "c".repeat(64) });
      return createUser(attrs);
    });
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    spy.mockRestore();
    expect(r.done).toContain("is now the owner of Lot 1");
    expect(r.done).toContain("An invitation to new@x.test is saved, but it could not be emailed just now.");
    expect(mail.sent).toEqual([]);
    expect(audit.events.some((e) => e.action === "invitation.sent")).toBe(false);
  });

  it.each([
    ["revoked", { status: "EXPIRED", tokenHash: null }],
    ["its link used", { tokenUsedAt: "2026-10-31T00:00:00.000Z" }],
    ["accepted", { status: "ACCEPTED" }],
  ])("an invitation %s between the commit and the delivery is not emailed", async (_what, change) => {
    const createUser = sharedFakeAuth.client.auth.admin.createUser;
    const spy = vi.spyOn(sharedFakeAuth.client.auth.admin, "createUser").mockImplementationOnce(async (attrs) => {
      Object.assign(invitation(), change);
      return createUser(attrs);
    });
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    spy.mockRestore();
    expect(r.done).toContain("is now the owner of Lot 1");
    expect(r.done).toContain("could not be emailed just now");
    expect(mail.sent).toEqual([]);
    expect(audit.events.some((e) => e.action === "invitation.sent")).toBe(false);
    // The account is not recorded on an invitation this link no longer opens.
    expect(invitation().accountAuthId ?? null).toBeNull();
  });

  it("S2a's sending limits apply: over the limit, the change is saved and nothing is emailed or created in Auth", async () => {
    limits.allow = false;
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("is now the owner of Lot 1");
    expect(r.done).toContain("could not be emailed just now");
    expect(sharedFake.table("SchemeMembership").find((m) => m.id === "m1")?.isActive).toBe(false);
    expect(mail.sent).toEqual([]);
    expect(sharedFakeAuth.calls.createUser).toEqual([]);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "invitation.send", outcome: "denied", reason: "too many invitations" }));
  });
});
