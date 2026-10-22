import { db } from "@/prisma/db";
import { toCents } from "@/lib/billing/money";
import { billingCaptureEnabled, loadPriceBook, transactionFeeMode } from "@/lib/billing/capture";
import { feeSchedule, feeTotals, type FeeScheduleRow, type FeeTotals } from "@/lib/billing/fee-schedule";
import { isPromotional, subscriptionPrice, type TierPrice } from "@/lib/billing/subscription-tier";

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
}

/** Everything the scheme's StrataVerze fees page shows. Caller checks access. */
export async function getPlatformFeesData(schemeId: string, lotCount: number): Promise<PlatformFeesData> {
  const today = new Date().toISOString().slice(0, 10);
  const [priceBook, subscription, eventRows, invoiceRows] = await Promise.all([
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
  ]);

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
    schedule: feeSchedule(priceBook, today, { transactionFeeMode: transactionFeeMode() }),
  };
}
