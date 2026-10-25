/**
 * The link between a works invoice and the building's finance (works
 * stage 4, 25 Oct 2026). Once a committee member (or the Adviser, where the
 * building allows it) sends a works invoice to finance, it becomes a
 * supplier invoice for the contractor and the usual payment approvals,
 * ledger posting, bank detail checks and payment apply. This moves the works
 * invoice on as the supplier invoice is approved, paid or cancelled, so the
 * contractor and the committee see where it stands.
 *
 * Kept free of other app imports, because the finance queries call it.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";

type Orm = typeof db.orm;

const ts = (v: string) => v as unknown as TimestampString<3>;
const money = (v: number) => v.toFixed(2) as unknown as Numeric<12, 2>;

/** Supplier invoice status → the works invoice status it means. */
const WORKS_STATUS_FOR: Record<string, string> = {
  APPROVED: "APPROVED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
};

/** Works invoice statuses while it is with finance. */
const WITH_FINANCE = ["WITH_FINANCE", "APPROVED", "PARTIALLY_PAID"];
/**
 * Where each move may come from. Cancelling only ever applies before
 * approval: once approved (and posted to the ledger) or part paid, finance
 * refuses to cancel a works invoice (finance actions.ts), and this would
 * not follow it if it did, so the work order's amount stays a cap.
 */
const MOVES_FROM: Record<string, string[]> = {
  APPROVED: ["WITH_FINANCE"],
  PARTIALLY_PAID: WITH_FINANCE,
  PAID: WITH_FINANCE,
  CANCELLED: ["WITH_FINANCE"],
};

/**
 * After a supplier invoice changes status: move its works invoice on (and,
 * once paid in full, close the request). Returns the works invoice moved, or
 * null when the supplier invoice did not come from one. Pass the
 * transaction's orm to keep it in the same transaction.
 */
export async function syncWorksInvoiceFromFinance(supplierInvoiceId: string, supplierStatus: string, orm: Orm = db.orm): Promise<{ worksInvoiceId: string; status: string } | null> {
  const status = WORKS_STATUS_FOR[supplierStatus];
  if (!status) return null;
  const si = await orm.public.SupplierInvoice.where((i) => i.id.eq(supplierInvoiceId)).first();
  if (!si?.worksInvoiceId) return null;
  const paid = Number(si.amountPaid ?? 0);
  const n = await orm.public.WorksInvoice
    .where((w) => and(w.id.eq(si.worksInvoiceId!), w.status.in(MOVES_FROM[status])))
    .updateAndCount({
      status,
      ...(status === "APPROVED" ? { approvedAmount: money(Number(si.totalAmount)) } : {}),
      ...(status === "PARTIALLY_PAID" || status === "PAID" ? { paidAmount: money(paid) } : {}),
    });
  if (n !== 1) return null;
  if (status === "PAID") {
    const w = await orm.public.WorksInvoice.where((x) => x.id.eq(si.worksInvoiceId!)).first();
    if (w?.requestId) {
      await orm.public.WorksRequest
        .where((r) => and(r.id.eq(w.requestId!), r.status.eq("CLOSE_OUT")))
        .updateAndCount({ status: "CLOSED", closedAt: ts(new Date().toISOString()) });
    }
  }
  return { worksInvoiceId: si.worksInvoiceId, status };
}

/**
 * Catch a works invoice up with its supplier invoice, in case an earlier
 * move was missed (a failure after the finance change). Safe to repeat.
 */
export async function reconcileWorksInvoice(worksInvoiceId: string): Promise<void> {
  const si = await db.orm.public.SupplierInvoice.where((i) => i.worksInvoiceId.eq(worksInvoiceId)).first();
  if (!si) return;
  const status = String(si.status);
  // Paid in full passes through approved; part paid likewise.
  if (status === "PAID" || status === "PARTIALLY_PAID" || status === "APPROVED" || status === "CANCELLED") await syncWorksInvoiceFromFinance(si.id, status);
}

/** Whether a supplier is a marketplace contractor (so its bank details come from the contractor). */
export async function contractorOfSupplier(supplierId: string): Promise<string | null> {
  const s = await db.orm.public.Supplier.where((x) => x.id.eq(supplierId)).first();
  return s?.contractorBusinessId ?? null;
}

/**
 * After a finance action on a supplier invoice (approve, pay, cancel): tell
 * the contractor where their works invoice now stands. Never throws.
 */
export async function afterFinanceChange(supplierInvoiceId: string, expect: ReadonlyArray<"APPROVED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED">): Promise<void> {
  try {
    const si = await db.orm.public.SupplierInvoice.where((i) => i.id.eq(supplierInvoiceId)).first();
    if (!si?.worksInvoiceId) return;
    const w = await db.orm.public.WorksInvoice.where((x) => x.id.eq(si.worksInvoiceId!)).first();
    // Only the status this action moves it to (an approval short of the full number moves nothing).
    if (!w || !(expect as readonly string[]).includes(String(w.status))) return;
    const { notifyWorksInvoiceFinance } = await import("./notify");
    await notifyWorksInvoiceFinance({ worksInvoiceId: w.id, status: String(w.status) });
  } catch {
    // Emails never undo the finance change they report.
  }
}
