import { describe, expect, it } from "vitest";
import {
  buildInvoice,
  monthBounds,
  nextInvoiceNumber,
  platformStatusFor,
  sydneyMidnightUtc,
  sydneyMonth,
  type AccruedFee,
} from "./invoice";
import { TEST_PRICE_BOOK } from "./test-price-book";

const paid = { status: "ACTIVE", promotionEnd: null, quotedMonthlyCents: null };
const fee = (over: Partial<AccruedFee>): AccruedFee => ({
  id: "f1",
  code: "MEETING_EGM",
  description: "General meeting",
  status: "ACCRUED",
  occurredAt: "2026-10-15T03:00:00.000Z",
  exGstCents: 5500,
  gstCents: 550,
  ...over,
});

describe("Sydney billing calendar", () => {
  it("finds the Sydney month at an instant", () => {
    // 31 Oct 14:00 UTC is 1 Nov 01:00 in Sydney (AEDT).
    expect(sydneyMonth(new Date("2026-10-31T14:00:00Z"))).toBe("2026-11");
    expect(sydneyMonth(new Date("2026-10-31T12:00:00Z"))).toBe("2026-10");
  });

  it("gives month bounds, including February in a leap year", () => {
    expect(monthBounds("2026-11")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("finds Sydney midnight in summer, winter and on a daylight saving day", () => {
    expect(sydneyMidnightUtc("2026-11-01").toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(sydneyMidnightUtc("2026-07-01").toISOString()).toBe("2026-06-30T14:00:00.000Z");
    // 1 Oct 2028 is the first Sunday of October: midnight is still AEST.
    expect(sydneyMidnightUtc("2028-10-01").toISOString()).toBe("2028-09-30T14:00:00.000Z");
  });
});

describe("buildInvoice", () => {
  it("produces a subscription-only invoice for a period with no events", () => {
    const inv = buildInvoice({ month: "2026-11", lotCount: 8, subscription: paid, priceBook: TEST_PRICE_BOOK, accruedFees: [] });
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].kind).toBe("SUBSCRIPTION");
    expect(inv.tier).toBe("SMALL");
    expect(inv.totalCents).toBe(inv.lines[0].exGstCents + inv.lines[0].gstCents);
    expect(inv.totalCents).toBeGreaterThan(0);
  });

  it("gives a promotional scheme a zero subscription with a visible promotional period line", () => {
    const inv = buildInvoice({
      month: "2026-11",
      lotCount: 8,
      subscription: { status: "PROMOTIONAL", promotionEnd: "2027-06-30", quotedMonthlyCents: null },
      priceBook: TEST_PRICE_BOOK,
      accruedFees: [],
    });
    expect(inv.promotional).toBe(true);
    expect(inv.lines.map((l) => l.kind)).toEqual(["SUBSCRIPTION", "PROMOTIONAL_CREDIT"]);
    expect(inv.lines[1].description).toMatch(/Promotional period/);
    expect(inv.totalCents).toBe(0);
  });

  it("still charges fees during the promotional period", () => {
    const inv = buildInvoice({
      month: "2026-11",
      lotCount: 8,
      subscription: { status: "PROMOTIONAL", promotionEnd: null, quotedMonthlyCents: null },
      priceBook: TEST_PRICE_BOOK,
      accruedFees: [fee({})],
    });
    expect(inv.totalCents).toBe(6050);
  });

  it("bills fees accrued before the month began, not those after", () => {
    const inv = buildInvoice({
      month: "2026-11",
      lotCount: 8,
      subscription: paid,
      priceBook: TEST_PRICE_BOOK,
      accruedFees: [
        fee({ id: "before", occurredAt: "2026-10-31T12:59:59.000Z" }),
        fee({ id: "after", occurredAt: "2026-10-31T13:00:00.000Z" }),
      ],
    });
    const billed = inv.lines.filter((l) => l.kind === "FEE").map((l) => l.feeEventId);
    expect(billed).toEqual(["before"]);
  });

  it("nets reversals and leaves out waived fees", () => {
    const inv = buildInvoice({
      month: "2026-11",
      lotCount: 8,
      subscription: { status: "PROMOTIONAL", promotionEnd: null, quotedMonthlyCents: null },
      priceBook: TEST_PRICE_BOOK,
      accruedFees: [
        fee({ id: "a" }),
        fee({ id: "b", status: "REVERSED", exGstCents: -5500, gstCents: -550 }),
        fee({ id: "c", status: "WAIVED" }),
      ],
    });
    expect(inv.lines.filter((l) => l.kind === "FEE").map((l) => l.feeEventId)).toEqual(["a", "b"]);
    expect(inv.totalCents).toBe(0);
  });

  it("uses the quoted price for an Enterprise scheme and flags a missing quote", () => {
    const quoted = buildInvoice({
      month: "2026-11",
      lotCount: 200,
      subscription: { ...paid, quotedMonthlyCents: 90000 },
      priceBook: TEST_PRICE_BOOK,
      accruedFees: [],
    });
    expect(quoted.totalCents).toBe(99000);
    const unquoted = buildInvoice({ month: "2026-11", lotCount: 200, subscription: paid, priceBook: TEST_PRICE_BOOK, accruedFees: [] });
    expect(unquoted.needsQuote).toBe(true);
    expect(unquoted.lines).toHaveLength(0);
  });
});

describe("nextInvoiceNumber", () => {
  it("numbers invoices sequentially across the platform", () => {
    expect(nextInvoiceNumber([])).toBe("SV-000001");
    expect(nextInvoiceNumber(["SV-000001", "SV-000002"])).toBe("SV-000003");
    expect(nextInvoiceNumber(["SV-000009", "SV-000002", "junk"])).toBe("SV-000010");
  });
});

describe("platformStatusFor", () => {
  it("follows approval and payment in the scheme ledger", () => {
    expect(platformStatusFor("APPROVED")).toBe("APPROVED");
    expect(platformStatusFor("PARTIALLY_PAID")).toBe("APPROVED");
    expect(platformStatusFor("PAID")).toBe("PAID");
    expect(platformStatusFor("AWAITING_APPROVAL")).toBeNull();
    expect(platformStatusFor("CANCELLED")).toBeNull();
  });
});
