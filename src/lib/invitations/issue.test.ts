import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issuing an invitation (security stage S2a), with the Supabase admin API,
 * Resend and the database all faked. Synthetic data only: the test building
 * SP 99999 and made-up owners at example.test.
 */

const limits = vi.hoisted(() => ({ allow: true, checks: [] as [string, string | null | undefined][][] }));
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string }[], ok: true }));
const audit = vi.hoisted(() => ({ events: [] as Record<string, unknown>[] }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/supabase/admin", async () => {
  const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
  return { createAdminClient: () => sharedFakeAuth.client };
});
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { to: string; subject: string; html: string }) => {
    mail.sent.push(e);
    return mail.ok;
  }),
}));
vi.mock("@/lib/auth/rate-limit-db", () => ({
  hitRateLimits: vi.fn(async (checks: [string, string | null | undefined][]) => {
    limits.checks.push(checks);
    return limits.allow;
  }),
}));
vi.mock("@/lib/audit/security-audit", () => ({
  recordSecurityEventLater: vi.fn(async (e: Record<string, unknown>) => {
    audit.events.push(e);
  }),
}));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeNameById: async () => "SP 99999 Test Towers" }));
vi.mock("@/lib/invitations/auth-users", async () => {
  const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
  return { findAuthUsersByEmail: (email: string) => sharedFakeAuth.findByEmail(email) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
const { issueInvitation, isInvitableEmail, deliverInvitationLink } = await import("./issue");
const { inviteeSetupState } = await import("./accounts");

const SCHEME = "99999999-0000-4000-8000-000000000001";
const OTHER_SCHEME = "88888888-0000-4000-8000-000000000002";
const inviter = { id: "p-adviser", firstName: "Avery", lastName: "Adviser" };
const base = { schemeId: SCHEME, inviter, actorRole: "ADVISER" };

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const tokenFrom = (html: string) => html.match(/\/join#([A-Za-z0-9_-]{43})/)?.[1] ?? null;

beforeEach(() => {
  limits.allow = true;
  limits.checks = [];
  mail.sent = [];
  mail.ok = true;
  audit.events = [];
  sharedFakeAuth.reset();
  sharedFake.reset({
    Lot: [
      { id: "lot-1", schemeId: SCHEME, lotNumber: "1" },
      { id: "lot-x", schemeId: OTHER_SCHEME, lotNumber: "7" },
    ],
    Invitation: [],
    Profile: [{ id: "p-existing", authId: "auth-existing", email: "existing.owner@example.test" }],
    SchemeMembership: [],
  });
});

describe("issuing an invitation to an address with no account", () => {
  it("creates an unconfirmed Auth user with no password, and emails a one-time link stored only as a hash", async () => {
    const r = await issueInvitation({ ...base, email: " New.Owner@Example.test ", role: "OWNER", lotId: "lot-1" });
    expect(r.ok).toBe(true);

    expect(sharedFakeAuth.calls.createUser).toEqual([{ email: "new.owner@example.test", email_confirm: false }]);
    const [authUser] = [...sharedFakeAuth.users.values()];
    expect(authUser.password).toBeUndefined();

    const [row] = sharedFake.table("Invitation");
    expect(row).toMatchObject({ schemeId: SCHEME, email: "new.owner@example.test", role: "OWNER", lotId: "lot-1", status: "PENDING", accountAuthId: authUser.id, tokenUsedAt: null });
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // The email carries the token; the database has only its hash.
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("new.owner@example.test");
    const token = tokenFrom(mail.sent[0].html);
    expect(token).not.toBeNull();
    expect(sha(token!)).toBe(row.tokenHash);
    expect(JSON.stringify(sharedFake.table("Invitation"))).not.toContain(token!);
    expect(mail.sent[0].html).toContain("Lot 1");
  });

  it("expires in 14 days", async () => {
    const before = Date.now();
    const r = await issueInvitation({ ...base, email: "new@example.test", role: "OWNER", lotId: "lot-1" });
    if (!r.ok) throw new Error("expected ok");
    const days = (r.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(13.99);
    expect(days).toBeLessThan(14.01);
  });

  it("reuses the account made for an earlier invitation that nobody has set up", async () => {
    await issueInvitation({ ...base, email: "new@example.test", role: "OWNER", lotId: "lot-1" });
    const first = sharedFake.table("Invitation")[0].accountAuthId;
    sharedFake.table("Lot").push({ id: "lot-b1", schemeId: OTHER_SCHEME, lotNumber: "2" });
    await issueInvitation({ ...base, schemeId: OTHER_SCHEME, email: "new@example.test", role: "OWNER", lotId: "lot-b1" });
    expect(sharedFakeAuth.calls.createUser).toHaveLength(1);
    expect(sharedFake.table("Invitation")[1].accountAuthId).toBe(first);
  });
});

describe("no account enumeration", () => {
  it("gives the inviter the same result whether or not the address has an account", async () => {
    const fresh = await issueInvitation({ ...base, email: "fresh@example.test", role: "OWNER", lotId: "lot-1" });
    const known = await issueInvitation({ ...base, email: "existing.owner@example.test", role: "OWNER", lotId: "lot-1" });
    expect(fresh.ok && known.ok).toBe(true);
    expect(Object.keys(fresh).sort()).toEqual(Object.keys(known).sort());
    expect(fresh.ok && fresh.emailed).toBe(true);
    expect(known.ok && known.emailed).toBe(true);
    // The existing account is not created again, and no new-account marker is kept for it.
    expect(sharedFakeAuth.calls.createUser).toHaveLength(1);
    expect(sharedFake.table("Invitation").find((i) => i.email === "existing.owner@example.test")?.accountAuthId).toBeNull();
    // Both get the same email, apart from the address and the link.
    const strip = (h: string) => h.replace(/\/join#[A-Za-z0-9_-]{43}/, "").replace(/[a-z.]+@example\.test/g, "");
    expect(strip(mail.sent[0].html)).toBe(strip(mail.sent[1].html));
  });

  it("replaces an Auth user nobody has confirmed or signed in to (planted through open sign-up), so nothing planted survives (M-1)", async () => {
    // Someone signed up with the invitee's address, a password and metadata of their own, and never confirmed it.
    sharedFakeAuth.addUser({
      id: "auth-dormant",
      email: "dormant@example.test",
      password: "Planted-Pass-2026!",
      user_metadata: { full_name: "Planted Name" },
      confirmation_token: "planted-confirmation",
    });
    const r = await issueInvitation({ ...base, email: "dormant@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r.ok).toBe(true);
    // Deleted outright (not soft), and made again as for a new address.
    expect(sharedFakeAuth.calls.deleteUser).toEqual([{ id: "auth-dormant", soft: false }]);
    expect(sharedFakeAuth.users.has("auth-dormant")).toBe(false);
    expect(sharedFakeAuth.calls.createUser.at(-1)).toEqual({ email: "dormant@example.test", email_confirm: false });
    expect(sharedFakeAuth.users.size).toBe(1);
    const [fresh] = [...sharedFakeAuth.users.values()];
    expect(fresh).toEqual({ id: fresh.id, email: "dormant@example.test" });
    expect(fresh.password).toBeUndefined();
    expect(fresh.user_metadata).toBeUndefined();
    expect(fresh.confirmation_token).toBeUndefined();
    expect(sharedFake.table("Invitation")[0].accountAuthId).toBe(fresh.id);
    // Logged away from the building.
    const adopted = audit.events.find((e) => e.action === "account.adopted_for_invitation");
    expect(adopted).toMatchObject({ outcome: "allowed", resourceId: fresh.id });
    expect(adopted?.schemeId ?? null).toBeNull();
    // The building's event is the same as for any other invitation.
    const sent = audit.events.find((e) => e.action === "invitation.sent");
    expect(JSON.stringify(sent)).not.toMatch(/adopt|new|created|auth/i);
    // The link can set it up.
    expect(await inviteeSetupState(fresh.id, "dormant@example.test")).toBe("ready");
  });

  it("treats the address as existing if it is taken again between the delete and the create", async () => {
    sharedFakeAuth.addUser({ id: "auth-dormant", email: "dormant@example.test", password: "Planted-Pass-2026!" });
    const admin = sharedFakeAuth.client.auth.admin;
    const realDelete = admin.deleteUser;
    admin.deleteUser = async (id: string, soft?: boolean) => {
      const out = await realDelete(id, soft);
      sharedFakeAuth.addUser({ id: "auth-again", email: "dormant@example.test", password: "Planted-Again-2026!" });
      return out;
    };
    try {
      const r = await issueInvitation({ ...base, email: "dormant@example.test", role: "OWNER", lotId: "lot-1" });
      expect(r.ok).toBe(true);
      expect(sharedFake.table("Invitation")[0].accountAuthId).toBeNull();
    } finally {
      admin.deleteUser = realDelete;
    }
  });

  it("sends nothing if the planted user cannot be deleted", async () => {
    sharedFakeAuth.addUser({ id: "auth-dormant", email: "dormant@example.test" });
    sharedFakeAuth.failures.deleteUser = "unexpected_failure";
    const r = await issueInvitation({ ...base, email: "dormant@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r).toMatchObject({ ok: false });
    expect(sharedFake.table("Invitation")).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });

  for (const [what, extra] of [
    ["confirmed by phone", { phone_confirmed_at: "2026-10-01T00:00:00Z" }],
    ["banned", { banned_until: "2999-01-01T00:00:00Z" }],
    ["an SSO user", { is_sso_user: true }],
    ["anonymous", { is_anonymous: true }],
  ] as const) {
    it(`does not replace an Auth user that is ${what}`, async () => {
      sharedFakeAuth.addUser({ id: "auth-kept", email: "kept@example.test", ...extra });
      expect((await issueInvitation({ ...base, email: "kept@example.test", role: "OWNER", lotId: "lot-1" })).ok).toBe(true);
      expect(sharedFakeAuth.users.has("auth-kept")).toBe(true);
      expect(sharedFakeAuth.calls.deleteUser).toHaveLength(0);
      expect(sharedFake.table("Invitation")[0].accountAuthId).toBeNull();
    });
  }

  it("replaces one whose ban has ended", async () => {
    sharedFakeAuth.addUser({ id: "auth-was-banned", email: "was.banned@example.test", banned_until: "2020-01-01T00:00:00Z" });
    expect((await issueInvitation({ ...base, email: "was.banned@example.test", role: "OWNER", lotId: "lot-1" })).ok).toBe(true);
    expect(sharedFakeAuth.calls.deleteUser).toEqual([{ id: "auth-was-banned", soft: false }]);
  });

  it("treats a confirmed Auth user with no profile as existing", async () => {
    sharedFakeAuth.addUser({ id: "auth-confirmed", email: "confirmed@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" });
    expect((await issueInvitation({ ...base, email: "confirmed@example.test", role: "OWNER", lotId: "lot-1" })).ok).toBe(true);
    expect(sharedFake.table("Invitation")[0].accountAuthId).toBeNull();
    expect(audit.events.some((e) => String(e.action).startsWith("account."))).toBe(false);
  });

  it("treats an Auth user that has signed in, with no profile, as existing", async () => {
    sharedFakeAuth.addUser({ id: "auth-signed-in", email: "signed.in@example.test", last_sign_in_at: "2026-10-01T00:00:00Z" });
    expect((await issueInvitation({ ...base, email: "signed.in@example.test", role: "OWNER", lotId: "lot-1" })).ok).toBe(true);
    expect(sharedFake.table("Invitation")[0].accountAuthId).toBeNull();
  });

  it("checks the account again through the admin API before adopting it (confirmed_at only)", async () => {
    // The auth.users read sees nothing set; the admin API's confirmed_at says otherwise.
    sharedFakeAuth.addUser({ id: "auth-phone", email: "phone@example.test", confirmed_at: "2026-10-01T00:00:00Z" });
    expect((await issueInvitation({ ...base, email: "phone@example.test", role: "OWNER", lotId: "lot-1" })).ok).toBe(true);
    expect(sharedFake.table("Invitation")[0].accountAuthId).toBeNull();
  });

  it("does not adopt an Auth user that already has a profile under another address", async () => {
    sharedFakeAuth.addUser({ id: "auth-moved", email: "moved@example.test" });
    sharedFake.table("Profile").push({ id: "p-moved", authId: "auth-moved", email: "old.address@example.test" });
    expect((await issueInvitation({ ...base, email: "moved@example.test", role: "OWNER", lotId: "lot-1" })).ok).toBe(true);
    expect(sharedFake.table("Invitation")[0].accountAuthId).toBeNull();
  });

  it("does not pick between two Auth users with the same address", async () => {
    sharedFakeAuth.addUser({ id: "auth-twin-1", email: "twin@example.test" });
    sharedFakeAuth.addUser({ id: "auth-twin-2", email: "Twin@Example.test" });
    expect((await issueInvitation({ ...base, email: "twin@example.test", role: "OWNER", lotId: "lot-1" })).ok).toBe(true);
    expect(sharedFake.table("Invitation")[0].accountAuthId).toBeNull();
  });

  it("keeps account creation out of the building's security events, which the Adviser can read", async () => {
    await issueInvitation({ ...base, email: "fresh@example.test", role: "OWNER", lotId: "lot-1" });
    const created = audit.events.find((e) => e.action === "account.created_for_invitation");
    expect(created).toBeTruthy();
    expect(created?.schemeId ?? null).toBeNull();
    const sent = audit.events.find((e) => e.action === "invitation.sent");
    expect(sent).toMatchObject({ schemeId: SCHEME, outcome: "allowed", actorProfileId: "p-adviser" });
    expect(JSON.stringify(sent)).not.toMatch(/new|created|auth/i);
  });
});

describe("checks made on the server", () => {
  it("needs a valid address and an invitable role (no Adviser invitations in S2a)", async () => {
    expect(await issueInvitation({ ...base, email: "not-an-email", role: "OWNER", lotId: "lot-1" })).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
    expect(await issueInvitation({ ...base, email: "a@example.test", role: "ADVISER" })).toMatchObject({ ok: false, fieldErrors: { role: expect.any(String) } });
    expect(await issueInvitation({ ...base, email: "a@example.test", role: "SUPPLIER" })).toMatchObject({ ok: false });
    expect(sharedFakeAuth.calls.createUser).toHaveLength(0);
    expect(sharedFake.table("Invitation")).toHaveLength(0);
  });

  it("accepts only plain ASCII addresses (L6)", async () => {
    for (const ok of ["a@example.test", "first.last+tag@sub.example.com", "o'brien@example.com.au", "a_b-c%d@x-y.example.org"]) {
      expect(isInvitableEmail(ok), ok).toBe(true);
    }
    const bad = [
      "",
      "plain",
      "a@b",
      "a@@example.test",
      ".a@example.test",
      "a.@example.test",
      "a..b@example.test",
      "a@-example.test",
      "a@example-.test",
      "a@example..test",
      "a@example.t",
      "a@example.123",
      "a b@example.test",
      "a@exa mple.test",
      "a\n@example.test",
      "a@example.test\r\nbcc:x@example.test",
      "a\u0000@example.test",
      "a\u007f@example.test",
      "<a@example.test>",
      "a<b@example.test",
      "a>b@example.test",
      "a,b@example.test",
      "a@example.test,b@example.test",
      "a;b@example.test",
      '"a"@example.test',
      "a\\b@example.test",
      "jos\u00e9@example.test",
      "a@ex\u00e4mple.test",
      "\u0430@example.test", // Cyrillic a
      `${"a".repeat(65)}@example.test`,
      `a@${"b".repeat(250)}.test`,
    ];
    for (const b of bad) expect(isInvitableEmail(b), JSON.stringify(b)).toBe(false);
  });

  it("refuses a control character or < > , ; \" \\ inside the address, before anything is made", async () => {
    for (const email of ["a\u0007b@example.test", "a<b@example.test", "a,b@example.test", "a;b@example.test", 'a"b@example.test', "a\\b@example.test"]) {
      expect(await issueInvitation({ ...base, email, role: "OWNER", lotId: "lot-1" })).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
    }
    expect(sharedFakeAuth.calls.createUser).toHaveLength(0);
    expect(sharedFake.table("Invitation")).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("needs a lot for an owner, and only one of this building's", async () => {
    expect(await issueInvitation({ ...base, email: "a@example.test", role: "OWNER" })).toMatchObject({ ok: false, fieldErrors: { lotId: expect.any(String) } });
    expect(await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-x" })).toMatchObject({ ok: false, fieldErrors: { lotId: expect.any(String) } });
    expect(sharedFakeAuth.calls.createUser).toHaveLength(0);
    expect(sharedFake.table("Invitation")).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("is rate limited per inviter and per address, before any account is made", async () => {
    limits.allow = false;
    const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Too many") });
    expect(limits.checks[0]).toEqual([
      ["invitationSend", "p-adviser"],
      ["invitationRecipient", `${SCHEME}|a@example.test`],
    ]);
    expect(sharedFakeAuth.calls.createUser).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "invitation.send", outcome: "denied" }));
  });

  it("saves nothing if the account cannot be prepared", async () => {
    sharedFakeAuth.failures.createUser = "unexpected_failure";
    const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r).toMatchObject({ ok: false, error: expect.any(String) });
    expect(sharedFake.table("Invitation")).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("refuses someone who already holds the role", async () => {
    sharedFake.table("Invitation").push({ id: "inv-old", schemeId: SCHEME, email: "existing.owner@example.test", role: "OWNER", status: "ACCEPTED" });
    sharedFake.table("SchemeMembership").push({ id: "m1", schemeId: SCHEME, profileId: "p-existing", role: "OWNER", isActive: true });
    const r = await issueInvitation({ ...base, email: "existing.owner@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("already has this role") });
  });

  it("says when the email could not be sent, the same way for everyone", async () => {
    mail.ok = false;
    const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r).toMatchObject({ ok: true, emailed: false });
  });
});

describe("sending again", () => {
  it("replaces the link, so only the newest one works", async () => {
    await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    const firstHash = sharedFake.table("Invitation")[0].tokenHash;
    sharedFake.table("Invitation")[0].tokenUsedAt = "2026-11-01T00:00:00.000Z";
    await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    const rows = sharedFake.table("Invitation");
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(firstHash);
    expect(rows[0].tokenUsedAt).toBeNull();
    expect(sha(tokenFrom(mail.sent[1].html)!)).toBe(rows[0].tokenHash);
  });

  it("reopens a declined invitation when the Adviser sends it again, with a new link, and logs it", async () => {
    sharedFake.table("Invitation").push({ id: "inv-d", schemeId: SCHEME, email: "a@example.test", role: "OWNER", status: "DECLINED", tokenHash: "e".repeat(64), tokenUsedAt: null });
    const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r.ok).toBe(true);
    const [row] = sharedFake.table("Invitation");
    expect(row).toMatchObject({ id: "inv-d", status: "PENDING", tokenUsedAt: null });
    expect(row.tokenHash).not.toBe("e".repeat(64));
    expect(sha(tokenFrom(mail.sent[0].html)!)).toBe(row.tokenHash);
    expect(audit.events).toContainEqual(
      expect.objectContaining({ action: "invitation.sent", outcome: "allowed", schemeId: SCHEME, resourceId: "inv-d", metadata: { role: "OWNER", resent: true, previousStatus: "DECLINED" } }),
    );
  });

  it("does not reopen an invitation accepted while a declined one was being sent again", async () => {
    sharedFake.table("Invitation").push({ id: "inv-d", schemeId: SCHEME, email: "a@example.test", role: "OWNER", status: "DECLINED", tokenHash: null });
    const admin = sharedFakeAuth.client.auth.admin;
    const realCreate = admin.createUser;
    admin.createUser = async (attributes) => {
      sharedFake.table("Invitation")[0].status = "ACCEPTED";
      return realCreate(attributes);
    };
    try {
      const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
      expect(r).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
      expect(sharedFake.table("Invitation")[0].status).toBe("ACCEPTED");
      expect(mail.sent).toHaveLength(0);
    } finally {
      admin.createUser = realCreate;
    }
  });

  it("reopens an accepted invitation only when the membership it gave has ended (someone invited back)", async () => {
    sharedFake.table("Invitation").push({ id: "inv-a", schemeId: SCHEME, email: "existing.owner@example.test", role: "OWNER", status: "ACCEPTED", tokenHash: null });
    sharedFake.table("SchemeMembership").push({ id: "m1", schemeId: SCHEME, profileId: "p-existing", role: "OWNER", isActive: false });
    const r = await issueInvitation({ ...base, email: "existing.owner@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r.ok).toBe(true);
    expect(sharedFake.table("Invitation")[0]).toMatchObject({ id: "inv-a", status: "PENDING" });
  });

  it("does not reopen an invitation accepted while it was being sent again", async () => {
    sharedFake.table("Invitation").push({ id: "inv-p", schemeId: SCHEME, email: "a@example.test", role: "OWNER", status: "PENDING", tokenHash: "f".repeat(64), accountAuthId: null });
    // Accepted (by the /join set-up, say) after the resend read it as pending.
    const admin = sharedFakeAuth.client.auth.admin;
    const realCreate = admin.createUser;
    admin.createUser = async (attributes) => {
      sharedFake.table("Invitation")[0].status = "ACCEPTED";
      return realCreate(attributes);
    };
    try {
      const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
      expect(r).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
      expect(sharedFake.table("Invitation")[0]).toMatchObject({ status: "ACCEPTED", tokenHash: "f".repeat(64) });
      expect(mail.sent).toHaveLength(0);
    } finally {
      admin.createUser = realCreate;
    }
  });

  it("waits at most 5 seconds for the invitation's lock", async () => {
    sharedFake.table("Invitation").push({ id: "inv-x", schemeId: SCHEME, email: "a@example.test", role: "OWNER", status: "EXPIRED", tokenHash: null });
    await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    expect(sharedFake.statements).toContain("SET LOCAL lock_timeout = '5s'");
  });

  it("brings back an expired or revoked invitation as pending", async () => {
    sharedFake.table("Invitation").push({ id: "inv-x", schemeId: SCHEME, email: "a@example.test", role: "OWNER", status: "EXPIRED", tokenHash: null });
    const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r.ok).toBe(true);
    expect(sharedFake.table("Invitation")[0]).toMatchObject({ id: "inv-x", status: "PENDING", lotId: "lot-1" });
  });
});

describe("delivering a link made inside another transaction (change of owner)", () => {
  const link = { token: "t".repeat(43), hash: sha("t".repeat(43)) };
  const input = (email: string) => ({
    invitationId: "inv-co",
    schemeId: SCHEME,
    email,
    role: "OWNER" as const,
    lotNumber: "1",
    token: link.token,
    hash: link.hash,
    expiresAt: new Date(Date.now() + 86_400_000),
    inviter,
    actorRole: "ADVISER",
    resent: false,
    previousStatus: null,
    via: "owner_change",
  });
  beforeEach(() => {
    sharedFake.table("Invitation").push({ id: "inv-co", schemeId: SCHEME, email: "nia@example.test", role: "OWNER", lotId: "lot-1", status: "PENDING", tokenHash: link.hash, tokenUsedAt: null, accountAuthId: null });
  });

  it("refuses an address issueInvitation refuses (review L1): no account, no email, a neutral event", async () => {
    for (const email of ["nia@exämple.test", "nia@example.test>, x@evil.test", "bad"]) {
      expect(await deliverInvitationLink(input(email))).toEqual({ emailed: false, reason: "address" });
    }
    expect(sharedFakeAuth.calls.createUser).toEqual([]);
    expect(mail.sent).toEqual([]);
    expect(limits.checks).toEqual([]);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "invitation.send", outcome: "denied", reason: "address not accepted" }));
  });

  it("emails the link to a valid address, with the account recorded on the invitation", async () => {
    expect(await deliverInvitationLink(input("nia@example.test"))).toEqual({ emailed: true });
    expect(tokenFrom(mail.sent[0].html)).toBe(link.token);
    expect(sharedFake.table("Invitation").find((i) => i.id === "inv-co")?.accountAuthId).toBe([...sharedFakeAuth.users.values()][0].id);
  });
});
