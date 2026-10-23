import { describe, expect, it, vi } from "vitest";

vi.mock("./certs/supabase-root-ca", () => ({ SUPABASE_ROOT_CA_2021: "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----" }));
const { databaseConnection } = await import("./connection");

const REMOTE = "postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

describe("databaseConnection (S8, SEC-017)", () => {
  it("verifies TLS for a remote database by default", () => {
    const c = databaseConnection({ DATABASE_URL: REMOTE });
    expect(c.mode).toBe("verify");
    expect(c.ssl).toEqual({ rejectUnauthorized: true, ca: expect.stringContaining("BEGIN CERTIFICATE") });
    expect(c.connectionString).toContain("pgbouncer=true");
  });

  it("removes SSL settings from the connection string so they cannot weaken it", () => {
    const c = databaseConnection({ DATABASE_URL: `${REMOTE}&sslmode=disable&sslrootcert=/tmp/x` });
    expect(c.connectionString).not.toMatch(/sslmode|sslrootcert/);
    expect(c.mode).toBe("verify");
  });

  it("never turns TLS off for a remote database", () => {
    const c = databaseConnection({ DATABASE_URL: REMOTE, DATABASE_SSL: "off" });
    expect(c.mode).toBe("verify");
    expect(c.warning).toMatch(/ignored/);
  });

  it("allows an encrypted, unverified stop-gap", () => {
    const c = databaseConnection({ DATABASE_URL: REMOTE, DATABASE_SSL: "require" });
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("uses no TLS for a local database, unless asked", () => {
    expect(databaseConnection({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" }).ssl).toBe(false);
    expect(databaseConnection({ DATABASE_URL: "postgresql://u:p@localhost:5432/db", DATABASE_SSL: "require" }).ssl).toEqual({ rejectUnauthorized: false });
  });

  it("takes a CA from the environment, with escaped line breaks", () => {
    const c = databaseConnection({ DATABASE_URL: REMOTE, DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\\nENV\\n-----END CERTIFICATE-----" });
    expect(c.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----\nENV\n-----END CERTIFICATE-----" });
  });
});
