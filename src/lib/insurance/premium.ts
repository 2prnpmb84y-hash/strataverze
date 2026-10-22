/**
 * Premium and money helpers (pure, no DB).
 *
 * Totals are always computed from entered line items. Tax rates and charge
 * types are never hardcoded or assumed to apply to every policy.
 */

import { DEFAULT_CURRENCY, PREMIUM_KIND_LABELS } from "./constants";

export interface PremiumLineItemInput {
  label?: string | null;
  kind?: string | null;
  amount: number | string;
}

/** Parse a money value (number, numeric string, or Decimal-like) to a number. */
export function toAmount(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Sum of all premium line items. */
export function premiumTotal(items: PremiumLineItemInput[]): number {
  return round2(items.reduce((sum, it) => sum + toAmount(it.amount), 0));
}

/** Totals grouped by charge kind, in the canonical kind order. */
export function premiumByKind(
  items: PremiumLineItemInput[],
): { kind: string; label: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const it of items) {
    const kind = it.kind ?? "OTHER";
    totals.set(kind, round2((totals.get(kind) ?? 0) + toAmount(it.amount)));
  }
  return [...totals.entries()].map(([kind, amount]) => ({
    kind,
    label: PREMIUM_KIND_LABELS[kind] ?? kind,
    amount,
  }));
}

/** Round to 2 decimal places, avoiding binary float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Format money for display in Australian English. Defaults to AUD. Returns an
 * empty string for null/undefined so callers can show a blank rather than $0.
 */
export function formatMoney(
  value: number | string | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): string {
  if (value == null || value === "") return "";
  const n = toAmount(value);
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(n);
  } catch {
    // Unknown currency code: fall back to a plain formatted number.
    return `${currency} ${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
