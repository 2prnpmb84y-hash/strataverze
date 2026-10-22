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
import { supplierInvoiceControls, worksInvoiceControls } from "./invoice-approval";

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
  target: { supplierInvoiceId: string } | { worksInvoiceId: string },
  viewerId: string,
): Promise<InvoiceControlView | null> {
  const loaded =
    "supplierInvoiceId" in target ? await supplierInvoiceControls(target.supplierInvoiceId) : await worksInvoiceControls(target.worksInvoiceId);
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
    if (decision.result === "blocked") {
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
      threshold === 0 ? "Every invoice needs two approvers." : `Invoices over ${formatAud(threshold)} need two approvers.`,
    exception,
    approve: checkSegregation("APPROVE", viewerId, loaded.forControls, ctx),
    payment: checkSegregation("RECORD_PAYMENT", viewerId, loaded.forControls, ctx),
    bank,
    approverNames: eligible.map(name),
  };
}
