/**
 * Migration 20261127 (certificate kinds and records access, VIC, ACT and WA
 * stage 2, PR 10a), read as text: idempotent, only widening the requester
 * checks, every name within Postgres's 63 characters, every column it adds
 * in the emitted contract as the ORM will read it, and every kind and
 * requester type the packs can write allowed by its checks.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, RULE_PACKS, type AccessKindKey, type CertificateKindKey, type StatutoryRules } from "@/config/statutory";

const ROOT = join(__dirname, "..", "..", "..");
const SQL = readFileSync(join(ROOT, "prisma/migrations/20261127_certificate_kinds.sql"), "utf8");
const BEFORE = readFileSync(join(ROOT, "prisma/migrations/20261115_qld_certificates_inspections.sql"), "utf8");
const CONTRACT = JSON.parse(readFileSync(join(ROOT, "src/prisma/contract.json"), "utf8")) as {
  storage: { namespaces: { public: { entries: { table: Record<string, { columns: Record<string, { codecId: string; nullable: boolean; typeParams?: { length?: number } }>; indexes: { name: string }[] }> } } } };
};
const TABLES = CONTRACT.storage.namespaces.public.entries.table;

/** The SQL without its comments. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");
/** The quoted values of the `column IN (...)` list in the named constraint (the last one in the file). */
function listIn(sql: string, constraint: string, column: string): string[] {
  const at = code(sql).lastIndexOf(`ADD CONSTRAINT ${constraint}`);
  expect(at, constraint).toBeGreaterThanOrEqual(0);
  const m = code(sql).slice(at).match(new RegExp(`${column} IN \\(([^)]*)\\)`));
  expect(m, `${constraint} ${column}`).not.toBeNull();
  return [...m![1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
}

// Compile-time complete: a kind added to the union must be added here, and so to the check.
const CERTIFICATE_KINDS: Record<CertificateKindKey, true> = { OWNERS_CORPORATION: true, SALE: true, SALE_UPDATE: true, RENTAL: true, SCHEME: true, LOT: true };
const ACCESS_KINDS: Record<AccessKindKey, true> = { RECORDS: true, REGISTER: true, EXECUTIVE_MEMBERS: true, INSURANCE: true, CONTACT: true };

describe("migration 20261127", () => {
  it("is marked not applied, to be applied before the code deploys, with approval", () => {
    expect(SQL).toMatch(/^-- Status: NOT APPLIED\.$/m);
    expect(SQL).toMatch(/BEFORE the code/);
    expect(SQL).toMatch(/ONLY with Matthew\s+-- Wrigley's approval/);
  });

  it("is idempotent, in one transaction with a lock timeout", () => {
    const sql = code(SQL);
    expect(sql.trim().startsWith("BEGIN;")).toBe(true);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    for (const m of sql.matchAll(/ADD COLUMN (?!IF NOT EXISTS)/g)) throw new Error(`ADD COLUMN without IF NOT EXISTS at ${m.index}`);
    const added = [...sql.matchAll(/ADD CONSTRAINT (\w+)/g)].map((m) => m[1]);
    const dropped = [...sql.matchAll(/DROP CONSTRAINT IF EXISTS (\w+);/g)].map((m) => m[1]);
    expect(added).toEqual(dropped);
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX|DROP COLUMN|UPDATE public|DELETE FROM|ALTER COLUMN|SET DEFAULT/);
  });

  it("names every constraint and column within Postgres's 63 characters, and adds no index the contract does not have", () => {
    const names = [...code(SQL).matchAll(/(?:CONSTRAINT|IF NOT EXISTS) (\w+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) expect(n.length, n).toBeLessThanOrEqual(63);
    // The indexes the tables already had (20261113): nothing here adds one.
    expect(TABLES.sale_certificates.indexes.map((i) => i.name).sort()).toEqual(["sale_certificates_lot_id_idx", "sale_certificates_scheme_id_number_key"]);
    expect(TABLES.records_inspections.indexes.map((i) => i.name)).toEqual(["records_inspections_scheme_id_status_idx"]);
  });

  it("adds each column nullable, with no default, as the emitted contract reads it", () => {
    const codec: Record<string, { codecId: string; length?: number }> = {
      text: { codecId: "pg/text@1" },
      integer: { codecId: "pg/int4@1" },
      boolean: { codecId: "pg/bool@1" },
      "varchar(40)": { codecId: "sql/varchar@1", length: 40 },
    };
    const columns = [...code(SQL).matchAll(/ALTER TABLE public\.(\w+) ADD COLUMN IF NOT EXISTS (\w+) ([\w()]+);/g)].map((m) => ({ table: m[1], column: m[2], type: m[3] }));
    expect(columns.map((c) => `${c.table}.${c.column}`)).toEqual([
      "sale_certificates.kind",
      "sale_certificates.fee_cap_cents",
      "sale_certificates.fee_includes_gst",
      "sale_certificates.additional_certificate",
      "records_inspections.rule_pack",
      "records_inspections.access_kind",
      "records_inspections.copy_medium",
      "records_inspections.records_copied",
      "records_inspections.device_cost_cents",
      "records_inspections.fee_cap_cents",
      "records_inspections.fee_includes_gst",
      "records_inspections.also_sale_certificate",
    ]);
    for (const c of columns) {
      const inContract = TABLES[c.table].columns[c.column];
      expect(inContract, `${c.table}.${c.column} in the contract`).toBeDefined();
      expect(inContract.nullable, `${c.table}.${c.column}`).toBe(true);
      expect(inContract.codecId, `${c.table}.${c.column}`).toBe(codec[c.type].codecId);
      expect(inContract.typeParams?.length, `${c.table}.${c.column}`).toBe(codec[c.type].length);
    }
    // records_inspections.rule_pack is the same column as sale_certificates.rule_pack.
    expect(TABLES.records_inspections.columns.rule_pack).toEqual(TABLES.sale_certificates.columns.rule_pack);
  });

  it("only widens the requester checks", () => {
    for (const [constraint, column] of [
      ["sale_certificates_requester_type_check", "requester_type"],
      ["sale_certificates_authorised_by_type_check", "authorised_by_type"],
      ["records_inspections_inspector_type_check", "inspector_type"],
    ] as const) {
      const before = listIn(BEFORE, constraint, column);
      const after = listIn(SQL, constraint, column);
      expect(after.slice(0, before.length), constraint).toEqual(before);
      expect(after.length, constraint).toBeGreaterThan(before.length);
    }
  });

  it("allows every certificate and access kind, and only those", () => {
    expect(listIn(SQL, "sale_certificates_kind_check", "kind").sort()).toEqual(Object.keys(CERTIFICATE_KINDS).sort());
    expect(listIn(SQL, "records_inspections_access_kind_check", "access_kind").sort()).toEqual(Object.keys(ACCESS_KINDS).sort());
  });

  it("allows every requester type any pack's certificate or records access can record (live or pending, whatever the set)", () => {
    const certificateTypes = new Set(listIn(SQL, "sale_certificates_requester_type_check", "requester_type"));
    const authorisers = new Set(listIn(SQL, "sale_certificates_authorised_by_type_check", "authorised_by_type"));
    const inspectorTypes = new Set(listIn(SQL, "records_inspections_inspector_type_check", "inspector_type"));
    const packs = [...Object.values(RULE_PACKS), ...Object.values(PENDING_RULE_PACKS)] as unknown as { code: string; rules: StatutoryRules }[];
    let checked = 0;
    for (const { code: pack, rules } of packs) {
      for (const c of [rules.CERTIFICATE, rules.CERTIFICATE_KINDS]) {
        if (!c) continue;
        for (const t of Object.keys(c.requesterTypes)) {
          expect(certificateTypes.has(t), `${pack} certificate requester ${t}`).toBe(true);
          if (t !== c.agentType) expect(authorisers.has(t), `${pack} certificate authoriser ${t}`).toBe(true);
          checked++;
        }
      }
      for (const r of [rules.INSPECTIONS, rules.RECORDS_ACCESS_KINDS]) {
        if (!r) continue;
        for (const t of Object.keys(r.requesterTypes)) {
          expect(inspectorTypes.has(t), `${pack} access requester ${t}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The draft packs' requester types (design D16), ahead of their pack PRs.
    for (const t of ["ANY_PERSON", "INTEREST_HOLDER", "COMPANY_REPRESENTATIVE", "OWNER", "BUYER", "MORTGAGEE", "PROPER_INTEREST", "AUTHORISED_PERSON", "AGENT"]) expect(certificateTypes.has(t), t).toBe(true);
    for (const t of ["INTEREST_HOLDER", "COMPANY_REPRESENTATIVE", "OWNER", "BUYER", "MORTGAGEE", "PROPER_INTEREST", "AUTHORISED_PERSON", "AGENT"]) expect(inspectorTypes.has(t), t).toBe(true);
  });

  it("ties a kind to the VIC, ACT and WA pack labels", () => {
    const re = /rule_pack ~ '\^AU-\(VIC\|ACT\|WA\) '/g;
    expect(code(SQL).match(re)).toHaveLength(2);
    const pattern = /^AU-(VIC|ACT|WA) /;
    for (const p of Object.values(PENDING_RULE_PACKS).filter((x) => ["VIC", "ACT", "WA"].includes(x.state))) expect(pattern.test(`${p.code} ${p.version}`), p.code).toBe(true);
    for (const p of Object.values(RULE_PACKS)) expect(pattern.test(`${p.code} ${p.version}`), p.code).toBe(false);
  });
});
