/**
 * Generating and storing StrataVerze PDFs from the ledger (server side).
 * Each function gathers the data, renders the PDF and stores it as a
 * FinancialDocument (once per identical file).
 */
import { db } from "@/prisma/db";
import { rulesForScheme, rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { siteUrl } from "@/lib/site-url";
import { and } from "@prisma/orm-postgres/orm-client";
import { toCents } from "@/lib/billing/money";
import { formatLotLabel } from "@/lib/format";
import { noticeContext, noticeOwnerNames, ownerNames, rollOwnerNames } from "@/lib/levies/notice-content-data";
import { getSchemeInterestSetting } from "@/lib/finance/interest-setting";
import { storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { getIssuedLevyNoticesForLot, getLevyPaymentsForNotices } from "@/lib/queries/levy-schedules";
import { buildStatement } from "@/lib/levies/levy-ledger";
import { getCreditMovements } from "@/lib/finance/owner-credits";
import { getCommitteeReportingPack } from "@/lib/queries/reports";
import { getStatutoryStatementsPack, type StatutoryPack } from "@/lib/finance/statutory-pack";
import {
  renderCommitteePackPdf,
  renderLevyNoticePdf,
  renderOwnerStatementPdf,
  renderRemittancePdf,
  renderStatutoryPackPdf,
  type LevyNoticeDocument,
} from "./documents";
import { storeGeneratedPdf } from "./store";
import { needRule } from "@/config/statutory";

const APP_URL = siteUrl();
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);
const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");

export interface GeneratedPdf {
  bytes: Uint8Array;
  fileName: string;
  documentId: string;
}

/** The levy notice document data for an issued notice. */
export async function levyNoticeData(noticeId: string, issuerId: string): Promise<{ data: LevyNoticeDocument; schemeId: string; lotId: string } | null> {
  const n = await db.orm.public.LevyNotice.where((x) => x.id.eq(noticeId)).include("lot").first();
  if (!n) return null;
  // The contact is the issuer if they are an adviser of the scheme, else the scheme's first adviser.
  const advisers = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(n.schemeId), m.role.eq("ADVISER"), m.isActive.eq(true)))
    .limit(10)
    .all();
  const contactId = advisers.some((a) => a.profileId === issuerId) ? issuerId : (advisers[0]?.profileId ?? issuerId);
  const [{ scheme, fund, issuer, account }, setting] = await Promise.all([noticeContext(n.schemeId, n.fundId, contactId), getSchemeInterestSetting(n.schemeId)]);
  if (!scheme) return null;
  const owners = n.ownerId ? await ownerNames([n.ownerId]) : new Map();
  const owner = n.ownerId ? owners.get(n.ownerId) : null;
  const rollNames = await rollOwnerNames([n.lotId]);
  return {
    schemeId: n.schemeId,
    lotId: n.lotId,
    data: {
      schemeName: String(scheme.name),
      planNumber: scheme.planNumber ? String(scheme.planNumber) : null,
      lotNumber: String(n.lot?.lotNumber ?? ""),
      ownerNames: noticeOwnerNames(owner?.name, rollNames.get(n.lotId)),
      noticeNumber: String(n.noticeNumber),
      // The day it was issued in the building's time zone (the stored value is a UTC timestamp).
      noticeDate: storedDayIn(setting.timeZone, n.issuedAt) || todayIn(setting.timeZone),
      dueDate: isoDay(n.dueDate),
      periodStart: isoDay(n.periodStart) || null,
      periodEnd: isoDay(n.periodEnd) || null,
      fundName: String(fund?.name ?? "Fund"),
      amountCents: toCents(String(n.amountDue)),
      payment: {
        accountName: String(account?.accountName ?? ""),
        bsb: String(account?.bsb ?? ""),
        accountNumber: String(account?.accountNumber ?? ""),
        reference: String(n.noticeNumber),
      },
      contact: {
        name: issuer ? `${issuer.firstName ?? ""} ${issuer.lastName ?? ""}`.trim() || "Your strata manager" : "Your strata manager",
        emailOrPhone: String(issuer?.email ?? ""),
      },
      ledgerUrl: `${APP_URL}/owner/levies`,
      noInterest: setting.mode === "NO_INTEREST",
      interest: needRule(setting.rules.rules, "STATUTORY_INTEREST"),
      hardship: setting.rules.rules.NOTICE_RULES.hardship?.information ?? null,
      terms: setting.rules.rules.TERMINOLOGY,
    },
  };
}

