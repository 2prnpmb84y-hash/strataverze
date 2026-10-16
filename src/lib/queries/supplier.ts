import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

/**
 * Get all OPEN quote requests visible to suppliers, newest first.
 */
export async function getOpenQuoteRequests() {
  return db.orm.public.QuoteRequest
    .where((qr) => qr.status.eq("OPEN"))
    .include("scheme")
    .include("workOrder")
    .include("quotes")
    .orderBy((qr) => qr.createdAt.desc())
    .all();
}

/**
 * Get a single quote request by ID with its quotes and scheme.
 */
export async function getQuoteRequestById(quoteRequestId: string) {
  return db.orm.public.QuoteRequest
    .include("scheme")
    .include("workOrder")
    .include("quotes", (q) =>
      q.include("supplier").orderBy((qt) => qt.createdAt.desc()),
    )
    .first({ id: quoteRequestId });
}

/**
 * Get all quotes submitted by a specific supplier, newest first.
 */
export async function getQuotesBySupplier(supplierId: string) {
  return db.orm.public.Quote
    .where((q) => q.supplierId.eq(supplierId))
    .include("quoteRequest", (qr) => qr.include("scheme"))
    .orderBy((q) => q.createdAt.desc())
    .all();
}

/**
 * Get work orders awarded to a specific supplier, newest first.
 */
export async function getWorkOrdersForSupplier(supplierId: string) {
  return db.orm.public.WorkOrder
    .where((wo) => wo.supplierId.eq(supplierId))
    .include("scheme")
    .include("comments")
    .orderBy((wo) => wo.createdAt.desc())
    .all();
}

/**
 * Get invoices submitted by a specific supplier, newest first.
 */
export async function getInvoicesBySupplier(supplierId: string) {
  return db.orm.public.Invoice
    .where((inv) => inv.supplierId.eq(supplierId))
    .include("scheme")
    .include("workOrder")
    .orderBy((inv) => inv.createdAt.desc())
    .all();
}

/**
 * Check whether a supplier has already submitted a quote for a given request.
 */
export async function hasSupplierQuoted(
  quoteRequestId: string,
  supplierId: string,
): Promise<boolean> {
  const existing = await db.orm.public.Quote
    .where((q) =>
      and(
        q.quoteRequestId.eq(quoteRequestId),
        q.supplierId.eq(supplierId),
      ),
    )
    .first();
  return existing !== null;
}
