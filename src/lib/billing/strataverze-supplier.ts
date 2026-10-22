/**
 * StrataVerze as a supplier to every scheme (pure). One platform-wide
 * Supplier row (scheme_id NULL) with a fixed id, so its invoices flow through
 * each scheme's normal supplier invoice approval and payment.
 */
export const STRATAVERZE_SUPPLIER_ID = "5e7a0000-0000-4000-8000-000000000001";

export const STRATAVERZE_SUPPLIER = {
  companyName: "StrataVerze",
  /** Placeholder until the ABN is confirmed. Printed as "ABN to be confirmed". */
  abn: null as string | null,
  /** Not set until StrataVerze confirms an accounts address. */
  email: null as string | null,
  gstRegistered: true,
  /** Invoices are billed in advance and due on issue. */
  paymentTerms: 0,
};

export function isStrataVerzeSupplier(supplierId: string | null | undefined): boolean {
  return supplierId === STRATAVERZE_SUPPLIER_ID;
}
