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

const { sharedFake } = await import("@/test/fake-orm");
const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
const { issueInvitation } = await import("./issue");

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

  it("treats an Auth account with no profile (signed up, never signed in) as existing", async () => {
    sharedFakeAuth.addUser({ id: "auth-dormant", email: "dormant@example.test" });
    const r = await issueInvitation({ ...base, email: "dormant@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r.ok).toBe(true);
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

  it("brings back an expired or revoked invitation as pending", async () => {
    sharedFake.table("Invitation").push({ id: "inv-x", schemeId: SCHEME, email: "a@example.test", role: "OWNER", status: "EXPIRED", tokenHash: null });
    const r = await issueInvitation({ ...base, email: "a@example.test", role: "OWNER", lotId: "lot-1" });
    expect(r.ok).toBe(true);
    expect(sharedFake.table("Invitation")[0]).toMatchObject({ id: "inv-x", status: "PENDING", lotId: "lot-1" });
  });
});
