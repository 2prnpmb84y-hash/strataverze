import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";
import { renderInvoicePdf } from "./invoice-pdf";

const NSW = statutoryRulesFor("NSW").TERMINOLOGY;

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
    }, NSW);
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
    const doc = await PDFDocument.load(await renderInvoicePdf({ ...base, lines }, NSW));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});

describe("the owners corporation billed", () => {
  const textOf = async (bytes: Uint8Array) => String((await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })).text).replace(/\s+/g, " ");
  const lines = [{ description: "Scheme subscription", exGstCents: 4900, gstCents: 490 }];

  it("is named as the NSW invoice always has", async () => {
    expect(await textOf(await renderInvoicePdf({ ...base, lines }, NSW))).toContain("The Owners - Strata Plan No. 12345");
    expect(await textOf(await renderInvoicePdf({ ...base, lines, scheme: { ...base.scheme, planNumber: null } }, NSW))).toContain("The Owners Corporation");
  });

  it("is named from the Queensland pack for a Queensland building", async () => {
    const scheme = { ...base.scheme, name: "Harbour View", state: "QLD" };
    const text = await textOf(await renderInvoicePdf({ ...base, lines, scheme }, PENDING_RULE_PACKS.QLD.rules.TERMINOLOGY));
    expect(text).toContain("Body corporate for Harbour View community titles scheme 12345");
    expect(text).not.toContain("Strata Plan");
  });
});
