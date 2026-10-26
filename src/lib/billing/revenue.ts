/**
 * Platform revenue summary for StrataVerze staff (pure): monthly recurring
 * revenue by tier, fee events by code, invoices outstanding and schemes in
 * their promotional period.
 */
import { isPromotional, subscriptionPrice, type SubscriptionTier } from "./subscription-tier";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import type { PriceBookEntry } from "./price-book";
import { sydneyMonth } from "./invoice";

export interface RevenueSubscription {
  schemeId: string;
  schemeName: string;
  status: string;
  promotionEnd: string | null;
  quotedMonthlyCents: number | null;
  lotCount: number;
}

export interface RevenueFeeEvent {
  code: string;
  status: string;
  occurredAt: string;
  exGstCents: number;
}

export interface RevenueInvoice {
  status: string;
  totalCents: number;
}

export interface TierLine {
  tier: SubscriptionTier;
  payingSchemes: number;
  promotionalSchemes: number;
  /** Monthly recurring revenue, ex GST, from paying schemes. */
  mrrCents: number;
  needsQuote: number;
}

export interface RevenueSummary {
  tiers: TierLine[];
  mrrCents: number;
  feesByCode: { code: string; thisMonthCents: number; last12MonthsCents: number; count12: number }[];
  outstanding: { count: number; totalCents: number };
  promotional: { schemeId: string; schemeName: string; promotionEnd: string | null; tier: SubscriptionTier }[];
}

const TIERS: SubscriptionTier[] = ["SMALL", "MEDIUM", "LARGE", "ENTERPRISE"];

export function revenueSummary(input: {
  subscriptions: RevenueSubscription[];
  priceBook: PriceBookEntry[];
  feeEvents: RevenueFeeEvent[];
  invoices: RevenueInvoice[];
  now: Date;
}): RevenueSummary {
  // StrataVerze's own day (not UTC).
  const today = platformToday(input.now);
  const tiers = new Map<SubscriptionTier, TierLine>(
    TIERS.map((t) => [t, { tier: t, payingSchemes: 0, promotionalSchemes: 0, mrrCents: 0, needsQuote: 0 }]),
  );
  const promotional: RevenueSummary["promotional"] = [];

  for (const s of input.subscriptions) {
    if (s.status === "CANCELLED") continue;
    const price = subscriptionPrice(input.priceBook, s.lotCount, today);
    const line = tiers.get(price.tier)!;
    if (isPromotional({ status: s.status, promotionEnd: s.promotionEnd }, today)) {
      line.promotionalSchemes += 1;
      promotional.push({ schemeId: s.schemeId, schemeName: s.schemeName, promotionEnd: s.promotionEnd, tier: price.tier });
      continue;
    }
    const monthly = price.tier === "ENTERPRISE" ? s.quotedMonthlyCents : price.monthlyCents;
    if (monthly == null) {
      line.needsQuote += 1;
      continue;
    }
    line.payingSchemes += 1;
    // MRR is ex GST.
    line.mrrCents += price.gstInclusive && price.tier !== "ENTERPRISE" ? Math.round((monthly * 10) / 11) : monthly;
  }

  const thisMonth = sydneyMonth(input.now);
  const yearAgo = input.now.getTime() - 365 * 86_400_000;
  const byCode = new Map<string, { code: string; thisMonthCents: number; last12MonthsCents: number; count12: number }>();
  for (const e of input.feeEvents) {
    if (e.status === "WAIVED") continue;
    const t = new Date(e.occurredAt).getTime();
    if (t <= yearAgo || t > input.now.getTime()) continue;
    const row = byCode.get(e.code) ?? { code: e.code, thisMonthCents: 0, last12MonthsCents: 0, count12: 0 };
    row.last12MonthsCents += e.exGstCents;
    if (e.status !== "REVERSED") row.count12 += 1;
    if (sydneyMonth(new Date(e.occurredAt)) === thisMonth) row.thisMonthCents += e.exGstCents;
    byCode.set(e.code, row);
  }

  const open = input.invoices.filter((i) => i.status === "ISSUED" || i.status === "APPROVED");
  const tierLines = [...tiers.values()];
  return {
    tiers: tierLines,
    mrrCents: tierLines.reduce((s, t) => s + t.mrrCents, 0),
    feesByCode: [...byCode.values()].sort((a, b) => b.last12MonthsCents - a.last12MonthsCents),
    outstanding: { count: open.length, totalCents: open.reduce((s, i) => s + i.totalCents, 0) },
    promotional: promotional.sort((a, b) => (a.promotionEnd ?? "9999").localeCompare(b.promotionEnd ?? "9999")),
  };
}
