/**
 * Completion, invoice and payment for marketplace work orders (works
 * marketplace stage 4, 25 Oct 2026; plan:
 * https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF).
 *
 * 1. The contractor reports the work done, with a note and photos.
 * 2. A committee member or the Adviser confirms it, or sends it back.
 * 3. The contractor invoices against the work order, with their tax
 *    invoice. Over the order's not-to-exceed amount they give a reason, and
 *    the extra needs the committee's vote under the building's rule.
 * 4. Once the work is confirmed (and any extra agreed), a committee member,
 *    or the Adviser where the building allows it, chooses the fund and the
 *    expense account. That sends it to finance as a supplier invoice for the
 *    contractor: the building's payment approvals, ledger posting, supplier
 *    bank detail checks and payment by the Adviser then apply unchanged
 *    (finance-link.ts moves the works invoice on as that happens).
 *
 * Every change of state is one UPDATE with its whole filter, and unique
 * indexes allow one open completion report and one invoice in progress per
 * order, one finance supplier per contractor per building and one supplier
 * invoice per works invoice. Callers authorise first.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { schemeTimeZone, schemeToday } from "@/lib/jurisdiction/scheme-time";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { WORKS_PHOTOS_MAX } from "@/config/works";
import { consumeUpload, verifyUpload, type VerifiedUpload } from "@/lib/storage/uploads";
import { signDownloads } from "@/lib/storage/server-storage";
import { schemeStoragePathProblem, toStoragePath } from "@/lib/queries/document-url";
import { logError } from "@/lib/log";
import { getWorksSettings } from "./settings";
import { committeeMembers } from "./review";
import { reconcileWorksInvoice } from "./finance-link";
import { getApprovalMembers, getPaymentSettings } from "@/lib/queries/payment-controls";
import { checkBankDetailsForPayment, eligibleApprovers } from "@/lib/finance/payment-controls";

const ts = (v: string) => v as unknown as TimestampString<3>;
const vc = <N extends number>(v: string) => v as unknown as Varchar<N>;
const money = (v: number) => v.toFixed(2) as unknown as Numeric<12, 2>;
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const DAY = 86_400_000;

export class WorksCompletionError extends Error {}

/** Thrown inside a transaction to undo it; never reaches the caller. */
class Undo extends Error {}

function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")} ${String((err as { code?: unknown }).code ?? "")}` : String(err);
  return /23505|unique|duplicate key/i.test(text);
}


function isDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const dateOnly = (v: string) => ts(`${v}T00:00:00.000Z`);
const addDays = (v: string, n: number) => new Date(Date.parse(`${v}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// ─── Statuses in plain words ───────────────────────────────────────────────

/** Invoice statuses that block another invoice for the same order. Matches works_invoices_one_live_per_order_idx. */
export const ENDED_INVOICE_STATUSES = ["RETURNED", "CANCELLED"] as const;

export function invoiceStatusLabel(status: string): string {
  switch (status) {
    case "SUBMITTED":
      return "Submitted: the building is checking it";
    case "RETURNED":
      return "Sent back";
    case "WITH_FINANCE":
      return "Waiting for payment approval";
    case "APPROVED":
      return "Approved for payment";
    case "PARTIALLY_PAID":
      return "Part paid";
    case "PAID":
      return "Paid";
    case "CANCELLED":
      return "Cancelled by the building";
    default:
      return status;
  }
}

export function completionStatusLabel(status: string): string {
  switch (status) {
    case "SUBMITTED":
      return "Reported done: waiting for the building to confirm";
    case "ACCEPTED":
      return "Confirmed done";
    case "REJECTED":
      return "Sent back";
    default:
      return status;
  }
}

// ─── Conflicts of interest ─────────────────────────────────────────────────

/** Whether this person is an active contact of the contractor business (so has an interest in its job). */
export async function isContactOf(profileId: string, contractorBusinessId: string): Promise<boolean> {
  return !!(await db.orm.public.ContractorContact.where((c) => and(c.profileId.eq(profileId), c.contractorBusinessId.eq(contractorBusinessId), c.status.eq("ACTIVE"))).first());
}

const CONFLICT = "You are a contact of the contractor doing this job, so someone else on the committee must do this.";

/**
 * What earlier invoices on the order have already been paid. With one live
 * invoice per order this is normally nil; it keeps the work order's amount a
 * cap across every invoice if one is replaced after a payment.
 */
async function paidOnOrderBefore(orderId: string, exceptInvoiceId: string | null): Promise<number> {
  const rows = await db.orm.public.WorksInvoice.where((w) => w.workOrderId.eq(orderId)).limit(100).all();
  return rows.filter((r) => r.id !== exceptInvoiceId).reduce((sum, r) => sum + cents(r.paidAmount), 0) / 100;
}

// ─── 1. The contractor reports the work done ───────────────────────────────

export interface CompletionInput {
  summary: string;
  completedOn: string;
  photoUploadIds: string[];
}

/** Check a completion report (pure). */
export function checkCompletion(raw: { summary?: unknown; completedOn?: unknown; photoUploadIds?: unknown }, today: string): { ok: true; value: CompletionInput } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const summary = String(raw.summary ?? "").trim();
  if (!summary) fieldErrors.summary = "Say what was done, so the building can check it.";
  else if (summary.length > 5000) fieldErrors.summary = "Keep it under 5,000 characters.";
  const completedOn = String(raw.completedOn ?? "").trim();
  if (!isDate(completedOn)) fieldErrors.completedOn = "Give the date the work was finished.";
  else if (completedOn > today) fieldErrors.completedOn = "The date cannot be in the future.";
  const photoUploadIds = Array.isArray(raw.photoUploadIds) ? raw.photoUploadIds.map(String).filter(Boolean) : [];
  if (photoUploadIds.length > WORKS_PHOTOS_MAX) fieldErrors.photos = `Add up to ${WORKS_PHOTOS_MAX} photos.`;
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: { summary, completedOn, photoUploadIds } };
}

async function myOrder(workOrderId: string, businessIds: string[]) {
  if (!businessIds.length) return null;
  return db.orm.public.WorksWorkOrder.where((o) => and(o.id.eq(workOrderId), o.contractorBusinessId.in(businessIds), o.requestId.isNotNull())).first();
}

/**
 * The contractor reports an accepted order done. Photos are checked before
 * anything is saved; a photo that then cannot be attached does not undo the
 * report (the contractor is told).
 */
export async function reportCompletion(input: { workOrderId: string; businessIds: string[]; profileId: string; completion: CompletionInput }) {
  const order = await myOrder(input.workOrderId, input.businessIds);
  if (!order || !order.requestId) throw new WorksCompletionError("Work order not found.");
  if (String(order.status) !== "AUTHORISED") {
    throw new WorksCompletionError(String(order.status) === "COMPLETION_REVIEW" ? "You have already reported this job done. The building is checking it." : "This job cannot be reported done now.");
  }
  const photos: VerifiedUpload[] = [];
  for (const id of input.completion.photoUploadIds) photos.push(await verifyUpload({ uploadId: id, schemeId: order.schemeId, purpose: "works_completion", profileId: input.profileId }));

  let submissionId: string;
  try {
    submissionId = await db.transaction(async (tx) => {
      const moved = await tx.orm.public.WorksWorkOrder
        .where((o) => and(o.id.eq(order.id), o.contractorBusinessId.eq(order.contractorBusinessId), o.status.eq("AUTHORISED")))
        .updateAndCount({ status: "COMPLETION_REVIEW", actualEnd: dateOnly(input.completion.completedOn) });
      if (moved !== 1) throw new Undo("moved on");
      const s = await tx.orm.public.WorksCompletionSubmission.create({
        workOrderId: order.id,
        submittedById: input.profileId,
        submissionType: "PRACTICAL_COMPLETION",
        summary: input.completion.summary,
        status: "SUBMITTED",
      });
      return s.id;
    });
  } catch (err) {
    if (err instanceof Undo || isUniqueViolation(err)) throw new WorksCompletionError("This job has just been reported done, or the building has changed it. Reload the page.");
    throw err;
  }

  let failed = 0;
  for (const p of photos) {
    try {
      await consumeUpload(
        p.uploadId,
        () =>
          db.orm.public.WorksDocument.create({
            schemeId: order.schemeId,
            requestId: order.requestId,
            documentType: "COMPLETION",
            title: vc<300>(`Completion photo, ${String(order.workOrderNumber)}`),
            fileName: vc<500>(p.fileName.slice(0, 500)),
            fileUrl: p.path,
            fileSize: p.size,
            mimeType: vc<100>(p.mimeType),
            uploadedById: input.profileId,
            accessLevel: "RESTRICTED",
          }),
        (d) => `WorksDocument:${d.id}`,
      );
    } catch (err) {
      failed++;
      logError("[works] completion photo not attached:", err);
    }
  }
  return {
    schemeId: order.schemeId,
    requestId: order.requestId,
    workOrderNumber: String(order.workOrderNumber),
    contractorBusinessId: order.contractorBusinessId,
    submissionId,
    photoProblem: failed ? `${failed} photo${failed === 1 ? " was" : "s were"} not attached. You can tell the building, or add them to your invoice.` : null,
  };
}

// ─── 2. The building confirms it, or sends it back ─────────────────────────

/**
 * A committee member or the Adviser confirms a reported job done (the
 * request moves to close out), or sends it back with a reason (the
 * contractor can report it again). Callers authorise first (works.decide).
 */
export async function answerCompletion(input: { schemeId: string; workOrderId: string; actorId: string; accept: boolean; comments: string | null }) {
  const order = await db.orm.public.WorksWorkOrder.where((o) => and(o.id.eq(input.workOrderId), o.schemeId.eq(input.schemeId), o.requestId.isNotNull())).first();
  if (!order || !order.requestId) throw new WorksCompletionError("Work order not found.");
  const submission = await db.orm.public.WorksCompletionSubmission.where((s) => and(s.workOrderId.eq(order.id), s.status.eq("SUBMITTED"))).first();
  if (!submission || String(order.status) !== "COMPLETION_REVIEW") throw new WorksCompletionError("This job is not waiting to be confirmed.");
  if (await isContactOf(input.actorId, order.contractorBusinessId)) throw new WorksCompletionError(CONFLICT);
  const comments = input.comments?.trim() || null;
  if (!input.accept && !comments) throw new WorksCompletionError("Say what still needs doing. The contractor is told.");
  const now = ts(new Date().toISOString());
  try {
    await db.transaction(async (tx) => {
      const answered = await tx.orm.public.WorksCompletionSubmission
        .where((s) => and(s.id.eq(submission.id), s.status.eq("SUBMITTED")))
        .updateAndCount({ status: input.accept ? "ACCEPTED" : "REJECTED", reviewedById: input.actorId, reviewedAt: now, reviewComments: comments });
      if (answered !== 1) throw new Undo("answered");
      const moved = await tx.orm.public.WorksWorkOrder
        .where((o) => and(o.id.eq(order.id), o.schemeId.eq(input.schemeId), o.status.eq("COMPLETION_REVIEW")))
        .updateAndCount(input.accept ? { status: "COMPLETE" } : { status: "AUTHORISED", actualEnd: null });
      if (moved !== 1) throw new Undo("answered");
      if (input.accept) {
        const request = await tx.orm.public.WorksRequest.where((r) => and(r.id.eq(order.requestId!), r.status.eq("DELIVERY"))).updateAndCount({ status: "CLOSE_OUT" });
        if (request !== 1) throw new Undo("answered");
      }
    });
  } catch (err) {
    if (err instanceof Undo) throw new WorksCompletionError("Someone has just answered this, or the request has changed. Reload the page.");
    throw err;
  }
  return { requestId: order.requestId, workOrderNumber: String(order.workOrderNumber), contractorBusinessId: order.contractorBusinessId, accepted: input.accept, comments };
}

// ─── 3. The contractor's invoice ───────────────────────────────────────────

export interface InvoiceInput {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  gst: number;
  excessReason: string | null;
  uploadId: string;
}

/** Dollars from a form field, or null when blank or not a number. */
function dollars(value: unknown): number | null {
  const v = String(value ?? "").replace(/[$,\s]/g, "");
  if (!v || !/^\d{1,9}(\.\d{1,2})?$/.test(v)) return null;
  return Number(v);
}

/**
 * Check an invoice (pure). GST is at most a tenth of the price before GST
 * (one eleventh of the total), and must be nil when the business is not
 * registered for GST.
 */
export function checkInvoice(
  raw: { invoiceNumber?: unknown; invoiceDate?: unknown; dueDate?: unknown; total?: unknown; gst?: unknown; excessReason?: unknown; uploadId?: unknown },
  ctx: { today: string; amountLimit: number | null; gstRegistered: boolean },
): { ok: true; value: InvoiceInput; overLimit: boolean } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const invoiceNumber = String(raw.invoiceNumber ?? "").trim();
  if (!invoiceNumber) fieldErrors.invoiceNumber = "Give your invoice number.";
  else if (invoiceNumber.length > 50) fieldErrors.invoiceNumber = "Keep the invoice number to 50 characters.";
  const invoiceDate = String(raw.invoiceDate ?? "").trim();
  if (!isDate(invoiceDate)) fieldErrors.invoiceDate = "Give the invoice date.";
  else if (invoiceDate > ctx.today) fieldErrors.invoiceDate = "The invoice date cannot be in the future.";
  const dueRaw = String(raw.dueDate ?? "").trim();
  let dueDate: string | null = null;
  if (dueRaw) {
    if (!isDate(dueRaw)) fieldErrors.dueDate = "Give a real date, or leave it blank.";
    else if (isDate(invoiceDate) && dueRaw < invoiceDate) fieldErrors.dueDate = "The due date cannot be before the invoice date.";
    else dueDate = dueRaw;
  }
  const total = dollars(raw.total);
  if (total == null || total <= 0) fieldErrors.total = "Give the invoice total in dollars, including any GST.";
  const gstText = String(raw.gst ?? "").trim();
  const gst = gstText ? dollars(gstText) : 0;
  if (gst == null) fieldErrors.gst = "Give the GST in dollars, or 0.";
  else if (!ctx.gstRegistered && gst > 0) fieldErrors.gst = "Your business is not registered for GST on StrataVerze, so the invoice cannot include GST. Update your business details first if it is.";
  else if (total != null && gst != null && Math.round(gst * 100) * 11 > Math.round(total * 100) + 11) fieldErrors.gst = "GST cannot be more than one eleventh of the total.";
  const overLimit = total != null && ctx.amountLimit != null && Math.round(total * 100) > Math.round(ctx.amountLimit * 100);
  const excessReason = String(raw.excessReason ?? "").trim() || null;
  if (overLimit && !excessReason) fieldErrors.excessReason = "The invoice is more than the work order allows. Say why, so the committee can decide whether to agree the extra.";
  else if (excessReason && excessReason.length > 2000) fieldErrors.excessReason = "Keep it under 2,000 characters.";
  const uploadId = String(raw.uploadId ?? "").trim();
  if (!uploadId) fieldErrors.document = "Attach your tax invoice (PDF or a photo of it).";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, overLimit, value: { invoiceNumber, invoiceDate, dueDate, total: total!, gst: gst!, excessReason: overLimit ? excessReason : null, uploadId } };
}

/** The contractor invoices a job they have reported done. */
export async function submitInvoice(input: { workOrderId: string; businessIds: string[]; profileId: string; raw: Parameters<typeof checkInvoice>[0]; now?: Date }) {
  const order = await myOrder(input.workOrderId, input.businessIds);
  if (!order || !order.requestId) throw new WorksCompletionError("Work order not found.");
  if (!["COMPLETION_REVIEW", "COMPLETE"].includes(String(order.status))) throw new WorksCompletionError("Report the job done before invoicing it.");
  const business = await db.orm.public.ContractorBusiness.where((c) => c.id.eq(order.contractorBusinessId)).first();
  const fullLimit = order.amountLimit != null ? Number(order.amountLimit) : null;
  // What is left of the work order's amount after anything already paid on it.
  const amountLimit = fullLimit == null ? null : Math.max(0, fullLimit - (await paidOnOrderBefore(order.id, null)));
  // The invoice's dates are checked against today in the building's time zone.
  const buildingToday = await schemeToday(order.schemeId, input.now ?? new Date());
  const checked = checkInvoice(input.raw, { today: buildingToday, amountLimit, gstRegistered: !!business?.gstRegistered });
  if (!checked.ok) return checked;
  const v = checked.value;
  // The same invoice number from this contractor for this building, still in progress or paid.
  const same = await db.orm.public.WorksInvoice
    .where((w) => and(w.schemeId.eq(order.schemeId), w.contractorBusinessId.eq(order.contractorBusinessId), w.invoiceNumber.eq(vc<50>(v.invoiceNumber)), w.status.notIn([...ENDED_INVOICE_STATUSES])))
    .first();
  if (same) return { ok: false as const, fieldErrors: { invoiceNumber: "You have already sent this building an invoice with this number." } };
  const upload = await verifyUpload({ uploadId: v.uploadId, schemeId: order.schemeId, purpose: "works_invoice", profileId: input.profileId });
  const today = buildingToday;
  let created;
  try {
    created = await consumeUpload(
      upload.uploadId,
      () =>
        db.orm.public.WorksInvoice.create({
          requestId: order.requestId,
          workOrderId: order.id,
          schemeId: order.schemeId,
          contractorBusinessId: order.contractorBusinessId,
          submittedById: input.profileId,
          invoiceNumber: vc<50>(v.invoiceNumber),
          invoiceDate: dateOnly(v.invoiceDate),
          dateReceived: dateOnly(today),
          dueDate: dateOnly(v.dueDate ?? addDays(v.invoiceDate, 30)),
          claimedAmount: money(v.total),
          gstAmount: money(v.gst),
          status: "SUBMITTED",
          excessReason: v.excessReason,
          documentPath: upload.path,
          documentName: vc<500>(upload.fileName.slice(0, 500)),
        }),
      (w) => `WorksInvoice:${w.id}`,
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new WorksCompletionError("There is already an invoice in progress for this job. Reload the page.");
    throw err;
  }
  return {
    ok: true as const,
    invoiceId: created.id,
    schemeId: order.schemeId,
    requestId: order.requestId,
    workOrderNumber: String(order.workOrderNumber),
    contractorBusinessId: order.contractorBusinessId,
    total: v.total,
    overLimit: checked.overLimit,
    amountLimit,
  };
}

/**
 * A committee member or the Adviser sends a submitted invoice back with a
 * reason; the contractor can then send a corrected one. Any open vote on
 * its extra cost is withdrawn with it. Callers authorise first (works.decide).
 */
export async function returnInvoice(input: { schemeId: string; invoiceId: string; reason: string | null }) {
  const reason = input.reason?.trim() || null;
  if (!reason) throw new WorksCompletionError("Say what is wrong with the invoice. The contractor is told.");
  const invoice = await db.orm.public.WorksInvoice.where((w) => and(w.id.eq(input.invoiceId), w.schemeId.eq(input.schemeId), w.workOrderId.isNotNull())).first();
  if (!invoice) throw new WorksCompletionError("Invoice not found.");
  const now = ts(new Date().toISOString());
  const done = await db.transaction(async (tx) => {
    const n = await tx.orm.public.WorksInvoice.where((w) => and(w.id.eq(invoice.id), w.status.eq("SUBMITTED"))).updateAndCount({ status: "RETURNED", returnReason: reason });
    if (n !== 1) return false;
    await tx.orm.public.WorksDecision.where((d) => and(d.invoiceId.eq(invoice.id), d.status.eq("OPEN"))).updateAndCount({ status: "WITHDRAWN", decidedAt: now });
    return true;
  });
  if (!done) throw new WorksCompletionError("Only an invoice the building is still checking can be sent back. Once it is with finance, the Adviser can cancel it there.");
  return { requestId: invoice.requestId, invoiceNumber: String(invoice.invoiceNumber), contractorBusinessId: invoice.contractorBusinessId, reason };
}

// ─── Extra cost over the work order ────────────────────────────────────────

/** Whether an invoice is over its order's amount, and whether the committee has agreed the extra. */
export async function variationState(invoice: { id: string; workOrderId: string | null; claimedAmount: unknown }) {
  const order = invoice.workOrderId ? await db.orm.public.WorksWorkOrder.where((o) => o.id.eq(invoice.workOrderId!)).first() : null;
  const fullLimit = order?.amountLimit != null ? Number(order.amountLimit) : null;
  const limit = fullLimit == null || !order ? null : Math.max(0, fullLimit - (await paidOnOrderBefore(order.id, invoice.id)));
  const overLimit = limit != null && cents(invoice.claimedAmount) > cents(limit);
  const decisions = await db.orm.public.WorksDecision.where((d) => and(d.invoiceId.eq(invoice.id), d.kind.eq("VARIATION"))).limit(20).all();
  const agreed = decisions.some((d) => d.status === "DECIDED" && cents(d.amount) === cents(invoice.claimedAmount));
  const open = decisions.find((d) => d.status === "OPEN") ?? null;
  return { overLimit, limit, agreed, openDecisionId: open?.id ?? null, notAgreed: !agreed && decisions.some((d) => d.status === "NOT_AGREED") };
}

// ─── 4. Sending it to finance ──────────────────────────────────────────────

export type Actor = { profileId: string; roles: readonly string[] };

/** Whether this person may choose the fund and account for the building's works invoices. */
export async function mayCodeInvoices(schemeId: string, actor: Actor): Promise<boolean> {
  if ((await committeeMembers(schemeId)).includes(actor.profileId)) return true;
  return actor.roles.includes("ADVISER") && (await getWorksSettings(schemeId)).adviserMayCodeInvoices;
}

/** The building's funds, and the expense accounts that can be used with each. */
export async function codingChoices(schemeId: string) {
  const [funds, accounts] = await Promise.all([
    db.orm.public.Fund.where((f) => and(f.schemeId.eq(schemeId), f.isActive.eq(true), f.deletedAt.isNull())).limit(50).all(),
    db.orm.public.AccountCode.where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true), a.accountType.eq("EXPENSE"))).limit(500).all(),
  ]);
  return {
    funds: funds.map((f) => ({ id: f.id, name: String(f.name), fundType: String(f.fundType) })),
    accounts: accounts
      .map((a) => ({ id: a.id, code: String(a.code), name: String(a.name), fundId: a.fundId ?? null }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

/** The contractor's bank details as they stand now (their latest version not replaced or rejected). */
async function latestContractorBank(contractorBusinessId: string, orm = db.orm) {
  const versions = await orm.public.WorksBankDetailVersion
    .where((b) => and(b.contractorBusinessId.eq(contractorBusinessId), b.status.notIn(["SUPERSEDED", "REJECTED"])))
    .limit(50)
    .all();
  return versions.sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))[0] ?? null;
}

const normBank = (v: unknown) => String(v ?? "").replace(/[\s-]/g, "").toUpperCase();

/**
 * Bring a contractor supplier's bank details up to the contractor's latest,
 * recording the change for the building to verify (by someone else, and a
 * second check within the cooling-off period, counted from now). The
 * supplier row is locked first and the contractor's details read after, so
 * a change the contractor makes at the same moment is never overwritten by
 * an older one (their own save locks the same row: contractor-onboarding.ts).
 */
export async function syncContractorSupplierBank(supplierId: string, contractorBusinessId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const locked = await tx.orm.public.Supplier.where((x) => x.id.eq(supplierId)).updateAndCount({ contractorBusinessId });
    if (locked !== 1) return;
    const supplier = await tx.orm.public.Supplier.where((x) => x.id.eq(supplierId)).first();
    const bank = await latestContractorBank(contractorBusinessId, tx.orm);
    if (!supplier || !bank) return;
    const same = normBank(supplier.bankBsb) === normBank(bank.bsb) && normBank(supplier.bankAccountNumber) === normBank(bank.accountNumber) && normBank(supplier.bankAccountName) === normBank(bank.accountName);
    if (same) return;
    await tx.orm.public.Supplier.where((x) => x.id.eq(supplierId)).updateAndCount({
      bankBsb: vc<7>(String(bank.bsb)),
      bankAccountNumber: vc<20>(String(bank.accountNumber)),
      bankAccountName: vc<200>(String(bank.accountName)),
    });
    await tx.orm.public.SupplierBankDetailVersion.create({
      supplierId,
      schemeId: supplier.schemeId ?? null,
      previousBsb: supplier.bankBsb ? vc<7>(String(supplier.bankBsb)) : null,
      previousAccountNumber: supplier.bankAccountNumber ? vc<20>(String(supplier.bankAccountNumber)) : null,
      previousAccountName: supplier.bankAccountName ? vc<200>(String(supplier.bankAccountName)) : null,
      newBsb: vc<7>(String(bank.bsb)),
      newAccountNumber: vc<20>(String(bank.accountNumber)),
      newAccountName: vc<200>(String(bank.accountName)),
      changedBy: bank.updatedById,
      status: "PENDING",
    });
  });
}

/**
 * The building's finance supplier for a contractor. An existing supplier of
 * the building with the same ABN (one the Adviser entered by hand) is
 * adopted, so the contractor is never two suppliers and duplicate invoice
 * checks see both paths. Otherwise one is made from the contractor's
 * business details. Either way the GST registration is brought up to date
 * and the contractor's latest bank details are recorded as a change for the
 * building to verify before any payment.
 */
export async function contractorSupplier(schemeId: string, contractorBusinessId: string): Promise<string> {
  const business = await db.orm.public.ContractorBusiness.where((c) => c.id.eq(contractorBusinessId)).first();
  if (!business) throw new WorksCompletionError("Contractor not found.");
  let supplierId: string | null = (await db.orm.public.Supplier.where((s) => and(s.schemeId.eq(schemeId), s.contractorBusinessId.eq(contractorBusinessId))).first())?.id ?? null;
  if (!supplierId && business.abn) {
    const sameAbn = await db.orm.public.Supplier.where((s) => and(s.schemeId.eq(schemeId), s.abn.eq(vc<11>(String(business.abn))), s.contractorBusinessId.isNull())).first();
    if (sameAbn) {
      try {
        const n = await db.orm.public.Supplier.where((s) => and(s.id.eq(sameAbn.id), s.contractorBusinessId.isNull())).updateAndCount({ contractorBusinessId });
        if (n === 1) supplierId = sameAbn.id;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }
  if (!supplierId) {
    const contact = await db.orm.public.ContractorContact.where((c) => and(c.contractorBusinessId.eq(contractorBusinessId), c.status.eq("ACTIVE"), c.isPrimary.eq(true))).first();
    try {
      const created = await db.orm.public.Supplier.create({
        schemeId,
        contractorBusinessId,
        companyName: vc<200>(String(business.companyName).slice(0, 200)),
        tradingName: business.tradingName ? vc<200>(String(business.tradingName).slice(0, 200)) : null,
        abn: business.abn ? vc<11>(String(business.abn)) : null,
        contactName: contact ? vc<200>(`${String(contact.firstName)} ${String(contact.lastName)}`.trim().slice(0, 200)) : null,
        email: business.email ? vc<320>(String(business.email)) : null,
        phone: business.phone ? vc<20>(String(business.phone)) : null,
        bankBsb: null,
        bankAccountNumber: null,
        bankAccountName: null,
        paymentTerms: 30,
        gstRegistered: !!business.gstRegistered,
        isActive: true,
      });
      supplierId = created.id;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Made at the same moment by someone else: use that one.
      supplierId = (await db.orm.public.Supplier.where((s) => and(s.schemeId.eq(schemeId), s.contractorBusinessId.eq(contractorBusinessId))).first())?.id ?? null;
      if (!supplierId) throw err;
    }
  }
  const id = supplierId;
  // The contractor may have registered for GST since the supplier was made.
  await db.orm.public.Supplier.where((s) => s.id.eq(id)).updateAndCount({ gstRegistered: !!business.gstRegistered });
  await syncContractorSupplierBank(id, contractorBusinessId);
  return id;
}

/**
 * Choose the fund and expense account and send the invoice to finance as a
 * supplier invoice waiting for approval. Whoever does this prepared it, so
 * under the payment controls they cannot also approve it.
 */
export async function sendInvoiceToFinance(input: { schemeId: string; invoiceId: string; actor: Actor; fundId: string; accountCodeId: string }) {
  if (!(await mayCodeInvoices(input.schemeId, input.actor))) {
    throw new WorksCompletionError("A committee member chooses the fund and account for works invoices. The building has not asked the Adviser to.");
  }
  const invoice = await db.orm.public.WorksInvoice.where((w) => and(w.id.eq(input.invoiceId), w.schemeId.eq(input.schemeId), w.workOrderId.isNotNull())).first();
  if (!invoice || !invoice.workOrderId) throw new WorksCompletionError("Invoice not found.");
  if (String(invoice.status) !== "SUBMITTED") throw new WorksCompletionError("This invoice is not waiting to be sent to finance.");
  const order = await db.orm.public.WorksWorkOrder.where((o) => and(o.id.eq(invoice.workOrderId!), o.schemeId.eq(input.schemeId))).first();
  if (!order || String(order.status) !== "COMPLETE") throw new WorksCompletionError("Confirm the work is done before sending the invoice for payment.");
  const variation = await variationState(invoice);
  if (variation.overLimit && !variation.agreed) {
    throw new WorksCompletionError("The invoice is more than the work order allows. The committee must agree the extra first, or send the invoice back.");
  }
  const [fund, account] = await Promise.all([
    db.orm.public.Fund.where((f) => and(f.id.eq(input.fundId), f.schemeId.eq(input.schemeId), f.isActive.eq(true), f.deletedAt.isNull())).first(),
    db.orm.public.AccountCode.where((a) => and(a.id.eq(input.accountCodeId), a.schemeId.eq(input.schemeId), a.isActive.eq(true), a.accountType.eq("EXPENSE"))).first(),
  ]);
  if (!fund) throw new WorksCompletionError("Choose the fund it is paid from.");
  if (!account) throw new WorksCompletionError("Choose an expense account.");
  if (account.fundId && account.fundId !== fund.id) throw new WorksCompletionError("That expense account belongs to the other fund. Choose an account for the fund it is paid from.");

  if (await isContactOf(input.actor.profileId, invoice.contractorBusinessId)) throw new WorksCompletionError(CONFLICT);
  const supplierId = await contractorSupplier(input.schemeId, invoice.contractorBusinessId);
  const supplier = await db.orm.public.Supplier.where((x) => x.id.eq(supplierId)).first();
  if (!supplier?.isActive) throw new WorksCompletionError("This contractor is marked inactive in the building's suppliers. The Adviser can make them active again under Finance.");
  // The same invoice already entered in finance (by hand, or through another works invoice).
  const sameAbn = supplier.abn ? await db.orm.public.Supplier.where((x) => and(x.schemeId.eq(input.schemeId), x.abn.eq(supplier.abn!))).limit(50).all() : [];
  const supplierIds = [...new Set([supplierId, ...sameAbn.map((x) => x.id)])];
  const duplicate = await db.orm.public.SupplierInvoice
    .where((i) => and(i.schemeId.eq(input.schemeId), i.supplierId.in(supplierIds), i.invoiceNumber.eq(vc<50>(String(invoice.invoiceNumber))), i.status.neq("CANCELLED")))
    .first();
  if (duplicate?.worksInvoiceId === invoice.id) throw new WorksCompletionError("Someone has just sent this invoice on. Reload the page.");
  if (duplicate) {
    throw new WorksCompletionError(`Invoice ${String(invoice.invoiceNumber)} from this contractor is already in the building's finance (${String(duplicate.status).toLowerCase().replace(/_/g, " ")}). Send this one back, or ask the Adviser to cancel the other.`);
  }
  const request = invoice.requestId ? await db.orm.public.WorksRequest.where((r) => r.id.eq(invoice.requestId!)).first() : null;
  const description = `Works ${request ? `request ${String(request.requestNumber)}, ${String(request.title)}` : "invoice"} (work order ${String(order.workOrderNumber)})`.slice(0, 500);
  const total = Number(invoice.claimedAmount);
  const gst = Number(invoice.gstAmount ?? 0);
  let supplierInvoiceId: string;
  try {
    supplierInvoiceId = await db.transaction(async (tx) => {
      const moved = await tx.orm.public.WorksInvoice
        .where((w) => and(w.id.eq(invoice.id), w.schemeId.eq(input.schemeId), w.status.eq("SUBMITTED"), w.claimedAmount.eq(money(total))))
        .updateAndCount({ status: "WITH_FINANCE", codedById: input.actor.profileId });
      if (moved !== 1) throw new Undo("moved on");
      // The work must still be confirmed done.
      const stillDone = await tx.orm.public.WorksWorkOrder.where((o) => and(o.id.eq(order.id), o.status.eq("COMPLETE"))).updateAndCount({ status: "COMPLETE" });
      if (stillDone !== 1) throw new Undo("moved on");
      const si = await tx.orm.public.SupplierInvoice.create({
        schemeId: input.schemeId,
        supplierId,
        invoiceNumber: vc<50>(String(invoice.invoiceNumber)),
        invoiceDate: ts(new Date(String(invoice.invoiceDate)).toISOString()),
        dueDate: ts(new Date(String(invoice.dueDate)).toISOString()),
        subtotal: money(total - gst),
        gstAmount: money(gst),
        totalAmount: money(total),
        amountPaid: money(0),
        balanceOutstanding: money(total),
        fundId: fund.id,
        accountCodeId: account.id,
        description: vc<500>(description),
        status: "AWAITING_APPROVAL",
        preparedById: input.actor.profileId,
        worksInvoiceId: invoice.id,
      });
      return si.id;
    });
  } catch (err) {
    if (err instanceof Undo || isUniqueViolation(err)) throw new WorksCompletionError("Someone has just sent this invoice on, or it has changed. Reload the page.");
    throw err;
  }
  return {
    supplierInvoiceId,
    requestId: invoice.requestId,
    invoiceNumber: String(invoice.invoiceNumber),
    total,
    fundName: String(fund.name),
    accountName: `${String(account.code)} ${String(account.name)}`,
    contractorBusinessId: invoice.contractorBusinessId,
  };
}

