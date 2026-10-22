import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validatePriceBook, type PriceBookEntry } from "./price-book";
import { toCents } from "./money";

/** Parse the seeded price book rows out of the platform billing migration. */
function seededRows(file = "prisma/migrations/20261022_platform_billing.sql"): PriceBookEntry[] {
  const sql = readFileSync(file, "utf8");
  const block = sql.slice(sql.indexOf("SELECT v.* FROM (VALUES"), sql.indexOf(") AS v("));
  const rows = block.split("\n").filter((l) => l.trim().startsWith("("));
  return rows.map((line) => {
    const body = line.trim().replace(/^\(/, "").replace(/\),?\s*$/, "");
    const parts = [...body.matchAll(/\s*((?:DATE\s+)?'(?:[^']|'')*'|[^,]+?)\s*(?:,|$)/g)].map((m) => m[1]).filter((p) => p !== "");
    const val = (p: string) => (p.startsWith("'") ? p.slice(1, -1).replace(/''/g, "'") : p.replace(/::\w+/g, ""));
    const [code, variant, description, amount, gstIncl, unit, payer, from, active, recoverable, bandMin, bandMax] = parts.map(val);
    return {
      code,
      variant: variant === "NULL" ? null : variant,
      description,
      amountCents: amount === "NULL" ? null : toCents(amount),
      gstInclusive: gstIncl === "true",
      unit: unit as PriceBookEntry["unit"],
      payerType: payer as PriceBookEntry["payerType"],
      effectiveFrom: from.replace("DATE '", "").replace("'", "").replace(/^DATE /, ""),
      isActive: active === "true",
      recoverableFromOwner: recoverable === "true",
      bandMin: bandMin === "NULL" ? null : Number(bandMin),
      bandMax: bandMax === "NULL" ? null : Number(bandMax),
    };
  });
}

describe("seeded price book", () => {
  const rows = seededRows();
  const price = (code: string, variant: string | null = null, bandMin: number | null = null) =>
    rows.find((r) => r.code === code && r.variant === variant && (bandMin === null || r.bandMin === bandMin))?.amountCents;

  it("parses every seed row", () => {
    expect(rows.length).toBe(32);
  });

  it("has no configuration problems", () => {
    expect(validatePriceBook(rows)).toEqual([]);
  });

  it("matches the brief's prices", () => {
    expect([price("SUBSCRIPTION_SMALL"), price("SUBSCRIPTION_MEDIUM"), price("SUBSCRIPTION_LARGE")]).toEqual([4900, 14900, 34900]);
    expect([price("TXN_FEE", null, 1), price("TXN_FEE", null, 50000), price("TXN_FEE", null, 500001), price("TXN_FEE_FLAT")]).toEqual([150, 250, 500, 250]);
    expect([price("MEETING_EGM"), price("BALLOT"), price("TRANSFER"), price("YEAR_END_PACK")]).toEqual([5500, 2500, 6000, 25000]);
    expect([price("ACCOUNTANT_SEAT"), price("CLAIM_HANDLING"), price("WORKS_VARIATION"), price("EDUCATION")]).toEqual([2000, 10000, 2500, 9900]);
  });

  it("keeps prescribed fees and unset prices switched off", () => {
    for (const code of ["S184_CERTIFICATE", "S184_PLATFORM_SHARE", "S182_INSPECTION", "PAPER_NOTICE"]) {
      expect(rows.filter((r) => r.code === code).every((r) => !r.isActive)).toBe(true);
    }
  });

  it("marks recovery steps recoverable from the owner", () => {
    expect(rows.filter((r) => r.code === "RECOVERY_STEP").every((r) => r.recoverableFromOwner)).toBe(true);
  });

  it("excludes GST on every seeded price", () => {
    expect(rows.every((r) => !r.gstInclusive)).toBe(true);
  });
});

describe("supplier billing seed", () => {
  const supplierRows = seededRows("prisma/migrations/20261022_supplier_billing.sql");

  it("seeds the $8 contractor plan, GST inclusive", () => {
    const plan = supplierRows.find((r) => r.code === "SUPPLIER_PLAN");
    expect(plan).toMatchObject({ amountCents: 800, gstInclusive: true, unit: "PER_MONTH", payerType: "SUPPLIER", isActive: true });
  });

  it("seeds the $49 annual compliance verification charge, GST exclusive", () => {
    const fee = supplierRows.find((r) => r.code === "COMPLIANCE_VERIFICATION");
    expect(fee).toMatchObject({ amountCents: 4900, gstInclusive: false, unit: "PER_YEAR", payerType: "SUPPLIER", isActive: true });
  });

  it("forms a valid price book with the Stage 1 rows", () => {
    expect(validatePriceBook([...seededRows(), ...supplierRows])).toEqual([]);
  });
});
