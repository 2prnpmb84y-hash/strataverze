import { describe, expect, it } from "vitest";
import { lotFinancialStatus } from "./financial-status";

const n = (status: string, dueDate: string, balanceOutstanding: string) => ({ status, dueDate, balanceOutstanding });
const TODAY = "2026-10-25";

describe("whether a lot is financial", () => {
  it("is financial with nothing owing, or only amounts not yet due", () => {
    expect(lotFinancialStatus([], TODAY)).toEqual({ financial: true, overdueCents: 0, oldestOverdue: null });
    expect(lotFinancialStatus([n("ISSUED", "2026-11-01", "850.00"), n("PAID", "2026-07-01", "0")], TODAY).financial).toBe(true);
  });

  it("is unfinancial once an unpaid amount is past its due date, with the total overdue", () => {
    const s = lotFinancialStatus([n("ISSUED", "2026-07-01", "850.00"), n("PARTIALLY_PAID", "2026-10-01", "100.50"), n("ISSUED", "2026-12-01", "850.00")], TODAY);
    expect(s).toEqual({ financial: false, overdueCents: 95050, oldestOverdue: "2026-07-01" });
  });

  it("counts notices already marked overdue, and arrears carried over at takeover", () => {
    expect(lotFinancialStatus([n("OVERDUE", "2026-06-30T00:00:00.000Z", "263.56")], TODAY)).toMatchObject({ financial: false, overdueCents: 26356 });
  });

  it("does not count drafts, written-off amounts, or something due today", () => {
    expect(lotFinancialStatus([n("DRAFT", "2026-07-01", "850"), n("WRITTEN_OFF", "2026-07-01", "50"), n("ISSUED", TODAY, "850")], TODAY).financial).toBe(true);
  });
});