// ─── What each side sees ───────────────────────────────────────────────────

async function signed(schemeId: string, paths: Array<string | null>): Promise<Array<string | null>> {
  const usable = paths.map((p) => (p && !schemeStoragePathProblem(schemeId, p) ? p : null));
  const want = usable.filter((p): p is string => !!p);
  if (!want.length) return usable.map(() => null);
  const links = await signDownloads(want, 15 * 60);
  let i = 0;
  return usable.map((p) => (p ? links[i++] ?? null : null));
}

async function completionPhotos(schemeId: string, requestId: string) {
  const docs = await db.orm.public.WorksDocument.where((d) => and(d.requestId.eq(requestId), d.schemeId.eq(schemeId), d.documentType.eq("COMPLETION"), d.deletedAt.isNull())).limit(50).all();
  const paths = docs.map((d) => toStoragePath(String(d.fileUrl)));
  const links = await signed(schemeId, paths);
  return docs.flatMap((d, i) => (links[i] ? [{ id: d.id, url: links[i]!, fileName: String(d.fileName) }] : []));
}

/** The order that is going ahead for a request (accepted, reported done or confirmed done). */
async function workingOrder(schemeId: string, requestId: string) {
  return db.orm.public.WorksWorkOrder
    .where((o) => and(o.schemeId.eq(schemeId), o.requestId.eq(requestId), o.status.in(["AUTHORISED", "COMPLETION_REVIEW", "COMPLETE"])))
    .first();
}

