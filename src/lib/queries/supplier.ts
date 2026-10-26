import { db } from "@/prisma/db";

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
