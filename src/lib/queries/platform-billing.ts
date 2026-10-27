import { db } from "@/prisma/db";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { referralIncomeEnabled } from "@/lib/billing/referral";
import { getReferralIncomeForScheme, type ReferralIncomeRow } from "@/lib/queries/referral-income";
import { toCents } from "@/lib/billing/money";
import { billingCaptureEnabled, loadPriceBook, transactionFeeMode } from "@/lib/billing/capture";
import { feeSchedule, feeTotals, type FeeScheduleRow, type FeeTotals } from "@/lib/billing/fee-schedule";
import { isPromotional, subscriptionPrice, type TierPrice } from "@/lib/billing/subscription-tier";
import { feeWordingFor, type FeeWording } from "@/lib/billing/disclosure";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";

const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const isoTime = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));

export interface PlatformFeeEventRow {
  id: string;
  code: string;
  description: string;
  sourceType: string;
  status: string;
  occurredAt: string;
  exGstCents: number;
  gstCents: number;
  totalCents: number;
  payerType: string;
  recoverableFromOwner: boolean;
  invoiced: boolean;
}

export interface PlatformInvoiceRow {
  id: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  totalCents: number;
  status: string;
}

export interface PlatformFeesData {
  captureEnabled: boolean;
  today: string;
  subscription: {
    exists: boolean;
    status: string | null;
    promotional: boolean;
    promotionEnd: string | null;
    lotCount: number;
    price: TierPrice;
  };
  uninvoiced: FeeTotals;
  events: PlatformFeeEventRow[];
  invoices: PlatformInvoiceRow[];
  schedule: FeeScheduleRow[];
  /** Null while the referral income feature is switched off. */
  referralIncome: ReferralIncomeRow[] | null;
  /** The building's words for its fees, from its rule pack (feeWordingFor). */
  wording: FeeWording;
}

/** Everything the scheme's StrataVerze fees page shows. Caller checks access. */
export async function getPlatformFeesData(schemeId: string, lotCount: number): Promise<PlatformFeesData> {
  // StrataVerze's own billing day.
  const today = platformToday();
  const [priceBook, subscription, eventRows, invoiceRows, { rules }] = await Promise.all([
    loadPriceBook(),
    db.orm.public.SchemeSubscription.where((s) => s.schemeId.eq(schemeId)).first(),
    db.orm.public.PlatformFeeEvent.where((e) => e.schemeId.eq(schemeId))
      .orderBy((e) => e.occurredAt.desc())
      .limit(500)
      .all(),
    db.orm.public.PlatformInvoice.where((i) => i.schemeId.eq(schemeId))
      .orderBy((i) => i.periodStart.desc())
      .limit(120)
      .all(),
    rulesForScheme(schemeId),
  ]);
  const wording = feeWordingFor(rules);

  const events: PlatformFeeEventRow[] = eventRows.map((e) => {
    const exGstCents = toCents(String(e.amountExGst));
    const gstCents = toCents(String(e.gstAmount));
    return {
      id: e.id,
      code: e.code,
      description: e.description,
      sourceType: e.sourceType,
      status: e.status,
      occurredAt: isoTime(e.occurredAt),
      exGstCents,
      gstCents,
      totalCents: exGstCents + gstCents,
      payerType: e.payerType,
      recoverableFromOwner: e.recoverableFromOwner,
      invoiced: e.invoiceId != null,
    };
  });

  const promotionEnd = subscription?.promotionEnd ? isoDay(subscription.promotionEnd) : null;

  return {
    captureEnabled: billingCaptureEnabled(),
    today,
    subscription: {
      exists: !!subscription,
      status: subscription?.status ?? null,
      promotional: subscription ? isPromotional({ status: subscription.status, promotionEnd }, today) : false,
      promotionEnd,
      lotCount,
      price: subscriptionPrice(priceBook, lotCount, today),
    },
    uninvoiced: feeTotals(
      events
        .filter((e) => !e.invoiced)
        .map((e) => ({ status: e.status, amountExGstCents: e.exGstCents, gstCents: e.gstCents })),
    ),
    events,
    invoices: invoiceRows.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      periodStart: isoDay(i.periodStart),
      periodEnd: isoDay(i.periodEnd),
      totalCents: toCents(String(i.total)),
      status: i.status,
    })),
    schedule: feeSchedule(priceBook, today, { transactionFeeMode: transactionFeeMode(), wording }),
    referralIncome: referralIncomeEnabled() ? await getReferralIncomeForScheme(schemeId) : null,
    wording,
  };
}

/** A StrataVerze invoice with its lines, for the PDF and detail views. */
export async function getPlatformInvoiceWithLines(invoiceId: string) {
  const invoice = await db.orm.public.PlatformInvoice.where((i) => i.id.eq(invoiceId)).first();
  if (!invoice) return null;
  const [scheme, events] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(invoice.schemeId)).first(),
    db.orm.public.PlatformFeeEvent.where((e) => e.invoiceId.eq(invoiceId))
      .orderBy((e) => e.occurredAt.asc())
      .limit(5000)
      .all(),
  ]);
  if (!scheme) return null;
  // Subscription first, then its promotional credit, then fees in date order.
  const rank = (code: string) => (code.startsWith("SUBSCRIPTION_") ? 0 : code === "PROMOTIONAL_CREDIT" ? 1 : 2);
  const lines = events
    .map((e) => ({
      code: e.code,
      description: e.status === "REVERSED" ? `Reversal: ${e.description}` : e.description,
      exGstCents: toCents(String(e.amountExGst)),
      gstCents: toCents(String(e.gstAmount)),
      occurredAt: isoTime(e.occurredAt),
    }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.occurredAt.localeCompare(b.occurredAt));
  return {
    id: invoice.id,
    schemeId: invoice.schemeId,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt ? isoTime(invoice.issuedAt) : isoTime(invoice.createdAt),
    periodStart: isoDay(invoice.periodStart),
    periodEnd: isoDay(invoice.periodEnd),
    status: invoice.status,
    scheme: {
      name: scheme.name,
      planNumber: scheme.planNumber ?? null,
      address: scheme.address ?? null,
      suburb: scheme.suburb ?? null,
      state: scheme.state ?? null,
      postcode: scheme.postcode ?? null,
    },
    lines,
    subtotalCents: toCents(String(invoice.subtotal)),
    gstCents: toCents(String(invoice.gst)),
    totalCents: toCents(String(invoice.total)),
  };
}
