import { describe, expect, it } from "vitest";
import { auditLotCount, auditRequired, keyFinancialInformation, leviesRaisedForYear, ownersFundsCents, unpaidAt } from "./key-financial-information";
import type { BasisEntry, BasisLine } from "./accounting-basis";

const l = (accountType: string, accountSubType: string, debit: number, credit: number): BasisLine => ({
  accountId: accountSubType,
  accountCode: accountSubType,
  accountName: accountSubType,
  accountType,
  accountSubType,
  fundId: "admin",
  debitCents: debit,
  creditCents: credit,
});

const entries: BasisEntry[] = [
  { id: "open", date: "2026-06-30", sourceType: "DATA_MIGRATION", sourceId: null, lines: [l("ASSET", "BANK", 500_000, 0), l("EQUITY", "OPENING_BALANCE", 0, 500_000)] },
  { id: "raise", date: "2026-07-01", sourceType: "LEVY_RAISED", sourceId: "s", lines: [l("ASSET", "ACCOUNTS_RECEIVABLE", 1_000_000, 0), l("INCOME", "LEVY_INCOME", 0, 1_000_000)] },
  { id: "rcpt", date: "2026-08-01", sourceType: "PAYMENT", sourceId: "n", lines: [l("ASSET", "BANK", 800_000, 0), l("ASSET", "ACCOUNTS_RECEIVABLE", 0, 800_000)] },
  { id: "inv", date: "2026-09-01", sourceType: "INVOICE", sourceId: "i", lines: [l("EXPENSE", "MAINTENANCE_EXPENSE", 300_000, 0), l("LIABILITY", "ACCOUNTS_PAYABLE", 0, 300_000)] },
];

describe("statement of key financial information", () => {
  it("works out owners' funds from assets less liabilities", () => {
    expect(ownersFundsCents(entries, "admin", "2026-06-30")).toBe(500_000);
    expect(ownersFundsCents(entries, "admin", "2027-06-30")).toBe(500_000 + 1_000_000 - 300_000);
  });

  it("counts contributions unpaid at the end, ignoring later payments", () => {
    const notices = [
      { dueDate: "2027-04-01", owedCents: 100_000, payments: [{ date: "2027-07-05", amountCents: 100_000 }] },
      { dueDate: "2027-07-01", owedCents: 100_000, payments: [] },
    ];
    expect(unpaidAt(notices, "2027-06-30")).toBe(100_000);
  });

  it("fills the rows of the form", () => {
    const k = keyFinancialInformation({
      entries,
      fundId: "admin",
      start: "2026-07-01",
      end: "2027-06-30",
      dayBefore: "2026-06-30",
      recognised: [
        { accountType: "INCOME", accountSubType: "LEVY_INCOME", amountCents: 1_000_000 },
        { accountType: "EXPENSE", accountSubType: "MAINTENANCE_EXPENSE", amountCents: 300_000 },
        { accountType: "EXPENSE", accountSubType: "INSURANCE_EXPENSE", amountCents: 50_000 },
      ],
      unpaidNotices: [{ dueDate: "2026-07-01", owedCents: 1_000_000, payments: [{ date: "2026-08-01", amountCents: 800_000 }] }],
      principalItemsNextPeriod: [{ description: "Insurance", amountCents: 60_000 }],
    });
    expect(k).toMatchObject({
      balanceCarriedForwardCents: 500_000,
      totalIncomeReceivedCents: 800_000,
      totalContributionsPaidCents: 800_000,
      totalUnpaidContributionsCents: 200_000,
      maintenanceExpenditureCents: 300_000,
      administrationExpenditureCents: 50_000,
      balanceAtEndCents: 1_200_000,
    });
  });
});

