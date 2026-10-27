/**
 * Pins the browser's column keys on the migration page to the field names the
 * server reads, so the two cannot drift apart again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn() }));

const { MIGRATION_TEMPLATES } = await import("@/lib/queries/data-migration");
const { FIELDS } = await import("./migration-templates");
const { IMPORT_FIELDS, IMPORT_DATA_TYPES, autoDetectMapping, buildImportRows, isImportDataType, missingRequired, parseCsvContent, toServerData } = await import(
  "./migration-import-fields"
);

const pairs = (dt: keyof typeof IMPORT_FIELDS) => Object.fromEntries(IMPORT_FIELDS[dt].map((f) => [f.key, f.field]));
const serverFields = (dt: keyof typeof IMPORT_FIELDS) => IMPORT_FIELDS[dt].map((f) => f.field as string).sort();
const required = (dt: keyof typeof IMPORT_FIELDS) => IMPORT_FIELDS[dt].filter((f) => f.required).map((f) => f.field as string).sort();

describe("the browser key to server field table", () => {
  it("maps each browser key the page sends to the field the server reads", () => {
    expect(pairs("lots")).toEqual({
      lot_number: "lotNumber",
      unit_number: "unitNumber",
      entitlement: "entitlement",
      floor_area: "floorArea",
      lot_type: "lotType",
    });
    expect(pairs("chart_of_accounts")).toEqual({
      account_code: "code",
      account_name: "name",
      account_type: "accountType",
      sub_type: "accountSubType",
      fund_name: "fundType",
    });
    expect(pairs("opening_balances")).toEqual({
      account_code: "accountCode",
      debit: "debit",
      credit: "credit",
      fund_name: "fundName",
      description: "description",
    });
  });

  it.each(["strata_master", "stratamax", "myob", "xero"])("covers every field of the %s lots and chart templates on the server", (system) => {
    for (const dt of ["lots", "chart_of_accounts"] as const) {
      const template = MIGRATION_TEMPLATES[`${system}_${dt}`];
      expect(serverFields(dt)).toEqual([...template.requiredFields, ...template.optionalFields].sort());
      expect(required(dt)).toEqual([...template.requiredFields].sort());
    }
    const ob = MIGRATION_TEMPLATES[`${system}_opening_balances`];
    for (const f of serverFields("opening_balances")) expect([...ob.requiredFields, ...ob.optionalFields]).toContain(f);
  });

  it("uses the same field names as the cutover's column list", () => {
    for (const dt of ["lots", "chart_of_accounts"] as const) {
      expect(serverFields(dt)).toEqual(FIELDS[dt].map((f) => f.field).sort());
      expect(required(dt)).toEqual(FIELDS[dt].filter((f) => f.required).map((f) => f.field).sort());
    }
    for (const f of serverFields("opening_balances")) expect(FIELDS.opening_balances.map((x) => x.field)).toContain(f);
  });

  it("has no repeated key or field within a data type", () => {
    for (const dt of IMPORT_DATA_TYPES) {
      const keys = IMPORT_FIELDS[dt].map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(new Set(serverFields(dt)).size).toBe(keys.length);
    }
  });

  it("is the only list of columns: the page keeps no key list of its own", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(portal)/adviser/schemes/[id]/finance/migration/migration-client.tsx"), "utf8");
    expect(page).toMatch(/from "@\/lib\/finance\/migration-import-fields"/);
    expect(page).not.toMatch(/key:\s*"/);
    for (const dt of IMPORT_DATA_TYPES) for (const f of IMPORT_FIELDS[dt]) expect(page).not.toContain(`"${f.key}"`);
  });
});

describe("rows built the browser's way", () => {
  it("auto matches headers, sends browser keys, and translates to the server's names", () => {
    const headers = ["Lot Number", "Unit Number", "Entitlement", "Floor Area", "Lot Type"];
    const mapping = autoDetectMapping("lots", headers);
    expect(mapping).toEqual({
      lot_number: "Lot Number",
      unit_number: "Unit Number",
      entitlement: "Entitlement",
      floor_area: "Floor Area",
      lot_type: "Lot Type",
    });
    const [row] = buildImportRows("lots", headers, [["1", "101", "25", "80", "Residential"]], mapping);
    expect(row).toEqual({
      rowNumber: 2,
      data: { lot_number: "1", unit_number: "101", entitlement: "25", floor_area: "80", lot_type: "Residential" },
      errors: [],
      warnings: [],
    });
    expect(toServerData("lots", row.data)).toEqual({ lotNumber: "1", unitNumber: "101", entitlement: "25", floorArea: "80", lotType: "Residential" });
  });

  it("prefers an exact header, so Account Sub Type placed first cannot take Account Type", () => {
    expect(autoDetectMapping("chart_of_accounts", ["Account Sub Type", "Account Type", "Account Code", "Account Name", "Fund"])).toEqual({
      sub_type: "Account Sub Type",
      account_type: "Account Type",
      account_code: "Account Code",
      account_name: "Account Name",
    });
  });

  it("prefers the shortest header holding every word when none is exact", () => {
    expect(autoDetectMapping("chart_of_accounts", ["GL Account Sub Type Name", "GL Account Type"]).account_type).toBe("GL Account Type");
  });

  it("matches the common short headers in full only", () => {
    expect(autoDetectMapping("lots", ["LotNo", "UnitNo", "Entitlement", "Area"])).toEqual({
      lot_number: "LotNo",
      unit_number: "UnitNo",
      entitlement: "Entitlement",
      floor_area: "Area",
    });
    expect(autoDetectMapping("chart_of_accounts", ["AccCode", "AccName", "AccType"])).toEqual({
      account_code: "AccCode",
      account_name: "AccName",
      account_type: "AccType",
    });
    expect(autoDetectMapping("lots", ["Common Area Levy"]).floor_area).toBeUndefined();
  });

  it("reads CSV the page's way", () => {
    expect(parseCsvContent('Lot Number,Entitlement\r\n\r\n"1, rear",10\n')).toEqual({ headers: ["Lot Number", "Entitlement"], rows: [["1, rear", "10"]] });
    expect(parseCsvContent("Lot Number,Entitlement\n")).toEqual({ headers: [], rows: [] });
  });

  it("flags an empty required field with the same words on both sides", () => {
    const headers = ["Account Code", "Account Name", "Account Type"];
    const [row] = buildImportRows("chart_of_accounts", headers, [["", "Bank", "ASSET"]], autoDetectMapping("chart_of_accounts", headers));
    expect(row.errors).toEqual(["Account Code is required"]);
    expect(missingRequired("chart_of_accounts", toServerData("chart_of_accounts", row.data))).toEqual(row.errors);
  });

  it("drops keys outside the table and non text values", () => {
    expect(toServerData("lots", { lotNumber: "1", lot_number: "2", entitlement: 5 })).toEqual({ lotNumber: "2" });
  });

  it("knows only the three data types the page builds", () => {
    expect(IMPORT_DATA_TYPES.filter(isImportDataType)).toEqual(["lots", "chart_of_accounts", "opening_balances"]);
    expect(isImportDataType("owners")).toBe(false);
    expect(isImportDataType("levy_arrears")).toBe(false);
  });
});
