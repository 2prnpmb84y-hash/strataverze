/**
 * StrataVerze PDF documents (pure: data in, PDF bytes out). Each takes the
 * figures it shows, so the same data can be checked in tests and rendered on
 * the server. See document.ts for the page layout.
 */
import { renderPdf, type PdfBlock } from "./document";
import { HARDSHIP_INFORMATION } from "@/lib/finance/levy-notice-content";
import { KEY_FINANCIAL_INFORMATION, STATUTORY_INTEREST } from "@/config/statutory";
import type { StatutoryPack } from "@/lib/finance/statutory-pack";
import type { CommitteeReportingPack } from "@/lib/queries/reports";

export const aud = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const audDollars = (dollars: number) => aud(Math.round(dollars * 100));
export const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
const planLine = (planNumber: string | null | undefined) => (planNumber ? `Strata Plan ${planNumber}` : null);

// ─── Levy notice ────────────────────────────────────────────────────────────

export interface LevyNoticeDocument {
  schemeName: string;
  planNumber: string | null;
  lotNumber: string;
  ownerNames: string[];
  noticeNumber: string;
  noticeDate: string;
  dueDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  fundName: string;
  amountCents: number;
  payment: { accountName: string; bsb: string; accountNumber: string; reference: string };
  contact: { name: string; emailOrPhone: string };
  ledgerUrl: string;
  noInterest: boolean;
}

export function levyNoticeBlocks(d: LevyNoticeDocument): PdfBlock[] {
  return [
    { kind: "heading", text: `Levy notice ${d.noticeNumber}` },
    { kind: "text", text: `To: ${d.ownerNames.join(", ") || "The owner"}, owner of lot ${d.lotNumber}` },
    {
      kind: "keyValues",
      rows: [
        ["Lot", d.lotNumber],
        ["Notice date", longDate(d.noticeDate)],
        ["Fund", d.fundName],
        ...(d.periodStart && d.periodEnd ? ([["Period", `${longDate(d.periodStart)} to ${longDate(d.periodEnd)}`]] as [string, string][]) : []),
        ["Amount payable", aud(d.amountCents)],
        ["Due date", longDate(d.dueDate)],
      ],
    },
    { kind: "heading", text: "How to pay", level: 2 },
    {
      kind: "keyValues",
      rows: [
        ["Account name", d.payment.accountName],
        ["BSB", d.payment.bsb],
        ["Account number", d.payment.accountNumber],
        ["Reference", d.payment.reference],
      ],
    },
    {
      kind: "text",
      text: d.noInterest
        ? "The owners corporation has resolved not to charge interest on overdue levies."
        : `Interest: if this levy is not paid within one month after the due date, simple interest of ${STATUTORY_INTEREST.annualRatePercent}% a year is charged from the due date until it is paid (${STATUTORY_INTEREST.source}).`,
    },
    {
      kind: "text",
      text: `You can check your levy ledger at any time in the StrataVerze owner portal (${d.ledgerUrl}). For questions contact ${d.contact.name} (${d.contact.emailOrPhone}).`,
    },
    {
      kind: "box",
      title: HARDSHIP_INFORMATION.title,
      lines: [
        HARDSHIP_INFORMATION.summary,
        `${HARDSHIP_INFORMATION.helplineName}: ${HARDSHIP_INFORMATION.helplinePhone} or ${HARDSHIP_INFORMATION.helplineWeb}.`,
        `More information, including translations: ${HARDSHIP_INFORMATION.moreInformationUrl}`,
      ],
    },
  ];
}

export function renderLevyNoticePdf(d: LevyNoticeDocument) {
  return renderPdf({ title: `Levy notice ${d.noticeNumber}`, schemeName: d.schemeName, schemeLine: planLine(d.planNumber), blocks: levyNoticeBlocks(d), footerNote: d.noticeNumber });
}

// ─── Owner statement ────────────────────────────────────────────────────────

export interface OwnerStatementDocument {
  schemeName: string;
  planNumber: string | null;
  lotLabel: string;
  ownerName: string;
  startDate: string | null;
  endDate: string | null;
  openingBalance: number;
  lines: { date: string; description: string; charge: number; payment: number; balance: number }[];
  totalCharges: number;
  totalPayments: number;
  closingBalance: number;
}

