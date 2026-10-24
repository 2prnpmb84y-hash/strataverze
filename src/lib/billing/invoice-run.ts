import { logError } from "@/lib/log";
/**
 * Monthly StrataVerze invoice run (server side).
 *
 * For each scheme with a subscription, issues one PlatformInvoice per month
 * (subscription in advance, fees accrued before the month in arrears), marks
 * the fees INVOICED, and records the invoice in the scheme's own ledger as a
 * SupplierInvoice from StrataVerze awaiting approval. Safe to run repeatedly:
 * a scheme already invoiced for the month is skipped.
 */
import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { formatAud, fromCents, toCents } from "./money";
import { getMemberEmailsForScheme } from "@/lib/queries/schemes";
import { notifyPlatformInvoiceIssued } from "@/lib/notifications";
import { loadPriceBook } from "./capture";
import { feeIdempotencyKey } from "./fee-engine";
import { buildInvoice, monthLabel, platformStatusFor, nextInvoiceNumber, sydneyMidnightUtc, type InvoiceDraft } from "./invoice";
import { STRATAVERZE_SUPPLIER, STRATAVERZE_SUPPLIER_ID } from "./strataverze-supplier";

type Orm = typeof db.orm;

const numeric = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (iso: string) => iso as unknown as TimestampString<3>;
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;
const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const isoTime = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));

/** Create the platform-wide StrataVerze supplier, or bring its details up to date. */
export async function ensureStrataVerzeSupplier(orm: Orm = db.orm) {
  const existing = await orm.public.Supplier.where((s) => s.id.eq(STRATAVERZE_SUPPLIER_ID)).first();
  if (existing) {
    if (
      existing.companyName !== STRATAVERZE_SUPPLIER.companyName ||
      (existing.abn ?? null) !== STRATAVERZE_SUPPLIER.abn ||
      existing.gstRegistered !== STRATAVERZE_SUPPLIER.gstRegistered
    ) {
      await orm.public.Supplier.where((s) => s.id.eq(STRATAVERZE_SUPPLIER_ID)).update({
        companyName: varchar<200>(STRATAVERZE_SUPPLIER.companyName),
        abn: STRATAVERZE_SUPPLIER.abn ? varchar<11>(STRATAVERZE_SUPPLIER.abn) : null,
        gstRegistered: STRATAVERZE_SUPPLIER.gstRegistered,
      });
    }
    return existing;
  }
  return orm.public.Supplier.create({
    id: STRATAVERZE_SUPPLIER_ID,
    schemeId: null,
    companyName: varchar<200>(STRATAVERZE_SUPPLIER.companyName),
    abn: STRATAVERZE_SUPPLIER.abn ? varchar<11>(STRATAVERZE_SUPPLIER.abn) : null,
    email: STRATAVERZE_SUPPLIER.email ? varchar<320>(STRATAVERZE_SUPPLIER.email) : null,
    gstRegistered: STRATAVERZE_SUPPLIER.gstRegistered,
    paymentTerms: STRATAVERZE_SUPPLIER.paymentTerms,
    isActive: true,
  });
}

export type InvoiceRunOutcome =
  | { schemeId: string; outcome: "ISSUED"; invoiceId: string; invoiceNumber: string; totalCents: number; promotional: boolean; ledger: "RECORDED" | "ZERO" | "NO_ACCOUNTS" }
  | { schemeId: string; outcome: "ALREADY_INVOICED"; invoiceId: string }
  | { schemeId: string; outcome: "SKIPPED"; reason: string };

