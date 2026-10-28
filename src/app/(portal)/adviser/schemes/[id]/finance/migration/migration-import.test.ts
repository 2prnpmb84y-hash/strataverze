/**
 * The CSV import on the adviser data migration page, end to end through the
 * server actions, with rows in the exact shape the browser sends: each mapped
 * column under its snake_case browser key. An earlier test fed camelCase
 * straight into importLots, which hid that the browser and the server used
 * different keys and that every lots and chart of accounts file was refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
// A building on Queensland's pack, for the interest schedule (stage 2, step 10). Written while the pack was pending; it is live from 28 Oct 2026.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) =>
    state === "QLD-SHAPED" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(state);
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { AuthorisationError } = await import("@/lib/auth/require-membership");
const { processMigrationAction, validateMigrationAction } = await import("./actions");
const { logActivity } = await import("@/lib/queries/activity-log");
// The page's own CSV reader, header match and row builder (migration-client.tsx imports these).
const { autoDetectMapping, buildImportRows, parseCsvContent } = await import("@/lib/finance/migration-import-fields");
const { separateEntitlement } = await import("@/lib/jurisdiction/building-data");
const { rulesForState } = await import("@/lib/jurisdiction/scheme-rules");

const SCHEME = "11111111-0000-0000-0000-000000000001";
const OTHER = "22222222-0000-0000-0000-000000000002";
const QLD = "33333333-0000-0000-0000-000000000003";

type BrowserRow = { rowNumber: number; data: Record<string, string>; errors: string[]; warnings: string[] };
const row = (rowNumber: number, data: Record<string, string>): BrowserRow => ({ rowNumber, data, errors: [], warnings: [] });

/** What the browser does: preview first, then import the rows the preview returned. */
async function previewThenImport(dataType: string, rows: BrowserRow[], schemeId = SCHEME) {
  const preview = await validateMigrationAction(schemeId, dataType, rows);
  expect(preview.error).toBeUndefined();
  const previewRows = preview.data!.rows as BrowserRow[];
  const imported = await processMigrationAction(schemeId, "stratamax", dataType, previewRows);
  return { preview, previewRows, imported };
}

const lots = () => sharedFake.table("Lot").filter((l) => l.schemeId === SCHEME);
const accounts = () => sharedFake.table("AccountCode").filter((a) => a.schemeId === SCHEME);

beforeEach(() => {
  vi.clearAllMocks();
  membership.mockResolvedValue({ profile: { id: "adviser" }, membership: { role: "ADVISER", profileId: "adviser" }, roles: ["ADVISER"] });
  sharedFake.reset({
    // The lot checks read each building's rule pack (stage 2, step 10), so each building has its state.
    Scheme: [{ id: SCHEME, state: "NSW" }, { id: OTHER, state: "NSW" }, { id: QLD, state: "QLD-SHAPED" }],
    Lot: [
      { id: "lot-existing", schemeId: SCHEME, lotNumber: "9" },
      { id: "lot-other", schemeId: OTHER, lotNumber: "1" },
    ],
    Fund: [
      { id: "fund-admin", schemeId: SCHEME, name: "Administrative Fund", fundType: "ADMINISTRATIVE", deletedAt: null },
      { id: "fund-cw", schemeId: SCHEME, name: "Capital Works Fund", fundType: "CAPITAL_WORKS", deletedAt: null },
    ],
    AccountCode: [{ id: "acc-existing", schemeId: SCHEME, code: "1000", name: "Bank", accountType: "ASSET", isActive: true }],
  });
});