export function ownerStatementBlocks(d: OwnerStatementDocument): PdfBlock[] {
  const balance = (v: number) => (v < 0 ? `${audDollars(-v)} credit` : audDollars(v));
  return [
    { kind: "heading", text: "Owner levy statement" },
    {
      kind: "keyValues",
      rows: [
        ["Lot", d.lotLabel],
        ["Owner", d.ownerName],
        ["Period", d.startDate || d.endDate ? `${d.startDate ? longDate(d.startDate) : "Start"} to ${d.endDate ? longDate(d.endDate) : "today"}` : "All periods"],
      ],
    },
    {
      kind: "table",
      columns: [
        { header: "Date", width: 1.3 },
        { header: "Description", width: 3.6 },
        { header: "Charge", width: 1.2, align: "right" },
        { header: "Payment", width: 1.2, align: "right" },
        { header: "Balance", width: 1.4, align: "right" },
      ],
      rows: [
        ["", "Opening balance", "", "", balance(d.openingBalance)],
        ...d.lines.map((l) => [longDate(l.date), l.description, l.charge ? audDollars(l.charge) : "", l.payment ? audDollars(l.payment) : "", balance(l.balance)]),
      ],
      totalRow: ["", "Totals and closing balance", audDollars(d.totalCharges), audDollars(d.totalPayments), balance(d.closingBalance)],
    },
    {
      kind: "text",
      muted: true,
      text: d.closingBalance < 0 ? "The lot is in credit. The credit is applied to the next levy notice or can be refunded." : "A positive balance is the amount owing.",
    },
  ];
}

export function renderOwnerStatementPdf(d: OwnerStatementDocument) {
  return renderPdf({ title: "Owner levy statement", schemeName: d.schemeName, schemeLine: planLine(d.planNumber), blocks: ownerStatementBlocks(d), footerNote: d.lotLabel });
}

// ─── Remittance advice ──────────────────────────────────────────────────────

export interface RemittanceDocument {
  schemeName: string;
  planNumber: string | null;
  supplierName: string;
  supplierAbn: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  description: string | null;
  invoiceTotalCents: number;
  payments: { date: string; amountCents: number; reference: string | null }[];
  bankAccountEnding: string | null;
}

export function remittanceBlocks(d: RemittanceDocument): PdfBlock[] {
  const paid = d.payments.reduce((s, p) => s + p.amountCents, 0);
  return [
    { kind: "heading", text: "Remittance advice" },
    { kind: "text", text: `To: ${d.supplierName}${d.supplierAbn ? ` (ABN ${d.supplierAbn})` : ""}` },
    {
      kind: "keyValues",
      rows: [
        ["Your invoice", d.invoiceNumber],
        ["Invoice date", longDate(d.invoiceDate)],
        ...(d.description ? ([["For", d.description]] as [string, string][]) : []),
        ["Invoice total", aud(d.invoiceTotalCents)],
        ["Paid to", d.bankAccountEnding ? `Your account ending ${d.bankAccountEnding}` : "Your nominated account"],
      ],
    },
    {
      kind: "table",
      columns: [
        { header: "Date paid", width: 2 },
        { header: "Reference", width: 3 },
        { header: "Amount", width: 1.5, align: "right" },
      ],
      rows: d.payments.map((p) => [longDate(p.date), p.reference ?? "", aud(p.amountCents)]),
      totalRow: ["", "Total paid", aud(paid)],
    },
    ...(paid < d.invoiceTotalCents
      ? ([{ kind: "text", text: `${aud(d.invoiceTotalCents - paid)} of this invoice is still to be paid.` }] as PdfBlock[])
      : []),
    { kind: "text", muted: true, text: `Paid on behalf of the owners corporation of ${d.schemeName}${d.planNumber ? `, Strata Plan ${d.planNumber}` : ""}.` },
  ];
}

export function renderRemittancePdf(d: RemittanceDocument) {
  return renderPdf({ title: "Remittance advice", schemeName: d.schemeName, schemeLine: planLine(d.planNumber), blocks: remittanceBlocks(d), footerNote: d.invoiceNumber });
}

// ─── Committee pack ─────────────────────────────────────────────────────────

