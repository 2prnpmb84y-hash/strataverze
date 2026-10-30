/**
 * Whether a levy notice is overdue on the building's day (overdue notices
 * fix, 30 Oct 2026): the one definition debt recovery reads, and the same
 * answer the screens give (effectiveStatus) for an ISSUED or PARTIALLY_PAID
 * notice.
 */
import { describe, expect, it } from "vitest";
import { isOverdueOn, OVERDUE_NOTICE_STATUSES, overdueOn, UnreadableNoticeError } from "./overdue";
import { effectiveStatus, type LedgerNotice } from "./levy-ledger";
import { todayIn } from "@/lib/jurisdiction/time-zone";

const TODAY = "2026-11-02";
const notice = (over: Partial<LedgerNotice> = {}): LedgerNotice => ({
  id: "n-1",
  lotId: "lot-1",
  noticeNumber: "L-1",
  dueDate: "2026-10-01",
  amountDue: "1000.00",
  amountPaid: "0.00",
  balanceOutstanding: "1000.00",
  status: "ISSUED",
  ...over,
});

describe("isOverdueOn", () => {
  it("counts ISSUED, PARTIALLY_PAID and OVERDUE notices past their due day with a balance", () => {
    expect(OVERDUE_NOTICE_STATUSES).toEqual(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);
    for (const status of OVERDUE_NOTICE_STATUSES) expect(isOverdueOn(notice({ status }), TODAY)).toBe(true);
  });

  it("never counts any other status, whatever its due day and balance", () => {
    for (const status of ["DRAFT", "PAID", "WRITTEN_OFF", "VOID", "CANCELLED", "", "issued"]) {
      expect(isOverdueOn(notice({ status }), TODAY)).toBe(false);
      // Not read at all, so an unreadable value does not throw.
      expect(isOverdueOn(notice({ status, balanceOutstanding: "x", dueDate: "x" }), TODAY)).toBe(false);
    }
  });

  it("is not overdue on its due day, and is from the day after", () => {
    expect(isOverdueOn(notice({ dueDate: "2026-11-02" }), TODAY)).toBe(false);
    expect(isOverdueOn(notice({ dueDate: "2026-11-03" }), TODAY)).toBe(false);
    expect(isOverdueOn(notice({ dueDate: "2026-11-01" }), TODAY)).toBe(true);
    // A notice stored as OVERDUE is held to the same rule.
    expect(isOverdueOn(notice({ status: "OVERDUE", dueDate: "2026-12-01" }), TODAY)).toBe(false);
  });

  it("needs a balance of at least a cent", () => {
    for (const balance of ["0.00", "0", 0, "0.004", "-5.00", -0.01]) {
      expect(isOverdueOn(notice({ balanceOutstanding: balance }), TODAY)).toBe(false);
      expect(isOverdueOn(notice({ status: "OVERDUE", balanceOutstanding: balance }), TODAY)).toBe(false);
    }
    for (const balance of ["0.01", 0.01, "1200.00"]) expect(isOverdueOn(notice({ balanceOutstanding: balance }), TODAY)).toBe(true);
  });

  it("reads a due date given as a Date (a date column) or a timestamp string", () => {
    expect(isOverdueOn(notice({ dueDate: new Date("2026-11-01T00:00:00.000Z") }), TODAY)).toBe(true);
    expect(isOverdueOn(notice({ dueDate: new Date("2026-11-02T00:00:00.000Z") }), TODAY)).toBe(false);
    expect(isOverdueOn(notice({ dueDate: "2026-11-01T00:00:00.000Z" }), TODAY)).toBe(true);
  });

  it("fails closed: a past-due notice whose balance cannot be read throws, never counted or left out silently", () => {
    for (const balance of [null, undefined, "", "  ", "not a number", NaN, Infinity]) {
      const n = notice({ balanceOutstanding: balance });
      expect(() => isOverdueOn(n, TODAY)).toThrow(UnreadableNoticeError);
      expect(() => overdueOn([n], TODAY)).toThrow(UnreadableNoticeError);
    }
    const thrown = (() => {
      try {
        isOverdueOn(notice({ balanceOutstanding: "abc" }), TODAY);
      } catch (err) {
        return err;
      }
      return null;
    })();
    expect(thrown).toMatchObject({ noticeId: "n-1", field: "balanceOutstanding" });
    // Not yet due: not overdue whatever the balance, so nothing to read.
    expect(isOverdueOn(notice({ dueDate: "2026-12-01", balanceOutstanding: "abc" }), TODAY)).toBe(false);
  });

  it("fails closed on a due date that cannot be read", () => {
    for (const dueDate of [null, undefined, "", "soon", new Date("nope")]) {
      expect(() => isOverdueOn(notice({ dueDate }), TODAY)).toThrow(UnreadableNoticeError);
    }
  });

  it("refuses a today that is not a day", () => {
    for (const today of ["", "2026-11-2", "2026-11-02T00:00:00Z", "today"]) expect(() => isOverdueOn(notice(), today)).toThrow(RangeError);
  });

  it("uses the building's day: the same instant is overdue in Sydney and not yet in Brisbane", () => {
    const instant = new Date("2026-11-01T13:30:00.000Z"); // 00:30 on 2 Nov in Sydney, 23:30 on 1 Nov in Brisbane
    const n = notice({ dueDate: "2026-11-01" });
    expect(isOverdueOn(n, todayIn("Australia/Sydney", instant))).toBe(true);
    expect(isOverdueOn(n, todayIn("Australia/Brisbane", instant))).toBe(false);
    expect(isOverdueOn(n, todayIn("UTC", instant))).toBe(false);
  });

  it("keeps the order given", () => {
    const list = [notice({ id: "a", dueDate: "2026-09-01" }), notice({ id: "b", dueDate: "2026-12-01" }), notice({ id: "c", dueDate: "2026-07-01" })];
    expect(overdueOn(list, TODAY).map((n) => n.id)).toEqual(["a", "c"]);
  });
});

describe("isOverdueOn gives the screens' answer (effectiveStatus)", () => {
  const statuses = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "WRITTEN_OFF"];
  const dues = ["2026-10-01", "2026-11-01", "2026-11-02", "2026-11-03", new Date("2026-11-01T00:00:00.000Z")];
  const balances = ["1000.00", "0.01", "0.005", "0.004", "0.00", "-1.00", 250];

  it("for every readable notice that is not stored as OVERDUE", () => {
    let checked = 0;
    for (const status of statuses)
      for (const dueDate of dues)
        for (const balanceOutstanding of balances) {
          const n = notice({ status, dueDate, balanceOutstanding });
          expect(isOverdueOn(n, TODAY), JSON.stringify({ status, dueDate, balanceOutstanding })).toBe(effectiveStatus(n, TODAY) === "OVERDUE");
          checked++;
        }
    expect(checked).toBe(statuses.length * dues.length * balances.length);
  });

  it("for a notice stored as OVERDUE, only when it is past due with a balance (the screens show it as stored)", () => {
    expect(effectiveStatus(notice({ status: "OVERDUE", dueDate: "2026-12-01" }), TODAY)).toBe("OVERDUE");
    expect(isOverdueOn(notice({ status: "OVERDUE", dueDate: "2026-12-01" }), TODAY)).toBe(false);
    expect(isOverdueOn(notice({ status: "OVERDUE" }), TODAY)).toBe(true);
  });
});