describe("lots import with the keys the browser sends", () => {
  const file = [
    row(2, { lot_number: "1", unit_number: "101", entitlement: "25", floor_area: "82.5", lot_type: "residential" }),
    row(3, { lot_number: "2", unit_number: "", entitlement: "30" }),
  ];

  it("previews the rows as valid and creates every lot with its fields", async () => {
    const { preview, previewRows, imported } = await previewThenImport("lots", file);
    expect(preview.data).toMatchObject({ totalRows: 2, validCount: 2, errorCount: 0 });
    // The preview hands back the browser's own keys, so its table and the import still read them.
    expect(previewRows[0].data).toEqual(file[0].data);
    expect(imported).toEqual({ success: true, data: { created: 2, total: 2, skipped: 0 } });
    expect(lots()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lotNumber: "1", unitNumber: "101", entitlement: 25, floorArea: 82.5, lotType: "RESIDENTIAL" }),
        expect.objectContaining({ lotNumber: "2", unitNumber: null, entitlement: 30, floorArea: null, lotType: "RESIDENTIAL" }),
      ]),
    );
    expect(lots()).toHaveLength(3);
  });

  it("flags a missing lot number in the preview, and the import skips that row", async () => {
    const rows = [row(2, { lot_number: "", entitlement: "10" }), row(3, { lot_number: "3", entitlement: "12" })];
    const { previewRows, imported } = await previewThenImport("lots", rows);
    expect(previewRows[0].errors).toEqual(["Lot Number is required"]);
    expect(previewRows[1].errors).toEqual([]);
    expect(imported).toEqual({ success: true, data: { created: 1, total: 2, skipped: 1 } });
    expect(lots().map((l) => l.lotNumber).sort()).toEqual(["3", "9"]);
  });

  it("keeps the real field rules: duplicates, existing lots and a bad entitlement", async () => {
    const rows = [
      row(2, { lot_number: "4", entitlement: "abc" }),
      row(3, { lot_number: "5", entitlement: "10" }),
      row(4, { lot_number: "5", entitlement: "10" }),
      row(5, { lot_number: "9", entitlement: "10" }),
    ];
    const { previewRows, imported } = await previewThenImport("lots", rows);
    expect(previewRows.map((r) => r.errors)).toEqual([
      ['Entitlement "abc" is not a valid number'],
      [],
      ['Duplicate lot number "5" — also on row 3'],
      ['Lot number "9" already exists in this scheme'],
    ]);
    expect(imported).toEqual({ success: true, data: { created: 1, total: 4, skipped: 3 } });
  });

  it("does not trust the error lists the browser sends", async () => {
    // A tampered request that claims a row with no entitlement is clean.
    const imported = await processMigrationAction(SCHEME, "stratamax", "lots", [row(2, { lot_number: "6", entitlement: "" })]);
    expect(imported).toEqual({ error: "No valid rows to import." });
    expect(lots()).toHaveLength(1);
  });

  it("drops keys that are not in the mapping, so a camelCase row is not read", async () => {
    const imported = await processMigrationAction(SCHEME, "stratamax", "lots", [row(2, { lotNumber: "7", entitlement: "10" })]);
    expect(imported).toEqual({ error: "No valid rows to import." });
  });
});

describe("chart of accounts import with the keys the browser sends", () => {
  it("previews the rows as valid and creates every account with its fund", async () => {
    const file = [
      row(2, { account_code: "4000", account_name: "Levy income", account_type: "income", sub_type: "levy_income", fund_name: "Capital Works Fund" }),
      row(3, { account_code: "5000", account_name: "Insurance", account_type: "EXPENSE" }),
    ];
    const { preview, imported } = await previewThenImport("chart_of_accounts", file);
    expect(preview.data).toMatchObject({ totalRows: 2, validCount: 2, errorCount: 0 });
    expect(imported).toEqual({ success: true, data: { created: 2, total: 2, skipped: 0 } });
    expect(accounts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "4000", name: "Levy income", accountType: "INCOME", accountSubType: "LEVY_INCOME", fundId: "fund-cw" }),
        expect.objectContaining({ code: "5000", name: "Insurance", accountType: "EXPENSE", accountSubType: null, fundId: "fund-admin" }),
      ]),
    );
  });

  it("flags missing and invalid fields in the preview, and the import agrees", async () => {
    const file = [
      row(2, { account_code: "", account_name: "No code", account_type: "ASSET" }),
      row(3, { account_code: "6000", account_name: "Odd", account_type: "WIDGET" }),
      row(4, { account_code: "1000", account_name: "Bank again", account_type: "ASSET" }),
      row(5, { account_code: "6100", account_name: "Cleaning", account_type: "EXPENSE" }),
    ];
    const { previewRows, imported } = await previewThenImport("chart_of_accounts", file);
    expect(previewRows.map((r) => r.errors)).toEqual([
      ["Account Code is required"],
      ['Invalid account type "WIDGET" — must be one of: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE'],
      ['Account code "1000" already exists in this scheme'],
      [],
    ]);
    expect(imported).toEqual({ success: true, data: { created: 1, total: 4, skipped: 3 } });
  });
});

