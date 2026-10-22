import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: every table a tracked SQL migration creates must have RLS enabled in
 * some tracked migration. Tables without RLS are open to the anon and
 * authenticated roles through the Supabase Data API.
 */
const DIRS = ["prisma/migrations", "supabase/migrations"];

function readMigrations(): string {
  return DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8")),
  )
    .join("\n")
    .replace(/--[^\n]*/g, "");
}

const strip = (name: string) => name.replace(/"/g, "").replace(/^public\./, "").toLowerCase();

describe("tracked migrations", () => {
  const sql = readMigrations();
  const created = new Set(
    [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+("?[\w.]+"?)/gi)].map((m) => strip(m[1])),
  );
  const withRls = new Set(
    [...sql.matchAll(/ALTER TABLE(?: ONLY)?\s+("?[\w.]+"?)\s+ENABLE ROW LEVEL SECURITY/gi)].map((m) =>
      strip(m[1]),
    ),
  );

  it("enable RLS on every table they create", () => {
    expect([...created].filter((t) => !withRls.has(t)).sort()).toEqual([]);
  });

  it("track the debt recovery and lot workflow tables", () => {
    for (const t of [
      "debt_recovery_cases",
      "payment_plans",
      "lot_details",
      "lot_tenants",
      "property_managers",
      "lot_delivery_preferences",
      "lot_debt_collections",
      "lot_powers_of_attorney",
      "lot_proxies",
    ]) {
      expect(created.has(t)).toBe(true);
      expect(withRls.has(t)).toBe(true);
    }
  });
});
