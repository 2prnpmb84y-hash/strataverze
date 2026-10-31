/**
 * A Zai payin to a lot's notices and the receipt journal (pure): the lot by
 * its registered PayID, oldest notice first, partial and overpaid payments,
 * an unknown reference to the unmatched queue, journals that balance, and a
 * reversal.
 */
import { describe, expect, it } from "vitest";
import { allocatePayment, journalBalances, matchPayinToLot, openNotices, reversalPlan, zaiReceiptJournalLines, type OpenNotice, type RegisteredReference } from "./payment-mapping";
import { readZaiTransaction } from "./webhook-payload";
import { BPAY_PAYIN_EXAMPLE, NPP_PAYIN_EXAMPLE } from "./__fixtures__/zai-doc-examples";

const npp = readZaiTransaction(NPP_PAYIN_EXAMPLE.transactions)!;
const bpay = readZaiTransaction(BPAY_PAYIN_EXAMPLE.transactions)!;
const ref = (over: Partial<RegisteredReference> = {}): RegisteredReference => ({
  lotId: "lot-7",
  method: "PAYID",
  value: "lot7.payid@example.com",
  zaiWalletAccountId: npp.accountId,
  status: "active",
  ...over,
});

describe("matchPayinToLot", () => {
  it("matches an NPP payin by the lot's active PayID on the wallet it arrived in (letter case aside)", () => {
    expect(matchPayinToLot(npp, [ref({ value: "Lot7.PayID@example.com" })])).toEqual({ matched: true, lotId: "lot-7", referenceValue: "lot7.payid@example.com" });
  });

  it("sends an unknown reference to the unmatched queue, with the reason", () => {
    expect(matchPayinToLot(npp, [])).toMatchObject({ matched: false, referenceValue: "lot7.payid@example.com", reason: expect.stringMatching(/No active PayID/) });
    // Another wallet's PayID, a PayID not yet active, and a value of another method are not this lot's.
    expect(matchPayinToLot(npp, [ref({ zaiWalletAccountId: "another-wallet" })]).matched).toBe(false);
    expect(matchPayinToLot(npp, [ref({ status: "pending_activation" })]).matched).toBe(false);
    expect(matchPayinToLot(npp, [ref({ method: "BPAY_CRN" })]).matched).toBe(false);
    expect(matchPayinToLot({ ...npp, payId: null }, [ref()])).toMatchObject({ matched: false, reason: "The NPP payin has no PayID." });
  });

  it("never matches a PayID registered for two lots", () => {
    expect(matchPayinToLot(npp, [ref(), ref({ lotId: "lot-8" })])).toMatchObject({ matched: false, reason: expect.stringMatching(/more than one lot/) });
  });

  it("never matches a BPAY payin: the documented payload has no payer reference, and the wallet is the building's", () => {
    expect(matchPayinToLot(bpay, [ref({ zaiWalletAccountId: bpay.accountId, method: "BPAY_CRN", value: "anything" })])).toMatchObject({ matched: false, referenceValue: null, reason: expect.stringMatching(/NC-BPAY-LOT-REFERENCE/) });
  });
});

const notice = (id: string, dueDate: string, owedCents: number, fundId = "fund-admin"): OpenNotice => ({ levyNoticeId: id, noticeNumber: id.toUpperCase(), lotId: "lot-7", fundId, dueDate, owedCents });

