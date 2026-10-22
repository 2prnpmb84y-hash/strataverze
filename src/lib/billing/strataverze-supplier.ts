/**
 * StrataVerze as a supplier to every scheme (pure). One platform-wide
 * Supplier row (scheme_id NULL) with a fixed id, so its invoices flow through
 * each scheme's normal supplier invoice approval and payment.
 *
 * Details from ABN Lookup (record extracted 23 October 2026): STRATAVERZE PTY
 * LTD, ABN 25 680 401 450, ACN 680 401 450, Australian private company, main
 * business location NSW 2064. At that date it was not registered for GST.
 */
export const STRATAVERZE_SUPPLIER_ID = "5e7a0000-0000-4000-8000-000000000001";

/**
 * Whether StrataVerze is registered for GST. Every StrataVerze price adds GST,
 * so no charge may be recorded or invoiced until this is on. Set
 * STRATAVERZE_GST_REGISTERED=on from the date the registration takes effect.
 */
export function strataVerzeGstRegistered(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRATAVERZE_GST_REGISTERED === "on";
}

export const STRATAVERZE_SUPPLIER = {
  companyName: "StrataVerze Pty Ltd",
  abn: "25680401450" as string | null,
  acn: "680401450",
  /** Not set until StrataVerze confirms an accounts address. */
  email: null as string | null,
  get gstRegistered() {
    return strataVerzeGstRegistered();
  },
  /** Invoices are billed in advance and due on issue. */
  paymentTerms: 0,
};

/** ABN as printed: 25 680 401 450. */
export function formatAbn(abn: string): string {
  const d = abn.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : abn;
}

export function isStrataVerzeSupplier(supplierId: string | null | undefined): boolean {
  return supplierId === STRATAVERZE_SUPPLIER_ID;
}
