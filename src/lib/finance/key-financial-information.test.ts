import { describe, expect, it } from "vitest";
import { auditRequired, keyFinancialInformation, ownersFundsCents, unpaidAt } from "./key-financial-information";
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

describe("audit requirement", () => {
  const t = { lotsMoreThan: 100, annualBudgetMoreThanCents: 25_000_000 };
  it("applies to more than 100 lots or a budget above the amount", () => {
    expect(auditRequired({ ...t, lots: 101, annualBudgetCents: 0 })).toMatchObject({ required: true, byLots: true });
    expect(auditRequired({ ...t, lots: 100, annualBudgetCents: 25_000_000 }).required).toBe(false);
    expect(auditRequired({ ...t, lots: 20, annualBudgetCents: 25_000_001 })).toMatchObject({ required: true, byBudget: true });
  });
});
