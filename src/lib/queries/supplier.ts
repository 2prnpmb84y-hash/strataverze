import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import { isQuoteRequestOpen, toSupplierQuoteView } from "@/lib/supplier/quote-visibility";

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

  const requests = await db.orm.public.QuoteRequest
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
    .limit(200)
    .all();

  // Past its closing time is not open. Competitors' quotes are reduced to a
  // count; only the supplier's own quote is returned (F3).
  const now = new Date();
  return requests
    .filter((qr) => isQuoteRequestOpen(qr, now))
    .map((qr) => toSupplierQuoteView(qr, supplierProfileId));
}

/**
 * Get a single quote request as a given supplier may see it: the request,
 * its scheme and work order, the supplier's own quote and a count of other
 * quotes (never their amounts, descriptions or supplier names). Callers must
 * still check the supplier's active SUPPLIER membership on the scheme and
 * supplierMaySeeQuoteRequest.
 */
export async function getQuoteRequestForSupplier(quoteRequestId: string, supplierId: string) {
  const qr = await db.orm.public.QuoteRequest
    .include("scheme")
    .include("workOrder")
    .include("quotes")
    .first({ id: quoteRequestId });
  return qr ? toSupplierQuoteView(qr, supplierId) : null;
}

/**
 * Get all quotes submitted by a specific supplier, newest first.
 */
export async function getQuotesBySupplier(supplierId: string, limit = 200) {
  return db.orm.public.Quote
    .where((q) => q.supplierId.eq(supplierId))
    .include("quoteRequest", (qr) => qr.include("scheme"))
    .orderBy((q) => q.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Get work orders awarded to a specific supplier, newest first.
 */
export async function getWorkOrdersForSupplier(supplierId: string, limit = 200) {
  return db.orm.public.WorkOrder
    .where((wo) => and(wo.supplierId.eq(supplierId), wo.deletedAt.eq(null)))
    .include("scheme")
    .include("comments")
    .orderBy((wo) => wo.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Get invoices submitted by a specific supplier, newest first.
 */
export async function getInvoicesBySupplier(supplierId: string, limit = 200) {
  return db.orm.public.Invoice
    .where((inv) => inv.supplierId.eq(supplierId))
    .include("scheme")
    .include("workOrder")
    .orderBy((inv) => inv.createdAt.desc())
    .limit(limit)
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