describe("openNotices", () => {
  it("keeps issued notices owing something, oldest due first, with the late charge counted", () => {
    const rows = [
      { id: "n3", noticeNumber: "L-0003", lotId: "lot-7", fundId: "fund-admin", dueDate: "2026-10-01", status: "ISSUED", amountDue: "500.00", amountPaid: "0", interestCharged: "0" },
      { id: "n1", noticeNumber: "L-0001", lotId: "lot-7", fundId: "fund-admin", dueDate: "2026-04-01", status: "OVERDUE", amountDue: "500.00", amountPaid: "200.00", interestCharged: "12.34" },
      { id: "n2", noticeNumber: "L-0002", lotId: "lot-7", fundId: "fund-cw", dueDate: "2026-07-01", status: "PAID", amountDue: "300.00", amountPaid: "300.00", interestCharged: "0" },
      { id: "n4", noticeNumber: "L-0004", lotId: "lot-7", fundId: "fund-cw", dueDate: "2026-07-01", status: "DRAFT", amountDue: "300.00", amountPaid: "0", interestCharged: "0" },
      { id: "n5", noticeNumber: "L-0005", lotId: "lot-7", fundId: "fund-cw", dueDate: new Date("2026-07-01T00:00:00Z"), status: "PARTIALLY_PAID", amountDue: "300.00", amountPaid: "100.00" },
    ];
    expect(openNotices(rows)).toEqual([
      { levyNoticeId: "n1", noticeNumber: "L-0001", lotId: "lot-7", fundId: "fund-admin", dueDate: "2026-04-01", owedCents: 31234 },
      { levyNoticeId: "n5", noticeNumber: "L-0005", lotId: "lot-7", fundId: "fund-cw", dueDate: "2026-07-01", owedCents: 20000 },
      { levyNoticeId: "n3", noticeNumber: "L-0003", lotId: "lot-7", fundId: "fund-admin", dueDate: "2026-10-01", owedCents: 50000 },
    ]);
  });

  it("refuses a notice whose amount cannot be read, rather than leave it out", () => {
    expect(() => openNotices([{ id: "n1", noticeNumber: "L-1", lotId: "l", fundId: "f", dueDate: "2026-01-01", status: "ISSUED", amountDue: "abc", amountPaid: "0" }])).toThrow();
  });
});

describe("allocatePayment", () => {
  const notices = [notice("n1", "2026-04-01", 31234), notice("n5", "2026-07-01", 20000, "fund-cw"), notice("n3", "2026-10-01", 50000)];

  it("pays every notice exactly", () => {
    const a = allocatePayment(notices, 101234);
    expect(a.kind).toBe("EXACT");
    expect(a.receipts).toEqual([{ levyNoticeId: "n1", amountCents: 31234 }, { levyNoticeId: "n5", amountCents: 20000 }, { levyNoticeId: "n3", amountCents: 50000 }]);
    expect(a.excessCents).toBe(0);
  });

  it("pays the oldest first and leaves the last part paid (partial payment)", () => {
    const a = allocatePayment(notices, 40000);
    expect(a.kind).toBe("PARTIAL");
    expect(a.receipts).toEqual([{ levyNoticeId: "n1", amountCents: 31234 }, { levyNoticeId: "n5", amountCents: 8766 }]);
    expect(a.parts.map((p) => [p.appliedCents, p.excessCents])).toEqual([[31234, 0], [8766, 0]]);
  });

  it("puts an overpayment on the newest notice as the owner's credit", () => {
    const a = allocatePayment(notices, 110000);
    expect(a.kind).toBe("OVERPAID");
    expect(a.excessCents).toBe(8766);
    expect(a.receipts.at(-1)).toEqual({ levyNoticeId: "n3", amountCents: 58766 });
    expect(a.parts.at(-1)).toMatchObject({ levyNoticeId: "n3", appliedCents: 50000, excessCents: 8766 });
  });

  it("allocates nothing when the lot owes nothing, and refuses an amount that is not whole cents", () => {
    expect(allocatePayment([], 5000)).toEqual({ kind: "NO_OPEN_NOTICES", receipts: [], parts: [], excessCents: 5000 });
    expect(() => allocatePayment(notices, 0)).toThrow(RangeError);
    expect(() => allocatePayment(notices, 1.5)).toThrow(RangeError);
  });

  it("never allocates more or less than the payment", () => {
    for (const amount of [1, 31233, 31234, 31235, 51234, 101233, 101234, 101235, 250000]) {
      const a = allocatePayment(notices, amount);
      expect(a.receipts.reduce((s, r) => s + r.amountCents, 0), String(amount)).toBe(amount);
    }
  });
});

