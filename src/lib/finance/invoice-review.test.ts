import { describe, expect, it } from "vitest";
import { extractedValues, extractionCorrections, formatCorrectionValue, matchSupplier, reviewChecks, type ExtractedFields, type InvoiceReviewValues } from "./invoice-review";

const suppliers = [
  { id: "s-acme", companyName: "Acme Plumbing Pty Ltd", abn: "12 345 678 901" },
  { id: "s-lift", companyName: "Lift Co", abn: null },
];

const read: ExtractedFields = {
  supplierName: "ACME PLUMBING PTY LTD",
  abn: "12345678901",
  invoiceNumber: " INV-9 ",
  invoiceDate: "2026-09-01",
  dueDate: "2026-09-30",
  subtotal: 1_000,
  gstAmount: 100,
  totalAmount: 1_100,
  description: "Burst pipe repair",
};

describe("invoice extraction review (TC-009)", () => {
  it("records the misread amount and the corrected amount", () => {
    const extracted = extractedValues(read, suppliers);
    expect(extracted).toMatchObject({ supplierId: "s-acme", invoiceNumber: "INV-9", totalCents: 110_000 });
    // The invoice says $11,000: the adviser corrects the subtotal and GST before saving.
    const accepted: InvoiceReviewValues = {
      supplierId: "s-acme",
      invoiceNumber: "inv-9",
      invoiceDate: "2026-09-01",
      dueDate: "2026-09-30",
      subtotalCents: 1_000_000,
      gstCents: 100_000,
      totalCents: 1_100_000,
      description: "Burst pipe repair",
    };
    const corrections = extractionCorrections(extracted, accepted);
    expect(corrections.map((c) => c.field)).toEqual(["subtotalCents", "gstCents", "totalCents"]);
    expect(corrections.find((c) => c.field === "totalCents")).toEqual({ field: "totalCents", label: "Total", extracted: 110_000, accepted: 1_100_000 });
    expect(formatCorrectionValue("totalCents", 110_000)).toBe("$1,100.00");
    expect(formatCorrectionValue("totalCents", 1_100_000)).toBe("$11,000.00");
    expect(reviewChecks(accepted, extracted.totalCents)).toEqual([
      "The total entered is ten or a hundred times the total read from the invoice. Check for a misread digit or decimal point.",
    ]);
  });

  it("records nothing when every field is accepted as read", () => {
    const extracted = extractedValues(read, suppliers);
    const accepted = { ...(extracted as InvoiceReviewValues), description: "burst  pipe repair" };
    expect(extractionCorrections(extracted, accepted)).toEqual([]);
  });

  it("records a field the adviser filled in that extraction missed", () => {
    const extracted = extractedValues({ ...read, dueDate: null, supplierName: "Unknown", abn: null }, suppliers);
    const accepted: InvoiceReviewValues = { ...(extracted as InvoiceReviewValues), supplierId: "s-lift", dueDate: "2026-10-15" };
    expect(extractionCorrections(extracted, accepted).map((c) => [c.field, c.extracted, c.accepted])).toEqual([
      ["supplierId", null, "s-lift"],
      ["dueDate", null, "2026-10-15"],
    ]);
    expect(formatCorrectionValue("dueDate", null)).toBe("not found");
  });

  it("takes subtotal plus GST as the total only when no total was read", () => {
    expect(extractedValues({ ...read, totalAmount: null }, suppliers).totalCents).toBe(110_000);
    expect(extractedValues({ ...read, totalAmount: null, gstAmount: null }, suppliers).totalCents).toBeNull();
    expect(extractedValues({ ...read, invoiceDate: "1/9/2026" }, suppliers).invoiceDate).toBeNull();
  });

  it("matches the supplier by ABN, then by name", () => {
    expect(matchSupplier({ abn: "12 345 678 901", supplierName: "Someone else" }, suppliers)).toBe("s-acme");
    expect(matchSupplier({ abn: null, supplierName: "lift co" }, suppliers)).toBe("s-lift");
    expect(matchSupplier({ abn: "999", supplierName: "Nobody" }, suppliers)).toBeNull();
  });

  it("flags totals that do not add up, odd GST and a due date before the invoice date", () => {
    expect(reviewChecks({ invoiceDate: "2026-09-10", dueDate: "2026-09-01", subtotalCents: 100_000, gstCents: 5_000, totalCents: 110_000 }, null)).toEqual([
      "Subtotal plus GST does not equal the total.",
      "GST is not 10% of the subtotal. Check the invoice for GST-free items.",
      "The due date is before the invoice date.",
    ]);
    expect(reviewChecks({ invoiceDate: "2026-09-01", dueDate: "2026-09-30", subtotalCents: 100_003, gstCents: 10_000, totalCents: 110_003 }, 110_003)).toEqual([]);
  });
});
