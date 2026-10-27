import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor, type NswRules } from "@/config/statutory";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { levyNoticeBlocks, ownerStatementBlocks, remittanceBlocks, renderLevyNoticePdf, renderOwnerStatementPdf, renderRemittancePdf, renderStatutoryPackPdf } from "./documents";
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
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
  interest: (statutoryRulesFor("NSW") as NswRules).STATUTORY_INTEREST,
  hardship: (statutoryRulesFor("NSW") as NswRules).HARDSHIP_INFORMATION,
  terms: statutoryRulesFor("NSW").TERMINOLOGY,
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
      terms: statutoryRulesFor("NSW").TERMINOLOGY,
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
        terms: statutoryRulesFor("NSW").TERMINOLOGY,
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
      rules: { rulePack: "AU-NSW test", keyFinancialInformation: (statutoryRulesFor("NSW") as NswRules).KEY_FINANCIAL_INFORMATION, auditThreshold: (statutoryRulesFor("NSW") as NswRules).AUDIT_THRESHOLD },
      adopted: null,
    };
    const { text, pages } = await textOf(await renderStatutoryPackPdf(pack, statutoryRulesFor("NSW").TERMINOLOGY));
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

describe("Queensland wording, from the pack's terms", () => {
  const QLD = PENDING_RULE_PACKS.QLD.rules.TERMINOLOGY;
  // The interest rule and hardship statement are NSW's here: Queensland's penalty wording is its own step.
  const qldNotice = { ...notice, terms: QLD };
  const words = (blocks: unknown[]) => JSON.stringify(blocks.filter((b) => (b as { kind: string }).kind !== "box"));

  it("names the contribution, the penalty and the body corporate on the notice", async () => {
    const text = words(levyNoticeBlocks(qldNotice));
    expect(text).toContain("Contribution notice LN-0042");
    expect(text).toContain("Penalty: if this contribution is not paid within one month after the due date, simple penalty of 10% a year");
    expect(text).toContain("check your contribution ledger");
    expect(words(levyNoticeBlocks({ ...qldNotice, noInterest: true }))).toContain("The body corporate has resolved not to charge penalty on overdue contributions.");
    // The ledger link is the portal's route, not wording.
    expect(text.replace(/https?:\/\/[^ )]+/g, "")).not.toMatch(/levy|levies|interest/i);
    const { text: pdf } = await textOf(await renderLevyNoticePdf(qldNotice));
    expect(pdf).toContain("Community titles scheme 12345");
    expect(pdf).not.toContain("Strata Plan");
  });

  it("names them in the notice email too", () => {
    const email = levyNoticeEmail({
      to: "alex@example.com", ownerName: "Alex Nguyen", schemeName: "Harbour View", planNumber: "12345", lotNumber: "7", noticeNumber: "LN-0042",
      noticeDate: "2026-10-01", dueDate: "2026-11-05", fundName: "Administrative fund", amount: "825.09",
      payment: notice.payment, contact: notice.contact, ledgerUrl: notice.ledgerUrl, noInterest: true,
      interest: notice.interest, hardship: notice.hardship, terms: QLD,
    });
    expect(email.subject).toMatch(/^Contribution notice LN-0042:/);
    expect(email.html).toContain("Harbour View, Community titles scheme 12345");
    expect(email.html).toContain("The body corporate has resolved not to charge penalty on overdue contributions.");
    expect(email.html).toContain("View your contribution ledger");
    expect(email.html).not.toContain("Strata Plan");
  });

  it("names them on the owner statement and remittance advice", () => {
    const statement = JSON.stringify(
      ownerStatementBlocks({ schemeName: "Harbour View", planNumber: "12345", lotLabel: "Lot 7", ownerName: "Alex", startDate: null, endDate: null, openingBalance: 0, lines: [], totalCharges: 0, totalPayments: 0, closingBalance: -10, terms: QLD }),
    );
    expect(statement).toContain("Owner contribution statement");
    expect(statement).toContain("the next contribution notice");
    const remittance = JSON.stringify(
      remittanceBlocks({ schemeName: "Harbour View", planNumber: "12345", supplierName: "Acme", supplierAbn: null, invoiceNumber: "INV-1", invoiceDate: "2026-09-01", description: null, invoiceTotalCents: 100, payments: [{ date: "2026-09-02", amountCents: 100, reference: null }], bankAccountEnding: null, terms: QLD }),
    );
    expect(remittance).toContain("Paid on behalf of the body corporate of Harbour View, Community titles scheme 12345.");
  });
});
