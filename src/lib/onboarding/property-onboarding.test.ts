import { describe, expect, it } from "vitest";
import {
  blankLots,
  buildCutoverFiles,
  checkLotBalances,
  checkLots,
  checkOpeningBalances,
  checkYearEnd,
  currentYearEnd,
  emptyOpeningBalances,
  formatMoney,
  parseMoney,
  todayInSydney,
  yearStartFor,
  type OpeningBalancesInput,
} from "./property-onboarding";
import { parseCSVContent } from "@/lib/queries/data-migration";
import { toRecords } from "@/lib/finance/migration-templates";
import {
  controlTieOuts,
  openingTrialBalance,
  parseArrearsRow,
  parseCreditRow,
  parseOpeningRow,
  type Lookups,
} from "@/lib/finance/migration-cutover";

const TODAY = "2026-10-24";

describe("financial year end", () => {
  it("needs a full date in the current financial year", () => {
    expect(checkYearEnd("2027-06-30", TODAY)).toEqual({ ok: true, date: "2027-06-30", mmdd: "06-30" });
    expect(checkYearEnd("2026-12-31", TODAY)).toMatchObject({ ok: true, mmdd: "12-31" });
    expect(checkYearEnd("2026-10-24", TODAY)).toMatchObject({ ok: true }); // the last day of the year is today
    expect(checkYearEnd("2027-10-23", TODAY)).toMatchObject({ ok: true }); // the year began today
  });

  it("refuses a day and month alone, a passed date, one over a year away, and 29 February", () => {
    expect(checkYearEnd("06-30", TODAY)).toMatchObject({ ok: false, message: expect.stringContaining("full date") });
    expect(checkYearEnd("", TODAY)).toMatchObject({ ok: false });
    expect(checkYearEnd("2026-06-31", TODAY)).toMatchObject({ ok: false });
    expect(checkYearEnd("2026-06-30", TODAY)).toMatchObject({ ok: false, message: expect.stringContaining("has passed") });
    expect(checkYearEnd("2027-10-25", TODAY)).toMatchObject({ ok: false, message: expect.stringContaining("more than a year") });
    expect(checkYearEnd("2028-02-29", "2027-06-01")).toMatchObject({ ok: false, message: expect.stringContaining("29 February") });
  });

  it("works out the year start and the current year end from the day and month", () => {
    expect(yearStartFor("2027-06-30")).toBe("2026-07-01");
    expect(yearStartFor("2027-02-28")).toBe("2026-03-01");
    expect(yearStartFor("2026-12-31")).toBe("2026-01-01");
    expect(currentYearEnd("06-30", TODAY)).toBe("2027-06-30");
    expect(currentYearEnd("12-31", TODAY)).toBe("2026-12-31");
    expect(currentYearEnd("10-24", TODAY)).toBe("2026-10-24");
    expect(currentYearEnd("02-29", TODAY)).toBe("2027-02-28");
    // A legacy 29 February year end never becomes a date the edit form refuses, even in a leap year.
    expect(currentYearEnd("02-29", "2027-03-01")).toBe("2028-02-28");
    expect(checkYearEnd(currentYearEnd("02-29", "2027-03-01"), "2027-03-01")).toMatchObject({ ok: true });
  });

  it("gives today's date in Sydney", () => {
    // 2026-10-24 14:30 UTC is 25 October in Sydney (daylight saving, UTC+11).
    expect(todayInSydney(new Date("2026-10-24T14:30:00Z"))).toBe("2026-10-25");
    expect(todayInSydney(new Date("2026-10-24T02:00:00Z"))).toBe("2026-10-24");
  });
});

describe("money", () => {
  it("reads amounts typed in a form", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("1234")).toBe(123400);
    expect(parseMoney("1,234.5")).toBe(123450);
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("-12.00", { allowNegative: true })).toBe(-1200);
  });

  it("refuses what is not an amount", () => {
    expect(parseMoney("-12.00")).toBeNull();
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("1,23")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1e5")).toBeNull();
    expect(parseMoney("1234567890123")).toBeNull();
    // Ledger amounts are numeric(12,2): 10 whole digits at most.
    expect(parseMoney("9,999,999,999.99")).toBe(999_999_999_999);
    expect(parseMoney("10,000,000,000")).toBeNull();
  });

  it("formats cents", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(-5)).toBe("-$0.05");
  });
});

