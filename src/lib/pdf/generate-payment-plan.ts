/**
 * The written reply to a payment plan request as a PDF (server side),
 * rendered from the request, its plan and instalments, and the building's
 * rule pack. Not stored: it is rendered each time from the records.
 */
import { db } from "@/prisma/db";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { toCents } from "@/lib/billing/money";
import { formatLotLabel } from "@/lib/format";
import { paymentPlanRequestDetail } from "@/lib/debt-recovery/payment-plan-requests";
import { renderPaymentPlanReplyPdf } from "./payment-plan";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

export async function generatePaymentPlanReplyPdf(schemeId: string, requestId: string) {
  const detail = await paymentPlanRequestDetail(schemeId, requestId);
  if (!detail) return null;
  const { request: r, plan, instalments, lotNumber } = detail;
  if (r.status !== "APPROVED" && r.status !== "REFUSED") return null;
  const [{ rules }, scheme, lotDetail, today] = await Promise.all([
    rulesForScheme(schemeId),
    db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first(),
    db.orm.public.LotDetail.where((d) => d.lotId.eq(r.lotId)).first(),
    schemeToday(schemeId),
  ]);
  const pp = rules.PAYMENT_PLANS;
  const oc = rules.TERMINOLOGY.ownersCorporation;
  const bytes = await renderPaymentPlanReplyPdf({
    schemeName: String(scheme?.name ?? ""),
    planNumber: scheme?.planNumber ? String(scheme.planNumber) : null,
    ownersCorporation: oc,
    lotNumber: formatLotLabel(lotNumber),
    ownerNames: r.ownerNames,
    ownerAddress: lotDetail?.ownerAddress ? String(lotDetail.ownerAddress) : null,
    receivedOn: day(r.receivedOn),
    decision: r.status,
    meetingLabel: r.decisionBody === "OWNERS_CORPORATION" ? `General meeting of the ${oc}` : `Meeting of the ${rules.TERMINOLOGY.committee}`,
    meetingOn: day(r.decidedOn),
    interestWaiver: r.interestWaiver === "WAIVED" || r.interestWaiver === "NOT_WAIVED" ? r.interestWaiver : null,
    refusalReasons: r.refusalReasons ?? null,
    mediation: pp.mediation,
    extensionStatement: pp.extensionStatement,
    plan: plan
      ? {
          agreedOn: day(plan.agreedOn),
          leviesOwingCents: toCents(String(plan.leviesOwing ?? 0)),
          interestOwingCents: toCents(String(plan.interestOwing ?? 0)),
          interestMethod: String(plan.interestMethod ?? ""),
          totalCents: toCents(String(plan.totalAmount)),
          coversCurrentLevies: !!plan.coversCurrentLevies,
          paymentMethods: String(plan.paymentMethods ?? ""),
          contactDetails: String(plan.contactDetails ?? ""),
          paidToDateCents: instalments.reduce((s, i) => s + toCents(String(i.amountPaid ?? 0)), 0),
          instalments: instalments.map((i) => ({ number: i.instalmentNumber, dueOn: day(i.dueDate), amountCents: toCents(String(i.amount)), paidCents: toCents(String(i.amountPaid ?? 0)) })),
        }
      : null,
    preparedOn: today,
  });
  const safe = `${formatLotLabel(lotNumber)}-payment-plan-${r.status === "APPROVED" ? "statement" : "reply"}.pdf`.replace(/[^A-Za-z0-9._-]+/g, "-");
  return { bytes, fileName: safe, lotId: r.lotId };
}