describe("opening balances with the keys the browser sends", () => {
  it("reads the account code, debit and credit in the preview", async () => {
    const rows = [row(2, { account_code: "1000", debit: "500", credit: "" }), row(3, { account_code: "7777", debit: "", credit: "400" })];
    const preview = await validateMigrationAction(SCHEME, "opening_balances", rows);
    const out = preview.data!.rows as BrowserRow[];
    expect(out[0].errors).toEqual(["Opening balances are not balanced: total debits ($500.00) ≠ total credits ($400.00)"]);
    expect(out[1].errors).toEqual(['Account code "7777" does not exist in this scheme']);
  });

  it("still sends the import to the cutover", async () => {
    const imported = await processMigrationAction(SCHEME, "stratamax", "opening_balances", [row(2, { account_code: "1000", debit: "1", credit: "1" })]);
    expect(imported.error).toMatch(/^Opening balances now go through the cutover/);
  });
});

describe("a CSV file taken through the browser's own steps", () => {
  // The same helpers the page calls: header auto match, then row building.
  const fromCsv = (dataType: "lots" | "chart_of_accounts", csv: string) => {
    const { headers, rows } = parseCsvContent(csv);
    return buildImportRows(dataType, headers, rows, autoDetectMapping(dataType, headers));
  };

  it("imports a lots file", async () => {
    const rows = fromCsv("lots", "Lot Number,Unit Number,Entitlement,Floor Area,Lot Type\n1,101,25,80,Residential\n2,,30,,Commercial\n,103,5,,\n");
    expect(rows[2].errors).toEqual(["Lot Number is required"]);
    const { preview, imported } = await previewThenImport("lots", rows);
    expect(preview.data).toMatchObject({ totalRows: 3, validCount: 2, errorCount: 1 });
    expect(imported).toEqual({ success: true, data: { created: 2, total: 3, skipped: 1 } });
    expect(lots().find((l) => l.lotNumber === "2")).toMatchObject({ unitNumber: null, entitlement: 30, lotType: "COMMERCIAL" });
  });

  it("maps Account Type correctly when Account Sub Type comes first", async () => {
    const rows = fromCsv("chart_of_accounts", "Account Sub Type,Account Type,Account Code,Account Name\nLEVY_INCOME,INCOME,4300,Special levy\n");
    expect(rows[0].data).toEqual({ account_code: "4300", account_name: "Special levy", account_type: "INCOME", sub_type: "LEVY_INCOME" });
    const { imported } = await previewThenImport("chart_of_accounts", rows);
    expect(imported).toMatchObject({ success: true, data: { created: 1 } });
    expect(accounts().find((a) => a.code === "4300")).toMatchObject({ accountType: "INCOME", accountSubType: "LEVY_INCOME" });
  });

  it("imports a StrataMax style lots file with short headers", async () => {
    const rows = fromCsv("lots", "LotNo,UnitNo,Entitlement,Area,Type\n5,5A,12,60,Residential\n");
    const { imported } = await previewThenImport("lots", rows);
    expect(imported).toMatchObject({ success: true, data: { created: 1 } });
    expect(lots().find((l) => l.lotNumber === "5")).toMatchObject({ unitNumber: "5A", entitlement: 12, floorArea: 60 });
  });

  it("imports a chart of accounts file", async () => {
    const rows = fromCsv("chart_of_accounts", "Account Code,Account Name,Account Type,Sub Type,Fund Name\n4000,Levy income,INCOME,LEVY_INCOME,Administrative Fund\n");
    const { imported } = await previewThenImport("chart_of_accounts", rows);
    expect(imported).toEqual({ success: true, data: { created: 1, total: 1, skipped: 0 } });
    expect(accounts().find((a) => a.code === "4000")).toMatchObject({ name: "Levy income", accountType: "INCOME", fundId: "fund-admin" });
  });
});

