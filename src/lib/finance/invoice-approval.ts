/**
 * Approving invoices for payment (server side). Every approval goes through
 * the scheme payment policy and segregation of duties: the preparer never
 * approves, nobody approves twice, and amounts above the policy limit need two
 * different approvers. The invoice only becomes APPROVED (and is posted to the
 * ledger) once the approvals it needs are in.
 */
import { db } from "@/prisma/db";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";
import { toCents } from "@/lib/billing/money";
import { approveInvoice, getSupplierInvoiceById } from "@/lib/queries/supplier-invoices";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { createJournalEntry, getNextEntryNumber, postJournalEntry } from "@/lib/queries/journal-entries";
import { logActivity } from "@/lib/queries/activity-log";
import {
  getApprovalMembers,
  getAuthorisations,
  getPaymentSettings,
  hashIp,
} from "@/lib/queries/payment-controls";
import {
  approvalComplete,
  approversRequired,
  checkSegregation,
  eligibleApprovers,
  isEligibleApprover,
  type ControlDecision,
  type InvoiceForControls,
} from "./payment-controls";
import { accountFundProblem } from "./fund-integrity";

export class PaymentControlError extends Error {}

/**
 * Why this person may not approve a payment to this supplier because they
 * are a contact of the marketplace contractor it is (works stage 4), or null.
 */
export async function contractorConflict(supplierId: string, actorId: string): Promise<string | null> {
  const supplier = await db.orm.public.Supplier.where((s) => s.id.eq(supplierId)).first();
  if (!supplier?.contractorBusinessId) return null;
  const contact = await db.orm.public.ContractorContact
    .where((c) => and(c.profileId.eq(actorId), c.contractorBusinessId.eq(supplier.contractorBusinessId!), c.status.eq("ACTIVE")))
    .first();
  return contact ? "You are a contact of this contractor, so someone else must approve the payment." : null;
}

export interface ApprovalOutcome {
  complete: boolean;
  approvals: number;
  required: number;
  exception: string | null;
}

/** The control view of a supplier invoice, with approvals so far. */
export async function supplierInvoiceControls(invoiceId: string) {
  const invoice = await getSupplierInvoiceById(invoiceId);
  if (!invoice) return null;
  const auths = await getAuthorisations({ supplierInvoiceId: invoiceId });
  const forControls: InvoiceForControls = {
    amountCents: toCents(String(invoice.totalAmount)),
    status: String(invoice.status),
    preparedById: invoice.preparedById ?? null,
    authorisedBy: auths.map((a) => a.approverId),
  };
  return { invoice, auths, forControls };
}

/** Check an action against the scheme's controls without changing anything. */
export async function checkInvoiceControl(
  schemeId: string,
  action: "APPROVE" | "RECORD_PAYMENT",
  actorId: string,
  forControls: InvoiceForControls,
): Promise<ControlDecision> {
  const settings = await getPaymentSettings(schemeId);
  const members = await getApprovalMembers(schemeId);
  return checkSegregation(action, actorId, forControls, {
    policy: settings.policy,
    eligibleApproverIds: eligibleApprovers(members, settings.policy),
  });
}

/**
 * Record one approval of a supplier invoice. Throws PaymentControlError when
 * the controls block it. Posts the invoice to the ledger once fully approved.
 */