/** Issue the invoice for one scheme and month, in one transaction. */
export async function issueSchemeInvoice(schemeId: string, month: string, now: Date = new Date()): Promise<InvoiceRunOutcome> {
  const monthStart = `${month}-01`;
  const monthStartInstant = sydneyMidnightUtc(monthStart);

  return db.transaction(async (tx) => {
    const orm = tx.orm;
    const subscription = await orm.public.SchemeSubscription.where((s) => s.schemeId.eq(schemeId)).first();
    if (!subscription) return { schemeId, outcome: "SKIPPED", reason: "No subscription" } as const;
    if (subscription.status === "CANCELLED") return { schemeId, outcome: "SKIPPED", reason: "Subscription cancelled" } as const;
    // A subscription that starts part way through a month is first billed the next month.
    if (new Date(isoTime(subscription.createdAt)).getTime() >= monthStartInstant.getTime()) {
      return { schemeId, outcome: "SKIPPED", reason: "Subscription starts after the month began" } as const;
    }

    const existing = await orm.public.PlatformInvoice
      .where((i) => and(i.schemeId.eq(schemeId), i.periodStart.eq(ts(monthStart))))
      .first();
    if (existing) return { schemeId, outcome: "ALREADY_INVOICED", invoiceId: existing.id } as const;

    const [priceBook, lots, events] = await Promise.all([
      loadPriceBook(orm),
      orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
      orm.public.PlatformFeeEvent
        .where((e) => and(e.schemeId.eq(schemeId), e.invoiceId.isNull(), or(e.status.eq("ACCRUED"), e.status.eq("REVERSED"))))
        .limit(5000)
        .all(),
    ]);

    const draft = buildInvoice({
      month,
      lotCount: lots.length,
      subscription: {
        status: subscription.status,
        promotionEnd: subscription.promotionEnd ? isoDay(subscription.promotionEnd) : null,
        quotedMonthlyCents: subscription.monthlyPrice == null ? null : toCents(String(subscription.monthlyPrice)),
      },
      priceBook,
      accruedFees: events.map((e) => ({
        id: e.id,
        code: e.code,
        description: e.description,
        status: e.status,
        occurredAt: isoTime(e.occurredAt),
        exGstCents: toCents(String(e.amountExGst)),
        gstCents: toCents(String(e.gstAmount)),
      })),
    });

    if (draft.lines.length === 0) {
      return { schemeId, outcome: "SKIPPED", reason: draft.needsQuote ? "Enterprise scheme has no quoted price" : "Nothing to invoice" } as const;
    }
    if (draft.totalCents < 0) {
      return { schemeId, outcome: "SKIPPED", reason: "Credits exceed charges; carried forward" } as const;
    }

    const last = await orm.public.PlatformInvoice.orderBy((i) => i.invoiceNumber.desc()).first();
    const invoiceNumber = nextInvoiceNumber(last ? [last.invoiceNumber] : []);
    const issuedAt = now.toISOString();

    const invoice = await orm.public.PlatformInvoice.create({
      schemeId,
      invoiceNumber,
      periodStart: ts(draft.periodStart),
      periodEnd: ts(draft.periodEnd),
      subtotal: numeric(draft.subtotalCents),
      gst: numeric(draft.gstCents),
      total: numeric(draft.totalCents),
      status: "ISSUED",
      issuedAt: ts(issuedAt),
    });

    await recordPeriodLines(orm, schemeId, month, invoice.id, draft, issuedAt);

    // Mark the billed fee events. Reversal rows keep their status.
    const feeIds = draft.lines.filter((l) => l.feeEventId).map((l) => l.feeEventId!);
    for (const id of feeIds) {
      const e = events.find((x) => x.id === id)!;
      await orm.public.PlatformFeeEvent.where((x) => x.id.eq(id)).update({
        invoiceId: invoice.id,
        status: e.status === "REVERSED" ? "REVERSED" : "INVOICED",
      });
    }

    const ledger = await recordInSchemeLedger(orm, schemeId, invoice.id, invoiceNumber, month, draft, issuedAt);
    return {
      schemeId,
      outcome: "ISSUED",
      invoiceId: invoice.id,
      invoiceNumber,
      totalCents: draft.totalCents,
      promotional: draft.promotional,
      ledger,
    } as const;
  });
}

/** Subscription and promotional credit for the month, as fee events on the invoice. */
async function recordPeriodLines(orm: Orm, schemeId: string, month: string, invoiceId: string, draft: InvoiceDraft, at: string) {
  for (const line of draft.lines) {
    if (line.kind === "FEE") continue;
    const sourceId = `${schemeId}_${month}`;
    await orm.public.PlatformFeeEvent.create({
      schemeId,
      code: line.code,
      variant: null,
      description: line.description,
      sourceType: "SubscriptionPeriod",
      sourceId,
      quantity: 1,
      amountExGst: numeric(line.exGstCents),
      gstAmount: numeric(line.gstCents),
      payerType: "OC",
      payerProfileId: null,
      recoverableFromOwner: false,
      status: "INVOICED",
      reversalOfId: null,
      disclosureShownToId: null,
      disclosureShownAt: null,
      disclosedAmount: null,
      createdById: null,
      invoiceId,
      idempotencyKey: feeIdempotencyKey({ code: line.code, sourceType: "SubscriptionPeriod", sourceId }),
      occurredAt: ts(at),
    });
  }
}