describe("a Queensland lots file with the interest schedule lot entitlement (stage 2, step 10)", () => {
  // What the migration page's server page passes the browser for this building.
  const separate = separateEntitlement(rulesForState("QLD-SHAPED").rules);
  const building = { field: separate!.field!, label: separate!.label };
  const qldLots = () => sharedFake.table("Lot").filter((l) => l.schemeId === QLD);
  const fromCsv = (csv: string, forBuilding: typeof building | null = building) => {
    const { headers, rows } = parseCsvContent(csv);
    return buildImportRows("lots", headers, rows, autoDetectMapping("lots", headers, forBuilding), forBuilding);
  };
  const CSV =
    "Lot Number,Unit Number,Contribution Schedule Lot Entitlement,Interest Schedule Lot Entitlement,Lot Type\n" +
    "1,101,10,12,Residential\n" +
    "2,102,10,,Residential\n" +
    "3,103,10,2.5,Residential\n" +
    "4,104,15,0,Residential\n" +
    "5,105,15,20,Commercial\n";

  it("sends the column under its browser key, and the preview and the import agree on it", async () => {
    const rows = fromCsv(CSV);
    expect(rows[0].data).toEqual({ lot_number: "1", unit_number: "101", entitlement: "10", lot_type: "Residential", interest_schedule_entitlement: "12" });
    const { preview, previewRows, imported } = await previewThenImport("lots", rows, QLD);
    expect(preview.data).toMatchObject({ totalRows: 5, validCount: 2, errorCount: 3 });
    expect(previewRows.map((r) => r.errors)).toEqual([
      [],
      ["Enter the interest schedule lot entitlement."],
      ["Interest Schedule Lot Entitlement must be a whole number of at least 1."],
      ["Interest Schedule Lot Entitlement must be a whole number of at least 1."],
      [],
    ]);
    // The preview hands back the browser's keys, and the import skips exactly the rows it flagged.
    expect(previewRows[0].data.interest_schedule_entitlement).toBe("12");
    expect(imported).toEqual({ success: true, data: { created: 2, total: 5, skipped: 3 } });
    expect(qldLots()).toEqual([
      expect.objectContaining({ lotNumber: "1", entitlement: 10, interestScheduleEntitlement: 12, lotType: "RESIDENTIAL" }),
      expect.objectContaining({ lotNumber: "5", entitlement: 15, interestScheduleEntitlement: 20, lotType: "COMMERCIAL" }),
    ]);
  });

  it("refuses every row of a Queensland file sent without the column, even if the browser says they are clean", async () => {
    const rows = fromCsv("Lot Number,Entitlement\n1,10\n", null);
    const preview = await validateMigrationAction(QLD, "lots", rows);
    expect((preview.data!.rows as BrowserRow[])[0].errors).toEqual(["Enter the interest schedule lot entitlement."]);
    expect(await processMigrationAction(QLD, "stratamax", "lots", rows)).toEqual({ error: "No valid rows to import." });
    expect(qldLots()).toHaveLength(0);
  });

  it("does not read the server's camelCase name from the browser", async () => {
    const tampered = [row(2, { lot_number: "1", entitlement: "10", interestScheduleEntitlement: "12" })];
    expect(await processMigrationAction(QLD, "stratamax", "lots", tampered)).toEqual({ error: "No valid rows to import." });
  });

  it("refuses a lots file for a building with no rule pack, in plain words, and saves nothing", async () => {
    sharedFake.table("Scheme").push({ id: "44444444-0000-0000-0000-000000000004", state: "ZZ" });
    const rows = [row(2, { lot_number: "1", entitlement: "10" })];
    const preview = await validateMigrationAction("44444444-0000-0000-0000-000000000004", "lots", rows);
    expect(preview.error).toMatch(/^StrataVerze has no strata rules for ZZ yet/);
    const imported = await processMigrationAction("44444444-0000-0000-0000-000000000004", "stratamax", "lots", rows);
    expect(imported.error).toMatch(/^StrataVerze has no strata rules for ZZ yet/);
    expect(sharedFake.table("Lot").filter((l) => l.schemeId === "44444444-0000-0000-0000-000000000004")).toHaveLength(0);
  });

  it("ignores the column for an NSW building, and never writes it", async () => {
    const rows = fromCsv("Lot Number,Entitlement,Interest Schedule Lot Entitlement\n7,10,12\n", null);
    expect(rows[0].data).not.toHaveProperty("interest_schedule_entitlement");
    // Even when a browser sends it anyway.
    const sent = [row(2, { lot_number: "7", entitlement: "10", interest_schedule_entitlement: "oops" })];
    const { previewRows, imported } = await previewThenImport("lots", sent);
    expect(previewRows[0].errors).toEqual([]);
    expect(imported).toMatchObject({ success: true, data: { created: 1 } });
    expect("interestScheduleEntitlement" in lots().find((l) => l.lotNumber === "7")!).toBe(false);
  });
});

