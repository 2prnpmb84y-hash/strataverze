import { describe, expect, it } from "vitest";
import {
  agedArrears,
  buildStatement,
  effectiveStatus,
  noticeLabel,
  noticeTotals,
  type LedgerNotice,
} from "./levy-ledger";

const base = {
  fund: { name: "Administrative Fund" },
  levySchedule: { levyType: "ORDINARY" },
  interestCharged: "0",
};

const q1: LedgerNotice = {
  ...base, id: "n1", lotId: "L1", noticeNumber: "LN-0001", status: "PARTIALLY_PAID",
  dueDate: "2026-07-01", periodStart: "2026-07-01", periodEnd: "2026-09-30",
  amountDue: "825.09", amountPaid: "300", balanceOutstanding: "525.09",
};
const q2: LedgerNotice = {
  ...base, id: "n2", lotId: "L1", noticeNumber: "LN-0002", status: "ISSUED",
  dueDate: "2026-10-01", periodStart: "2026-10-01", periodEnd: "2026-12-31",
  amountDue: "825.08", amountPaid: "0", balanceOutstanding: "825.08",
};
const special: LedgerNotice = {
  id: "n3", lotId: "L2", noticeNumber: "LN-0003", status: "ISSUED",
  dueDate: "2026-12-01", amountDue: "340.34", amountPaid: "0", balanceOutstanding: "340.34",
  levySchedule: { levyType: "SPECIAL", title: "Roof" }, fund: { name: "Capital Works Fund" },
};

describe("labels and status", () => {
  it("names budget and special levies", () => {
    expect(noticeLabel(q1)).toBe("Administrative Fund levy, Jul–Sep 2026");
    expect(noticeLabel(special)).toBe("Special levy: Roof");
  });

  it("shows overdue once an unpaid notice passes its due date", () => {
    expect(effectiveStatus(q2, "2026-09-30")).toBe("ISSUED");
    expect(effectiveStatus(q2, "2026-10-02")).toBe("OVERDUE");
    expect(effectiveStatus({ ...q2, status: "PAID", balanceOutstanding: "0" }, "2027-01-01")).toBe("PAID");
  });
});

describe("buildStatement", () => {
  const payments = [
    { id: "p1", levyNoticeId: "n1", amount: "200", paymentDate: "2026-07-10" },
    { id: "p2", levyNoticeId: "n1", amount: "100", paymentDate: "2026-08-15", reference: "BPAY 123" },
  ];

  it("lists charges and each payment with a running balance", () => {
    const s = buildStatement([q1, q2], payments);
    expect(s.lines.map((l) => [l.date, l.type, l.charge, l.payment, l.balance])).toEqual([
      ["2026-07-01", "Levy", 825.09, 0, 825.09],
      ["2026-07-10", "Payment", 0, 200, 625.09],
      ["2026-08-15", "Payment", 0, 100, 525.09],
      ["2026-10-01", "Levy", 825.08, 0, 1350.17],
    ]);
    expect(s.closingBalance).toBe(1350.17);
  });

  it("rolls earlier entries into the opening balance", () => {
    const s = buildStatement([q1, q2], payments, { startDate: "2026-08-01" });
    expect(s.openingBalance).toBe(625.09);
    expect(s.lines[0].balance).toBe(525.09);
    expect(s.closingBalance).toBe(1350.17);
  });

  it("accounts for amounts paid before receipts were kept", () => {
    const s = buildStatement([{ ...q1, updatedAt: "2026-07-20T03:00:00Z" }], []);
    expect(s.lines.find((l) => l.type === "Payment")).toMatchObject({ date: "2026-07-20", payment: 300 });
  });
});

describe("agedArrears", () => {
  it("buckets balances by days past due", () => {
    const rows = agedArrears([q1, q2, special], "2026-10-15");
    const l1 = rows.find((r) => r.lotId === "L1")!;
    expect(l1).toMatchObject({ days90Plus: 525.09, days30: 825.08, total: 1350.17 });
    expect(rows.find((r) => r.lotId === "L2")!.current).toBe(340.34);
  });
});

describe("noticeTotals", () => {
  it("adds up levied, paid and outstanding", () => {
    expect(noticeTotals([q1, q2])).toEqual({ levied: 1650.17, paid: 300, outstanding: 1350.17 });
  });
});
