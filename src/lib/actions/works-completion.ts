"use server";

/**
 * Works marketplace, stage 4 (25 Oct 2026): the contractor reports the work
 * done and invoices it; the committee or the Adviser confirms the work and
 * checks the invoice; a committee member (or the Adviser, where the building
 * allows it) sends it to the building's finance for payment approval.
 * Plan: https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF
 */
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { requireActiveContractorContact } from "@/lib/auth/require-contractor";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { logActivity } from "@/lib/queries/activity-log";
import { uploadErrorMessage } from "@/lib/storage/uploads";
import { logError } from "@/lib/log";
import { db } from "@/prisma/db";
import { getApprovalMembers, getPaymentSettings } from "@/lib/queries/payment-controls";
import { eligibleApprovers } from "@/lib/finance/payment-controls";
import { myContractorBusinessIds } from "@/lib/works/urgent-orders";
import { answerCompletion, checkCompletion, reportCompletion, returnInvoice, sendInvoiceToFinance, submitInvoice, sydneyToday, WorksCompletionError } from "@/lib/works/completion";
import { notifyCompletionAnswered, notifyCompletionReported, notifyInvoiceReturned, notifyInvoiceSubmitted, notifyInvoiceWithFinance } from "@/lib/works/notify";
import type { WorksFormState } from "./works-marketplace";

function revalidateWorks(schemeId: string, requestId?: string | null) {
  revalidatePath("/owner/works", "layout");
  revalidatePath(`/adviser/schemes/${schemeId}/works`, "layout");
  if (requestId) revalidatePath(`/owner/works/${requestId}`);
  revalidatePath("/supplier/work-orders", "layout");
  revalidatePath("/supplier/invoices");
}

function failure(err: unknown, fallback: string, uploadField = "document"): WorksFormState {
  if (err instanceof AuthorisationError || err instanceof WorksCompletionError) return { error: err.message };
  const upload = uploadErrorMessage(err);
  if (upload) return { fieldErrors: { [uploadField]: upload } };
  logError(`[works] ${fallback}`, err);
  return { error: fallback };
}

async function contractorName(businessId: string) {
  const b = await db.orm.public.ContractorBusiness.where((c) => c.id.eq(businessId)).first();
  return String(b?.tradingName || b?.companyName || "The contractor");
}

/** The signed-in contractor contact of an order's business, and their approved businesses. */
async function asOrderContractor(workOrderId: string) {
  const order = await db.orm.public.WorksWorkOrder.where((o) => o.id.eq(String(workOrderId))).first();
  if (!order || !order.requestId) throw new WorksCompletionError("Work order not found.");
  const { profile } = await requireActiveContractorContact(order.contractorBusinessId);
  const businessIds = await myContractorBusinessIds(profile.id);
  if (!businessIds.includes(order.contractorBusinessId)) throw new WorksCompletionError("Your business is not currently approved on StrataVerze.");
  return { order, profile, businessIds };
}

// ─── The contractor ────────────────────────────────────────────────────────

/** The contractor reports an accepted job done, with a note and photos. */
export async function reportCompletionAction(workOrderId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { order, profile, businessIds } = await asOrderContractor(workOrderId);
    const checked = checkCompletion(
      { summary: formData.get("summary"), completedOn: formData.get("completedOn"), photoUploadIds: formData.getAll("photoUploadId").map(String) },
      sydneyToday(),
    );
    if (!checked.ok) return { fieldErrors: checked.fieldErrors };
    const r = await reportCompletion({ workOrderId: order.id, businessIds, profileId: profile.id, completion: checked.value });
    await logActivity({ schemeId: r.schemeId, actorId: profile.id, action: "WORKS_COMPLETION_REPORTED", entityType: "WorksRequest", entityId: r.requestId, metadata: { workOrderNumber: r.workOrderNumber, photos: checked.value.photoUploadIds.length } });
    await notifyCompletionReported({ schemeId: r.schemeId, requestId: r.requestId, workOrderNumber: r.workOrderNumber, contractorName: await contractorName(r.contractorBusinessId) });
    revalidateWorks(r.schemeId, r.requestId);
    return { done: `Reported done. The building has been asked to confirm it.${r.photoProblem ? ` ${r.photoProblem}` : ""}` };
  } catch (err) {
    return failure(err, "The job could not be reported done. Please try again.", "photos");
  }
}

/** The contractor invoices a job they have reported done. */
export async function submitWorksInvoiceAction(workOrderId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { order, profile, businessIds } = await asOrderContractor(workOrderId);
    const r = await submitInvoice({
      workOrderId: order.id,
      businessIds,
      profileId: profile.id,
      raw: {
        invoiceNumber: formData.get("invoiceNumber"),
        invoiceDate: formData.get("invoiceDate"),
        dueDate: formData.get("dueDate"),
        total: formData.get("total"),
        gst: formData.get("gst"),
        excessReason: String(formData.get("excessReason") ?? "").slice(0, 3000),
        uploadId: formData.get("uploadId"),
      },
    });
    if (!r.ok) return { fieldErrors: r.fieldErrors };
    await logActivity({ schemeId: r.schemeId, actorId: profile.id, action: "WORKS_INVOICE_SUBMITTED", entityType: "WorksRequest", entityId: r.requestId, metadata: { workOrderNumber: r.workOrderNumber, invoiceId: r.invoiceId, total: r.total, overLimit: r.overLimit } });
    await notifyInvoiceSubmitted({ schemeId: r.schemeId, requestId: r.requestId, workOrderNumber: r.workOrderNumber, contractorName: await contractorName(r.contractorBusinessId), total: r.total, overLimit: r.overLimit, amountLimit: r.amountLimit });
    revalidateWorks(r.schemeId, r.requestId);
    return { done: r.overLimit ? "Invoice sent. It is more than the work order allowed, so the committee will decide on the extra before it can be paid." : "Invoice sent. The building will check it and send it for payment approval." };
  } catch (err) {
    return failure(err, "The invoice could not be sent. Please try again.");
  }
}