describe("lots and unit entitlements", () => {
  const rows = [
    { lotNumber: "1", unitNumber: "1", entitlement: "40", ownerName: "  JOHN CITIZEN & JANE CITIZEN " },
    { lotNumber: "2", unitNumber: "", entitlement: "60", ownerName: "ACME PTY LTD (ACN 000 000 000)" },
  ];

  it("passes when the count and the entitlement total both match", () => {
    const c = checkLots(rows, 2, 100);
    expect(c.ok).toBe(true);
    expect(c.lots).toEqual([
      { lotNumber: "1", unitNumber: "1", entitlement: 40, ownerName: "JOHN CITIZEN & JANE CITIZEN" },
      { lotNumber: "2", unitNumber: null, entitlement: 60, ownerName: "ACME PTY LTD (ACN 000 000 000)" },
    ]);
  });

  it("refuses a lot count that does not match the building's total lots", () => {
    const c = checkLots(rows, 3, 100);
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toContain("You have entered 2 lots, but the building has 3");
  });

  it("refuses unit entitlements that do not add up to the total", () => {
    const c = checkLots(rows, 2, 101);
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toContain("add up to 100, but the building's total unit entitlement is 101");
  });

  it("flags bad rows: missing or repeated lot numbers, bad entitlements, line breaks in names", () => {
    const c = checkLots(
      [
        { lotNumber: "", unitNumber: "", entitlement: "10", ownerName: "" },
        { lotNumber: "2", unitNumber: "", entitlement: "0", ownerName: "" },
        { lotNumber: " 2", unitNumber: "", entitlement: "1.5", ownerName: "" },
        { lotNumber: "4", unitNumber: "", entitlement: "10", ownerName: "A\nB" },
      ],
      4,
      30,
    );
    expect(c.ok).toBe(false);
    expect(c.rowErrors[0]).toContain("Enter the lot number.");
    expect(c.rowErrors[1]).toContain("The unit entitlement must be a whole number of at least 1.");
    expect(c.rowErrors[2]!.join(" ")).toContain("entered twice");
    expect(c.rowErrors[3]!.join(" ")).toContain("line break");
  });

  it("needs every lot's owner name as on the strata roll", () => {
    const c = checkLots([{ ...rows[0], ownerName: "   " }, rows[1]], 2, 100);
    expect(c.ok).toBe(false);
    expect(c.rowErrors[0]).toContain("Enter the owner's name as it appears on the strata roll.");
  });

  it("makes blank rows numbered 1 to n", () => {
    expect(blankLots(3).map((l) => l.lotNumber)).toEqual(["1", "2", "3"]);
    expect(blankLots(0)).toEqual([]);
  });
});

const goodBalances = (): OpeningBalancesInput => ({
  takeoverDate: "2026-09-30",
  totalBalance: "52,500.00",
  admin: { cashAtBank: "10,000", leviesReceivable: "1,500.00", leviesInAdvance: "500", creditors: "1,000", fundBalance: "10,000" },
  capitalWorks: { cashAtBank: "41,700", leviesReceivable: "800", leviesInAdvance: "", creditors: "0", fundBalance: "42,500" },
});

