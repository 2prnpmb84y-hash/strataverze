import { describe, expect, it, vi } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";

vi.mock("@/prisma/db", () => ({ db: {} }));

const { defaultAccounts } = await import("./seed-chart-of-accounts");

const NSW = statutoryRulesFor("NSW").FUND_CATALOGUE;
const QLD = QLD_RULE_PACK.rules.FUND_CATALOGUE;

/** The default chart every NSW building has been given: code, name and fund type. */
const NSW_CHART = [
  ["1-1000", "Bank Account — Operating", "ADMINISTRATIVE"],
  ["1-1100", "Levies Receivable — Admin", "ADMINISTRATIVE"],
  ["1-1900", "Suspense — Unidentified Bank Items", "ADMINISTRATIVE"],
  ["2-1000", "Accounts Payable", "ADMINISTRATIVE"],
  ["2-1100", "GST Collected", "ADMINISTRATIVE"],
  ["2-1200", "GST Paid", "ADMINISTRATIVE"],
  ["2-1300", "Levies Paid in Advance — Admin", "ADMINISTRATIVE"],
  ["3-1000", "Retained Funds — Admin", "ADMINISTRATIVE"],
  ["3-1100", "Opening Balance — Admin", "ADMINISTRATIVE"],
  ["4-1000", "Levy Income — Admin", "ADMINISTRATIVE"],
  ["4-1100", "Interest Income", "ADMINISTRATIVE"],
  ["4-1200", "Sundry Income", "ADMINISTRATIVE"],
  ["5-1000", "Management Fees", "ADMINISTRATIVE"],
  ["5-1100", "Insurance", "ADMINISTRATIVE"],
  ["5-1200", "Maintenance and Repairs", "ADMINISTRATIVE"],
  ["5-1300", "Utilities", "ADMINISTRATIVE"],
  ["5-1400", "Professional Fees", "ADMINISTRATIVE"],
  ["5-1500", "Sundry Expenses", "ADMINISTRATIVE"],
  ["1-2100", "Levies Receivable — Capital Works", "CAPITAL_WORKS"],
  ["2-2300", "Levies Paid in Advance — Capital Works", "CAPITAL_WORKS"],
  ["3-2000", "Retained Funds — Capital Works", "CAPITAL_WORKS"],
  ["3-2100", "Opening Balance — Capital Works", "CAPITAL_WORKS"],
  ["4-2000", "Levy Income — Capital Works", "CAPITAL_WORKS"],
  ["5-2000", "Capital Works Expenditure", "CAPITAL_WORKS"],
];

describe("default chart of accounts", () => {
  it("names the NSW accounts exactly as before", () => {
    expect(defaultAccounts(NSW).map((a) => [a.code, a.name, a.fundType])).toEqual(NSW_CHART);
  });

  it("names the accounts from the Queensland funds, with the same codes and fund types", () => {
    const qld = defaultAccounts(QLD);
    const nsw = defaultAccounts(NSW);
    expect(qld.map((a) => [a.code, a.accountType, a.subType, a.fundType, a.gstApplicable])).toEqual(nsw.map((a) => [a.code, a.accountType, a.subType, a.fundType, a.gstApplicable]));
    const name = (code: string) => qld.find((a) => a.code === code)?.name;
    expect(name("1-1100")).toBe("Levies Receivable — Admin");
    expect(name("1-2100")).toBe("Levies Receivable — Sinking Fund");
    expect(name("4-2000")).toBe("Levy Income — Sinking Fund");
    expect(name("5-2000")).toBe("Sinking Fund Expenditure");
    expect(name("1-1000")).toBe("Bank Account — Operating");
    expect(qld.some((a) => /Capital Works/.test(a.name))).toBe(false);
  });
});
