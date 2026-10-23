import { describe, expect, it } from "vitest";
import { monthOf, treasurerMonth, type TreasurerInputs } from "./treasurer-home";

const base: TreasurerInputs = {
  today: "2026-10-23",
  unmatched: [
    { id: "t1", date: "2026-10-02", amountCents: 275_000, description: "TRANSFER FROM UNKNOWN" },
    { id: "t2", date: "2026-09-28", amountCents: -12_000, description: "BANK FEE" },
  ],
  approvals: [
    { id: "i1", kind: "SUPPLIER_INVOICE", label: "Acme INV-9", amountCents: 110_000, dueDate: "2026-10-01" },
    { id: "w1", kind: "WORKS_INVOICE", label: "Roof works claim 2", amountCents: 900_000, dueDate: null },
  ],
  notices: [
    { id: "n1", noticeNumber: "LN-1", lotNumber: "3", dueDate: "2026-08-01", balanceCents: 150_000, status: "ISSUED" },
    { id: "n2", noticeNumber: "LN-2", lotNumber: "3", dueDate: "2026-10-01", balanceCents: 50_000, status: "PARTIALLY_PAID" },
    { id: "n3", noticeNumber: "LN-3", lotNumber: "7", dueDate: "2026-11-01", balanceCents: 80_000, status: "ISSUED" },
    { id: "n4", noticeNumber: "LN-4", lotNumber: "8", dueDate: "2026-09-01", balanceCents: 10_000, status: "WRITTEN_OFF" },
  ],
  suspense: [{ id: "s1", transactionDate: "2026-09-15", amountCents: 40_000, description: "Unknown deposit" }],
  periods: [
    { id: "p9", name: "September 2026", startDate: "2026-09-01", endDate: "2026-09-30", status: "OPEN" },
    { id: "p8", name: "August 2026", startDate: "2026-08-01", endDate: "2026-08-31", status: "CLOSED" },
    { id: "p10", name: "October 2026", startDate: "2026-10-01", endDate: "2026-10-31", status: "OPEN" },
  ],
};

describe("treasurer this month", () => {
  it("names the month and its range", () => {
    expect(monthOf("2026-10-23")).toEqual({ start: "2026-10-01", end: "2026-10-31", label: "October 2026" });
    expect(monthOf("2028-02-10").end).toBe("2028-02-29");
  });

  it("gathers what needs the treasurer's attention", () => {
    const m = treasurerMonth(base);
    expect(m.unmatched).toMatchObject({ count: 2, thisMonth: 1, receiptsCents: 275_000, paymentsCents: 12_000, oldestDate: "2026-09-28" });
    expect(m.approvals).toMatchObject({ count: 2, totalCents: 1_010_000, overdueCount: 1 });
    expect(m.overdue.items.map((n) => [n.noticeNumber, n.daysOverdue])).toEqual([
      ["LN-1", 83],
      ["LN-2", 22],
    ]);
    expect(m.overdue).toMatchObject({ count: 2, totalCents: 200_000, lots: 1 });
    expect(m.suspense).toMatchObject({ count: 1, netCents: 40_000 });
    expect(m.periods.current).toEqual({ name: "October 2026", status: "OPEN" });
    // September has ended but is still open, and the suspense item from September stops it closing.
    expect(m.periods.endedOpen).toEqual([{ name: "September 2026", endDate: "2026-09-30", suspenseBlocking: 1 }]);
    expect(m.attention).toBe(5);
  });

  it("has nothing to do when everything is up to date", () => {
    const m = treasurerMonth({ ...base, unmatched: [], approvals: [], notices: [], suspense: [], periods: base.periods.map((p) => (p.id === "p9" ? { ...p, status: "LOCKED" } : p)) });
    expect(m.attention).toBe(0);
    expect(m.periods.endedOpen).toEqual([]);
  });
});
