/**
 * Scheme subscription tiers (pure). The tier is derived from the scheme's
 * active lot count at the start of each billing period. Prices come from the
 * price book (codes SUBSCRIPTION_SMALL, SUBSCRIPTION_MEDIUM, SUBSCRIPTION_LARGE).
 * Enterprise schemes have no list price and are flagged for a manual quote.
 */
import { resolvePrice, type PriceBookEntry } from "./price-book";

export type SubscriptionTier = "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE";

/** Lot bands: Small up to 10, Medium 11 to 50, Large 51 to 150, Enterprise above 150. */
export function deriveTier(lotCount: number): SubscriptionTier {
  if (!Number.isInteger(lotCount) || lotCount < 0) {
    throw new Error("Lot count must be a whole number of zero or more.");
  }
  if (lotCount <= 10) return "SMALL";
  if (lotCount <= 50) return "MEDIUM";
  if (lotCount <= 150) return "LARGE";
  return "ENTERPRISE";
}

export const TIER_PRICE_CODES: Record<Exclude<SubscriptionTier, "ENTERPRISE">, string> = {
  SMALL: "SUBSCRIPTION_SMALL",
  MEDIUM: "SUBSCRIPTION_MEDIUM",
  LARGE: "SUBSCRIPTION_LARGE",
};

export interface TierPrice {
  tier: SubscriptionTier;
  /** Monthly price in cents, or null when a manual quote is needed. */
  monthlyCents: number | null;
  gstInclusive: boolean;
  needsQuote: boolean;
}

/** The monthly subscription price for a lot count on a date. */
export function subscriptionPrice(
  priceBook: PriceBookEntry[],
  lotCount: number,
  date: string,
): TierPrice {
  const tier = deriveTier(lotCount);
  if (tier === "ENTERPRISE") {
    return { tier, monthlyCents: null, gstInclusive: false, needsQuote: true };
  }
  const entry = resolvePrice(priceBook, { code: TIER_PRICE_CODES[tier], date });
  if (!entry || entry.amountCents == null) {
    return { tier, monthlyCents: null, gstInclusive: false, needsQuote: true };
  }
  return { tier, monthlyCents: entry.amountCents, gstInclusive: entry.gstInclusive, needsQuote: false };
}

/**
 * Whether a subscription is still in its promotional (free) period on `date`.
 * Mirrors ContractorMembership: status PROMOTIONAL with a promotion end date.
 */
export function isPromotional(
  sub: { status: string; promotionEnd?: string | null },
  date: string,
): boolean {
  if (sub.status !== "PROMOTIONAL") return false;
  if (!sub.promotionEnd) return true;
  return date < sub.promotionEnd.slice(0, 10);
}
