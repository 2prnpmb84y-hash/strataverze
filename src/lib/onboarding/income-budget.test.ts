import { describe, expect, it } from "vitest";
import {
  checkIncomeBudget,
  instalments,
  nextAccountCodes,
  onboardingYears,
  yearContaining,
  type IncomeBudgetContext,
  type IncomeBudgetInput,
  type IncomeBudgetRowInput,
} from "./income-budget";

/**
 * SP 99999's FY2025-26 statements (Urbanise handover): admin fund opened at
 * $868.45, income $32,435.34, expenditure $23,267.17, closing $10,036.62;
 * capital works fund opened at $85,457.96, income $5,562.54, expenditure
 * $6,594.50, closing $84,426.00. Takeover 30 June 2026.
 */

const ctx = (takeoverDate = "2026-06-30"): IncomeBudgetContext => ({
  takeoverDate,
  years: onboardingYears(takeoverDate, "06-30"),
  funds: [
    {
      id: "admin",
      name: "Administrative Fund",
      fundType: "ADMINISTRATIVE",
      balanceAtTakeoverCents: 1003662,
      levyIncomeAccountId: "a-levy",
      accounts: [
        { id: "a-levy", code: "4-1000", name: "Levy Income — Admin", accountType: "INCOME" },
        { id: "a-int", code: "4-1100", name: "Interest Income", accountType: "INCOME" },
        { id: "a-ins", code: "5-1100", name: "Insurance", accountType: "EXPENSE" },
        { id: "a-mgmt", code: "5-1000", name: "Management Fees", accountType: "EXPENSE" },
      ],
    },
    {
      id: "cw",
      name: "Capital Works Fund",
      fundType: "CAPITAL_WORKS",
      balanceAtTakeoverCents: 8442600,
      levyIncomeAccountId: "c-levy",
      accounts: [
        { id: "c-levy", code: "4-2000", name: "Levy Income — Capital Works", accountType: "INCOME" },
        { id: "c-exp", code: "5-2000", name: "Capital Works Expenditure", accountType: "EXPENSE" },
      ],
    },
  ],
});

const row = (accountId: string, actual: string, budget = "", newAccountName = "", accountType: "INCOME" | "EXPENSE" = "EXPENSE"): IncomeBudgetRowInput => ({ accountId, newAccountName, accountType, actual, budget });

function sp99999(): IncomeBudgetInput {
  return {
    funds: [
      {
        fundId: "admin",
        openingBalance: "868.45",
        rows: [
          row("a-levy", "32,388.96", "34,000"),
          row("", "46.38", "", "Mutual Revenue - penalty interest", "INCOME"),
          row("a-ins", "8,192.00", "9,000"),
          row("a-mgmt", "2,924.20", "3,500"),
          // The other 17 expense lines, as one figure here: 23,267.17 - 8,192.00 - 2,924.20.
          row("", "12,150.97", "18,000", "Other administrative expenses"),
        ],
      },
      {
        fundId: "cw",
        openingBalance: "85,457.96",
        rows: [row("c-levy", "5,555.68", "8,000"), row("", "6.86", "", "Mutual Revenue - penalty interest", "INCOME"), row("", "6,594.50", "5,000", "Windows")],
      },
    ],
    adoption: { kind: "before_takeover", meetingDate: "2026-05-20" },
    levies: { frequency: "QUARTERLY", raisedBeforeTakeover: "none" },
  };
}

describe("onboarding years", () => {
  it("takes over at the year end: last year is the year just ended, the budget is for the next", () => {
    const y = onboardingYears("2026-06-30", "06-30");
    expect(y.lastYear).toEqual({ financialYear: 2025, start: "2025-07-01", end: "2026-06-30" });
    expect(y.budgetYear).toEqual({ financialYear: 2026, start: "2026-07-01", end: "2027-06-30" });
    expect(y.takeoverAtYearEnd).toBe(true);
  });

  it("takes over part way through a year: the budget is for that year", () => {
    const y = onboardingYears("2026-09-30", "06-30");
    expect(y.lastYear.financialYear).toBe(2025);
    expect(y.budgetYear.financialYear).toBe(2026);
    expect(y.takeoverAtYearEnd).toBe(false);
  });

  it("works for a 31 December year end", () => {
    expect(yearContaining("2026-12-31", "12-31")).toEqual({ financialYear: 2026, start: "2026-01-01", end: "2026-12-31" });
    expect(onboardingYears("2026-12-31", "12-31").budgetYear.start).toBe("2027-01-01");
  });
});

