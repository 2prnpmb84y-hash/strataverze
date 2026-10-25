/**
 * What an invoice screen shows about payment controls (server side):
 * approvals so far, what is still needed, whether the viewer can approve or
 * record payment, and the supplier's bank detail status.
 */
import { formatAud } from "@/lib/billing/money";
import { getApprovalMembers, getLatestBankDetailVersion, getPaymentSettings } from "@/lib/queries/payment-controls";
import {
  approversRequired,
  checkBankDetailsForPayment,
  checkSegregation,
  eligibleApprovers,
  secondApproverThresholdCents,
  type ControlDecision,
} from "./payment-controls";
import { contractorConflict, supplierInvoiceControls, worksInvoiceControls } from "./invoice-approval";
import { db } from "@/prisma/db";
import { refundControls } from "./owner-credits";

async function refundAsInvoice(refundId: string) {
  const r = await refundControls(refundId);
  return r ? { invoice: r.refund, auths: r.auths, forControls: r.forControls } : null;
}

const METHOD_LABELS: Record<string, string> = {
  CALLBACK: "a call back to a known number",
  SUPPLIER_PORTAL_CONFIRMED: "confirmation in the supplier portal",
  DOCUMENT: "a document from the supplier",
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });

export interface InvoiceControlView {
  approvals: { name: string; role: string; approvedAt: string; isException: boolean }[];
  required: number;
  thresholdText: string;
  exception: string | null;
  approve: ControlDecision;
  payment: ControlDecision;
  bank: { message: string | null; blocked: boolean };
  approverNames: string[];
}

export async function getInvoiceControlView(
  schemeId: string,
  target: { supplierInvoiceId: string } | { worksInvoiceId: string } | { ownerCreditRefundId: string },
  viewerId: string,
): Promise<InvoiceControlView | null> {
  const loaded =
    "supplierInvoiceId" in target
      ? await supplierInvoiceControls(target.supplierInvoiceId)
      : "worksInvoiceId" in target
        ? await worksInvoiceControls(target.worksInvoiceId)
        : await refundAsInvoice(target.ownerCreditRefundId);
  if (!loaded || loaded.invoice.schemeId !== schemeId) return null;
  const [settings, members] = await Promise.all([getPaymentSettings(schemeId), getApprovalMembers(schemeId)]);
  const eligible = eligibleApprovers(members, settings.policy);
  const ctx = { policy: settings.policy, eligibleApproverIds: eligible };
  const name = (id: string) => members.find((m) => m.profileId === id)?.name ?? "Former member";

  const exception = loaded.auths.find((a) => a.isException)?.exceptionReason ?? null;
  const required = exception ? 1 : approversRequired(settings.policy, loaded.forControls.amountCents);
  const threshold = secondApproverThresholdCents(settings.policy);

  let bank: InvoiceControlView["bank"] = { message: null, blocked: false };
  if ("supplierInvoiceId" in target) {
    const supplierId = (loaded.invoice as { supplierId: string }).supplierId;
    const latest = await getLatestBankDetailVersion(supplierId);
    const decision = checkBankDetailsForPayment(latest, new Date().toISOString(), settings.coolingOffDays);
    const contractor = !latest ? (await db.orm.public.Supplier.where((s) => s.id.eq(supplierId)).first())?.contractorBusinessId : null;
    if (contractor) {
      // A marketplace contractor is paid only to bank details they gave (works stage 4).
      bank = { message: "The contractor has not given bank details yet, so this cannot be paid until they do and someone verifies them.", blocked: true };
    } else if (decision.result === "blocked") {
      bank = { message: decision.reason, blocked: true };
    } else if (latest?.verifiedById && latest.verifiedAt) {
      bank = {
        message: `Bank details changed on ${day(latest.changedAt)}, verified by ${name(latest.verifiedById)} via ${
          METHOD_LABELS[latest.verificationMethod ?? ""] ?? "an unrecorded method"
        }${latest.secondVerifiedById ? ` and again by ${name(latest.secondVerifiedById)}` : ""}.`,
        blocked: false,
      };
    }
  }

  return {
    approvals: loaded.auths.map((a) => ({ name: name(a.approverId), role: a.role, approvedAt: a.approvedAt, isException: a.isException })),
    required,
    thresholdText:
      threshold === 0 ? "Every payment needs two approvers." : `Payments over ${formatAud(threshold)} need two approvers.`,
    exception,
    approve: await (async () => {
      const sod = checkSegregation("APPROVE", viewerId, loaded.forControls, ctx);
      if (sod.result === "blocked" || !("supplierInvoiceId" in target)) return sod;
      const conflict = await contractorConflict((loaded.invoice as { supplierId: string }).supplierId, viewerId);
      return conflict ? ({ result: "blocked", reason: conflict } as const) : sod;
    })(),
    payment: checkSegregation("RECORD_PAYMENT", viewerId, loaded.forControls, ctx),
    bank,
    approverNames: eligible.map(name),
  };
}
