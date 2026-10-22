import { describe, expect, it } from "vitest";
import { formatAud, splitGst, toCents } from "./money";
import { resolvePrice, validatePriceBook, PriceBookError, type PriceBookEntry } from "./price-book";
import { deriveTier, isPromotional, subscriptionPrice } from "./subscription-tier";
import {
  feeIdempotencyKey,
  paperNoticeFee,
  reversalIdempotencyKey,
  transactionFee,
  usageFee,
} from "./fee-engine";
import { TEST_PRICE_BOOK as book } from "./test-price-book";

const date = "2026-11-01";

describe("deriveTier", () => {
  it.each([
    [0, "SMALL"], [10, "SMALL"], [11, "MEDIUM"], [50, "MEDIUM"],
    [51, "LARGE"], [150, "LARGE"], [151, "ENTERPRISE"],
  ])("%i lots is %s", (lots, tier) => {
    expect(deriveTier(lots)).toBe(tier);
  });

  it("rejects impossible lot counts", () => {
    expect(() => deriveTier(-1)).toThrow();
    expect(() => deriveTier(2.5)).toThrow();
  });
});

describe("subscriptionPrice", () => {
  it("prices each tier from the price book", () => {
    expect(subscriptionPrice(book, 10, date).monthlyCents).toBe(4900);
    expect(subscriptionPrice(book, 11, date).monthlyCents).toBe(14900);
    expect(subscriptionPrice(book, 150, date).monthlyCents).toBe(34900);
  });

  it("flags enterprise schemes for a manual quote", () => {
    expect(subscriptionPrice(book, 151, date)).toMatchObject({ tier: "ENTERPRISE", monthlyCents: null, needsQuote: true });
  });

  it("treats promotional subscriptions as free until the promotion ends", () => {
    expect(isPromotional({ status: "PROMOTIONAL", promotionEnd: "2026-12-01" }, "2026-11-30")).toBe(true);
    expect(isPromotional({ status: "PROMOTIONAL", promotionEnd: "2026-12-01" }, "2026-12-01")).toBe(false);
    expect(isPromotional({ status: "ACTIVE" }, date)).toBe(false);
  });
});

describe("transactionFee", () => {
  const fee = (dollars: number, mode: "TIERED" | "FLAT" = "TIERED") =>
    transactionFee({ movement: "LEVY_RECEIPT", paymentCents: toCents(dollars), mode, priceBook: book, date })!.exGstCents;

  it("applies the tier for the payment amount", () => {
    expect(fee(499.99)).toBe(150);
    expect(fee(500)).toBe(250);
    expect(fee(5000)).toBe(250);
    expect(fee(5000.01)).toBe(500);
  });

  it("charges the same fee for every event in flat mode", () => {
    expect([fee(10, "FLAT"), fee(500, "FLAT"), fee(9000, "FLAT")]).toEqual([250, 250, 250]);
  });

  it("never charges for internal transfers between the scheme's funds", () => {
    expect(
      transactionFee({ movement: "INTERNAL_FUND_TRANSFER", paymentCents: 100_000, mode: "TIERED", priceBook: book, date }),
    ).toBeNull();
  });

  it("does not depend on the payment amount beyond its band (no percentage)", () => {
    expect(fee(600)).toBe(fee(4999));
  });

  it("rejects bad amounts", () => {
    expect(() => transactionFee({ movement: "LEVY_RECEIPT", paymentCents: 0, mode: "TIERED", priceBook: book, date })).toThrow();
  });
});

describe("GST", () => {
  it("adds 10% to GST-exclusive prices, rounded to the cent", () => {
    expect(splitGst(150, false)).toEqual({ exGstCents: 150, gstCents: 15, totalCents: 165 });
    expect(splitGst(4900, false)).toEqual({ exGstCents: 4900, gstCents: 490, totalCents: 5390 });
    expect(splitGst(5, false)).toEqual({ exGstCents: 5, gstCents: 1, totalCents: 6 });
  });

  it("takes one eleventh out of GST-inclusive prices", () => {
    expect(splitGst(800, true)).toEqual({ exGstCents: 727, gstCents: 73, totalCents: 800 });
    expect(splitGst(1100, true)).toEqual({ exGstCents: 1000, gstCents: 100, totalCents: 1100 });
  });

  it("formats dollars", () => {
    expect(formatAud(165)).toBe("$1.65");
  });
});

