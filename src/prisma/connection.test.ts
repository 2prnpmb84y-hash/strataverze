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

describe("the bundled Supabase certificate", () => {
  it("is the Supabase Root 2021 CA and parses", async () => {
    const { X509Certificate } = await import("node:crypto");
    const { SUPABASE_ROOT_CA_2021 } = await vi.importActual<typeof import("./certs/supabase-root-ca")>("./certs/supabase-root-ca");
    const cert = new X509Certificate(SUPABASE_ROOT_CA_2021!);
    expect(cert.subject).toContain("CN=Supabase Root 2021 CA");
    expect(cert.ca).toBe(true);
    expect(cert.fingerprint256).toBe("80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA");
    expect(cert.verify(cert.publicKey)).toBe(true);
  });
});