export function committeePackBlocks(p: CommitteeReportingPack): PdfBlock[] {
  return [
    { kind: "heading", text: "Committee financial report" },
    {
      kind: "keyValues",
      rows: [
        ["Period", `${longDate(p.startDate)} to ${longDate(p.endDate)}`],
        ["Total fund balances", audDollars(p.totalFundBalance)],
        ["Cash position", audDollars(p.cashPosition)],
        ["Levy collection rate", `${p.levyCollectionRate.toFixed(1)}%`],
      ],
    },
    { kind: "heading", text: "Funds", level: 2 },
    {
      kind: "table",
      columns: [
        { header: "Fund", width: 2.4 },
        { header: "Opening", width: 1.3, align: "right" },
        { header: "Income", width: 1.3, align: "right" },
        { header: "Expenses", width: 1.3, align: "right" },
        { header: "Closing", width: 1.3, align: "right" },
        { header: "Levies owing", width: 1.3, align: "right" },
      ],
      rows: p.fundSummaries.map((f) => [
        f.fundName,
        audDollars(f.openingBalance),
        audDollars(f.totalIncome),
        audDollars(f.totalExpenses),
        audDollars(f.closingBalance),
        audDollars(f.outstandingLevies),
      ]),
    },
    { kind: "heading", text: "Levy arrears", level: 2 },
    {
      kind: "table",
      columns: [
        { header: "Not yet due", width: 1, align: "right" },
        { header: "1 to 30 days", width: 1, align: "right" },
        { header: "31 to 60", width: 1, align: "right" },
        { header: "61 to 90", width: 1, align: "right" },
        { header: "Over 90", width: 1, align: "right" },
        { header: "In arrears", width: 1, align: "right" },
      ],
      rows: [
        [
          audDollars(p.arrearsSnapshot.current),
          audDollars(p.arrearsSnapshot.days30),
          audDollars(p.arrearsSnapshot.days60),
          audDollars(p.arrearsSnapshot.days90),
          audDollars(p.arrearsSnapshot.days90Plus),
          audDollars(p.arrearsSnapshot.total),
        ],
      ],
    },
    { kind: "text", muted: true, text: `${p.arrearsSnapshot.lotCount} lot${p.arrearsSnapshot.lotCount === 1 ? "" : "s"} in arrears.` },
    ...p.budgetComparisons.flatMap((b): PdfBlock[] => [
      { kind: "heading", text: `Budget against actual: ${b.fundName}`, level: 2 },
      {
        kind: "table",
        columns: [
          { header: "Account", width: 3 },
          { header: "Budget", width: 1.2, align: "right" },
          { header: "Actual", width: 1.2, align: "right" },
          { header: "Variance", width: 1.2, align: "right" },
        ],
        rows: b.lines.map((l) => [`${l.accountCode} ${l.accountName}`, audDollars(l.budgetAmount), audDollars(l.actualAmount), audDollars(l.variance)]),
        totalRow: ["Total expenditure", audDollars(b.totalBudget), audDollars(b.totalActual), audDollars(b.totalVariance)],
      },
    ]),
    { kind: "heading", text: "Bank accounts", level: 2 },
    {
      kind: "table",
      columns: [
        { header: "Account", width: 3 },
        { header: "Balance", width: 1.3, align: "right" },
        { header: "Unmatched", width: 1, align: "right" },
        { header: "Last reconciled", width: 1.6 },
      ],
      rows: p.bankSummaries.map((b) => [b.bankAccountName, audDollars(b.closingBalance), String(b.unmatchedCount), b.lastReconciledDate ? longDate(b.lastReconciledDate) : "Never"]),
    },
  ];
}

export function renderCommitteePackPdf(p: CommitteeReportingPack, planNumber: string | null) {
  return renderPdf({ title: "Committee financial report", schemeName: p.schemeName, schemeLine: planLine(planNumber), blocks: committeePackBlocks(p), footerNote: `${p.startDate} to ${p.endDate}` });
}

// ─── Statutory statements pack ──────────────────────────────────────────────