describe("building opening balances", () => {
  it("passes when each fund's balance sheet comes to its balance and the total adds up", () => {
    const c = checkOpeningBalances(goodBalances(), "2027-06-30", TODAY);
    expect(c.errors).toEqual([]);
    expect(c.fieldErrors).toEqual({});
    expect(c.ok).toBe(true);
    expect(c.total).toBe(5_250_000);
    expect(c.netAssets).toEqual({ admin: 1_000_000, capitalWorks: 4_250_000 });
  });

  it("refuses a fund whose balance sheet does not come to the fund balance", () => {
    const b = goodBalances();
    b.admin.fundBalance = "10,100";
    b.totalBalance = "52,600";
    const c = checkOpeningBalances(b, "2027-06-30", TODAY);
    expect(c.ok).toBe(false);
    expect(c.errors[0]).toContain("Administrative fund: the balance sheet comes to $10,000.00");
    expect(c.errors[0]).toContain("Difference -$100.00");
  });

  it("refuses a total that is not admin plus capital works", () => {
    const b = goodBalances();
    b.totalBalance = "52,000";
    const c = checkOpeningBalances(b, "2027-06-30", TODAY);
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toContain("must equal the administrative fund ($10,000.00) plus the capital works fund ($42,500.00)");
  });

  it("allows an overdrawn bank and a fund in deficit, but no negative receivables or creditors", () => {
    const b = goodBalances();
    b.admin = { cashAtBank: "-500", leviesReceivable: "300", leviesInAdvance: "0", creditors: "0", fundBalance: "-200" };
    b.totalBalance = "42,300";
    expect(checkOpeningBalances(b, "2027-06-30", TODAY).ok).toBe(true);
    b.admin.creditors = "-1";
    expect(checkOpeningBalances(b, "2027-06-30", TODAY).fieldErrors["admin.creditors"]).toBeDefined();
  });

  it("ignores levies paid in advance for capital works (credits are held in admin)", () => {
    const b = goodBalances();
    b.capitalWorks.leviesInAdvance = "999";
    expect(checkOpeningBalances(b, "2027-06-30", TODAY).capitalWorks.leviesInAdvance).toBe(0);
  });

  it("needs a takeover date in the current year (or the last day of the year before), not in the future", () => {
    const at = (d: string) => checkOpeningBalances({ ...goodBalances(), takeoverDate: d }, "2027-06-30", TODAY).fieldErrors.takeoverDate;
    expect(at("2026-06-30")).toBeUndefined();
    expect(at("2026-07-01")).toBeUndefined();
    expect(at(TODAY)).toBeUndefined();
    expect(at("2026-06-29")).toContain("current financial year");
    expect(at("2026-10-25")).toContain("future");
    expect(at("")).toContain("Enter the takeover date");
  });

  it("all blank is a building with nothing to bring across", () => {
    const c = checkOpeningBalances({ ...emptyOpeningBalances(), takeoverDate: "2026-10-01" }, "2027-06-30", TODAY);
    expect(c.ok).toBe(true);
    expect(c.total).toBe(0);
  });
});

describe("lot opening balances", () => {
  const lots = [{ lotNumber: "1" }, { lotNumber: "2" }];

  it("passes when each fund's levies and interest add up to its receivables, and unallocated to paid in advance", () => {
    const sheet = checkOpeningBalances(goodBalances(), "2027-06-30", TODAY);
    // The sheet: admin receivable 1,500, capital works 800, paid in advance 500.
    const c = checkLotBalances(
      [
        { lotNumber: "1", admin: "1,200", interestAdmin: "120", capitalWorks: "600", interestCapitalWorks: "60", unallocated: "" },
        { lotNumber: "2", admin: "", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "500" },
      ],
      lots,
      sheet,
    );
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toContain("Administrative fund levies and interest on the lots come to $1,320.00");
    expect(c.errors.join(" ")).toContain("Capital works fund levies and interest on the lots come to $660.00");

    // Interest as the previous system charged it, per fund: ties to the cent.
    const tied = checkLotBalances(
      [
        { lotNumber: "1", admin: "1,200", interestAdmin: "300", capitalWorks: "640", interestCapitalWorks: "160", unallocated: "" },
        { lotNumber: "2", admin: "", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "500" },
      ],
      lots,
      sheet,
    );
    expect(tied.ok).toBe(true);
    expect(tied.rows[0]).toMatchObject({ interestAdmin: 30000, interestCapitalWorks: 16000 });
    expect(tied.totals).toMatchObject({ receivableAdmin: 150000, receivableCapitalWorks: 80000, interestAdmin: 30000, interestCapitalWorks: 16000, unallocated: 50000 });
  });

  it("reads amounts typed as Urbanise prints them (owing as negative), SP 99999", () => {
    // SP 99999's balance sheet: $307.76 levies receivable (lot 14) and $160.78 paid in advance (lot 10).
    const sheet = {
      ...checkOpeningBalances({ ...emptyOpeningBalances(), takeoverDate: "2026-10-01" }, "2027-06-30", TODAY),
      admin: { cashAtBank: 0, leviesReceivable: 26356, leviesInAdvance: 16078, creditors: 0, fundBalance: 0 },
      capitalWorks: { cashAtBank: 0, leviesReceivable: 4420, leviesInAdvance: 0, creditors: 0, fundBalance: 0 },
    };
    const c = checkLotBalances(
      [
        { lotNumber: "1", admin: "-250.12", interestAdmin: "-13.44", capitalWorks: "-42.92", interestCapitalWorks: "-1.28", unallocated: "" },
        { lotNumber: "2", admin: "", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "160.78" },
      ],
      lots,
      sheet,
    );
    expect(c.rowErrors).toEqual({});
    expect(c.errors).toEqual([]);
    expect(c.rows[0]).toMatchObject({ admin: 25012, interestAdmin: 1344, capitalWorks: 4292, interestCapitalWorks: 128 });
    expect(c.totals).toMatchObject({ receivableAdmin: 26356, receivableCapitalWorks: 4420, unallocated: 16078 });
  });

  it("writes each lot number as the lot is numbered, whatever case was typed", () => {
    const sheet = checkOpeningBalances({ ...emptyOpeningBalances(), takeoverDate: "2026-10-01" }, "2027-06-30", TODAY);
    const c = checkLotBalances([{ lotNumber: " a1 ", admin: "", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "" }], [{ lotNumber: "A1" }], sheet);
    expect(c.ok).toBe(true);
    expect(c.rows[0].lotNumber).toBe("A1");
  });

  it("refuses unknown lots, repeated lots, amounts that are not money and missing lots", () => {
    const sheet = checkOpeningBalances({ ...emptyOpeningBalances(), takeoverDate: "2026-10-01" }, "2027-06-30", TODAY);
    const c = checkLotBalances(
      [
        { lotNumber: "1", admin: "12.3.4", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "" },
        { lotNumber: "1", admin: "", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "" },
        { lotNumber: "9", admin: "", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "" },
      ],
      lots,
      sheet,
    );
    expect(c.ok).toBe(false);
    expect(c.rowErrors[0]!.join(" ")).toContain('"12.3.4" is not an amount');
    expect(c.rowErrors[1]!.join(" ")).toContain("two opening balances");
    expect(c.rowErrors[2]!.join(" ")).toContain("not one of the building's lots");
    expect(c.errors.join(" ")).toContain("no opening balance row: 2");
  });
});

