import { describe, expect, it } from "vitest";
import {
  agedArrears,
  buildStatement,
  effectiveStatus,
  noticeLabel,
  noticeTotals,
  type LedgerNotice,
} from "./levy-ledger";
import { PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";

const NSW = statutoryRulesFor("NSW").TERMINOLOGY;

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
    const s = buildStatement([q1, q2], payments, {}, [], NSW);
    expect(s.lines.map((l) => [l.date, l.type, l.charge, l.payment, l.balance])).toEqual([
      ["2026-07-01", "Levy", 825.09, 0, 825.09],
      ["2026-07-10", "Payment", 0, 200, 625.09],
      ["2026-08-15", "Payment", 0, 100, 525.09],
      ["2026-10-01", "Levy", 825.08, 0, 1350.17],
    ]);
    expect(s.closingBalance).toBe(1350.17);
  });

  it("shows a dishonoured payment and its reversal, with the reason (TC-008)", () => {
    const after = { ...q1, amountPaid: "100", balanceOutstanding: "725.09" };
    const s = buildStatement([after], [
      { ...payments[0], reversedAt: "2026-07-20T02:00:00Z", reversalDate: "2026-07-18", reversalReason: "DISHONOURED", reversalNote: "Direct debit failed" },
      payments[1],
    ], {}, [], NSW);
    expect(s.lines.map((l) => [l.date, l.type, l.charge, l.payment, l.balance, l.description])).toEqual([
      ["2026-07-01", "Levy", 825.09, 0, 825.09, expect.any(String)],
      ["2026-07-10", "Payment", 0, 200, 625.09, "Payment for LN-0001"],
      ["2026-07-18", "Reversal", 200, 0, 825.09, "Payment for LN-0001 reversed, dishonoured: Direct debit failed"],
      ["2026-08-15", "Payment", 0, 100, 725.09, "Payment for LN-0001 (BPAY 123)"],
    ]);
    expect(s.closingBalance).toBe(725.09);
  });

  it("rolls earlier entries into the opening balance", () => {
    const s = buildStatement([q1, q2], payments, { startDate: "2026-08-01" }, [], NSW);
    expect(s.openingBalance).toBe(625.09);
    expect(s.lines[0].balance).toBe(525.09);
    expect(s.closingBalance).toBe(1350.17);
  });

  it("shows an overpayment as credit, applies it once, and charges a refund", () => {
    const paid = { ...q1, status: "PAID", amountPaid: "825.09", balanceOutstanding: "0" };
    const second = { ...q2, status: "PARTIALLY_PAID", amountPaid: "100", balanceOutstanding: "725.08" };
    const receipts = [
      { id: "p1", levyNoticeId: "n1", amount: "825.09", paymentDate: "2026-07-10" },
      { id: "p-credit", levyNoticeId: "n2", amount: "100", paymentDate: "2026-10-01", reference: "Owner credit applied" },
    ];
    const credits = [
      { id: "c1", type: "OVERPAYMENT", amount: "150", effectiveDate: "2026-07-10" },
      { id: "c2", type: "APPLIED", amount: "100", effectiveDate: "2026-10-01", levyPaymentId: "p-credit" },
      { id: "c3", type: "REFUNDED", amount: "50", effectiveDate: "2026-10-05" },
    ];
    const s = buildStatement([paid, second], receipts, {}, credits, NSW);
    expect(s.lines.map((l) => [l.date, l.type, l.charge, l.payment, l.balance])).toEqual([
      ["2026-07-01", "Levy", 825.09, 0, 825.09],
      ["2026-07-10", "Payment", 0, 825.09, 0],
      ["2026-07-10", "Payment", 0, 150, -150],
      ["2026-10-01", "Levy", 825.08, 0, 675.08],
      ["2026-10-05", "Refund", 50, 0, 725.08],
    ]);
    expect(s.closingBalance).toBe(725.08);
  });

  it("opens a mid-year statement at the balance carried forward, including credit", () => {
    const paid = { ...q1, status: "PAID", amountPaid: "825.09", balanceOutstanding: "0" };
    const receipts = [{ id: "p1", levyNoticeId: "n1", amount: "825.09", paymentDate: "2026-07-10" }];
    const credits = [{ id: "c1", type: "OVERPAYMENT", amount: "100", effectiveDate: "2026-07-10" }];
    // Statement from 1 September: Q1 levied and paid, plus $100 credit held, so it opens $100 in credit.
    const s = buildStatement([paid, q2], receipts, { startDate: "2026-09-01" }, credits, NSW);
    expect(s.openingBalance).toBe(-100);
    expect(s.lines.map((l) => [l.date, l.balance])).toEqual([["2026-10-01", 725.08]]);
    expect(s.closingBalance).toBe(725.08);
  });

  it("accounts for amounts paid before receipts were kept", () => {
    const s = buildStatement([{ ...q1, updatedAt: "2026-07-20T03:00:00Z" }], [], {}, [], NSW);
    expect(s.lines.find((l) => l.type === "Payment")).toMatchObject({ date: "2026-07-20", payment: 300 });
  });
});

describe("buildStatement wording", () => {
  const charged = { ...q1, amountPaid: "0", interestCharged: "12.50" };

  it("names an NSW late charge interest, as it always has", () => {
    const s = buildStatement([charged], [], {}, [], NSW);
    expect(s.lines.map((l) => [l.kind, l.type, l.description])).toEqual([
      ["LEVY", "Levy", expect.any(String)],
      ["LATE_CHARGE", "Interest", "Interest on LN-0001"],
    ]);
  });

  it("names a Queensland late charge penalty, never interest, and a levy a contribution", () => {
    const s = buildStatement([charged], [], {}, [], PENDING_RULE_PACKS.QLD.rules.TERMINOLOGY);
    expect(s.lines.map((l) => [l.kind, l.type, l.description])).toEqual([
      ["LEVY", "Contribution", expect.any(String)],
      ["LATE_CHARGE", "Penalty", "Penalty on LN-0001"],
    ]);
    expect(s.lines.map((l) => `${l.type} ${l.description}`).join(" ")).not.toMatch(/interest/i);
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