/** Catch up any of the order's invoices that are with finance (see reconcileWorksInvoice). */
async function reconcileOrderInvoices(orderId: string) {
  const rows = await db.orm.public.WorksInvoice.where((w) => and(w.workOrderId.eq(orderId), w.status.in(["WITH_FINANCE", "APPROVED", "PARTIALLY_PAID"]))).limit(50).all();
  for (const r of rows) {
    try {
      await reconcileWorksInvoice(r.id);
    } catch (err) {
      logError("[works] works invoice not reconciled:", err);
    }
  }
}

async function invoiceRows(orderId: string, schemeId: string) {
  await reconcileOrderInvoices(orderId);
  const rows = await db.orm.public.WorksInvoice.where((w) => w.workOrderId.eq(orderId)).limit(50).all();
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const links = await signed(schemeId, rows.map((r) => (r.documentPath ? String(r.documentPath) : null)));
  return rows.map((r, i) => ({ row: r, documentUrl: links[i] }));
}

/** Everything the committee and the Adviser see about finishing and paying for a request's work. */
export async function closeOutForCommittee(schemeId: string, requestId: string, viewer: Actor) {
  const order = await workingOrder(schemeId, requestId);
  if (!order) return null;
  const [business, submissions, invoices, photos, members, maySend, conflicted, settings, payment, approvalMembers] = await Promise.all([
    db.orm.public.ContractorBusiness.where((c) => c.id.eq(order.contractorBusinessId)).first(),
    db.orm.public.WorksCompletionSubmission.where((s) => s.workOrderId.eq(order.id)).limit(50).all(),
    invoiceRows(order.id, schemeId),
    completionPhotos(schemeId, requestId),
    committeeMembers(schemeId),
    mayCodeInvoices(schemeId, viewer),
    isContactOf(viewer.profileId, order.contractorBusinessId),
    getWorksSettings(schemeId),
    getPaymentSettings(schemeId),
    getApprovalMembers(schemeId),
  ]);
  submissions.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const latest = submissions[0] ?? null;
  const isMember = members.includes(viewer.profileId);
  const isAdviser = viewer.roles.includes("ADVISER");
  // A contact of the contractor has an interest in the job, so takes no part in signing it off.
  const decides = (isMember || isAdviser) && !conflicted;
  const amountLimit = order.amountLimit != null ? Number(order.amountLimit) : null;

  const invoiceViews = await Promise.all(
    invoices.map(async ({ row, documentUrl }) => {
      const variation = await variationState(row);
      const si = await db.orm.public.SupplierInvoice.where((s) => s.worksInvoiceId.eq(row.id)).first();
      const bank = si ? await bankState(si.supplierId, payment.coolingOffDays, await schemeTimeZone(schemeId)) : null;
      const status = String(row.status);
      return {
        id: row.id,
        invoiceNumber: String(row.invoiceNumber),
        invoiceDate: String(row.invoiceDate).slice(0, 10),
        dueDate: String(row.dueDate).slice(0, 10),
        total: Number(row.claimedAmount),
        gst: Number(row.gstAmount ?? 0),
        paid: Number(row.paidAmount ?? 0),
        status,
        statusLabel: invoiceStatusLabel(status),
        excessReason: row.excessReason ? String(row.excessReason) : null,
        returnReason: row.returnReason ? String(row.returnReason) : null,
        documentUrl,
        documentName: row.documentName ? String(row.documentName) : null,
        variation,
        supplierInvoiceId: si?.id ?? null,
        supplierId: si?.supplierId ?? null,
        bank,
      };
    }),
  );
  const live = invoiceViews.find((i) => !(ENDED_INVOICE_STATUSES as readonly string[]).includes(i.status)) ?? null;
  const needsChoices = !!live && live.status === "SUBMITTED" && maySend && !conflicted && String(order.status) === "COMPLETE";
  // Proposing the extra: a committee member, or the Adviser under the delegation and within its limit.
  const mayProposeExtra =
    !conflicted && !!live && (isMember || (isAdviser && settings.adviserMayDecide && (settings.adviserLimit == null || live.total <= settings.adviserLimit)));
  // Whoever sends it prepares it, so cannot approve it. Is anyone else able to?
  const contacts = await db.orm.public.ContractorContact.where((c) => and(c.contractorBusinessId.eq(order.contractorBusinessId), c.status.eq("ACTIVE"))).limit(100).all();
  const otherApprovers = eligibleApprovers(approvalMembers, payment.policy).filter((id) => id !== viewer.profileId && !contacts.some((c) => c.profileId === id));
  const approvalWarning = needsChoices && otherApprovers.length === 0
    ? "Nobody other than you can approve payments for this building, and whoever sends an invoice cannot approve it. Ask the committee to flag another treasurer or payment authoriser first, or let someone else send it."
    : null;
  return {
    order: {
      id: order.id,
      workOrderNumber: String(order.workOrderNumber),
      status: String(order.status),
      contractorName: String(business?.tradingName || business?.companyName || "The contractor"),
      amountLimit,
      completedOn: order.actualEnd ? String(order.actualEnd).slice(0, 10) : null,
    },
    completion: latest
      ? {
          id: latest.id,
          status: String(latest.status),
          statusLabel: completionStatusLabel(String(latest.status)),
          summary: String(latest.summary ?? ""),
          submittedAt: String(latest.submittedAt),
          reviewComments: latest.reviewComments ? String(latest.reviewComments) : null,
        }
      : null,
    earlierReports: submissions.slice(1).map((s) => ({ id: s.id, status: String(s.status), statusLabel: completionStatusLabel(String(s.status)), summary: String(s.summary ?? ""), reviewComments: s.reviewComments ? String(s.reviewComments) : null, submittedAt: String(s.submittedAt) })),
    photos,
    invoices: invoiceViews,
    live,
    can: {
      answerCompletion: decides && String(order.status) === "COMPLETION_REVIEW" && latest?.status === "SUBMITTED",
      returnInvoice: decides && live?.status === "SUBMITTED",
      proposeVariation: !!live && live.status === "SUBMITTED" && live.variation.overLimit && !live.variation.agreed && !live.variation.openDecisionId && mayProposeExtra,
      sendToFinance: needsChoices && (!live!.variation.overLimit || live!.variation.agreed),
      maySend,
      conflicted,
    },
    approvalWarning,
    choices: needsChoices ? await codingChoices(schemeId) : null,
  };
}

