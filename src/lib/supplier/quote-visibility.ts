/**
 * What a supplier may see of a quote request (pure). Security finding F3:
 * the supplier quote pages showed every competitor's quote (amount, supplier
 * name, description). A supplier sees the request, their own quote and, at
 * most, how many other quotes there are.
 */

type QuoteRequestTiming = { status: string; closesAt?: unknown };

/** Whether the request is still taking quotes: status OPEN and not past its closing time. */
export function isQuoteRequestOpen(qr: QuoteRequestTiming, now: Date = new Date()): boolean {
  if (qr.status !== "OPEN") return false;
  if (qr.closesAt == null || qr.closesAt === "") return true;
  const closes = new Date(String(qr.closesAt)).getTime();
  return Number.isNaN(closes) || closes > now.getTime();
}

type QuoteOf<R> = R extends { quotes?: infer A } ? (NonNullable<A> extends readonly (infer Q)[] ? Q : never) : never;

export type SupplierQuoteView<R> = Omit<R, "quotes"> & {
  /** The caller's own quote on this request, if any. */
  ownQuote: QuoteOf<R> | null;
  /** How many quotes other suppliers have submitted. No other detail. */
  otherQuoteCount: number;
};

/** Strip every quote except the caller's own, keeping only a count of the others. */
export function toSupplierQuoteView<R extends { quotes?: readonly { supplierId: string }[] | null }>(
  quoteRequest: R,
  supplierId: string,
): SupplierQuoteView<R> {
  const { quotes, ...rest } = quoteRequest;
  const all = (quotes ?? []) as readonly QuoteOf<R>[] & readonly { supplierId: string }[];
  const ownQuote = all.find((q) => q.supplierId === supplierId) ?? null;
  return {
    ...rest,
    ownQuote,
    otherQuoteCount: all.filter((q) => q.supplierId !== supplierId).length,
  };
}

/**
 * Whether a supplier (already confirmed as an active supplier on the request's
 * scheme) may open the request: while it is open, or afterwards when they
 * quoted on it.
 */
export function supplierMaySeeQuoteRequest(
  qr: QuoteRequestTiming,
  hasOwnQuote: boolean,
  now: Date = new Date(),
): boolean {
  return isQuoteRequestOpen(qr, now) || hasOwnQuote;
}
