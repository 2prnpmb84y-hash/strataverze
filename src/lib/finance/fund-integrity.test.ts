import { describe, expect, it, vi } from "vitest";
vi.mock("@/prisma/db", () => ({ db: { orm: { public: {} } } }));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
import { fundIntegrityProblems, isSharedAccount, type IntegrityAccount } from "./fund-integrity";
import { fundImbalances } from "./fund-balance-check";
import { receiptJournalLines } from "./levy-reversal";

const ADMIN = "fund-admin";
const CW = "fund-cw";
const acc = (id: string, code: string, name: string, sub: string | null, fundId: string | null): IntegrityAccount => ({ id, code, name, accountSubType: sub, fundId });
const accounts = new Map(
  [
    acc("bank", "1-1000", "Bank Account — Operating", "BANK", ADMIN),
    acc("susp", "1-1900", "Suspense", "SUSPENSE", ADMIN),
    acc("ar-cw", "1-2100", "Levies Receivable — Capital Works", "ACCOUNTS_RECEIVABLE", CW),
    acc("inc-cw", "4-2000", "Levy Income — Capital Works", "LEVY_INCOME", CW),
    acc("lift", "5-2010", "Lift refurbishment", "MAINTENANCE_EXPENSE", CW),
    acc("util", "5-1300", "Utilities", "UTILITIES_EXPENSE", ADMIN),
    acc("loose", "9-9999", "No fund", null, null),
  ].map((a) => [a.id, a]),
);
const name = (id: string) => (id === ADMIN ? "Administrative Fund" : "Capital Works Fund");

describe("fund integrity of a journal", () => {
  it("refuses the review's B1 journal: capital works expense in the admin fund, paid from the capital works fund", () => {
    const p = fundIntegrityProblems(
      [
        { accountCodeId: "lift", fundId: ADMIN, debit: 40 },
        { accountCodeId: "bank", fundId: CW, credit: 40 },
      ],
      accounts,
      name,
    );
    expect(p).toContain("5-2010 Lift refurbishment belongs to the Capital Works Fund, so it cannot be used for the Administrative Fund.");
    expect(p.some((m) => m.startsWith("The Administrative Fund lines are out of balance by $40.00"))).toBe(true);
    expect(p.some((m) => m.startsWith("The Capital Works Fund lines are out of balance by $40.00"))).toBe(true);
  });

  it("allows a journal that balances in each fund, using the shared bank for both", () => {
    expect(
      fundIntegrityProblems(
        [
          { accountCodeId: "bank", fundId: CW, debit: "1250.50" },
          { accountCodeId: "ar-cw", fundId: CW, credit: "1250.50" },
          { accountCodeId: "util", fundId: ADMIN, debit: 25.55 },
          { accountCodeId: "bank", fundId: ADMIN, credit: 25.55 },
        ],
        accounts,
        name,
      ),
    ).toEqual([]);
  });

  it("refuses a journal that balances overall but moves money between funds", () => {
    const p = fundIntegrityProblems(
      [
        { accountCodeId: "bank", fundId: CW, debit: 100 },
        { accountCodeId: "bank", fundId: ADMIN, credit: 100 },
      ],
      accounts,
      name,
    );
    expect(p).toHaveLength(2);
  });

  it("treats the bank, suspense and accounts with no fund as shared, and fund accounts as locked", () => {
    expect(isSharedAccount(accounts.get("bank")!)).toBe(true);
    expect(isSharedAccount(accounts.get("susp")!)).toBe(true);
    expect(isSharedAccount(accounts.get("loose")!)).toBe(true);
    expect(isSharedAccount(accounts.get("ar-cw")!)).toBe(false);
  });

  it("refuses an unknown account", () => {
    expect(fundIntegrityProblems([{ accountCodeId: "nope", fundId: ADMIN, debit: 1 }, { accountCodeId: "bank", fundId: ADMIN, credit: 1 }], accounts, name)).toEqual([
      "A line uses an account that is not in this scheme's chart of accounts.",
    ]);
  });

  it("compares in cents, so floating point sums do not trip it", () => {
    expect(
      fundIntegrityProblems(
        [
          { accountCodeId: "util", fundId: ADMIN, debit: 0.1 },
          { accountCodeId: "util", fundId: ADMIN, debit: 0.2 },
          { accountCodeId: "bank", fundId: ADMIN, credit: 0.3 },
        ],
        accounts,
        name,
      ),
    ).toEqual([]);
  });
});

describe("the journal form's fund check", () => {
  it("reports each fund out of balance", () => {
    const funds = [{ value: ADMIN, label: "Administrative Fund" }, { value: CW, label: "Capital Works Fund" }];
    expect(fundImbalances([{ fundId: ADMIN, debit: "40", credit: "" }, { fundId: CW, debit: "", credit: "40" }], funds)).toEqual([
      { label: "Administrative Fund", gap: 40 },
      { label: "Capital Works Fund", gap: 40 },
    ]);
    expect(fundImbalances([{ fundId: ADMIN, debit: "40", credit: "" }, { fundId: ADMIN, debit: "", credit: "40" }], funds)).toEqual([]);
  });
});

describe("a levy payment taken from suspense for the other fund", () => {
  it("moves the money to that fund in the bank, so each fund balances", () => {
    const lines = receiptJournalLines(
      [{ levyNoticeId: "n", noticeNumber: "LN-1", lotId: "lot", fundId: CW, appliedCents: 50_000, excessCents: 0 }],
      { debitAccountId: "susp", receivableByFund: { [CW]: "ar-cw" }, advanceByFund: {}, holding: { fundId: ADMIN, bankAccountId: "bank" } },
      "Suspense cleared",
    );
    expect(
      fundIntegrityProblems(
        lines.map((l) => ({ accountCodeId: l.accountCodeId, fundId: l.fundId, debit: (l.debitCents ?? 0) / 100, credit: (l.creditCents ?? 0) / 100 })),
        accounts,
        name,
      ),
    ).toEqual([]);
    expect(lines.find((l) => l.accountCodeId === "susp")?.fundId).toBe(ADMIN);
  });

  it("is unchanged when the payment is for the suspense account's own fund", () => {
    const lines = receiptJournalLines(
      [{ levyNoticeId: "n", noticeNumber: "LN-1", lotId: "lot", fundId: ADMIN, appliedCents: 100, excessCents: 0 }],
      { debitAccountId: "susp", receivableByFund: { [ADMIN]: "ar-admin" }, advanceByFund: {}, holding: { fundId: ADMIN, bankAccountId: "bank" } },
      "x",
    );
    expect(lines).toHaveLength(2);
  });
});
