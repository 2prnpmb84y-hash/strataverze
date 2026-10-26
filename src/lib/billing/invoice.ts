/**
 * Monthly StrataVerze invoice to a scheme (pure).
 *
 * Billing is in advance for the subscription and in arrears for fees: the
 * invoice issued at the start of a month covers that month's subscription
 * plus every fee accrued before the month began. It is due on issue.
 *
 * A promotional period credits the subscription only. Transaction and usage
 * fees are still charged.
 */
import { splitGst } from "./money";
import { PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
import { subscriptionPrice, isPromotional, type SubscriptionTier } from "./subscription-tier";
import type { PriceBookEntry } from "./price-book";

/** StrataVerze bills on its own time zone. */
export const BILLING_TIME_ZONE = PLATFORM_TIME_ZONE;

/** The calendar month (YYYY-MM) in Sydney at an instant. */
export function sydneyMonth(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** First and last day (YYYY-MM-DD) of a YYYY-MM month. */
export function monthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) throw new Error("Month must be YYYY-MM.");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** The UTC instant of midnight in Sydney at the start of a YYYY-MM-DD day. */
export function sydneyMidnightUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  // Start from midnight UTC and subtract Sydney's offset. Daylight saving
  // changes at 2am or 3am, so the offset is re-read at the corrected instant
  // in case a change falls later that day.
  const guess = new Date(Date.UTC(y, m - 1, d));
  const first = new Date(guess.getTime() - utcOffsetMinutes(guess) * 60_000);
  return new Date(guess.getTime() - utcOffsetMinutes(first) * 60_000);
}

function utcOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-AU", {
    timeZone: BILLING_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT+11:00"
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "November 2026" for "2026-11". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

const TIER_NAMES: Record<SubscriptionTier, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  ENTERPRISE: "Enterprise",
};

export interface InvoiceSubscription {
  status: string;
  promotionEnd: string | null;
  /** Negotiated monthly price ex GST in cents, used for Enterprise schemes. */
  quotedMonthlyCents: number | null;
}

/** An accrued fee event waiting to be invoiced. */
export interface AccruedFee {
  id: string;
  code: string;
  description: string;
  status: string;
  occurredAt: string;
  exGstCents: number;
  gstCents: number;
}

export type InvoiceLineKind = "SUBSCRIPTION" | "PROMOTIONAL_CREDIT" | "FEE";

export interface InvoiceLine {
  kind: InvoiceLineKind;
  code: string;
  description: string;
  exGstCents: number;
  gstCents: number;
  /** The fee event this line bills, for FEE lines. */
  feeEventId: string | null;
}

export interface InvoiceDraft {
  month: string;
  periodStart: string;
  periodEnd: string;
  tier: SubscriptionTier;
  promotional: boolean;
  /** True when an Enterprise scheme has no quoted price, so no subscription line. */
  needsQuote: boolean;
  lines: InvoiceLine[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
}

/**
 * Build the invoice for `month`. Fees are those accrued before the month
 * began (by `occurredAt`), excluding waived events. Reversal rows net off.
 */
export function buildInvoice(input: {
  month: string;
  lotCount: number;
  subscription: InvoiceSubscription;
  priceBook: PriceBookEntry[];
  accruedFees: AccruedFee[];
}): InvoiceDraft {
  const { start, end } = monthBounds(input.month);
  const cutoff = sydneyMidnightUtc(start).getTime();
  const price = subscriptionPrice(input.priceBook, input.lotCount, start);
  const promotional = isPromotional(input.subscription, start);

  const lines: InvoiceLine[] = [];

  let subscriptionCents: number | null = price.monthlyCents;
  let gstInclusive = price.gstInclusive;
  if (price.tier === "ENTERPRISE") {
    subscriptionCents = input.subscription.quotedMonthlyCents;
    gstInclusive = false;
  }
  const needsQuote = subscriptionCents == null;

  if (subscriptionCents != null) {
    const split = splitGst(subscriptionCents, gstInclusive);
    const code = price.tier === "ENTERPRISE" ? "SUBSCRIPTION_ENTERPRISE" : `SUBSCRIPTION_${price.tier}`;
    lines.push({
      kind: "SUBSCRIPTION",
      code,
      description: `Scheme subscription, ${TIER_NAMES[price.tier]} (${input.lotCount} lots), ${monthLabel(input.month)}`,
      exGstCents: split.exGstCents,
      gstCents: split.gstCents,
      feeEventId: null,
    });
    if (promotional) {
      lines.push({
        kind: "PROMOTIONAL_CREDIT",
        code: "PROMOTIONAL_CREDIT",
        description: `Promotional period: subscription credited for ${monthLabel(input.month)}`,
        exGstCents: -split.exGstCents,
        gstCents: -split.gstCents,
        feeEventId: null,
      });
    }
  }

  const fees = input.accruedFees
    .filter((f) => f.status === "ACCRUED" || f.status === "REVERSED")
    .filter((f) => new Date(f.occurredAt).getTime() < cutoff)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const f of fees) {
    lines.push({
      kind: "FEE",
      code: f.code,
      description: f.status === "REVERSED" ? `Reversal: ${f.description}` : f.description,
      exGstCents: f.exGstCents,
      gstCents: f.gstCents,
      feeEventId: f.id,
    });
  }

  const subtotalCents = lines.reduce((s, l) => s + l.exGstCents, 0);
  const gstCents = lines.reduce((s, l) => s + l.gstCents, 0);
  return {
    month: input.month,
    periodStart: start,
    periodEnd: end,
    tier: price.tier,
    promotional,
    needsQuote,
    lines,
    subtotalCents,
    gstCents,
    totalCents: subtotalCents + gstCents,
  };
}

export const INVOICE_NUMBER_PREFIX = "SV-";

/** The next platform invoice number after the existing ones: SV-000001, SV-000002, ... */
export function nextInvoiceNumber(existing: string[]): string {
  let max = 0;
  for (const n of existing) {
    const match = /^SV-(\d+)$/.exec(n);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${INVOICE_NUMBER_PREFIX}${String(max + 1).padStart(6, "0")}`;
}

/** The StrataVerze invoice status that follows a supplier invoice status in the scheme ledger. */
export function platformStatusFor(supplierStatus: string): "APPROVED" | "PAID" | null {
  if (supplierStatus === "PAID") return "PAID";
  if (supplierStatus === "APPROVED" || supplierStatus === "PARTIALLY_PAID") return "APPROVED";
  return null;
}
