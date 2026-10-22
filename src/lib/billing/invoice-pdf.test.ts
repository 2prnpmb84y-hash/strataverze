import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderInvoicePdf } from "./invoice-pdf";

const base = {
  invoiceNumber: "SV-000001",
  issuedAt: "2026-11-01T15:00:00.000Z",
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  status: "ISSUED",
  scheme: { name: "Harbour View — Building A", planNumber: "12345", address: "1 Example St", suburb: "Drummoyne", state: "NSW", postcode: "2047" },
  subtotalCents: 4900,
  gstCents: 490,
  totalCents: 5390,
};

describe("renderInvoicePdf", () => {
  it("renders a one page PDF for a short invoice", async () => {
    const bytes = await renderInvoicePdf({
      ...base,
      lines: [{ description: "Scheme subscription, Small (8 lots), November 2026", exGstCents: 4900, gstCents: 490 }],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("adds pages for a long invoice and copes with characters outside the PDF font", async () => {
    const lines = Array.from({ length: 80 }, (_, i) => ({
      description: `Transaction service fee — payment ${i + 1} “levy” ✓`,
      exGstCents: 150,
      gstCents: 15,
    }));
    const doc = await PDFDocument.load(await renderInvoicePdf({ ...base, lines }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