export function statutoryPackBlocks(pack: StatutoryPack): PdfBlock[] {
  const rows = KEY_FINANCIAL_INFORMATION.rows;
  const blocks: PdfBlock[] = [
    { kind: "heading", text: "Financial statements" },
    { kind: "text", text: `For the financial year ${longDate(pack.start)} to ${longDate(pack.end)}.` },
  ];
  if (pack.adopted) blocks.push({ kind: "box", lines: [`Adopted at the annual general meeting on ${longDate(pack.adopted.adoptedAt)}.`] });
  pack.funds.forEach((f, i) => {
    if (i > 0) blocks.push({ kind: "pageBreak" });
    const k = f.keyInformation;
    blocks.push(
      { kind: "heading", text: `${f.fundName} (${f.basis === "CASH" ? "cash basis" : "accrual basis"})` },
      { kind: "heading", text: "Statement of key financial information", level: 2 },
      { kind: "text", muted: true, text: KEY_FINANCIAL_INFORMATION.source },
      {
        kind: "table",
        columns: [
          { header: "", width: 4 },
          { header: "Amount", width: 1.5, align: "right" },
        ],
        rows: [
          [rows[0], aud(k.balanceCarriedForwardCents)],
          [rows[1], aud(k.totalIncomeReceivedCents)],
          [rows[2], aud(k.totalInterestEarnedCents)],
          [rows[3], aud(k.totalContributionsPaidCents)],
          [rows[4], aud(k.totalUnpaidContributionsCents)],
          [rows[5], aud(k.maintenanceExpenditureCents)],
          [rows[6], aud(k.administrationExpenditureCents)],
        ],
        totalRow: [rows[7], aud(k.balanceAtEndCents)],
      },
      { kind: "text", bold: true, text: rows[8] },
      k.principalItemsNextPeriod.length
        ? { kind: "table", columns: [{ header: "Item", width: 4 }, { header: "Estimate", width: 1.5, align: "right" }], rows: k.principalItemsNextPeriod.map((p) => [p.description, aud(p.amountCents)]) }
        : { kind: "text", muted: true, text: "None recorded in next year's budget or the capital works fund plan." },
      { kind: "heading", text: "Income and expenditure", level: 2 },
      {
        kind: "table",
        columns: [
          { header: "Account", width: 4 },
          { header: "This year", width: 1.5, align: "right" },
        ],
        rows: [
          ...f.income.map((l) => [`${l.accountCode} ${l.accountName}`, aud(l.amountCents)]),
          ["Total income", aud(f.totals.incomeCents)],
          ...f.expenditure.map((l) => [`${l.accountCode} ${l.accountName}`, aud(l.amountCents)]),
          ["Total expenditure", aud(f.totals.expenseCents)],
        ],
        totalRow: [`Surplus (deficit). Prior year: ${aud(f.comparative.surplusCents)}`, aud(f.totals.surplusCents)],
      },
      { kind: "heading", text: "Balance sheet at year end", level: 2 },
      {
        kind: "table",
        columns: [
          { header: "Account", width: 4 },
          { header: "Amount", width: 1.5, align: "right" },
        ],
        rows: [
          ...f.balanceSheet.assets.map((l) => [`${l.accountCode} ${l.accountName}`, aud(l.cents)]),
          ...f.balanceSheet.liabilities.map((l) => [`Less ${l.accountCode} ${l.accountName}`, aud(-l.cents)]),
        ],
        totalRow: ["Owners' funds", aud(f.balanceSheet.ownersFundsCents)],
      },
      { kind: "heading", text: "Contributions unpaid at year end", level: 2 },
      f.arrearsByLot.length
        ? { kind: "table", columns: [{ header: "Lot", width: 4 }, { header: "Unpaid", width: 1.5, align: "right" }], rows: f.arrearsByLot.map((a) => [`Lot ${a.lotNumber}`, aud(a.unpaidCents)]) }
        : { kind: "text", text: "None." },
      { kind: "heading", text: "Levy register", level: 2 },
      {
        kind: "table",
        columns: [
          { header: "Lot", width: 0.8 },
          { header: "Notice", width: 1.2 },
          { header: "Due", width: 1.4 },
          { header: "Owed", width: 1.2, align: "right" },
          { header: "Paid by year end", width: 1.4, align: "right" },
          { header: "Unpaid", width: 1.2, align: "right" },
        ],
        rows: f.levyRegister.map((r) => [r.lotNumber, r.noticeNumber, longDate(r.dueDate), aud(r.owedCents), aud(r.paidByYearEndCents), aud(r.unpaidAtYearEndCents)]),
      },
    );
  });
  blocks.push({ kind: "pageBreak" }, { kind: "heading", text: "Notes" }, ...pack.notes.map((n, i): PdfBlock => ({ kind: "text", text: `${i + 1}. ${n}` })));
  return blocks;
}

export function renderStatutoryPackPdf(pack: StatutoryPack) {
  return renderPdf({
    title: `Financial statements FY ${pack.financialYear}`,
    schemeName: pack.scheme.name,
    schemeLine: planLine(pack.scheme.planNumber),
    blocks: statutoryPackBlocks(pack),
    footerNote: `${pack.start} to ${pack.end}`,
  });
}