describe("field rules the database would otherwise enforce at import", () => {
  it("refuses a decimal or too large entitlement in the preview, since the column holds whole numbers", async () => {
    const rows = [row(2, { lot_number: "1", entitlement: "25.5" }), row(3, { lot_number: "2", entitlement: "3000000000" }), row(4, { lot_number: "3", entitlement: "25" })];
    const { previewRows, imported } = await previewThenImport("lots", rows);
    expect(previewRows.map((r) => r.errors)).toEqual([
      ["Entitlement must be a whole number, got 25.5"],
      ["Entitlement is too large, the most allowed is 2147483647"],
      [],
    ]);
    expect(imported).toEqual({ success: true, data: { created: 1, total: 3, skipped: 2 } });
  });

  it("warns about a floor area that is not a number and stores none, not NaN", async () => {
    const { previewRows, imported } = await previewThenImport("lots", [row(2, { lot_number: "1", entitlement: "10", floor_area: "big" })]);
    expect(previewRows[0].errors).toEqual([]);
    expect(previewRows[0].warnings).toEqual(['Floor area "big" is not a valid number — will be skipped']);
    expect(imported).toMatchObject({ success: true, data: { created: 1 } });
    expect(lots().find((l) => l.lotNumber === "1")?.floorArea).toBeNull();
  });

  it("checks the lot type against the lot form's list, in any case", async () => {
    const rows = [row(2, { lot_number: "1", entitlement: "10", lot_type: "Car Space" }), row(3, { lot_number: "2", entitlement: "10", lot_type: "parking" })];
    const { previewRows, imported } = await previewThenImport("lots", rows);
    expect(previewRows[0].errors).toEqual(['Lot type "Car Space" is not a valid lot type. Use one of: RESIDENTIAL, COMMERCIAL, PARKING, STORAGE, COMMON']);
    expect(previewRows[1].errors).toEqual([]);
    expect(imported).toMatchObject({ success: true, data: { created: 1, skipped: 1 } });
    expect(lots().find((l) => l.lotNumber === "2")?.lotType).toBe("PARKING");
  });

  it("refuses an account code over 10 characters and a name over 200", async () => {
    const rows = [
      row(2, { account_code: "12345678901", account_name: "Long code", account_type: "ASSET" }),
      row(3, { account_code: "4100", account_name: "x".repeat(201), account_type: "INCOME" }),
      row(4, { account_code: "1234567890", account_name: "y".repeat(200), account_type: "INCOME" }),
    ];
    const { previewRows, imported } = await previewThenImport("chart_of_accounts", rows);
    expect(previewRows.map((r) => r.errors)).toEqual([
      ['Account code "12345678901" is longer than 10 characters'],
      ["Account name is longer than 200 characters (it has 201)"],
      [],
    ]);
    expect(imported).toMatchObject({ success: true, data: { created: 1, skipped: 2 } });
  });

  it("stores a blank sub type as none, not an empty string", async () => {
    await previewThenImport("chart_of_accounts", [row(2, { account_code: "4200", account_name: "Interest", account_type: "INCOME", sub_type: "  " })]);
    expect(accounts().find((a) => a.code === "4200")?.accountSubType).toBeNull();
  });
});