export async function generateLevyNoticePdf(noticeId: string, actorId: string): Promise<GeneratedPdf | null> {
  const loaded = await levyNoticeData(noticeId, actorId);
  if (!loaded) return null;
  const bytes = await renderLevyNoticePdf(loaded.data);
  const fileName = safeName(`Levy-notice-${loaded.data.noticeNumber}-Lot-${loaded.data.lotNumber}.pdf`);
  const stored = await storeGeneratedPdf({
    schemeId: loaded.schemeId,
    documentType: "LEVY_NOTICE",
    fileName,
    bytes,
    actorId,
    documentDate: loaded.data.noticeDate,
    amountCents: loaded.data.amountCents,
    lotId: loaded.lotId,
    levyNoticeId: noticeId,
  });
  return { bytes, fileName, documentId: stored.id };
}

export async function generateOwnerStatementPdf(input: { schemeId: string; lotId: string; startDate?: string; endDate?: string; actorId: string }): Promise<GeneratedPdf | null> {
  const [scheme, lot] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first(),
    db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(),
  ]);
  if (!scheme || !lot || lot.schemeId !== input.schemeId) return null;
  const owners = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(input.schemeId), m.lotId.eq(input.lotId), m.role.eq("OWNER"), m.isActive.eq(true)))
    .include("profile")
    .limit(10)
    .all();
  const notices = await getIssuedLevyNoticesForLot(input.schemeId, input.lotId);
  const [payments, credits] = await Promise.all([getLevyPaymentsForNotices(notices.map((n) => n.id)), getCreditMovements(input.schemeId, input.lotId)]);
  const terms = rulesForState(scheme.state).rules.TERMINOLOGY;
  const s = buildStatement(notices, payments, { startDate: input.startDate, endDate: input.endDate }, credits, terms);
  const lotLabel = `${formatLotLabel(lot.lotNumber)}${lot.unitNumber ? ` (Unit ${String(lot.unitNumber)})` : ""}`;
  const bytes = await renderOwnerStatementPdf({
    schemeName: String(scheme.name),
    planNumber: scheme.planNumber ? String(scheme.planNumber) : null,
    lotLabel,
    ownerName: owners.map((o) => `${o.profile?.firstName ?? ""} ${o.profile?.lastName ?? ""}`.trim()).filter(Boolean).join(", ") || "Owner",
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    openingBalance: s.openingBalance,
    lines: s.lines,
    totalCharges: s.totalCharges,
    totalPayments: s.totalPayments,
    closingBalance: s.closingBalance,
    terms,
  });
  const endDay = input.endDate ?? todayIn(timeZoneOf(scheme));
  const fileName = safeName(`Owner-statement-${lotLabel}-${input.startDate ?? "start"}-to-${endDay}.pdf`);
  const stored = await storeGeneratedPdf({
    schemeId: input.schemeId,
    documentType: "OWNER_STATEMENT",
    fileName,
    bytes,
    actorId: input.actorId,
    documentDate: endDay,
    amountCents: Math.round(s.closingBalance * 100),
    lotId: input.lotId,
  });
  return { bytes, fileName, documentId: stored.id };
}

export async function generateRemittancePdf(invoiceId: string, actorId: string): Promise<GeneratedPdf | null> {
  const invoice = await db.orm.public.SupplierInvoice.where((i) => i.id.eq(invoiceId)).include("supplier").first();
  if (!invoice) return null;
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(invoice.schemeId)).first();
  if (!scheme) return null;
  // Payments are the posted PAYMENT journals for the invoice: the accounts payable debit is the amount paid.
  const entries = await db.orm.public.JournalEntry
    .where((je) => and(je.schemeId.eq(invoice.schemeId), je.sourceType.eq("PAYMENT"), je.sourceId.eq(invoiceId), je.status.eq("POSTED")))
    .include("lines", (l) => l.include("accountCode"))
    .orderBy((je) => je.transactionDate.asc())
    .limit(100)
    .all();
  const payments = entries
    .map((e) => ({
      date: isoDay(e.transactionDate),
      amountCents: (e.lines ?? []).filter((l) => l.accountCode?.accountSubType === "ACCOUNTS_PAYABLE").reduce((s, l) => s + toCents(String(l.debit ?? 0)), 0),
      reference: String(e.entryNumber),
    }))
    .filter((p) => p.amountCents > 0);
  if (payments.length === 0) return null;
  const account = String(invoice.supplier?.bankAccountNumber ?? "");
  const bytes = await renderRemittancePdf({
    schemeName: String(scheme.name),
    planNumber: scheme.planNumber ? String(scheme.planNumber) : null,
    supplierName: String(invoice.supplier?.companyName ?? "Supplier"),
    supplierAbn: invoice.supplier?.abn ? String(invoice.supplier.abn) : null,
    invoiceNumber: String(invoice.invoiceNumber),
    invoiceDate: isoDay(invoice.invoiceDate),
    description: invoice.description ? String(invoice.description) : null,
    invoiceTotalCents: toCents(String(invoice.totalAmount)),
    payments,
    bankAccountEnding: account ? account.slice(-4) : null,
    terms: rulesForState(scheme.state).rules.TERMINOLOGY,
  });
  const fileName = safeName(`Remittance-${invoice.supplier?.companyName ?? "supplier"}-${invoice.invoiceNumber}.pdf`);
  const stored = await storeGeneratedPdf({
    schemeId: invoice.schemeId,
    documentType: "REMITTANCE_ADVICE",
    fileName,
    bytes,
    actorId,
    documentDate: payments[payments.length - 1].date,
    amountCents: payments.reduce((s, p) => s + p.amountCents, 0),
    supplierId: invoice.supplierId,
    supplierInvoiceId: invoice.id,
  });
  return { bytes, fileName, documentId: stored.id };
}

