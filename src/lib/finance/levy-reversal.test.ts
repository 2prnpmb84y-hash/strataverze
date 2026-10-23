import { describe, expect, it } from "vitest";
import { livePayments, noticeAfterReversal, reallocationProblem, receiptJournalLines, reversalProblem } from "./levy-reversal";

const accounts = {
  debitAccountId: "bank",
  receivableByFund: { admin: "ar-admin", cw: "ar-cw" },
  advanceByFund: { admin: "lia-admin", cw: null },
};

describe("one receipt journal for several notices (TC-004)", () => {
  it("credits each lot's notice on its own line under one entry", () => {
    const lines = receiptJournalLines(
      [
        { levyNoticeId: "n3", noticeNumber: "LN-3", lotId: "l3", fundId: "admin", appliedCents: 200_000, excessCents: 0 },
        { levyNoticeId: "n7", noticeNumber: "LN-7", lotId: "l7", fundId: "admin", appliedCents: 350_000, excessCents: 0 },
      ],
      accounts,
      "Bank receipt",
    );
    expect(lines).toEqual([
      { accountCodeId: "bank", fundId: "admin", debitCents: 550_000, description: "Bank receipt" },
      { accountCodeId: "ar-admin", fundId: "admin", creditCents: 200_000, description: "Levies receivable reduced, notice LN-3", lotId: "l3" },
      { accountCodeId: "ar-admin", fundId: "admin", creditCents: 350_000, description: "Levies receivable reduced, notice LN-7", lotId: "l7" },
    ]);
    const debits = lines.reduce((s, l) => s + (l.debitCents ?? 0), 0);
    const credits = lines.reduce((s, l) => s + (l.creditCents ?? 0), 0);
    expect(debits).toBe(credits);
  });

  it("balances each fund separately and holds any excess as credit", () => {
    const lines = receiptJournalLines(
      [
        { levyNoticeId: "a", noticeNumber: "LN-A", lotId: "l1", fundId: "admin", appliedCents: 300_000, excessCents: 50_000 },
        { levyNoticeId: "c", noticeNumber: "LN-C", lotId: "l1", fundId: "cw", appliedCents: 100_000, excessCents: 0 },
      ],
      accounts,
      "Bank receipt",
    );
    for (const fund of ["admin", "cw"]) {
      const f = lines.filter((l) => l.fundId === fund);
      expect(f.reduce((s, l) => s + (l.debitCents ?? 0), 0)).toBe(f.reduce((s, l) => s + (l.creditCents ?? 0), 0));
    }
    expect(lines.find((l) => l.accountCodeId === "lia-admin")?.creditCents).toBe(50_000);
  });

  it("refuses an excess where the fund has no levies in advance account", () => {
    expect(() =>
      receiptJournalLines([{ levyNoticeId: "c", noticeNumber: "LN-C", lotId: "l1", fundId: "cw", appliedCents: 0, excessCents: 100 }], accounts, "x"),
    ).toThrow(/levies paid in advance/);
  });
});

describe("reversing a receipt (TC-003, TC-008)", () => {
  it("puts the notice back", () => {
    // A $3,000 notice paid in full, then the payment is dishonoured.
    expect(noticeAfterReversal({ owedCents: 300_000, paidCents: 300_000 }, 300_000)).toEqual({ paidCents: 0, balanceCents: 300_000, status: "ISSUED" });
    // $4,000 notice with two payments of $2,500 and $1,500; the second is reversed.
    expect(noticeAfterReversal({ owedCents: 400_000, paidCents: 400_000 }, 150_000)).toEqual({ paidCents: 250_000, balanceCents: 150_000, status: "PARTIALLY_PAID" });
  });

  const base = { entryStatus: "POSTED", sourceType: "PAYMENT", payments: [{ id: "p", reversedAt: null }], credits: [], bankTransactions: [], reason: "DISHONOURED" as const };

  it("allows a posted receipt with live payments", () => {
    expect(reversalProblem(base)).toBeNull();
  });

  it("refuses what is not a live levy receipt", () => {
    expect(reversalProblem({ ...base, sourceType: "INVOICE" })).toBe("This entry is not a levy receipt.");
    expect(reversalProblem({ ...base, entryStatus: "REVERSED" })).toBe("Only a posted receipt can be reversed.");
    expect(reversalProblem({ ...base, payments: [] })).toContain("No levy payments are linked");
    expect(reversalProblem({ ...base, payments: [{ id: "p", reversedAt: "2026-10-01" }] })).toBe("This receipt has already been reversed.");
  });

  it("refuses when the credit the receipt created has been spent", () => {
    expect(reversalProblem({ ...base, credits: [{ amountCents: 50_000, availableCents: 10_000, lotNumber: "1" }] })).toContain("Lot 1's credit");
  });

  it("will not move a reconciled receipt, but a dishonour can be recorded against it", () => {
    const reconciled = { ...base, bankTransactions: [{ status: "RECONCILED" }] };
    expect(reversalProblem({ ...reconciled, reason: "WRONG_LOT" })).toContain("reconciled");
    expect(reversalProblem(reconciled)).toBeNull();
  });

  it("needs the new receipts to add up to the amount moved", () => {
    expect(reallocationProblem(300_000, [{ levyNoticeId: "n12", amountCents: 300_000 }])).toBeNull();
    expect(reallocationProblem(300_000, [{ levyNoticeId: "n12", amountCents: 250_000 }])).toContain("must add up to the $3000.00");
    expect(reallocationProblem(300_000, [])).toBe("Choose the notice the payment belongs to.");
  });

  it("leaves reversed payments out of interest and balances", () => {
    const pays = [
      { id: "a", reversedAt: null, reversalDate: null },
      { id: "b", reversedAt: "2026-10-05T01:00:00Z", reversalDate: "2026-10-04" },
    ];
    expect(livePayments(pays).map((p) => p.id)).toEqual(["a"]);
    // At a year end before the dishonour, the payment still counted.
    expect(livePayments(pays, "2026-09-30").map((p) => p.id)).toEqual(["a", "b"]);
    expect(livePayments(pays, "2026-10-04").map((p) => p.id)).toEqual(["a"]);
  });
});
