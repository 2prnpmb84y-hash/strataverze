import { beforeEach, describe, expect, it, vi } from "vitest";

/** The security audit writer (S6): what it stores, and that it never throws. */
const create = vi.fn();
vi.mock("@/prisma/db", () => ({ db: { orm: { public: { SecurityAuditEvent: { create: (d: unknown) => create(d) } } } } }));
const headerValues = new Map<string, string>();
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => headerValues.get(k) ?? null }) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const { auditHash, recordSecurityEvent, sanitiseMetadata } = await import("./security-audit");

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({});
  headerValues.clear();
  process.env.AUDIT_HASH_KEY = "test-key";
});

describe("sanitiseMetadata", () => {
  it("keeps simple values under safe keys", () => {
    expect(sanitiseMetadata({ kind: "levy_notice", rows: 3, ok: true, none: null })).toEqual({
      kind: "levy_notice",
      rows: 3,
      ok: true,
      none: null,
    });
  });

  it("drops keys that could hold secrets or personal details, and non-simple values", () => {
    const out = sanitiseMetadata({
      password: "x",
      accessToken: "x",
      bsb: "062-000",
      accountNumber: "1234",
      email: "a@b.c",
      phone: "0400",
      firstName: "A",
      code: "123456",
      nested: { a: 1 },
      list: [1],
      fn: () => 1,
      "bad key": 1,
    });
    expect(out).toEqual({});
  });

  it("cuts long strings and limits the number of keys", () => {
    expect((sanitiseMetadata({ kind: "x".repeat(500) }).kind as string).length).toBe(200);
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitiseMetadata(many))).toHaveLength(20);
  });
});

describe("auditHash", () => {
  it("is a stable keyed hash, and null without a key", () => {
    expect(auditHash("203.0.113.9")).toBe(auditHash(" 203.0.113.9 "));
    expect(auditHash("203.0.113.9")).toMatch(/^[0-9a-f]{32}$/);
    expect(auditHash("203.0.113.9")).not.toContain("203");
    delete process.env.AUDIT_HASH_KEY;
    const role = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(auditHash("203.0.113.9")).toBeNull();
    if (role) process.env.SUPABASE_SERVICE_ROLE_KEY = role;
  });
});

describe("recordSecurityEvent", () => {
  it("stores the event with a hashed IP, never the address", async () => {
    headerValues.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
    headerValues.set("user-agent", "U".repeat(300));
    await recordSecurityEvent({
      action: "auth.sign_in",
      outcome: "failed",
      actorProfileId: "11111111-1111-4111-8111-111111111111",
      schemeId: "not-a-uuid",
      metadata: { password: "secret", kind: "x" },
    });
    const row = create.mock.calls[0][0];
    expect(row).toMatchObject({ action: "auth.sign_in", outcome: "failed", schemeId: null, metadata: { kind: "x" } });
    expect(row.ipHash).toBe(auditHash("203.0.113.9"));
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
    expect(JSON.stringify(row)).not.toContain("secret");
    expect(row.userAgent).toHaveLength(200);
  });

  it("refuses a malformed action name", async () => {
    await recordSecurityEvent({ action: "Auth Sign In; drop", outcome: "allowed" });
    expect(create).not.toHaveBeenCalled();
  });

  it("never throws when the write fails", async () => {
    create.mockRejectedValue(new Error("database down"));
    await expect(recordSecurityEvent({ action: "auth.sign_in", outcome: "allowed" })).resolves.toBeUndefined();
  });
});

describe("recordActionInvocation", () => {
  it("records a server action once per request, with the page but not its query", async () => {
    const { recordActionInvocation } = await import("./security-audit");
    headerValues.set("next-action", "7f3a9c0e1b2d4f6a8c0e1b2d4f6a8c0e");
    headerValues.set("referer", "https://www.strataverze.com/adviser/schemes/x/lots?search=smith");
    await recordActionInvocation({ actorProfileId: "11111111-1111-4111-8111-111111111111", actorRole: "ADVISER" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      action: "action.authorised",
      metadata: { actionId: "7f3a9c0e1b2d4f6a", page: "/adviser/schemes/x/lots" },
    });
  });

  it("ignores page loads", async () => {
    const { recordActionInvocation } = await import("./security-audit");
    await recordActionInvocation({ actorProfileId: "11111111-1111-4111-8111-111111111111", actorRole: "ADVISER" });
    expect(create).not.toHaveBeenCalled();
  });
});
