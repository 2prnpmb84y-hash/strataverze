import { db } from "@/prisma/db";
import { captureTransactionFee } from "@/lib/billing/capture";
import { and, or } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a plain string to the Prisma 8 Varchar branded type. */
function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

// ─── Financial Supplier Functions ──────────────────────────────

/**
 * Fetch all financial suppliers for a scheme, ordered by company name.
 * By default only active suppliers are returned.
 */
export async function getFinancialSuppliersForScheme(
  schemeId: string,
  includeInactive = false,
  limit = 500,
) {
  if (includeInactive) {
    return db.orm.public.Supplier
      .where((s) => s.schemeId.eq(schemeId))
      .orderBy((s) => s.companyName.asc())
      .limit(limit)
      .all();
  }
  return db.orm.public.Supplier
    .where((s) => and(s.schemeId.eq(schemeId), s.isActive.eq(true)))
    .orderBy((s) => s.companyName.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single financial supplier by ID.
 */
export async function getFinancialSupplierById(supplierId: string) {
  try {
    return db.orm.public.Supplier
      .where((s) => s.id.eq(supplierId))
      .include("supplierInvoices")
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Create a financial supplier record.
 */
export async function createFinancialSupplier(data: {
  schemeId?: string;
  companyName: string;
  tradingName?: string;
  abn?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  bankBsb?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  paymentTerms?: number;
  gstRegistered?: boolean;
}) {
  return db.orm.public.Supplier.create({
    schemeId: data.schemeId ?? null,
    companyName: toVarchar<200>(data.companyName),
    tradingName: data.tradingName ? toVarchar<200>(data.tradingName) : null,
    abn: data.abn ? toVarchar<11>(data.abn) : null,
    contactName: data.contactName ? toVarchar<200>(data.contactName) : null,
    email: data.email ? toVarchar<320>(data.email) : null,
    phone: data.phone ? toVarchar<20>(data.phone) : null,
    bankBsb: data.bankBsb ? toVarchar<7>(data.bankBsb) : null,
    bankAccountNumber: data.bankAccountNumber ? toVarchar<20>(data.bankAccountNumber) : null,
    bankAccountName: data.bankAccountName ? toVarchar<200>(data.bankAccountName) : null,
    paymentTerms: data.paymentTerms ?? null,
    gstRegistered: data.gstRegistered ?? false,
  });
}

/**
 * Update a financial supplier's details.
 */
export async function updateFinancialSupplier(
  supplierId: string,
  data: Partial<{
    companyName: string;
    tradingName: string | null;
    abn: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    bankBsb: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    paymentTerms: number | null;
    gstRegistered: boolean;
    isActive: boolean;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.companyName !== undefined) updateData.companyName = data.companyName;
  if (data.tradingName !== undefined) updateData.tradingName = data.tradingName;
  if (data.abn !== undefined) updateData.abn = data.abn;
  if (data.contactName !== undefined) updateData.contactName = data.contactName;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.bankBsb !== undefined) updateData.bankBsb = data.bankBsb;
  if (data.bankAccountNumber !== undefined) updateData.bankAccountNumber = data.bankAccountNumber;
  if (data.bankAccountName !== undefined) updateData.bankAccountName = data.bankAccountName;
  if (data.paymentTerms !== undefined) updateData.paymentTerms = data.paymentTerms;
  if (data.gstRegistered !== undefined) updateData.gstRegistered = data.gstRegistered;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return db.orm.public.Supplier.where({ id: supplierId }).update(updateData);
}

/**
 * Deactivate a financial supplier (soft disable).
 */
export async function deactivateFinancialSupplier(supplierId: string) {
  try {
    return db.orm.public.Supplier
      .where({ id: supplierId })
      .update({ isActive: false });
  } catch {
    // Table may not exist yet
    return [];
  }
}

// ─── Supplier Invoice Functions ────────────────────────────────

/**
 * Fetch supplier invoices for a scheme with optional filters.
 */
export async function getSupplierInvoicesForScheme(
  schemeId: string,
  filters?: {
    status?: string;
    supplierId?: string;
    startDate?: string;
    endDate?: string;
  },
  limit = 200,
) {
  let query = db.orm.public.SupplierInvoice
    .where((si) => si.schemeId.eq(schemeId));

  if (filters?.status) {
    query = query.where((si) => si.status.eq(filters.status!));
  }
  if (filters?.supplierId) {
    query = query.where((si) => si.supplierId.eq(filters.supplierId!));
  }
  if (filters?.startDate) {
    query = query.where((si) => si.invoiceDate.gte(toTimestamp(filters.startDate!)));
  }
  if (filters?.endDate) {
    query = query.where((si) => si.invoiceDate.lte(toTimestamp(filters.endDate!)));
  }

  return query
    .include("supplier")
    .include("fund")
    .include("accountCode")
    .orderBy((si) => si.invoiceDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single supplier invoice by ID with related data.
 */
export async function getSupplierInvoiceById(invoiceId: string) {
  try {
    return db.orm.public.SupplierInvoice
      .where((si) => si.id.eq(invoiceId))
      .include("supplier")
      .include("fund")
      .include("accountCode")
      .include("financialDocuments")
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Create a new supplier invoice.
 */
export async function createSupplierInvoice(data: {
  schemeId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  fundId: string;
  accountCodeId: string;
  description: string;
}) {
  return db.orm.public.SupplierInvoice.create({
    schemeId: data.schemeId,
    supplierId: data.supplierId,
    invoiceNumber: toVarchar<50>(data.invoiceNumber),
    invoiceDate: toTimestamp(data.invoiceDate),
    dueDate: toTimestamp(data.dueDate),
    subtotal: toNumeric(data.subtotal),
    gstAmount: toNumeric(data.gstAmount),
    totalAmount: toNumeric(data.totalAmount),
    amountPaid: toNumeric(0),
    balanceOutstanding: toNumeric(data.totalAmount),
    fundId: data.fundId,
    accountCodeId: data.accountCodeId,
    description: toVarchar<500>(data.description),
    status: "DRAFT",
  });
}

/**
 * Update a supplier invoice (only when status is DRAFT).
 */
export async function updateSupplierInvoice(
  invoiceId: string,
  data: Partial<{
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    subtotal: number;
    gstAmount: number;
    totalAmount: number;
    balanceOutstanding: number;
    fundId: string;
    accountCodeId: string;
    description: string;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.invoiceNumber !== undefined) updateData.invoiceNumber = toVarchar<50>(data.invoiceNumber);
  if (data.invoiceDate !== undefined) updateData.invoiceDate = toTimestamp(data.invoiceDate);
  if (data.dueDate !== undefined) updateData.dueDate = toTimestamp(data.dueDate);
  if (data.subtotal !== undefined) updateData.subtotal = toNumeric(data.subtotal);
  if (data.gstAmount !== undefined) updateData.gstAmount = toNumeric(data.gstAmount);
  if (data.totalAmount !== undefined) updateData.totalAmount = toNumeric(data.totalAmount);
  if (data.balanceOutstanding !== undefined) updateData.balanceOutstanding = toNumeric(data.balanceOutstanding);
  if (data.fundId !== undefined) updateData.fundId = data.fundId;
  if (data.accountCodeId !== undefined) updateData.accountCodeId = data.accountCodeId;
  if (data.description !== undefined) updateData.description = toVarchar<500>(data.description);

  return db.orm.public.SupplierInvoice
    .where((si) => and(si.id.eq(invoiceId), si.status.eq("DRAFT")))
    .update(updateData);
}

/**
 * Submit a supplier invoice for approval.
 */
export async function submitForApproval(invoiceId: string) {
  try {
    return db.orm.public.SupplierInvoice
      .where({ id: invoiceId })
      .update({ status: "AWAITING_APPROVAL" });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Approve a supplier invoice.
 */
export async function approveInvoice(invoiceId: string, approvedBy: string) {
  try {
    return db.orm.public.SupplierInvoice
      .where({ id: invoiceId })
      .update({
        status: "APPROVED",
        approvedBy,
        approvedAt: toTimestamp(new Date().toISOString()),
      });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Record a payment against a supplier invoice.
 * Recalculates amountPaid, balanceOutstanding, and status.
 */
export async function recordInvoicePayment(
  invoiceId: string,
  paymentAmount: number,
  details: { paymentDate?: string; actorId?: string | null } = {},
) {
  return db.transaction(async (tx) => {
    const invoice = await tx.orm.public.SupplierInvoice
      .where((si) => si.id.eq(invoiceId))
      .first();

    if (!invoice) {
      throw new Error(`Supplier invoice not found: ${invoiceId}`);
    }

    const currentPaid = Number(invoice.amountPaid);
    const total = Number(invoice.totalAmount);
    const newAmountPaid = Math.round((currentPaid + paymentAmount) * 100) / 100;
    const newBalance = total - newAmountPaid;
    const newStatus = newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

    const updated = await tx.orm.public.SupplierInvoice
      .where({ id: invoiceId })
      .update({
        amountPaid: toNumeric(newAmountPaid),
        balanceOutstanding: toNumeric(Math.max(newBalance, 0)),
        status: newStatus,
      });

    // StrataVerze transaction service fee on the disbursement, in the same
    // transaction. Each payment is identified by the invoice and the running
    // total it brings the invoice to.
    await captureTransactionFee(tx.orm, {
      schemeId: invoice.schemeId,
      movement: "SUPPLIER_DISBURSEMENT",
      paymentCents: Math.round(paymentAmount * 100),
      sourceType: "SupplierInvoicePayment",
      sourceId: `${invoiceId}_${Math.round(newAmountPaid * 100)}`,
      actorId: details.actorId ?? null,
      date: details.paymentDate,
    });

    return updated;
  });
}

/**
 * Cancel a supplier invoice.
 */
export async function cancelInvoice(invoiceId: string) {
  try {
    return db.orm.public.SupplierInvoice
      .where({ id: invoiceId })
      .update({ status: "CANCELLED" });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Link a journal entry to a supplier invoice.
 */
export async function linkJournalEntry(
  invoiceId: string,
  journalEntryId: string,
) {
  return db.orm.public.SupplierInvoice
    .where({ id: invoiceId })
    .update({ journalEntryId });
}

/**
 * Fetch overdue supplier invoices for a scheme.
 * An invoice is overdue when its status is APPROVED or PARTIALLY_PAID
 * and its due date has passed.
 */
export async function getOverdueInvoices(schemeId: string, limit = 500) {
  try {
    const now = toTimestamp(new Date().toISOString());
    return db.orm.public.SupplierInvoice
      .where((si) =>
        and(
          si.schemeId.eq(schemeId),
          or(si.status.eq("APPROVED"), si.status.eq("PARTIALLY_PAID")),
          si.dueDate.lt(now),
        ),
      )
      .include("supplier")
      .orderBy((si) => si.dueDate.asc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch all invoices for a specific financial supplier.
 */
export async function getInvoicesBySupplierFinancial(
  supplierId: string,
  limit = 200,
) {
  return db.orm.public.SupplierInvoice
    .where((si) => si.supplierId.eq(supplierId))
    .include("fund")
    .include("accountCode")
    .orderBy((si) => si.invoiceDate.desc())
    .limit(limit)
    .all();
}