describe("the draft cutover", () => {
  const lookups: Lookups = {
    funds: [
      { id: "admin", name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
      { id: "cw", name: "Capital Works Fund", fundType: "CAPITAL_WORKS" },
    ],
    accounts: [
      { id: "bank", code: "1-1000", accountType: "ASSET", accountSubType: "BANK", fundId: "admin" },
      { id: "ar", code: "1-1100", accountType: "ASSET", accountSubType: "ACCOUNTS_RECEIVABLE", fundId: "admin" },
      { id: "ar-cw", code: "1-2100", accountType: "ASSET", accountSubType: "ACCOUNTS_RECEIVABLE", fundId: "cw" },
      { id: "ap", code: "2-1000", accountType: "LIABILITY", accountSubType: "ACCOUNTS_PAYABLE", fundId: "admin" },
      { id: "lia", code: "2-1300", accountType: "LIABILITY", accountSubType: "LEVIES_IN_ADVANCE", fundId: "admin" },
      { id: "ob", code: "3-1100", accountType: "EQUITY", accountSubType: "OPENING_BALANCE", fundId: "admin" },
      { id: "ob-cw", code: "3-2100", accountType: "EQUITY", accountSubType: "OPENING_BALANCE", fundId: "cw" },
    ],
    lots: [
      { id: "l1", lotNumber: "1" },
      { id: "l2", lotNumber: "2" },
    ],
    suppliers: [],
    bankAccounts: [],
  };
  const accounts = {
    bank: "1-1000",
    receivable: { admin: "1-1100", capitalWorks: "1-2100" },
    inAdvance: "2-1300",
    payable: "2-1000",
    opening: { admin: "3-1100", capitalWorks: "3-2100" },
  };
  const fundNames = { admin: "Administrative Fund", capitalWorks: "Capital Works Fund" };

  function parseFile<T>(file: { content: string; mapping: Record<string, number> }, type: "opening_balances" | "levy_arrears" | "owner_credits", parse: (r: Record<string, string>, n: number) => { value: T | null; errors: string[] }) {
    const { rows } = parseCSVContent(file.content);
    return toRecords(rows, file.mapping, type).map((r, i) => parse(r, i + 2));
  }

  it("is accepted by the cutover's own parsers, balances, and ties out with no differences", () => {
    const sheet = checkOpeningBalances(goodBalances(), "2027-06-30", TODAY);
    const lotsCheck = checkLotBalances(
      [
        { lotNumber: "1", admin: "1,200", interestAdmin: "300", capitalWorks: "640", interestCapitalWorks: "160", unallocated: "" },
        { lotNumber: "2", admin: "", interestAdmin: "", capitalWorks: "", interestCapitalWorks: "", unallocated: "500" },
      ],
      lookups.lots,
      sheet,
    );
    expect(sheet.ok && lotsCheck.ok).toBe(true);
    const files = buildCutoverFiles({ takeoverDate: sheet.takeoverDate!, balances: sheet, lotBalances: lotsCheck.rows, accounts, fundNames })!;

    const opening = parseFile(files.opening_balances, "opening_balances", (r, n) => parseOpeningRow(r, n, lookups));
    const arrears = parseFile(files.levy_arrears!, "levy_arrears", (r, n) => parseArrearsRow(r, n, lookups, "2026-09-30"));
    const credits = parseFile(files.owner_credits!, "owner_credits", (r, n) => parseCreditRow(r, n, lookups));
    for (const r of [...opening, ...arrears, ...credits]) expect(r.errors).toEqual([]);

    const lines = opening.map((r) => r.value!);
    expect(openingTrialBalance(lines)).toMatchObject({ balanced: true, differenceCents: 0 });
    // Capital works cash sits on the operating bank account, tagged to the capital works fund.
    expect(lines.find((l) => l.accountCode === "1-1000" && l.fundId === "cw")?.debitCents).toBe(4_170_000);

    const tieOuts = controlTieOuts(
      { opening_balances: opening as never, levy_arrears: arrears as never, owner_credits: credits as never },
      lookups.funds,
    );
    // Receivables and paid in advance tie exactly. Creditors have no invoice
    // detail yet, so that one is left for the Adviser to acknowledge or load.
    // The bank line is only shown (no bank accounts exist yet), never acknowledged.
    const ties = tieOuts.filter((t) => t.key !== "ap" && t.key !== "bank");
    expect(ties.map((t) => t.key).sort()).toEqual(["ar:admin", "ar:cw", "lia:admin"]);
    for (const t of ties) expect(t.differenceCents).toBe(0);
    expect(tieOuts.find((t) => t.key === "bank")?.needsAcknowledgement).toBe(false);
    expect(tieOuts.find((t) => t.key === "ap")?.ledgerCents).toBe(100_000);

    expect(arrears.map((r) => r.value)).toEqual([
      expect.objectContaining({ lotNumber: "1", fundId: "admin", dueDate: "2026-09-30", levyOutstandingCents: 120000, interestChargedCents: 30000 }),
      expect.objectContaining({ lotNumber: "1", fundId: "cw", levyOutstandingCents: 64000, interestChargedCents: 16000 }),
    ]);
    expect(credits.map((r) => r.value)).toEqual([expect.objectContaining({ lotNumber: "2", fundId: "admin", amountCents: 50000 })]);
    // Each brought-forward notice has its own short number, so long lot numbers cannot clash.
    expect(arrears.map((r) => r.value!.noticeNumber)).toEqual(["OB0001A", "OB0001C"]);
  });

  it("posts a deficit as a debit and an overdraft as a credit", () => {
    const b = goodBalances();
    b.admin = { cashAtBank: "-500", leviesReceivable: "300", leviesInAdvance: "0", creditors: "0", fundBalance: "-200" };
    b.totalBalance = "42,300";
    const sheet = checkOpeningBalances(b, "2027-06-30", TODAY);
    const files = buildCutoverFiles({ takeoverDate: "2026-09-30", balances: sheet, lotBalances: [], accounts, fundNames })!;
    const lines = parseFile(files.opening_balances, "opening_balances", (r, n) => parseOpeningRow(r, n, lookups)).map((r) => r.value!);
    expect(lines.find((l) => l.accountCode === "1-1000" && l.fundId === "admin")).toMatchObject({ debitCents: 0, creditCents: 50000 });
    expect(lines.find((l) => l.accountCode === "3-1100")).toMatchObject({ debitCents: 20000, creditCents: 0 });
    expect(openingTrialBalance(lines).balanced).toBe(true);
  });

  it("is nothing when every balance is zero", () => {
    const sheet = checkOpeningBalances({ ...emptyOpeningBalances(), takeoverDate: "2026-10-01" }, "2027-06-30", TODAY);
    expect(buildCutoverFiles({ takeoverDate: "2026-10-01", balances: sheet, lotBalances: [], accounts, fundNames })).toBeNull();
  });
});