describe("lots counted for the audit test", () => {
  const excludedLotTypes = ["PARKING", "STORAGE"];
  const lots = (n: number, lotType: string) => Array.from({ length: n }, () => ({ lotType }));

  it("leaves out parking and utility (storage) lots", () => {
    // 101 lots on the roll, 30 of them parking or storage: 71 counted, so not a large scheme.
    const r = auditLotCount({ lots: [...lots(71, "RESIDENTIAL"), ...lots(20, "PARKING"), ...lots(10, "STORAGE")], totalLots: 101, excludedLotTypes });
    expect(r).toEqual({ counted: 71, excluded: 30, fromRoll: true });
    expect(auditRequired({ lots: r.counted, leviesRaisedCents: 0, lotsMoreThan: 100, leviesRaisedMoreThanCents: 25_000_000 }).byLots).toBe(false);
  });

  it("counts commercial and other lots, and reads the type in any case", () => {
    const r = auditLotCount({ lots: [...lots(100, "RESIDENTIAL"), ...lots(1, "COMMERCIAL"), ...lots(2, "parking")], totalLots: 103, excludedLotTypes });
    expect(r).toEqual({ counted: 101, excluded: 2, fromRoll: true });
    expect(auditRequired({ lots: r.counted, leviesRaisedCents: 0, lotsMoreThan: 100, leviesRaisedMoreThanCents: 25_000_000 }).byLots).toBe(true);
  });

  it("uses the building's recorded total when no lots are on the roll", () => {
    expect(auditLotCount({ lots: [], totalLots: 120, excludedLotTypes })).toEqual({ counted: 120, excluded: 0, fromRoll: false });
  });

  it("does not count a common property row, or let it stand for a lot not yet entered", () => {
    const withCommon = ["PARKING", "STORAGE", "COMMON"];
    const r = auditLotCount({ lots: [...lots(99, "RESIDENTIAL"), ...lots(1, "COMMON")], totalLots: 100, excludedLotTypes: withCommon });
    expect(r).toEqual({ counted: 100, excluded: 1, fromRoll: false });
  });

  it("counts the lots not yet on a partly loaded roll", () => {
    // 150 lots recorded, 40 on the roll (5 parking): 35 + 110 not yet entered.
    const r = auditLotCount({ lots: [...lots(35, "RESIDENTIAL"), ...lots(5, "PARKING")], totalLots: 150, excludedLotTypes });
    expect(r).toEqual({ counted: 145, excluded: 5, fromRoll: false });
    expect(auditRequired({ lots: r.counted, leviesRaisedCents: 0, lotsMoreThan: 100, leviesRaisedMoreThanCents: 25_000_000 }).byLots).toBe(true);
  });
});

describe("audit requirement", () => {
  const t = { lotsMoreThan: 100, leviesRaisedMoreThanCents: 25_000_000 };
  it("applies to more than 100 lots or levies raised above $250,000", () => {
    expect(auditRequired({ ...t, lots: 101, leviesRaisedCents: 0 })).toMatchObject({ required: true, byLots: true });
    expect(auditRequired({ ...t, lots: 100, leviesRaisedCents: 25_000_000 }).required).toBe(false);
    expect(auditRequired({ ...t, lots: 20, leviesRaisedCents: 25_000_001 })).toMatchObject({ required: true, byBudget: true });
  });

  it("totals the levies resolved to be raised for the year", () => {
    // $80,000 administrative and $20,000 capital works: $100,000 raised, below the threshold.
    const plain = leviesRaisedForYear({
      schedules: [
        { fundId: "admin", status: "ACTIVE", budgetAmountCents: 8_000_000 },
        { fundId: "cw", status: "ACTIVE", budgetAmountCents: 2_000_000 },
        { fundId: "admin", status: "DRAFT", budgetAmountCents: 99_000_000 },
      ],
      notices: [{ fundId: "admin", amountDueCents: 2_000_000 }],
    });
    expect(plain).toEqual({ totalCents: 10_000_000, byFund: { admin: 8_000_000, cw: 2_000_000 } });
    // A special levy of $160,000 takes the year to $260,000, above it.
    const special = leviesRaisedForYear({
      schedules: [
        { fundId: "admin", status: "ACTIVE", budgetAmountCents: 8_000_000 },
        { fundId: "cw", status: "ACTIVE", budgetAmountCents: 2_000_000 },
        { fundId: "cw", status: "APPROVED", budgetAmountCents: 16_000_000 },
      ],
      notices: [],
    });
    expect(special.totalCents).toBe(26_000_000);
    expect(auditRequired({ ...t, lots: 20, leviesRaisedCents: special.totalCents }).required).toBe(true);
  });

  it("counts notices raised when they come to more than the schedules", () => {
    const r = leviesRaisedForYear({
      schedules: [{ fundId: "admin", status: "SUPERSEDED", budgetAmountCents: 8_000_000 }],
      notices: [
        { fundId: "admin", amountDueCents: 2_000_000 },
        { fundId: "admin", amountDueCents: 2_100_000 },
      ],
    });
    expect(r.totalCents).toBe(4_100_000);
  });
});
