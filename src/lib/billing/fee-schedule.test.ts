import { describe, expect, it } from "vitest";
import { feeSchedule, feeTotals, groupFeeSchedule } from "./fee-schedule";
import { TEST_PRICE_BOOK } from "./test-price-book";

describe("feeSchedule", () => {
  const rows = feeSchedule(TEST_PRICE_BOOK, "2026-07-01");

  it("shows GST on top of GST exclusive prices", () => {
    const egm = rows.find((r) => r.code === "MEETING_EGM");
    expect(egm).toBeDefined();
    expect(egm!.exGstCents).toBe(5500);
    expect(egm!.gstCents).toBe(550);
    expect(egm!.totalCents).toBe(6050);
  });

  it("leaves out inactive rows and rows not yet in force", () => {
    const egm = TEST_PRICE_BOOK.find((e) => e.code === "MEETING_EGM")!;
    const book = [
      ...TEST_PRICE_BOOK,
      { ...egm, code: "SWITCHED_OFF", isActive: false },
      { ...egm, code: "FUTURE_FEE", effectiveFrom: "2027-01-01" },
    ];
    const shown = feeSchedule(book, "2026-07-01");
    expect(shown.some((r) => r.code === "SWITCHED_OFF")).toBe(false);
    expect(shown.some((r) => r.code === "FUTURE_FEE")).toBe(false);
  });

  it("orders transaction fee bands from lowest to highest", () => {
    const txn = rows.filter((r) => r.code === "TXN_FEE").map((r) => r.bandMin);
    expect(txn).toEqual([...txn].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("shows only the transaction fee that applies in each mode", () => {
    const tiered = feeSchedule(TEST_PRICE_BOOK, "2026-07-01", { transactionFeeMode: "TIERED" });
    expect(tiered.some((r) => r.code === "TXN_FEE_FLAT")).toBe(false);
    expect(tiered.some((r) => r.code === "TXN_FEE")).toBe(true);
    const flat = feeSchedule(TEST_PRICE_BOOK, "2026-07-01", { transactionFeeMode: "FLAT" });
    expect(flat.some((r) => r.code === "TXN_FEE")).toBe(false);
  });

  it("never shows a percentage", () => {
    for (const r of rows) {
      expect(r.description).not.toMatch(/%|per ?cent/i);
      expect(r.unitLabel).not.toMatch(/%|per ?cent/i);
    }
  });

  it("groups rows in display order with no empty groups", () => {
    const groups = groupFeeSchedule(rows);
    expect(groups[0].group).toBe("Subscription");
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
  });
});

describe("feeTotals", () => {
  it("nets reversals and ignores waived charges", () => {
    const t = feeTotals([
      { status: "ACCRUED", amountExGstCents: 5500, gstCents: 550 },
      { status: "ACCRUED", amountExGstCents: 2500, gstCents: 250 },
      { status: "REVERSED", amountExGstCents: -2500, gstCents: -250 },
      { status: "WAIVED", amountExGstCents: 10000, gstCents: 1000 },
    ]);
    expect(t).toEqual({ exGstCents: 5500, gstCents: 550, totalCents: 6050, count: 2 });
  });
});