/**
 * Enter the invoice in the scheme's accounts as a supplier invoice from
 * StrataVerze, awaiting approval, against Sundry Expenses in the
 * Administrative Fund. A zero invoice has nothing to approve or pay.
 */
async function recordInSchemeLedger(
  orm: Orm,
  schemeId: string,
  invoiceId: string,
  invoiceNumber: string,
  month: string,
  draft: InvoiceDraft,
  issuedAt: string,
): Promise<"RECORDED" | "ZERO" | "NO_ACCOUNTS"> {
  if (draft.totalCents === 0) return "ZERO";

  const [fund, accounts] = await Promise.all([
    orm.public.Fund.where((f) => and(f.schemeId.eq(schemeId), f.fundType.eq("ADMINISTRATIVE"), f.isActive.eq(true))).first(),
    orm.public.AccountCode
      .where((a) => and(a.schemeId.eq(schemeId), a.accountSubType.eq("SUNDRY_EXPENSE"), a.isActive.eq(true)))
      .limit(10)
      .all(),
  ]);
  const account = accounts.find((a) => !fund || a.fundId === fund.id) ?? accounts[0];
  if (!fund || !account) return "NO_ACCOUNTS";

  await ensureStrataVerzeSupplier(orm);
  const day = issuedAt.slice(0, 10);
  const previous = monthLabel(previousMonth(month));
  const supplierInvoice = await orm.public.SupplierInvoice.create({
    schemeId,
    supplierId: STRATAVERZE_SUPPLIER_ID,
    invoiceNumber: varchar<50>(invoiceNumber),
    invoiceDate: ts(day),
    dueDate: ts(day),
    subtotal: numeric(draft.subtotalCents),
    gstAmount: numeric(draft.gstCents),
    totalAmount: numeric(draft.totalCents),
    amountPaid: numeric(0),
    balanceOutstanding: numeric(draft.totalCents),
    fundId: fund.id,
    accountCodeId: account.id,
    description: varchar<500>(
      `StrataVerze invoice ${invoiceNumber}: subscription for ${monthLabel(month)} and fees to the end of ${previous}`,
    ),
    status: "AWAITING_APPROVAL",
  });
  await orm.public.PlatformInvoice.where((i) => i.id.eq(invoiceId)).update({ supplierInvoiceId: supplierInvoice.id });
  return "RECORDED";
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Issue the month's invoice for every scheme with a subscription. */
export async function runMonthlyInvoices(month: string, now: Date = new Date()): Promise<InvoiceRunOutcome[]> {
  const subscriptions = await db.orm.public.SchemeSubscription.limit(10000).all();
  const results: InvoiceRunOutcome[] = [];
  // One scheme at a time keeps invoice numbers sequential.
  for (const s of subscriptions) {
    try {
      results.push(await issueSchemeInvoice(s.schemeId, month, now));
    } catch (err) {
      logError(`[platform-invoices] Failed for scheme ${s.schemeId}:`, err);
      results.push({ schemeId: s.schemeId, outcome: "SKIPPED", reason: "Error, see logs" });
    }
  }
  return results;
}

/**
 * Keep a StrataVerze invoice's status in step with its supplier invoice in
 * the scheme ledger (approved, part paid or paid).
 */
export async function syncPlatformInvoiceStatus(supplierInvoiceId: string, supplierStatus: string, orm: Orm = db.orm) {
  const status = platformStatusFor(supplierStatus);
  if (!status) return;
  await orm.public.PlatformInvoice.where((i) => i.supplierInvoiceId.eq(supplierInvoiceId)).updateAndCount({ status });
}

/** Email each issued invoice to the scheme's committee. Never throws. */
export async function notifyIssuedInvoices(month: string, results: InvoiceRunOutcome[]) {
  for (const r of results) {
    if (r.outcome !== "ISSUED") continue;
    try {
      const [scheme, emails] = await Promise.all([
        db.orm.public.Scheme.where((s) => s.id.eq(r.schemeId)).first(),
        getMemberEmailsForScheme(r.schemeId, "COMMITTEE"),
      ]);
      await notifyPlatformInvoiceIssued({
        recipientEmails: emails,
        schemeName: scheme?.name ?? "your scheme",
        invoiceNumber: r.invoiceNumber,
        monthLabel: monthLabel(month),
        total: formatAud(r.totalCents),
        promotional: r.promotional,
        needsApproval: r.ledger === "RECORDED",
      });
    } catch (err) {
      logError(`[platform-invoices] Could not notify scheme ${r.schemeId}:`, err);
    }
  }
}
