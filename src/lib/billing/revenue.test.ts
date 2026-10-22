import { describe, expect, it } from "vitest";
import { revenueSummary } from "./revenue";
import { TEST_PRICE_BOOK } from "./test-price-book";

const sub = (over: Partial<Parameters<typeof revenueSummary>[0]["subscriptions"][number]>) => ({
  schemeId: "s",
  schemeName: "Scheme",
  status: "ACTIVE",
  promotionEnd: null,
  quotedMonthlyCents: null,
  lotCount: 8,
  ...over,
});

describe("revenueSummary", () => {
  const now = new Date("2026-10-22T03:00:00Z");

  it("counts paying, promotional and unquoted schemes by tier", () => {
    const r = revenueSummary({
      subscriptions: [
        sub({ schemeId: "a" }),
        sub({ schemeId: "b", status: "PROMOTIONAL", promotionEnd: "2027-03-31" }),
        sub({ schemeId: "c", lotCount: 200 }),
        sub({ schemeId: "d", lotCount: 200, quotedMonthlyCents: 90000 }),
        sub({ schemeId: "e", status: "CANCELLED" }),
      ],
      priceBook: TEST_PRICE_BOOK,
      feeEvents: [],
      invoices: [],
      now,
    });
    const small = r.tiers.find((t) => t.tier === "SMALL")!;
    const ent = r.tiers.find((t) => t.tier === "ENTERPRISE")!;
    expect(small.payingSchemes).toBe(1);
    expect(small.promotionalSchemes).toBe(1);
    expect(ent).toMatchObject({ payingSchemes: 1, needsQuote: 1, mrrCents: 90000 });
    expect(r.mrrCents).toBe(small.mrrCents + 90000);
    expect(r.promotional.map((p) => p.schemeId)).toEqual(["b"]);
  });

  it("totals fee events by code for this month and the last 12 months, ex GST", () => {
    const r = revenueSummary({
      subscriptions: [],
      priceBook: TEST_PRICE_BOOK,
      feeEvents: [
        { code: "BALLOT", status: "ACCRUED", occurredAt: "2026-10-10T00:00:00Z", exGstCents: 2500 },
        { code: "BALLOT", status: "INVOICED", occurredAt: "2026-06-10T00:00:00Z", exGstCents: 2500 },
        { code: "BALLOT", status: "WAIVED", occurredAt: "2026-10-11T00:00:00Z", exGstCents: 2500 },
        { code: "BALLOT", status: "INVOICED", occurredAt: "2025-06-10T00:00:00Z", exGstCents: 2500 },
      ],
      invoices: [
        { status: "ISSUED", totalCents: 5390 },
        { status: "APPROVED", totalCents: 1000 },
        { status: "PAID", totalCents: 9999 },
      ],
      now,
    });
    expect(r.feesByCode).toEqual([{ code: "BALLOT", thisMonthCents: 2500, last12MonthsCents: 5000, count12: 2 }]);
    expect(r.outstanding).toEqual({ count: 2, totalCents: 6390 });
  });
});