/** Where the contractor's bank details stand with the building, for the committee's view. */
async function bankState(supplierId: string, coolingOffDays: number, timeZone: string) {
  const versions = await db.orm.public.SupplierBankDetailVersion.where((v) => v.supplierId.eq(supplierId)).limit(100).all();
  const latest = versions.sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)))[0] ?? null;
  if (!latest) return { status: "NONE" as const, label: "The contractor has not given bank details yet." };
  if (latest.status === "PENDING") return { status: "PENDING" as const, label: "The contractor's bank details need verifying before payment." };
  if (latest.status === "REJECTED") return { status: "REJECTED" as const, label: "The contractor's bank details were rejected." };
  const check = checkBankDetailsForPayment(
    { status: "VERIFIED", changedById: latest.changedBy, changedAt: new Date(String(latest.changedAt)).toISOString(), verifiedById: latest.verifiedBy ?? null, verifiedAt: latest.verifiedAt ? String(latest.verifiedAt) : null, verificationMethod: null, secondVerifiedById: latest.secondVerifiedBy ?? null },
    new Date().toISOString(),
    coolingOffDays,
    timeZone,
  );
  if (check.result === "blocked") return { status: "PENDING" as const, label: "Bank details verified once. They changed recently, so a second person must also verify them before payment." };
  return { status: "VERIFIED" as const, label: latest.secondVerifiedBy ? "Bank details verified twice." : "Bank details verified." };
}