export async function authoriseSupplierInvoice(input: {
  schemeId: string;
  invoiceId: string;
  actorId: string;
  ip?: string | null;
}): Promise<ApprovalOutcome> {
  const loaded = await supplierInvoiceControls(input.invoiceId);
  if (!loaded || loaded.invoice.schemeId !== input.schemeId) throw new PaymentControlError("Invoice not found.");
  const { forControls } = loaded;

  const settings = await getPaymentSettings(input.schemeId);
  const members = await getApprovalMembers(input.schemeId);
  const eligible = eligibleApprovers(members, settings.policy);
  const decision = checkSegregation("APPROVE", input.actorId, forControls, { policy: settings.policy, eligibleApproverIds: eligible });
  if (decision.result === "blocked") throw new PaymentControlError(decision.reason);
  const conflict = await contractorConflict(loaded.invoice.supplierId, input.actorId);
  if (conflict) throw new PaymentControlError(conflict);
  // The approval posts the expense to the invoice's fund: refuse now, before
  // any approval is recorded, if the account belongs to the other fund
  // (financials review B1). Invoices saved before this check could hold one.
  if (loaded.invoice.accountCodeId) {
    const fundProblem = await accountFundProblem(db.orm, input.schemeId, loaded.invoice.accountCodeId, loaded.invoice.fundId);
    if (fundProblem) throw new PaymentControlError(`${fundProblem} Cancel this invoice and enter it again with an account of the invoice's fund.`);
  }

  const asMember = members.find((m) => m.profileId === input.actorId && isEligibleApprover(m, settings.policy));
  const role = asMember ? (asMember.role === "COMMITTEE" ? "TREASURER" : asMember.role) : "UNKNOWN";
  const exception = decision.result === "exception" ? decision.reason : null;
  const sequence = forControls.authorisedBy.length + 1;
  const approvals = sequence;
  const required = exception ? 1 : approversRequired(settings.policy, forControls.amountCents);
  const complete = approvalComplete(settings.policy, forControls.amountCents, approvals, exception != null);

  await db.transaction(async (tx) => {
    await tx.orm.public.PaymentAuthorisation.create({
      schemeId: input.schemeId,
      supplierInvoiceId: input.invoiceId,
      worksInvoiceId: null,
      ownerCreditRefundId: null,
      approverId: input.actorId,
      role,
      ipHash: hashIp(input.ip),
      sequence,
      isException: exception != null,
      exceptionReason: exception,
    });
    if (!complete && forControls.status === "DRAFT") {
      await tx.orm.public.SupplierInvoice.where((i) => i.id.eq(input.invoiceId)).update({ status: "AWAITING_APPROVAL" });
    }
  });

  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "SUPPLIER_INVOICE_AUTHORISED",
    entityType: "SupplierInvoice",
    entityId: input.invoiceId,
    metadata: { sequence, required, complete },
  });
  if (exception) {
    await logActivity({
      schemeId: input.schemeId,
      actorId: input.actorId,
      action: "PAYMENT_CONTROL_EXCEPTION",
      entityType: "SupplierInvoice",
      entityId: input.invoiceId,
      metadata: { control: "SINGLE_APPROVER", reason: exception },
    });
  }

  if (complete) await finaliseSupplierInvoiceApproval(input.schemeId, input.invoiceId, input.actorId);
  return { complete, approvals, required, exception };
}

/** Mark the invoice APPROVED and post DR expense (and GST paid), CR accounts payable. */
async function finaliseSupplierInvoiceApproval(schemeId: string, invoiceId: string, actorId: string) {
  await approveInvoice(invoiceId, actorId);

  const invoice = await getSupplierInvoiceById(invoiceId);
  if (invoice && Number(invoice.totalAmount) > 0) {
    const totalAmount = Number(invoice.totalAmount);
    const gstAmount = Number(invoice.gstAmount ?? 0);
    const netAmount = totalAmount - gstAmount;
    const payableAccount = await getSystemAccountBySubType(schemeId, "ACCOUNTS_PAYABLE");

    if (payableAccount && invoice.accountCodeId) {
      const entryNumber = await getNextEntryNumber(schemeId);
      const today = await schemeToday(schemeId);
      const lines: Array<{
        accountCodeId: string;
        fundId: string;
        debit?: number;
        credit?: number;
        description?: string;
        supplierId?: string;
      }> = [
        {
          accountCodeId: invoice.accountCodeId,
          fundId: invoice.fundId,
          debit: netAmount,
          description: `Expense — invoice ${String(invoice.invoiceNumber)}`,
          supplierId: invoice.supplierId,
        },
      ];
      if (gstAmount > 0) {
        const gstPaidAccount = await getSystemAccountBySubType(schemeId, "GST_PAID");
        if (gstPaidAccount) {
          lines.push({
            accountCodeId: gstPaidAccount.id,
            fundId: invoice.fundId,
            debit: gstAmount,
            description: "GST on supplier invoice",
          });
        } else {
          // No GST account seeded: debit the full amount to the expense.
          lines[0].debit = totalAmount;
        }
      }
      lines.push({
        accountCodeId: payableAccount.id,
        fundId: invoice.fundId,
        credit: totalAmount,
        description: `Accounts payable — invoice ${String(invoice.invoiceNumber)}`,
        supplierId: invoice.supplierId,
      });
      const entry = await createJournalEntry({
        schemeId,
        entryNumber,
        transactionDate: today,
        description: `Invoice approved — ${String(invoice.invoiceNumber)} (${invoice.supplier?.companyName ?? "supplier"})`,
        entryType: "AUTO",
        sourceType: "INVOICE",
        sourceId: invoiceId,
        createdBy: actorId,
        lines,
      });
      await postJournalEntry(entry.id, actorId);
    }
  }

  await logActivity({
    schemeId,
    actorId,
    action: "SUPPLIER_INVOICE_APPROVED",
    entityType: "SupplierInvoice",
    entityId: invoiceId,
    metadata: {},
  });
}

