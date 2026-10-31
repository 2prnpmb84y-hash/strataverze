import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The read-only lookup of auth.users by address (S2a, review finding M1).
 * The database is faked: these check the statement the code builds and how
 * rows come back, not Postgres. Synthetic addresses at example.test only.
 */

const raw = vi.hoisted(() => ({
  statements: [] as { sql: string; values: unknown[]; spec: unknown }[],
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/prisma/db", () => ({
  db: {
    raw: {
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        returnsRow: (spec: unknown) => ({
          build: () => {
            const plan = { sql: strings.join("$?"), values, spec };
            raw.statements.push(plan);
            return plan;
          },
        }),
      }),
    },
    query: async () => raw.rows,
  },
}));

const { findAuthUsersByEmail } = await import("./auth-users");

beforeEach(() => {
  raw.statements = [];
  raw.rows = [];
});

describe("findAuthUsersByEmail", () => {
  it("reads auth.users only, with the address as a parameter, never in the SQL text", async () => {
    await findAuthUsersByEmail("  Someone@Example.test ");
    expect(raw.statements).toHaveLength(1);
    const [plan] = raw.statements;
    expect(plan.values).toEqual(["someone@example.test"]);
    expect(plan.sql).not.toContain("someone@example.test");
    expect(plan.sql).toMatch(/FROM auth\.users/);
    expect(plan.sql).toMatch(/^\s*SELECT/);
    expect(plan.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|encrypted_password)\b/i);
    expect(plan.sql).toMatch(/LIMIT 2/);
    expect(plan.spec).toEqual({ id: "pg/text@1", confirmed: "pg/bool@1", signed_in: "pg/bool@1", banned: "pg/bool@1" });
    // Confirmed by email or phone; SSO, anonymous and soft-deleted users left out; bans read (L-c).
    expect(plan.sql).toMatch(/email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL/);
    expect(plan.sql).toMatch(/AND NOT is_sso_user\s+AND NOT coalesce\(is_anonymous, false\)\s+AND deleted_at IS NULL/);
    expect(plan.sql).toMatch(/banned_until IS NOT NULL AND banned_until > now\(\)/);
  });

  it("maps the rows, and asks nothing for an empty address", async () => {
    raw.rows = [
      { id: "00000000-0000-4000-8000-000000000001", confirmed: false, signed_in: true, banned: false },
      { id: "00000000-0000-4000-8000-000000000002", confirmed: false, signed_in: false, banned: false },
    ];
    expect(await findAuthUsersByEmail("a@example.test")).toEqual([
      { id: "00000000-0000-4000-8000-000000000001", confirmed: false, signedIn: true, banned: false, adoptable: false },
      { id: "00000000-0000-4000-8000-000000000002", confirmed: false, signedIn: false, banned: false, adoptable: true },
    ]);
    // Banned, or a ban that cannot be read, is never adoptable.
    raw.rows = [
      { id: "b1", confirmed: false, signed_in: false, banned: true },
      { id: "b2", confirmed: false, signed_in: false, banned: null },
    ];
    expect((await findAuthUsersByEmail("a@example.test")).map((u) => u.adoptable)).toEqual([false, false]);
    expect(await findAuthUsersByEmail("   ")).toEqual([]);
    expect(raw.statements).toHaveLength(2);
  });
});
