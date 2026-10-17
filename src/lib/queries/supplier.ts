import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";

/**
 * Get OPEN quote requests visible to a specific supplier, scoped to
 * schemes where the supplier has an active membership. Newest first.
 */
export async function getOpenQuoteRequests(supplierProfileId: string) {
  // Find schemes this supplier is a member of
  const memberships = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.profileId.eq(supplierProfileId),
        m.role.eq("SUPPLIER"),
        m.isActive.eq(true),
      ),
    )
    .all();

  const schemeIds = memberships.map((m) => m.schemeId);
  if (schemeIds.length === 0) return [];

  return db.orm.public.QuoteRequest
    .where((qr) =>
      and(
        qr.status.eq("OPEN"),
        or(...schemeIds.map((id) => qr.schemeId.eq(id))),
      ),
    )
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
    .where((wo) => and(wo.supplierId.eq(supplierId), wo.deletedAt.eq(null)))
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