/** Invoices in a scheme waiting for approval, for the approvals list. */
export async function getInvoicesAwaitingApproval(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];
  return db.orm.public.SupplierInvoice
    .where((i) => and(i.schemeId.in(schemeIds), i.status.in(["DRAFT", "AWAITING_APPROVAL"])))
    .include("supplier")
    .orderBy((i) => i.dueDate.asc())
    .limit(500)
    .all();
}

// ─── Works invoices ─────────────────────────────────────────────────────────

/** The control view of a works invoice. The assessor is its preparer. */
export async function worksInvoiceControls(worksInvoiceId: string) {
  const invoice = await db.orm.public.WorksInvoice.where((i) => i.id.eq(worksInvoiceId)).first();
  if (!invoice) return null;
  const auths = await getAuthorisations({ worksInvoiceId });
  const amount = invoice.assessedAmount ?? invoice.claimedAmount;
  const forControls: InvoiceForControls = {
    amountCents: toCents(String(amount)),
    status: invoice.status,
    preparedById: invoice.assessedById ?? null,
    authorisedBy: auths.map((a) => a.approverId),
  };
  return { invoice, auths, forControls };
}

/** Record one approval of an assessed works invoice; APPROVED once complete. */
export async function authoriseWorksInvoice(input: {
  schemeId: string;
  worksInvoiceId: string;
  actorId: string;
  ip?: string | null;
}): Promise<ApprovalOutcome> {
  const loaded = await worksInvoiceControls(input.worksInvoiceId);
  if (!loaded || loaded.invoice.schemeId !== input.schemeId) throw new PaymentControlError("Invoice not found.");
  // A marketplace invoice is approved as the supplier invoice it became (works stage 4).
  if (loaded.invoice.workOrderId) throw new PaymentControlError("This invoice is approved under Payment approvals as a supplier invoice.");
  if (loaded.invoice.status !== "AWAITING_AUTHORISATION") {
    throw new PaymentControlError("This works invoice must be assessed before it can be approved.");
  }
  const { forControls } = loaded;
  const settings = await getPaymentSettings(input.schemeId);
  const members = await getApprovalMembers(input.schemeId);
  const eligible = eligibleApprovers(members, settings.policy);
  const decision = checkSegregation("APPROVE", input.actorId, forControls, { policy: settings.policy, eligibleApproverIds: eligible });
  if (decision.result === "blocked") throw new PaymentControlError(decision.reason);

  const asMember = members.find((m) => m.profileId === input.actorId && isEligibleApprover(m, settings.policy));
  const role = asMember ? (asMember.role === "COMMITTEE" ? "TREASURER" : asMember.role) : "UNKNOWN";
  const exception = decision.result === "exception" ? decision.reason : null;
  const sequence = forControls.authorisedBy.length + 1;
  const required = exception ? 1 : approversRequired(settings.policy, forControls.amountCents);
  const complete = approvalComplete(settings.policy, forControls.amountCents, sequence, exception != null);

  await db.transaction(async (tx) => {
    await tx.orm.public.PaymentAuthorisation.create({
      schemeId: input.schemeId,
      supplierInvoiceId: null,
      worksInvoiceId: input.worksInvoiceId,
      ownerCreditRefundId: null,
      approverId: input.actorId,
      role,
      ipHash: hashIp(input.ip),
      sequence,
      isException: exception != null,
      exceptionReason: exception,
    });
    if (complete) {
      await tx.orm.public.WorksInvoice.where((i) => i.id.eq(input.worksInvoiceId)).update({ status: "APPROVED" });
    }
  });

  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "WORKS_INVOICE_AUTHORISED",
    entityType: "WorksInvoice",
    entityId: input.worksInvoiceId,
    metadata: { sequence, required, complete },
  });
  if (exception) {
    await logActivity({
      schemeId: input.schemeId,
      actorId: input.actorId,
      action: "PAYMENT_CONTROL_EXCEPTION",
      entityType: "WorksInvoice",
      entityId: input.worksInvoiceId,
      metadata: { control: "SINGLE_APPROVER", reason: exception },
    });
  }
  return { complete, approvals: sequence, required, exception };
}

/** Works invoices assessed and waiting for approval. */
export async function getWorksInvoicesAwaitingApproval(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];
  return db.orm.public.WorksInvoice
    .where((i) => and(i.schemeId.in(schemeIds), i.status.eq("AWAITING_AUTHORISATION")))
    .limit(500)
    .all();
}
