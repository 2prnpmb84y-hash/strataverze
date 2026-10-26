import { describe, expect, it } from "vitest";
import { FeeConfirmationError, confirmedCentsFrom, resolveDisclosure, toFeeView } from "./disclosure";
import { usageFee } from "./fee-engine";
import { TEST_PRICE_BOOK as book } from "./test-price-book";

const quote = usageFee({ code: "BALLOT", priceBook: book, date: "2026-11-01" })!;

describe("resolveDisclosure", () => {
  it("records who confirmed, when and what they saw", () => {
    const d = resolveDisclosure(quote, 2750, "u1", new Date("2026-11-01T01:00:00Z"));
    expect(d).toEqual({ shownToId: "u1", shownAt: "2026-11-01T01:00:00.000Z", amountCents: 2750 });
  });

  it("needs no confirmation when there is no fee", () => {
    expect(resolveDisclosure(null, null, "u1")).toBeNull();
  });

  it("blocks the action when the fee was not confirmed", () => {
    expect(() => resolveDisclosure(quote, null, "u1")).toThrow(FeeConfirmationError);
    expect(() => resolveDisclosure(quote, null, "u1")).toThrow("$27.50");
  });

  it("blocks the action when the fee changed since it was shown", () => {
    expect(() => resolveDisclosure(quote, 2500, "u1")).toThrow(/now \$27\.50/);
  });
});

describe("payment plan set-up fee", () => {
  it("is charged to the owners corporation and never passed to the owner, whatever the price book says", () => {
    const q = usageFee({ code: "RECOVERY_STEP", variant: "PAYMENT_PLAN", priceBook: book, date: "2026-11-01" })!;
    expect(q.payerType).toBe("OC");
    expect(q.recoverableFromOwner).toBe(false);
    const v = toFeeView(q);
    expect(v.payerLabel).toBe("Charged to the owners corporation");
    expect(v.explanation).toMatch(/cannot be passed to the owner/);
  });
});

describe("toFeeView", () => {
  it("explains the charge and who pays it", () => {
    const v = toFeeView(usageFee({ code: "RECOVERY_STEP", variant: "REMINDER", priceBook: book, date: "2026-11-01" })!);
    expect(v.totalCents).toBe(1650);
    expect(v.payerLabel).toMatch(/recoverable from the owner/);
    expect(v.explanation).toMatch(/flat fee/);
  });
});

describe("confirmedCentsFrom", () => {
  it("reads the confirmed amount from a form", () => {
    const f = new FormData();
    expect(confirmedCentsFrom(f)).toBeNull();
    f.set("feeConfirmedCents", "2750");
    expect(confirmedCentsFrom(f)).toBe(2750);
    f.set("feeConfirmedCents", "27.5");
    expect(confirmedCentsFrom(f)).toBeNull();
  });
});