// ─── The committee and the Adviser ─────────────────────────────────────────

/** A committee member or the Adviser confirms the work is done, or sends it back. */
export async function answerCompletionAction(schemeId: string, workOrderId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    const accept = String(formData.get("answer") ?? "") === "CONFIRM";
    const r = await answerCompletion({ schemeId, workOrderId, actorId: profile.id, accept, comments: String(formData.get("comments") ?? "").slice(0, 2000) || null });
    await logActivity({ schemeId, actorId: profile.id, action: accept ? "WORKS_COMPLETION_CONFIRMED" : "WORKS_COMPLETION_SENT_BACK", entityType: "WorksRequest", entityId: r.requestId, metadata: { workOrderNumber: r.workOrderNumber, comments: r.comments } });
    await notifyCompletionAnswered({ schemeId, workOrderId, workOrderNumber: r.workOrderNumber, contractorBusinessId: r.contractorBusinessId, accepted: accept, comments: r.comments });
    revalidateWorks(schemeId, r.requestId);
    return { done: accept ? "Confirmed done. The contractor has been told." : "Sent back. The contractor has been told what still needs doing." };
  } catch (err) {
    return failure(err, "Your answer could not be recorded. Please try again.");
  }
}

/** A committee member or the Adviser sends an invoice back to the contractor. */
export async function returnWorksInvoiceAction(schemeId: string, invoiceId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    const r = await returnInvoice({ schemeId, invoiceId, reason: String(formData.get("reason") ?? "").slice(0, 2000) || null });
    const invoice = await db.orm.public.WorksInvoice.where((w) => w.id.eq(invoiceId)).first();
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_INVOICE_RETURNED", entityType: "WorksRequest", entityId: r.requestId ?? invoiceId, metadata: { invoiceId, invoiceNumber: r.invoiceNumber, reason: r.reason } });
    if (invoice?.workOrderId) await notifyInvoiceReturned({ schemeId, workOrderId: invoice.workOrderId, invoiceNumber: r.invoiceNumber, contractorBusinessId: r.contractorBusinessId, reason: r.reason! });
    revalidateWorks(schemeId, r.requestId);
    return { done: "Invoice sent back. The contractor has been told why and can send a corrected one." };
  } catch (err) {
    return failure(err, "The invoice could not be sent back. Please try again.");
  }
}

/**
 * Choose the fund and expense account and send the invoice for the
 * building's payment approvals. A committee member, or the Adviser where the
 * building allows it.
 */
export async function sendWorksInvoiceToFinanceAction(schemeId: string, invoiceId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile, roles } = await requireSchemeAccess(schemeId, "works.decide");
    // A payment step: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const fundId = String(formData.get("fundId") ?? "");
    const accountCodeId = String(formData.get("accountCodeId") ?? "");
    if (!fundId) return { fieldErrors: { fundId: "Choose the fund it is paid from." } };
    if (!accountCodeId) return { fieldErrors: { accountCodeId: "Choose an expense account." } };
    const r = await sendInvoiceToFinance({ schemeId, invoiceId, actor: { profileId: profile.id, roles }, fundId, accountCodeId });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_INVOICE_SENT_TO_FINANCE", entityType: "WorksRequest", entityId: r.requestId ?? invoiceId, metadata: { invoiceId, supplierInvoiceId: r.supplierInvoiceId, fund: r.fundName, account: r.accountName, total: r.total } });
    const invoice = await db.orm.public.WorksInvoice.where((w) => w.id.eq(invoiceId)).first();
    try {
      const [settings, members] = await Promise.all([getPaymentSettings(schemeId), getApprovalMembers(schemeId)]);
      await notifyInvoiceWithFinance({
        schemeId,
        workOrderId: String(invoice?.workOrderId ?? ""),
        invoiceNumber: r.invoiceNumber,
        contractorName: await contractorName(r.contractorBusinessId),
        contractorBusinessId: r.contractorBusinessId,
        total: r.total,
        preparedById: profile.id,
        approverIds: eligibleApprovers(members, settings.policy),
      });
    } catch (err) {
      logError("[works] with-finance emails not sent:", err);
    }
    revalidateWorks(schemeId, r.requestId);
    revalidatePath("/owner/finance/approvals");
    revalidatePath(`/adviser/schemes/${schemeId}/finance`, "layout");
    return { done: `Sent for payment approval from the ${r.fundName}, ${r.accountName}. You prepared it, so someone else approves it.` };
  } catch (err) {
    return failure(err, "The invoice could not be sent for payment. Please try again.");
  }
}
