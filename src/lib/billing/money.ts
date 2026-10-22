/**
 * Money helpers for platform billing (pure). All arithmetic is in whole cents.
 * Australian GST is 10%. GST on a GST-inclusive amount is one eleventh.
 */

export const GST_RATE = 0.1;

export const toCents = (dollars: number | string) => Math.round(Number(dollars) * 100);
export const fromCents = (cents: number) => cents / 100;

export interface GstSplit {
  exGstCents: number;
  gstCents: number;
  totalCents: number;
}

/**
 * Split an amount into its GST-exclusive part and GST, rounded to the cent.
 * `gstInclusive` says whether `amountCents` already includes GST.
 */
export function splitGst(amountCents: number, gstInclusive: boolean): GstSplit {
  if (!Number.isInteger(amountCents)) throw new Error("Amount must be in whole cents.");
  if (gstInclusive) {
    const gstCents = Math.round(amountCents / 11);
    return { exGstCents: amountCents - gstCents, gstCents, totalCents: amountCents };
  }
  const gstCents = Math.round(amountCents * GST_RATE);
  return { exGstCents: amountCents, gstCents, totalCents: amountCents + gstCents };
}

/** Format cents as AUD, e.g. 165 -> "$1.65". */
export function formatAud(cents: number): string {
  return fromCents(cents).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}