describe("usageFee", () => {
  it("prices simple usage events", () => {
    expect(usageFee({ code: "MEETING_EGM", priceBook: book, date })!.totalCents).toBe(6050);
  });

  it("prices recovery steps by step type and marks them recoverable from the owner", () => {
    const step = usageFee({ code: "RECOVERY_STEP", variant: "REFERRAL", priceBook: book, date })!;
    expect(step.exGstCents).toBe(6000);
    expect(step.recoverableFromOwner).toBe(true);
    expect(step.payerType).toBe("OWNER_VIA_OC");
  });

  it("prices works contracts by value band with flat amounts", () => {
    expect(usageFee({ code: "WORKS_CONTRACT", priceBook: book, date, bandValue: toCents(8_000) })!.exGstCents).toBe(15000);
    expect(usageFee({ code: "WORKS_CONTRACT", priceBook: book, date, bandValue: toCents(20_000) })!.exGstCents).toBe(30000);
    expect(usageFee({ code: "WORKS_CONTRACT", priceBook: book, date, bandValue: toCents(80_000) })!.exGstCents).toBe(50000);
  });

  it("multiplies per-seat prices", () => {
    expect(usageFee({ code: "ACCOUNTANT_SEAT", priceBook: book, date, quantity: 3 })!.exGstCents).toBe(6000);
  });

  it("returns no fee when the fee is switched off", () => {
    expect(usageFee({ code: "CLAIM_HANDLING", priceBook: book, date })).toBeNull();
  });

  it("charges paper notices at cost plus a flat margin", () => {
    expect(paperNoticeFee({ mailCostCents: 230, priceBook: book, date })).toMatchObject({ exGstCents: 330, gstCents: 33, totalCents: 363 });
  });
});

describe("price book", () => {
  const entry = (over: Partial<PriceBookEntry>): PriceBookEntry => ({
    code: "BALLOT", description: "Ballot", amountCents: 2500, gstInclusive: false, unit: "PER_EVENT",
    payerType: "OC", effectiveFrom: "2026-01-01", isActive: true, ...over,
  });

  it("picks the row in force on the date", () => {
    const rows = [entry({ effectiveTo: "2027-01-01" }), entry({ amountCents: 3000, effectiveFrom: "2027-01-01" })];
    expect(resolvePrice(rows, { code: "BALLOT", date: "2026-12-31" })!.amountCents).toBe(2500);
    expect(resolvePrice(rows, { code: "BALLOT", date: "2027-01-01" })!.amountCents).toBe(3000);
    expect(resolvePrice(rows, { code: "BALLOT", date: "2025-06-01" })).toBeNull();
  });

  it("refuses to guess between overlapping rows", () => {
    expect(() => resolvePrice([entry({}), entry({ amountCents: 1 })], { code: "BALLOT", date })).toThrow(PriceBookError);
    expect(validatePriceBook([entry({}), entry({ amountCents: 1 })])).toHaveLength(1);
  });

  it("accepts the test price book, whose bands do not overlap", () => {
    expect(validatePriceBook(book)).toEqual([]);
  });

  it("rejects percentage units and negative prices", () => {
    const bad = validatePriceBook([
      entry({ unit: "PERCENT" as never }),
      entry({ code: "X", amountCents: -1 }),
    ]);
    expect(bad.map((p) => p.code)).toEqual(["BALLOT", "X"]);
  });
});

describe("idempotency keys", () => {
  it("is the same for the same source and differs across sources", () => {
    const a = feeIdempotencyKey({ code: "TXN_FEE", sourceType: "LevyPayment", sourceId: "p1" });
    expect(feeIdempotencyKey({ code: "TXN_FEE", sourceType: "LevyPayment", sourceId: "p1" })).toBe(a);
    expect(feeIdempotencyKey({ code: "TXN_FEE", sourceType: "LevyPayment", sourceId: "p2" })).not.toBe(a);
    expect(feeIdempotencyKey({ code: "BALLOT", sourceType: "LevyPayment", sourceId: "p1" })).not.toBe(a);
    expect(feeIdempotencyKey({ code: "RECOVERY_STEP", variant: "REMINDER", sourceType: "Step", sourceId: "s1" }))
      .not.toBe(feeIdempotencyKey({ code: "RECOVERY_STEP", variant: "REFERRAL", sourceType: "Step", sourceId: "s1" }));
  });

  it("gives reversals their own key", () => {
    const a = feeIdempotencyKey({ code: "TXN_FEE", sourceType: "LevyPayment", sourceId: "p1" });
    expect(reversalIdempotencyKey(a)).not.toBe(a);
  });

  it("rejects ambiguous parts", () => {
    expect(() => feeIdempotencyKey({ code: "TXN_FEE", sourceType: "Levy:Payment", sourceId: "p1" })).toThrow();
    expect(() => feeIdempotencyKey({ code: "TXN_FEE", sourceType: "LevyPayment", sourceId: "" })).toThrow();
  });
});