/** The contractor's view of finishing and invoicing an order. */
export async function closeOutForContractor(workOrderId: string, businessIds: string[]) {
  const order = await myOrder(workOrderId, businessIds);
  if (!order || !order.requestId) return null;
  if (!["AUTHORISED", "COMPLETION_REVIEW", "COMPLETE"].includes(String(order.status))) return null;
  await reconcileOrderInvoices(order.id);
  const [submissions, invoices, business] = await Promise.all([
    db.orm.public.WorksCompletionSubmission.where((s) => s.workOrderId.eq(order.id)).limit(50).all(),
    db.orm.public.WorksInvoice.where((w) => w.workOrderId.eq(order.id)).limit(50).all(),
    db.orm.public.ContractorBusiness.where((c) => c.id.eq(order.contractorBusinessId)).first(),
  ]);
  submissions.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  invoices.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const latest = submissions[0] ?? null;
  const live = invoices.find((i) => !(ENDED_INVOICE_STATUSES as readonly string[]).includes(String(i.status))) ?? null;
  const bank = await db.orm.public.WorksBankDetailVersion.where((b) => and(b.contractorBusinessId.eq(order.contractorBusinessId), b.status.notIn(["SUPERSEDED", "REJECTED"]))).first();
  return {
    status: String(order.status),
    amountLimit: order.amountLimit != null ? Number(order.amountLimit) : null,
    gstRegistered: !!business?.gstRegistered,
    hasBankDetails: !!bank,
    schemeId: order.schemeId,
    completion: latest ? { status: String(latest.status), statusLabel: completionStatusLabel(String(latest.status)), summary: String(latest.summary ?? ""), reviewComments: latest.reviewComments ? String(latest.reviewComments) : null, submittedAt: String(latest.submittedAt) } : null,
    invoices: invoices.map((w) => ({
      id: w.id,
      invoiceNumber: String(w.invoiceNumber),
      invoiceDate: String(w.invoiceDate).slice(0, 10),
      total: Number(w.claimedAmount),
      paid: Number(w.paidAmount ?? 0),
      status: String(w.status),
      statusLabel: invoiceStatusLabel(String(w.status)),
      returnReason: w.returnReason ? String(w.returnReason) : null,
      excessReason: w.excessReason ? String(w.excessReason) : null,
    })),
    canReport: String(order.status) === "AUTHORISED",
    canInvoice: ["COMPLETION_REVIEW", "COMPLETE"].includes(String(order.status)) && !live,
  };
}

/** Every marketplace invoice of these businesses, newest first (supplier portal). */
export async function invoicesForContractor(businessIds: string[]) {
  if (!businessIds.length) return [];
  const rows = await db.orm.public.WorksInvoice.where((w) => and(w.contractorBusinessId.in(businessIds), w.workOrderId.isNotNull())).limit(500).all();
  if (!rows.length) return [];
  const [schemes, orders] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.in([...new Set(rows.map((r) => r.schemeId))])).limit(500).all(),
    db.orm.public.WorksWorkOrder.where((o) => o.id.in([...new Set(rows.map((r) => r.workOrderId!))])).limit(500).all(),
  ]);
  return rows
    .map((w) => {
      const s = schemes.find((x) => x.id === w.schemeId);
      const o = orders.find((x) => x.id === w.workOrderId);
      return {
        id: w.id,
        workOrderId: w.workOrderId!,
        workOrderNumber: o ? String(o.workOrderNumber) : "",
        invoiceNumber: String(w.invoiceNumber),
        building: s ? String(s.name) : "",
        total: Number(w.claimedAmount),
        paid: Number(w.paidAmount ?? 0),
        status: String(w.status),
        statusLabel: invoiceStatusLabel(String(w.status)),
        createdAt: String(w.createdAt),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
