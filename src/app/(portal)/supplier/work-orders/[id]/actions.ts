"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import {
  requireAuth,
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { logActivity } from "@/lib/queries/activity-log";
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

const SUPPLIER_ALLOWED_STATUSES = ["IN_PROGRESS", "COMPLETED"];

export async function updateWorkOrderStatusAction(
  workOrderId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    const profile = await requireAuth();

    // Validate status
    if (!SUPPLIER_ALLOWED_STATUSES.includes(status))
      return { error: "Suppliers can only set status to In Progress or Completed." };

    // Fetch and verify ownership
    const workOrder = await db.orm.public.WorkOrder.first({ id: workOrderId });
    if (!workOrder) return { error: "Work order not found." };
    if (workOrder.supplierId !== profile.id)
      return { error: "You can only update work orders assigned to you." };

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
    const profile = await requireAuth();

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

    // Fetch work order and verify ownership
    const workOrder = await db.orm.public.WorkOrder.first({ id: workOrderId });
    if (!workOrder) return { error: "Work order not found." };
    if (workOrder.supplierId !== profile.id)
      return { error: "You can only submit invoices for work orders assigned to you." };

    // Verify supplier has membership on the scheme
    await requireSchemeMembership(workOrder.schemeId, ["SUPPLIER"]);

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
