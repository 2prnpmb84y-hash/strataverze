/**
 * Platform price book (pure). Every StrataVerze price lives in the
 * PlatformPriceBook table with effective dates; this module only resolves
 * which row applies. No price is hard-coded here.
 *
 * Banded prices (transaction fee tiers, works contract value bands, developer
 * set-up lot bands) are rows with the same code and a band range. Bands are
 * inclusive at both ends and measured in the code's band unit (cents for money
 * bands, lots for lot bands).
 */

export type PayerType =
  | "OC"
  | "OWNER_VIA_OC"
  | "REQUESTING_PARTY"
  | "INCOMING_OWNER"
  | "DEVELOPER"
  | "SUPPLIER";

/** Billing units. There is deliberately no percentage unit (hard rule 1). */
export type PriceUnit =
  | "PER_EVENT"
  | "PER_MONTH"
  | "PER_YEAR"
  | "PER_SEAT_MONTH"
  | "PER_STEP"
  | "PER_NOTICE";

export const PRICE_UNITS: readonly PriceUnit[] = [
  "PER_EVENT",
  "PER_MONTH",
  "PER_YEAR",
  "PER_SEAT_MONTH",
  "PER_STEP",
  "PER_NOTICE",
];

export interface PriceBookEntry {
  code: string;
  /** Distinguishes priced options of one code, e.g. a recovery step type. */
  variant?: string | null;
  description: string;
  /** Price in cents. Null means "quote manually" (e.g. enterprise subscriptions). */
  amountCents: number | null;
  gstInclusive: boolean;
  unit: PriceUnit;
  payerType: PayerType;
  /** YYYY-MM-DD, inclusive. */
  effectiveFrom: string;
  /** YYYY-MM-DD, exclusive. Null means open-ended. */
  effectiveTo?: string | null;
  isActive: boolean;
  recoverableFromOwner?: boolean;
  /** Inclusive band bounds, when the price depends on an amount or a count. */
  bandMin?: number | null;
  bandMax?: number | null;
}

/** Whether the entry is in force on `date` (YYYY-MM-DD). */
export function isEffective(entry: PriceBookEntry, date: string): boolean {
  if (!entry.isActive) return false;
  if (date < entry.effectiveFrom) return false;
  if (entry.effectiveTo && date >= entry.effectiveTo) return false;
  return true;
}

function inBand(entry: PriceBookEntry, value: number | undefined): boolean {
  if (entry.bandMin == null && entry.bandMax == null) return true;
  if (value === undefined) return false;
  if (entry.bandMin != null && value < entry.bandMin) return false;
  if (entry.bandMax != null && value > entry.bandMax) return false;
  return true;
}

export class PriceBookError extends Error {}

/**
 * The single price book row that applies to `code` (and `variant`) on `date`,
 * for `bandValue` when the code is banded. Returns null when no row applies.
 * Throws when more than one row applies, because that is a configuration error.
 */
export function resolvePrice(
  entries: PriceBookEntry[],
  query: { code: string; variant?: string | null; date: string; bandValue?: number },
): PriceBookEntry | null {
  const matches = entries.filter(
    (e) =>
      e.code === query.code &&
      (e.variant ?? null) === (query.variant ?? null) &&
      isEffective(e, query.date) &&
      inBand(e, query.bandValue),
  );
  if (matches.length > 1) {
    throw new PriceBookError(
      `More than one price applies to ${query.code}${query.variant ? `/${query.variant}` : ""} on ${query.date}.`,
    );
  }
  return matches[0] ?? null;
}

export interface PriceBookProblem {
  code: string;
  message: string;
}

const overlaps = (a: PriceBookEntry, b: PriceBookEntry) => {
  const aEnd = a.effectiveTo ?? "9999-12-31";
  const bEnd = b.effectiveTo ?? "9999-12-31";
  const datesOverlap = a.effectiveFrom < bEnd && b.effectiveFrom < aEnd;
  if (!datesOverlap) return false;
  const aMin = a.bandMin ?? -Infinity;
  const aMax = a.bandMax ?? Infinity;
  const bMin = b.bandMin ?? -Infinity;
  const bMax = b.bandMax ?? Infinity;
  return aMin <= bMax && bMin <= aMax;
};

/**
 * Check a price book for configuration errors: unknown units, negative
 * prices, empty date ranges and overlapping rows for the same code.
 */
export function validatePriceBook(entries: PriceBookEntry[]): PriceBookProblem[] {
  const problems: PriceBookProblem[] = [];
  for (const e of entries) {
    if (!PRICE_UNITS.includes(e.unit)) {
      problems.push({ code: e.code, message: `Unit ${String(e.unit)} is not allowed (prices are flat amounts, never percentages).` });
    }
    if (e.amountCents != null && (!Number.isInteger(e.amountCents) || e.amountCents < 0)) {
      problems.push({ code: e.code, message: "Amount must be whole cents and not negative." });
    }
    if (e.effectiveTo && e.effectiveTo <= e.effectiveFrom) {
      problems.push({ code: e.code, message: "effectiveTo must be after effectiveFrom." });
    }
    if (e.bandMin != null && e.bandMax != null && e.bandMin > e.bandMax) {
      problems.push({ code: e.code, message: "bandMin must not exceed bandMax." });
    }
  }
  const active = entries.filter((e) => e.isActive);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.code === b.code && (a.variant ?? null) === (b.variant ?? null) && overlaps(a, b)) {
        problems.push({ code: a.code, message: `Overlapping prices for ${a.code}${a.variant ? `/${a.variant}` : ""}.` });
      }
    }
  }
  return problems;
}
