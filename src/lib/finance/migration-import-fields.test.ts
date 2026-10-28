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
const { IMPORT_FIELDS, IMPORT_DATA_TYPES, autoDetectMapping, buildImportRows, importFieldsFor, isImportDataType, missingRequired, parseCsvContent, toServerData } =
  await import("./migration-import-fields");
const { RULE_PACKS, PENDING_RULE_PACKS } = await import("@/config/statutory");
const { separateEntitlement } = await import("@/lib/jurisdiction/building-data");
type ImportField = import("./migration-import-fields").ImportField;

const fieldsOf = (dt: keyof typeof IMPORT_FIELDS) => IMPORT_FIELDS[dt] as readonly ImportField[];
const pairs = (dt: keyof typeof IMPORT_FIELDS) => Object.fromEntries(fieldsOf(dt).map((f) => [f.key, f.field]));
const allServerFields = (dt: keyof typeof IMPORT_FIELDS) => fieldsOf(dt).map((f) => f.field).sort();
// The fields every building's file carries: a second lot entitlement only some packs hold is checked on its own below.
const serverFields = (dt: keyof typeof IMPORT_FIELDS) => fieldsOf(dt).filter((f) => !f.separateEntitlement).map((f) => f.field).sort();
const required = (dt: keyof typeof IMPORT_FIELDS) => fieldsOf(dt).filter((f) => f.required).map((f) => f.field).sort();

// Queensland's pack (pending) and its interest schedule, as the migration page's server page passes it.
const QLD_SEPARATE = separateEntitlement(PENDING_RULE_PACKS.QLD.rules);
const qldSeparate = { field: QLD_SEPARATE!.field!, label: QLD_SEPARATE!.label };

describe("the browser key to server field table", () => {
  it("maps each browser key the page sends to the field the server reads", () => {
    expect(pairs("lots")).toEqual({
      lot_number: "lotNumber",
      unit_number: "unitNumber",
      entitlement: "entitlement",
      floor_area: "floorArea",
      lot_type: "lotType",
      interest_schedule_entitlement: "interestScheduleEntitlement",
      // Victoria's lot entitlement (stage 2, PR 4).
      lot_entitlement: "lotEntitlement",
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
      expect(new Set(allServerFields(dt)).size).toBe(keys.length);
    }
  });

  it("holds every second lot entitlement a rule pack keeps on its lots, never required in the table", () => {
    const packs = [...Object.values(RULE_PACKS), ...Object.values(PENDING_RULE_PACKS)];
    const held = packs.map((p) => separateEntitlement(p.rules as Parameters<typeof separateEntitlement>[0])?.field).filter((f): f is NonNullable<typeof f> => !!f);
    expect(held).toContain("interestScheduleEntitlement");
    const separate = fieldsOf("lots").filter((f) => f.separateEntitlement);
    expect(separate.map((f) => f.field).sort()).toEqual([...new Set(held)].sort());
    for (const f of separate) {
      expect(f.required).toBe(false);
      // A snake_case browser key, like every other column.
      expect(f.key).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
    // Only lots carry one.
    for (const dt of ["chart_of_accounts", "opening_balances"] as const) expect(fieldsOf(dt).some((f) => f.separateEntitlement)).toBe(false);
  });

  it("shows the interest schedule column only for a building whose pack holds it, required and under the pack's label", () => {
    expect(importFieldsFor("lots").map((f) => f.field)).not.toContain("interestScheduleEntitlement");
    // NSW lots hold one entitlement, so its server page passes null.
    expect(separateEntitlement(RULE_PACKS.NSW.rules)).toBeNull();
    expect(importFieldsFor("lots", null)).toEqual(importFieldsFor("lots"));
    const qld = importFieldsFor("lots", qldSeparate).find((f) => f.field === "interestScheduleEntitlement");
    expect(qld).toMatchObject({ key: "interest_schedule_entitlement", label: "Interest Schedule Lot Entitlement", required: true });
    expect(qld!.label).toBe(QLD_SEPARATE!.label);
    // A schedule held in another field never borrows this column.
    expect(importFieldsFor("lots", { field: "somethingElse", label: "X" })).toEqual(importFieldsFor("lots"));
    // The table's own required list is unchanged: the pack decides.
    expect(missingRequired("lots", { lotNumber: "1", entitlement: "5" })).toEqual([]);
  });

  it("shows Victoria's lot entitlement column for a Victorian building only, required, and sends it under its own key (stage 2, PR 4)", () => {
    const vicSeparate = separateEntitlement(PENDING_RULE_PACKS.VIC.rules as Parameters<typeof separateEntitlement>[0])!;
    const vic = { field: vicSeparate.field!, label: vicSeparate.label };
    expect(vic).toEqual({ field: "lotEntitlement", label: "Lot Entitlement" });
    const fields = importFieldsFor("lots", vic);
    expect(fields.filter((f) => f.separateEntitlement).map((f) => [f.key, f.field, f.label, f.required])).toEqual([["lot_entitlement", "lotEntitlement", "Lot Entitlement", true]]);
    // Neither second column for NSW, and only its own for Queensland.
    expect(importFieldsFor("lots").map((f) => f.field)).not.toContain("lotEntitlement");
    expect(importFieldsFor("lots", qldSeparate).map((f) => f.field)).not.toContain("lotEntitlement");

    const headers = ["Lot", "Lot Liability", "Lot Entitlement"];
    const mapping = autoDetectMapping("lots", headers, vic);
    expect(mapping).toEqual({ lot_entitlement: "Lot Entitlement" });
    const rows = buildImportRows("lots", headers, [["1", "1", "60"], ["2", "1", ""]], { ...mapping, lot_number: "Lot", entitlement: "Lot Liability" }, vic);
    expect(rows.map((r) => [r.data, r.errors])).toEqual([
      [{ lot_number: "1", entitlement: "1", lot_entitlement: "60" }, []],
      // An empty one is refused by the server against the pack (validateLots), for the preview and the import alike, as Queensland's is.
      [{ lot_number: "2", entitlement: "1", lot_entitlement: "" }, []],
    ]);
    expect(toServerData("lots", rows[0].data)).toEqual({ lotNumber: "1", entitlement: "1", lotEntitlement: "60" });
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

  it("matches and sends a Queensland lot's interest schedule column under its browser key", () => {
    const headers = ["Lot Number", "Contribution Schedule Lot Entitlement", "Interest Schedule Lot Entitlement"];
    const mapping = autoDetectMapping("lots", headers, qldSeparate);
    expect(mapping).toEqual({
      lot_number: "Lot Number",
      entitlement: "Contribution Schedule Lot Entitlement",
      interest_schedule_entitlement: "Interest Schedule Lot Entitlement",
    });
    const [row] = buildImportRows("lots", headers, [["1", "10", "12"]], mapping, qldSeparate);
    expect(row.data).toEqual({ lot_number: "1", entitlement: "10", interest_schedule_entitlement: "12" });
    expect(toServerData("lots", row.data)).toEqual({ lotNumber: "1", entitlement: "10", interestScheduleEntitlement: "12" });
    // An NSW building does not map or send the column.
    expect(autoDetectMapping("lots", headers).interest_schedule_entitlement).toBeUndefined();
    expect(buildImportRows("lots", headers, [["1", "10", "12"]], mapping)[0].data).not.toHaveProperty("interest_schedule_entitlement");
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
