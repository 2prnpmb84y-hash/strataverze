import { describe, expect, it } from "vitest";
import { isQuoteRequestOpen, supplierMaySeeQuoteRequest, toSupplierQuoteView } from "./quote-visibility";

/** Finding F3: a supplier sees their own quote and a count of the others, nothing more. */

const request = {
  id: "qr-1",
  schemeId: "scheme-a",
  status: "OPEN",
  closesAt: null,
  quotes: [
    { id: "q-mine", supplierId: "supplier-me", amount: "1200.00", description: "Mine", supplier: { firstName: "Me" } },
    { id: "q-rival-1", supplierId: "supplier-x", amount: "900.00", description: "Rival one", supplier: { firstName: "X" } },
    { id: "q-rival-2", supplierId: "supplier-y", amount: "950.00", description: "Rival two", supplier: { firstName: "Y" } },
  ],
};

describe("toSupplierQuoteView", () => {
  it("keeps only the supplier's own quote and counts the others", () => {
    const view = toSupplierQuoteView(request, "supplier-me");
    expect(view.ownQuote?.id).toBe("q-mine");
    expect(view.otherQuoteCount).toBe(2);
    expect("quotes" in view).toBe(false);
    // No competitor's amount, description or name anywhere in the view.
    const json = JSON.stringify(view);
    for (const leak of ["900.00", "950.00", "Rival one", "Rival two", "supplier-x", "supplier-y"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("gives no own quote to a supplier who has not quoted", () => {
    const view = toSupplierQuoteView(request, "supplier-new");
    expect(view.ownQuote).toBeNull();
    expect(view.otherQuoteCount).toBe(3);
  });

  it("handles a request with no quotes", () => {
    const view = toSupplierQuoteView({ ...request, quotes: [] }, "supplier-me");
    expect(view).toMatchObject({ ownQuote: null, otherQuoteCount: 0 });
  });
});

describe("isQuoteRequestOpen and supplierMaySeeQuoteRequest", () => {
  const now = new Date("2026-10-23T00:00:00Z");

  it("is open while OPEN and before the closing time", () => {
    expect(isQuoteRequestOpen({ status: "OPEN", closesAt: "2026-10-30T00:00:00Z" }, now)).toBe(true);
    expect(isQuoteRequestOpen({ status: "OPEN", closesAt: null }, now)).toBe(true);
  });

  it("is closed after the closing time or when not OPEN", () => {
    expect(isQuoteRequestOpen({ status: "OPEN", closesAt: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(isQuoteRequestOpen({ status: "AWARDED", closesAt: null }, now)).toBe(false);
  });

  it("lets a supplier see a closed request only if they quoted on it", () => {
    const closed = { status: "AWARDED", closesAt: null };
    expect(supplierMaySeeQuoteRequest(closed, false, now)).toBe(false);
    expect(supplierMaySeeQuoteRequest(closed, true, now)).toBe(true);
    expect(supplierMaySeeQuoteRequest({ status: "OPEN" }, false, now)).toBe(true);
  });
});
