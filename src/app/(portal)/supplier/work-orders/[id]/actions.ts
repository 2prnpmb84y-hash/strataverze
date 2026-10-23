"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import {
  requireAuth,
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { logActivity } from "@/lib/queries/activity-log";
import { and } from "@prisma/orm-postgres/orm-client";
import { supplierMayTransition } from "@/lib/work-orders/status-transitions";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Load a work order the caller may act on as its supplier: it exists, is not
 * deleted, is awarded to the caller, and the caller holds an active SUPPLIER
 * membership on its scheme (F16). The same "not found" whether the work order
 * is missing or someone else's.
 */
async function loadAwardedWorkOrder(workOrderId: string) {
  const profile = await requireAuth();
  const workOrder = await db.orm.public.WorkOrder
    .where((wo) => and(wo.id.eq(workOrderId), wo.deletedAt.eq(null)))
    .first();
  if (!workOrder || workOrder.supplierId !== profile.id) {
    throw new AuthorisationError("Work order not found.");
  }
  await requireSchemeMembership(workOrder.schemeId, ["SUPPLIER"]);
  return { profile, workOrder };
}

export async function updateWorkOrderStatusAction(
  workOrderId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    const { profile, workOrder } = await loadAwardedWorkOrder(workOrderId);

    // Forward moves only: AWARDED -> IN_PROGRESS -> COMPLETED.
    if (!supplierMayTransition(workOrder.status, status))
      return { error: "That status change is not allowed." };

    // Build update
    const data: Record<string, unknown> = { status };
    if (status === "COMPLETED") {
      data.completedAt = toTimestamp(new Date().toISOString());
    }

    await db.orm.public.WorkOrder.where({ id: workOrderId }).update(data);

    await logActivity({
      schemeId: workOrder.schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      entityId: workOrderId,
      metadata: { status },
    });

    revalidatePath(`/supplier/work-orders/${workOrderId}`);
    revalidatePath("/supplier/work-orders");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update status. Please try again." };
  }
}

export async function createInvoiceAction(
  workOrderId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    // Validate inputs
    const invoiceNumber = (formData.get("invoiceNumber") as string)?.trim();
    const amountStr = (formData.get("amount") as string)?.trim();
    const gstAmountStr = (formData.get("gstAmount") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const dueDateStr = (formData.get("dueDate") as string)?.trim();

    if (!invoiceNumber) return { error: "Invoice number is required." };
    if (!amountStr) return { error: "Amount is required." };

    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0)
      return { error: "Amount must be a positive number." };

    let gstAmount = 0;
    if (gstAmountStr) {
      gstAmount = Number(gstAmountStr);
      if (isNaN(gstAmount) || gstAmount < 0)
        return { error: "GST amount must be zero or a positive number." };
    }

    const totalAmount = amount + gstAmount;

    let dueDate: string | null = null;
    if (dueDateStr) {
      const d = new Date(dueDateStr);
      if (isNaN(d.getTime()))
        return { error: "Due date must be a valid date." };
      dueDate = d.toISOString();
    }

    // The work order must be awarded to the caller, with an active SUPPLIER membership.
    const { profile, workOrder } = await loadAwardedWorkOrder(workOrderId);

    // Create the invoice
    const invoice = await db.orm.public.Invoice.create({
      workOrderId,
      schemeId: workOrder.schemeId,
      supplierId: profile.id,
      invoiceNumber,
      amount: toNumeric(amount),
      gstAmount: toNumeric(gstAmount),
      totalAmount: toNumeric(totalAmount),
      description: description || null,
      status: "SUBMITTED",
      dueDate: dueDate ? toTimestamp(dueDate) : null,
      fileUrl: null,
    });

    await logActivity({
      schemeId: workOrder.schemeId,
      actorId: profile.id,
      action: "INVOICE_SUBMITTED",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { invoiceNumber, amount: totalAmount, workOrderId },
    });

    revalidatePath(`/supplier/work-orders/${workOrderId}`);
    revalidatePath("/supplier/invoices");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit invoice. Please try again." };
  }
}