describe("fund matching for the chart of accounts", () => {
  const acct = (rowNumber: number, code: string, fund: string) => row(rowNumber, { account_code: code, account_name: `Account ${code}`, account_type: "EXPENSE", fund_name: fund });

  it("matches a fund by name or type, ignoring case, spaces, underscores and a trailing fund", async () => {
    const rows = [acct(2, "5001", "Capital Works"), acct(3, "5002", "capital_works"), acct(4, "5003", "ADMINISTRATIVE FUND"), acct(5, "5004", "  administrative  ")];
    const { previewRows, imported } = await previewThenImport("chart_of_accounts", rows);
    expect(previewRows.every((r) => r.errors.length === 0)).toBe(true);
    expect(imported).toMatchObject({ success: true, data: { created: 4 } });
    expect(Object.fromEntries(accounts().map((a) => [a.code, a.fundId]))).toMatchObject({ "5001": "fund-cw", "5002": "fund-cw", "5003": "fund-admin", "5004": "fund-admin" });
  });

  it("flags a fund name that matches nothing in the preview, and never puts it in another fund", async () => {
    const { previewRows, imported } = await previewThenImport("chart_of_accounts", [acct(2, "5005", "Sinking Fund")]);
    expect(previewRows[0].errors).toEqual(['Fund "Sinking Fund" does not match any fund in this scheme']);
    expect(imported).toEqual({ error: "No valid rows to import." });
    expect(accounts().find((a) => a.code === "5005")).toBeUndefined();
  });

  it("accepts a sinking fund only when the building has a fund by that name", async () => {
    sharedFake.table("Fund").push({ id: "fund-sink", schemeId: SCHEME, name: "Sinking Fund", fundType: "CAPITAL_WORKS", deletedAt: null });
    const { imported } = await previewThenImport("chart_of_accounts", [acct(2, "5006", "sinking")]);
    expect(imported).toMatchObject({ success: true, data: { created: 1 } });
    expect(accounts().find((a) => a.code === "5006")?.fundId).toBe("fund-sink");
  });

  it("flags a fund type shared by two funds, rather than guessing", async () => {
    sharedFake.table("Fund").push(
      { id: "fund-lift", schemeId: SCHEME, name: "Lift Levy Fund", fundType: "SPECIAL", deletedAt: null },
      { id: "fund-roof", schemeId: SCHEME, name: "Roof Levy Fund", fundType: "SPECIAL", deletedAt: null },
    );
    const { previewRows, imported } = await previewThenImport("chart_of_accounts", [acct(2, "5007", "Special"), acct(3, "5009", "Roof Levy")]);
    expect(previewRows[0].errors).toEqual([`Fund "Special" matches more than one fund in this scheme. Use the fund's full name`]);
    expect(previewRows[1].errors).toEqual([]);
    expect(imported).toMatchObject({ success: true, data: { created: 1, skipped: 1 } });
    expect(accounts().find((a) => a.code === "5009")?.fundId).toBe("fund-roof");
  });

  it("keeps the default fund for a blank fund name", async () => {
    await previewThenImport("chart_of_accounts", [acct(2, "5008", "")]);
    expect(accounts().find((a) => a.code === "5008")?.fundId).toBe("fund-admin");
  });
});

describe("an insert that fails at import", () => {
  it("saves nothing and says which row failed", async () => {
    // Stand in for Postgres: a failed insert aborts the transaction, which rolls back on a throw.
    const realTransaction = sharedFake.db.transaction;
    const spy = vi.spyOn(sharedFake.db, "transaction").mockImplementation(async (fn) => {
      const before = sharedFake.table("Lot").map((r) => ({ ...r }));
      const orm = {
        public: new Proxy({} as typeof sharedFake.db.orm.public, {
          get: (_t, name: string) => {
            const model = sharedFake.db.orm.public[name];
            if (name !== "Lot") return model;
            return { ...model, create: async (data: Record<string, unknown>) => {
              if (data.lotNumber === "2") throw new Error('duplicate key value violates unique constraint "lots_scheme_id_lot_number_key"');
              return model.create(data);
            } };
          },
        }),
      };
      try {
        return await fn({ orm });
      } catch (err) {
        sharedFake.table("Lot").splice(0, Infinity, ...before);
        throw err;
      }
    });
    const rows = [row(2, { lot_number: "1", entitlement: "10" }), row(3, { lot_number: "2", entitlement: "10" }), row(4, { lot_number: "3", entitlement: "10" })];
    const { imported } = await previewThenImport("lots", rows);
    expect(imported).toEqual({ error: "Row 3 could not be saved, so nothing was imported. Check that row and try again." });
    expect(lots()).toHaveLength(1);
    expect(logActivity).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(sharedFake.db.transaction).toBe(realTransaction);
  });
});

describe("authorisation and unknown types", () => {
  it("refuses someone who is not an adviser of the building, before reading any row", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have access to this building."));
    const rows = [row(2, { lot_number: "8", entitlement: "10" })];
    expect(await validateMigrationAction(SCHEME, "lots", rows)).toEqual({ error: "You do not have access to this building." });
    expect(await processMigrationAction(SCHEME, "stratamax", "lots", rows)).toEqual({ error: "You do not have access to this building." });
    expect(membership).toHaveBeenCalledWith(SCHEME, ["ADVISER"]);
    expect(lots()).toHaveLength(1);
  });

  it("refuses an unknown data type", async () => {
    expect(await validateMigrationAction(SCHEME, "owners", [])).toEqual({ error: "Unknown data type: owners" });
    expect(await processMigrationAction(SCHEME, "stratamax", "owners", [])).toEqual({ error: "Unknown data type: owners" });
  });
});