describe("the receipt journal", () => {
  const accounts = {
    debitAccountId: "acc-bank",
    receivableByFund: { "fund-admin": "acc-ar-admin", "fund-cw": "acc-ar-cw" },
    advanceByFund: { "fund-admin": "acc-adv-admin", "fund-cw": "acc-adv-cw" },
  };
  const notices = [notice("n1", "2026-04-01", 31234), notice("n5", "2026-07-01", 20000, "fund-cw"), notice("n3", "2026-10-01", 50000)];

  it("debits the money for each fund and credits each notice's receivable and any credit, balancing in each fund", () => {
    const { parts } = allocatePayment(notices, 110000);
    const lines = zaiReceiptJournalLines(parts, accounts);
    expect(lines).toEqual([
      { accountCodeId: "acc-bank", fundId: "fund-admin", debitCents: 90000, description: "Zai receipt, levy payment" },
      { accountCodeId: "acc-bank", fundId: "fund-cw", debitCents: 20000, description: "Zai receipt, levy payment" },
      { accountCodeId: "acc-ar-admin", fundId: "fund-admin", creditCents: 31234, description: "Levies receivable reduced, notice N1", lotId: "lot-7" },
      { accountCodeId: "acc-ar-cw", fundId: "fund-cw", creditCents: 20000, description: "Levies receivable reduced, notice N5", lotId: "lot-7" },
      { accountCodeId: "acc-ar-admin", fundId: "fund-admin", creditCents: 50000, description: "Levies receivable reduced, notice N3", lotId: "lot-7" },
      { accountCodeId: "acc-adv-admin", fundId: "fund-admin", creditCents: 8766, description: "Overpayment held as owner credit, notice N3", lotId: "lot-7" },
    ]);
    expect(journalBalances(lines)).toBe(true);
  });

  it("balances for every split of a payment", () => {
    for (const amount of [1, 31234, 40000, 101234, 250000]) expect(journalBalances(zaiReceiptJournalLines(allocatePayment(notices, amount).parts, accounts)), String(amount)).toBe(true);
  });

  it("finds a journal that does not balance, in total or within a fund", () => {
    expect(journalBalances([])).toBe(false);
    expect(journalBalances([{ fundId: "a", debitCents: 100 }, { fundId: "a", creditCents: 99 }])).toBe(false);
    expect(journalBalances([{ fundId: "a", debitCents: 100 }, { fundId: "b", creditCents: 100 }])).toBe(false);
    expect(journalBalances([{ fundId: "a", debitCents: -5 }, { fundId: "a", creditCents: -5 }])).toBe(false);
  });
});

describe("reversalPlan", () => {
  it("turns the receipt's lines round and puts each notice back as the shared rule does", () => {
    const owed = [notice("n1", "2026-04-01", 31234), notice("n3", "2026-10-01", 50000)];
    const { parts } = allocatePayment(owed, 60000);
    const accounts = { debitAccountId: "acc-bank", receivableByFund: { "fund-admin": "acc-ar" }, advanceByFund: { "fund-admin": null } };
    const lines = zaiReceiptJournalLines(parts, accounts);
    const plan = reversalPlan(lines, [{ levyNoticeId: "n1", owedCents: 50000, paidCents: 50000 }, { levyNoticeId: "n3", owedCents: 50000, paidCents: 28766 }], parts);
    expect(journalBalances(plan.lines)).toBe(true);
    expect(plan.lines[0]).toMatchObject({ accountCodeId: "acc-bank", creditCents: 60000, debitCents: undefined });
    expect(plan.lines.slice(1).every((l) => l.debitCents && !l.creditCents)).toBe(true);
    expect(plan.notices).toEqual([
      { levyNoticeId: "n1", paidCents: 18766, balanceCents: 31234, status: "PARTIALLY_PAID" },
      { levyNoticeId: "n3", paidCents: 0, balanceCents: 50000, status: "ISSUED" },
    ]);
  });
});