export async function generateCommitteePackPdf(input: { schemeId: string; startDate: string; endDate: string; financialYear: number; actorId: string }): Promise<GeneratedPdf | null> {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first();
  if (!scheme) return null;
  const pack = await getCommitteeReportingPack(input.schemeId, input.startDate, input.endDate, input.financialYear);
  const bytes = await renderCommitteePackPdf(pack, scheme.planNumber ? String(scheme.planNumber) : null, rulesForState(scheme.state).rules.TERMINOLOGY);
  const fileName = safeName(`Committee-report-${input.startDate}-to-${input.endDate}.pdf`);
  const stored = await storeGeneratedPdf({ schemeId: input.schemeId, documentType: "COMMITTEE_PACK", fileName, bytes, actorId: input.actorId, documentDate: input.endDate });
  return { bytes, fileName, documentId: stored.id };
}

/** The rules shown on an adopted copy that was stored before rule packs were recorded. */
async function adoptedPackRulesFallback(schemeId: string): Promise<StatutoryPack["rules"]> {
  const { rules } = await rulesForScheme(schemeId);
  return { rulePack: "", keyFinancialInformation: needRule(rules, "KEY_FINANCIAL_INFORMATION"), auditThreshold: needRule(rules, "AUDIT_THRESHOLD") };
}

/** The statutory statements: the locked copy once adopted at the AGM, else recalculated from the ledger. */
export async function generateStatutoryPackPdf(input: { schemeId: string; financialYear: number; actorId: string }): Promise<GeneratedPdf | null> {
  // Only buildings whose rule pack has the statement of key financial information.
  const { rules } = await rulesForScheme(input.schemeId);
  if (!rules.FEATURES.keyFinancialInformation) return null;
  const snapshot = await db.orm.public.StatutoryPackSnapshot
    .where((s) => and(s.schemeId.eq(input.schemeId), s.financialYear.eq(input.financialYear)))
    .first();
  let pack: StatutoryPack;
  if (snapshot) {
    const stored = JSON.parse(snapshot.content) as Omit<StatutoryPack, "rules"> & { rules?: StatutoryPack["rules"] };
    pack = {
      ...stored,
      // Copies adopted before rule packs were recorded (26 Oct 2026) carry no
      // rules: show them with the building's current rules, and no pack label.
      rules: stored.rules ?? (await adoptedPackRulesFallback(input.schemeId)),
      adopted: { meetingId: snapshot.meetingId, adoptedAt: String(snapshot.adoptedAt), snapshotId: snapshot.id },
    };
  } else {
    pack = await getStatutoryStatementsPack(input.schemeId, input.financialYear);
  }
  const bytes = await renderStatutoryPackPdf(pack, rules.TERMINOLOGY);
  const fileName = safeName(`Financial-statements-FY${input.financialYear}${snapshot ? "-adopted" : "-draft"}.pdf`);
  const stored = await storeGeneratedPdf({
    schemeId: input.schemeId,
    documentType: "STATUTORY_PACK",
    fileName,
    bytes,
    actorId: input.actorId,
    documentDate: pack.end,
    meetingId: snapshot?.meetingId ?? null,
  });
  return { bytes, fileName, documentId: stored.id };
}
