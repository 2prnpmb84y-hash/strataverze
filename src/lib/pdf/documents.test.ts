import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { renderLevyNoticePdf, renderOwnerStatementPdf, renderRemittancePdf, renderStatutoryPackPdf } from "./documents";
import { wrap } from "./document";
import type { StatutoryPack } from "@/lib/finance/statutory-pack";

async function textOf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: String(text).replace(/\s+/g, " "), pages: pdf.numPages };
}

const notice = {
  schemeName: "Harbour View",
  planNumber: "12345",
  lotNumber: "7",
  ownerNames: ["Alex Nguyen"],
  noticeNumber: "LN-0042",
  noticeDate: "2026-10-23",
  dueDate: "2026-11-30",
  periodStart: "2026-10-01",
  periodEnd: "2026-12-31",
  fundName: "Administrative Fund",
  amountCents: 82_509,
  payment: { accountName: "The Owners SP 12345", bsb: "062-000", accountNumber: "12345678", reference: "LN-0042" },
  contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
  ledgerUrl: "https://strataverze.vercel.app/owner/levies",
  noInterest: false,
};

describe("PDF documents", () => {
  it("renders a levy notice with everything the notice must state, in Inter", async () => {
    const bytes = await renderLevyNoticePdf(notice);
    const { text } = await textOf(bytes);
    for (const s of ["Levy notice LN-0042", "Harbour View", "Strata Plan 12345", "$825.09", "30 November 2026", "062-000", "Financial Hardship Information Statement", "1800 007 007", "10% a year", "Page 1 of 1"]) {
      expect(text).toContain(s);
    }
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Levy notice LN-0042");
    // The brand font is embedded (subset fonts are named like ABCDEF+Inter-Regular).
    const fontNames = doc.context
      .enumerateIndirectObjects()
      .map(([, obj]) => (obj instanceof PDFDict ? obj.get(PDFName.of("BaseFont")) : undefined))
      .filter(Boolean)
      .map(String);
    expect(fontNames.some((n) => /Inter-Regular/.test(n))).toBe(true);
  });

  it("runs a long owner statement over several pages with the header on each", async () => {
    const lines = Array.from({ length: 120 }, (_, i) => ({ date: "2026-07-01", description: `Administrative Fund levy ${i + 1}`, charge: 100, payment: 0, balance: (i + 1) * 100 }));
    const bytes = await renderOwnerStatementPdf({
      schemeName: "Harbour View",
      planNumber: "12345",
      lotLabel: "Lot 7",
      ownerName: "Alex Nguyen",
      startDate: "2026-07-01",
      endDate: null,
      openingBalance: -50,
      lines,
      totalCharges: 12_000,
      totalPayments: 0,
      closingBalance: 11_950,
    });
    const { text, pages } = await textOf(bytes);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain("$50.00 credit");
    expect(text).toContain(`Page ${pages} of ${pages}`);
    expect(text.match(/Owner levy statement/g)!.length).toBeGreaterThanOrEqual(pages);
  });

  it("renders a remittance advice with the amount still owing", async () => {
    const { text } = await textOf(
      await renderRemittancePdf({
        schemeName: "Harbour View",
        planNumber: "12345",
        supplierName: "Acme Plumbing",
        supplierAbn: "12 345 678 901",
        invoiceNumber: "INV-9",
        invoiceDate: "2026-09-01",
        description: "Burst pipe",
        invoiceTotalCents: 110_000,
        payments: [{ date: "2026-09-15", amountCents: 60_000, reference: "EFT 1" }],
        bankAccountEnding: "5678",
      }),
    );
    expect(text).toContain("Remittance advice");
    expect(text).toContain("$500.00 of this invoice is still to be paid");
    expect(text).toContain("ending 5678");
  });

  it("renders the statutory statements with each fund and the notes", async () => {
    const fund = {
      fundId: "a",
      fundName: "Administrative Fund",
      fundType: "ADMINISTRATIVE",
      basis: "CASH" as const,
      keyInformation: {
        balanceCarriedForwardCents: 500_000,
        totalIncomeReceivedCents: 800_000,
        totalInterestEarnedCents: 0,
        totalContributionsPaidCents: 800_000,
        totalUnpaidContributionsCents: 200_000,
        maintenanceExpenditureCents: 300_000,
        administrationExpenditureCents: 50_000,
        balanceAtEndCents: 950_000,
        principalItemsNextPeriod: [{ description: "Insurance", amountCents: 60_000 }],
      },
      income: [{ accountId: "i", accountCode: "4-1000", accountName: "Levy Income", accountType: "INCOME" as const, accountSubType: "LEVY_INCOME", fundId: "a", amountCents: 800_000 }],
      expenditure: [],
      comparative: { incomeCents: 0, expenseCents: 0, surplusCents: 0 },
      totals: { incomeCents: 800_000, expenseCents: 350_000, surplusCents: 450_000 },
      balanceSheet: { assets: [], liabilities: [], ownersFundsCents: 950_000 },
      levyRegister: [],
      arrearsByLot: [{ lotNumber: "3", unpaidCents: 200_000 }],
    };
    const pack: StatutoryPack = {
      scheme: { name: "Harbour View", planNumber: "12345", lots: 12 },
      financialYear: 2026,
      start: "2026-07-01",
      end: "2027-06-30",
      generatedAt: "2027-07-10T00:00:00Z",
      funds: [fund, { ...fund, fundId: "c", fundName: "Capital Works Fund", basis: "ACCRUAL" }],
      notes: ["An audit is not required by size."],
      audit: { required: false, byLots: false, byBudget: false, annualBudgetCents: 1 },
      adopted: null,
    };
    const { text, pages } = await textOf(await renderStatutoryPackPdf(pack));
    expect(pages).toBeGreaterThanOrEqual(3);
    for (const s of ["Statement of key financial information", "Capital Works Fund (accrual basis)", "Balance carried forward", "$9,500.00", "Lot 3", "An audit is not required by size."]) {
      expect(text).toContain(s);
    }
  });
});

describe("stored copies", () => {
  it("gives the same file for the same document on the same day, so it is stored once", async () => {
    const at = new Date("2026-10-23T03:00:00Z");
    const a = await renderLevyNoticePdf({ ...notice });
    const b = await renderLevyNoticePdf({ ...notice });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const { renderPdf } = await import("./document");
    const one = await renderPdf({ title: "T", schemeName: "S", blocks: [{ kind: "text", text: "x" }], generatedAt: at });
    const two = await renderPdf({ title: "T", schemeName: "S", blocks: [{ kind: "text", text: "x" }], generatedAt: new Date("2026-10-23T09:00:00Z") });
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(true);
  });
});

describe("wrap", () => {
  it("splits a word wider than the line", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont("Helvetica");
    const lines = wrap("short " + "x".repeat(200), font, 10, 100);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((l) => font.widthOfTextAtSize(l, 10) <= 100)).toBe(true);
  });
});