describe("checkIncomeBudget, SP 99999", () => {
  it("passes when each fund reconciles with its opening balance", () => {
    const c = checkIncomeBudget(sp99999(), ctx());
    expect(c.problems).toEqual([]);
    expect(c.fundProblems).toEqual({ admin: [], cw: [] });
    const [admin, cw] = c.parsed!.funds;
    expect(admin).toMatchObject({ actualIncomeCents: 3243534, actualExpenseCents: 2326717, levyCents: 3400000, openingCents: 86845 });
    expect(cw).toMatchObject({ actualIncomeCents: 556254, actualExpenseCents: 659450, levyCents: 800000 });
    expect(c.parsed!.adoption).toEqual({ kind: "before_takeover", meetingDate: "2026-05-20" });
  });

  it("refuses a fund that does not reconcile, and says by how much", () => {
    const input = sp99999();
    input.funds[0].rows[2].actual = "8,129.00"; // transposed digits
    const c = checkIncomeBudget(input, ctx());
    expect(c.parsed).toBeNull();
    expect(c.fundProblems.admin.join(" ")).toContain("a difference of -$63.00");
  });

  it("asks for last year's opening balance", () => {
    const input = sp99999();
    input.funds[1].openingBalance = "";
    expect(checkIncomeBudget(input, ctx()).fundProblems.cw.join(" ")).toContain("Capital Works Fund balance at 01/07/2025");
  });

  it("refuses an account entered twice, or a new account that already exists", () => {
    const input = sp99999();
    input.funds[0].rows.push(row("a-ins", "0"), row("", "0", "", "insurance"));
    const p = checkIncomeBudget(input, ctx()).fundProblems.admin.join(" ");
    expect(p).toContain("5-1100 Insurance is already entered");
    expect(p).toContain('already has an account called "Insurance"');
  });

  it("refuses an account of another fund", () => {
    const input = sp99999();
    input.funds[0].rows.push(row("c-exp", "0", "10"));
    expect(checkIncomeBudget(input, ctx()).fundProblems.admin.join(" ")).toContain("choose one of the Administrative Fund's income or expense accounts");
  });

  it("refuses a negative budget but allows a negative actual (a refund)", () => {
    const input = sp99999();
    input.funds[0].rows.push(row("a-int", "-10.00"));
    input.funds[0].rows[0].actual = "32,398.96";
    expect(checkIncomeBudget(input, ctx()).fundProblems.admin).toEqual([]);
    input.funds[0].rows[2].budget = "-5";
    expect(checkIncomeBudget(input, ctx()).fundProblems.admin.join(" ")).toContain("not negative");
  });

  it("needs the administrative fund's levies on the levy income line", () => {
    const input = sp99999();
    input.funds[0].rows[0].budget = "";
    expect(checkIncomeBudget(input, ctx()).fundProblems.admin.join(" ")).toContain("4-1000 Levy Income — Admin line");
  });

  it("allows no capital works levies, with a note", () => {
    const input = sp99999();
    input.funds[1].rows[0].budget = "";
    const c = checkIncomeBudget(input, ctx());
    expect(c.fundProblems.cw).toEqual([]);
    expect(c.notes.join(" ")).toContain("no levy schedule will be made for it");
    expect(c.parsed!.funds[1].levyCents).toBe(0);
  });

  it("refuses an adoption meeting after the takeover", () => {
    const input = sp99999();
    input.adoption = { kind: "before_takeover", meetingDate: "2026-07-15" };
    expect(checkIncomeBudget(input, ctx()).problems.join(" ")).toContain("was after the takeover");
  });

  it("keeps the budget as a draft when it was not adopted", () => {
    const input = sp99999();
    input.adoption = { kind: "draft", meetingDate: "" };
    expect(checkIncomeBudget(input, ctx()).parsed!.adoption).toEqual({ kind: "draft" });
  });

  it("does not reconcile a mid-year takeover, and says so", () => {
    const c = checkIncomeBudget({ ...sp99999(), levies: { frequency: "QUARTERLY", raisedBeforeTakeover: "none" } }, ctx("2026-09-30"));
    expect(c.notes[0]).toContain("part way through");
    expect(c.problems).toEqual([]);
    expect(Object.values(c.fundProblems).flat()).toEqual([]);
  });
});

describe("levies raised before the takeover", () => {
  it("must be answered", () => {
    const input = sp99999();
    input.levies.raisedBeforeTakeover = "";
    expect(checkIncomeBudget(input, ctx()).problems.join(" ")).toContain("raised the levies for 1 July 2026 to 30 June 2027");
  });

  it("makes no levy schedule when the levies were already raised, so nothing is charged twice", () => {
    const input = sp99999();
    input.levies = { frequency: "QUARTERLY", raisedBeforeTakeover: "some" };
    const c = checkIncomeBudget(input, ctx());
    expect(c.problems).toEqual([]);
    expect(c.parsed!.levies).toEqual({ frequency: "QUARTERLY", makeSchedules: false });
    expect(c.notes.join(" ")).toContain("they are not raised again and no levy schedule is made");
  });

  it("makes the schedules when none were raised", () => {
    expect(checkIncomeBudget(sp99999(), ctx()).parsed!.levies.makeSchedules).toBe(true);
  });
});

describe("instalments", () => {
  it("splits a year's levies, the last taking the odd cents", () => {
    expect(instalments(3400000, "QUARTERLY")).toEqual([850000, 850000, 850000, 850000]);
    expect(instalments(1000001, "QUARTERLY")).toEqual([250000, 250000, 250000, 250001]);
  });
});

describe("new account codes", () => {
  it("follows the fund's existing codes, 10 apart", () => {
    expect(nextAccountCodes(["5-1000", "5-1100", "5-1500", "4-1000"], "5-1", 2)).toEqual(["5-1510", "5-1520"]);
    expect(nextAccountCodes(["4-2000"], "4-2", 1)).toEqual(["4-2010"]);
    expect(nextAccountCodes([], "5-2", 1)).toEqual(["5-2000"]);
  });

  it("fills gaps once the top of the range is used", () => {
    const codes = nextAccountCodes(["5-1990"], "5-1", 2);
    expect(codes).toEqual(["5-1010", "5-1020"]);
  });
});
