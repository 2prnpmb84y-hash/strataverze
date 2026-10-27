import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { decisionDefaults, paymentPlanRequestDetail } from "@/lib/debt-recovery/payment-plan-requests";
import { daysToReply } from "@/lib/debt-recovery/payment-plans";
import { previewUsageFee } from "@/lib/billing/capture";
import {
  markPaymentPlanNotFollowedAction,
  recordPaymentPlanDecisionAction,
  recordPaymentPlanReplyAction,
  recordPlanInstalmentPaymentAction,
} from "@/lib/actions/payment-plans";
import { formatLotLabel } from "@/lib/format";
import { formatAud, toCents } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { PaymentPlanDecisionForm, SmallActionForm } from "@/components/debt-recovery/payment-plan-forms";
import { WithdrawRequestButton } from "./withdraw-button";
import { needRule } from "@/config/statutory";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const aud = (v: unknown) => formatAud(toCents(String(v ?? 0)));
const FREQ: Record<string, string> = { WEEKLY: "weekly", FORTNIGHTLY: "fortnightly", MONTHLY: "monthly" };
const BODY: Record<string, string> = { STRATA_COMMITTEE: "strata committee meeting", OWNERS_CORPORATION: "general meeting" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-1.5 border-b border-line last:border-0 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink text-right min-w-0">{value}</dd>
    </div>
  );
}

export default async function PaymentPlanRequestPage({ params }: { params: Promise<{ id: string; requestId: string }> }) {
  await connection();
  const { id, requestId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();
  const detail = await paymentPlanRequestDetail(id, requestId);
  if (!detail) notFound();
  const { request: r, plan, instalments, lotNumber } = detail;
  const { rules } = await rulesForScheme(id);
  if (!rules.FEATURES.statutoryPaymentPlans) notFound();
  const pp = needRule(rules, "PAYMENT_PLANS");
  const [defaults, fee] = await Promise.all([
    decisionDefaults(id, r.lotId, profile.id),
    previewUsageFee({ code: "RECOVERY_STEP", variant: "PAYMENT_PLAN" }),
  ]);
  const due = day(r.replyDueOn);
  const left = daysToReply(due, defaults.today);
  const decided = r.status === "APPROVED" || r.status === "REFUSED";
  const base = `/adviser/schemes/${id}/finance/debt-recovery/payment-plans`;
  const replyPdf = `/api/debt-recovery/payment-plan-reply/${r.id}?schemeId=${id}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={`Payment plan request: ${formatLotLabel(lotNumber)}`} description={`${r.ownerNames} · received ${day(r.receivedOn)}`} backHref={base} backLabel="Payment plans" />

      <Card>
        <CardHeader
          title="Request"
          description={r.source === "OWNER_PORTAL" ? "Sent by the owner in the owner portal." : "Recorded by the adviser from the standard form."}
          action={
            r.status === "RECEIVED" ? (
              <StatusChip status={left < 0 ? `Reply ${-left} days overdue` : `Reply due in ${left} days`} variant={left < 0 ? "danger" : left <= 7 ? "warning" : "default"} />
            ) : undefined
          }
        />
        <dl>
          <Row label="Owner" value={r.ownerNames} />
          <Row label="Statement of financial hardship" value={r.hardshipStatement ? "Given" : "Not given"} />
          <Row label="Current debt (as on the form)" value={r.currentDebt != null ? aud(r.currentDebt) : "Not stated"} />
          <Row
            label="Proposed"
            value={[r.proposedInstalment != null ? `${aud(r.proposedInstalment)} ${FREQ[String(r.proposedFrequency)] ?? ""}` : null, r.proposedMonths ? `over ${r.proposedMonths} months` : null].filter(Boolean).join(" ") || "Not stated"}
          />
          <Row label="Interest waiver asked for" value={r.interestWaiverRequested ? "Yes" : "No"} />
          <Row label="Written reply due by" value={due} />
          {r.notes && <Row label="Notes" value={r.notes} />}
          {r.caseId && (
            <Row
              label="Recovery case"
              value={
                <Link className="text-turquoise underline" href={`/adviser/schemes/${id}/finance/debt-recovery/${r.caseId}`}>
                  Open the case
                </Link>
              }
            />
          )}
        </dl>
      </Card>

      {r.status === "RECEIVED" && (
        <Card>
          <CardHeader title="Record the decision" />
          <PaymentPlanDecisionForm
            action={recordPaymentPlanDecisionAction.bind(null, id, r.id)}
            defaults={{
              today: defaults.today,
              leviesCents: defaults.leviesCents,
              interestCents: defaults.interestCents,
              interestMethod: defaults.interestMethod,
              paymentMethods: defaults.paymentMethods,
              contactDetails: defaults.contactDetails,
              maxMonths: pp.maxMonths,
              currentLeviesFrom: pp.currentLeviesFrom,
              decidedBy: pp.decidedBy,
              notDecidedBy: pp.notDecidedBy,
              refusalGrounds: pp.refusalGrounds,
            }}
            interestWaiverRequested={!!r.interestWaiverRequested}
            receivedOn={day(r.receivedOn)}
            fee={fee}
            feeScheduleHref={`/adviser/schemes/${id}/finance/platform-fees#fee-schedule`}
          />
          <div className="mt-4 border-t border-line pt-4">
            <WithdrawRequestButton schemeId={id} requestId={r.id} />
          </div>
        </Card>
      )}

      {decided && (
        <Card>
          <CardHeader
            title={r.status === "APPROVED" ? "Approved" : "Refused"}
            description={`At the ${BODY[String(r.decisionBody)] ?? "meeting"} of ${day(r.decidedOn)}.`}
            action={<StatusChip status={r.status === "APPROVED" ? "Approved" : "Refused"} variant={r.status === "APPROVED" ? "success" : "danger"} />}
          />
          <dl>
            {r.status === "REFUSED" && <Row label="Reasons" value={<span className="whitespace-pre-line">{r.refusalReasons}</span>} />}
            {r.interestWaiver && <Row label="Interest" value={r.interestWaiver === "WAIVED" ? "Waived" : "Not waived"} />}
            <Row label="Written reply given" value={r.repliedOn ? day(r.repliedOn) : `Not recorded (due by ${due})`} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={replyPdf} className="text-sm text-turquoise underline" target="_blank" rel="noreferrer">
              {r.status === "APPROVED" ? "Written reply with the payment plan statement (PDF)" : "Written reply with the reasons (PDF)"}
            </a>
          </div>
          {!r.repliedOn && (
            <div className="mt-4">
              <SmallActionForm
                action={recordPaymentPlanReplyAction.bind(null, id, r.id)}
                submitLabel="Record reply date"
                fields={[{ name: "repliedOn", label: "Date the written reply was given", type: "date", defaultValue: defaults.today, max: defaults.today }]}
              />
            </div>
          )}
          {r.status === "REFUSED" && <p className="mt-3 text-xs text-ink-muted">{pp.mediation}</p>}
        </Card>
      )}

      {plan && (
        <Card>
          <CardHeader
            title="Plan"
            description={`${aud(plan.totalAmount)} in ${plan.numberOfInstalments} ${FREQ[String(plan.frequency)] ?? ""} instalments, agreed ${day(plan.agreedOn)}${plan.coversCurrentLevies ? ", including current levies" : ""}.`}
            action={
              <StatusChip
                status={plan.status === "ACTIVE" ? "Being followed" : plan.status === "DEFAULTED" ? "Not followed" : plan.status === "COMPLETED" ? "Completed" : String(plan.status)}
                variant={plan.status === "ACTIVE" ? "success" : plan.status === "DEFAULTED" ? "danger" : "default"}
              />
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-right">Paid</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {instalments.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{i.instalmentNumber}</td>
                    <td className="py-2 pr-3 tabular-nums">{day(i.dueDate)}</td>
                    <td className="py-2 pr-3 tabular-nums text-right">{aud(i.amount)}</td>
                    <td className="py-2 pr-3 tabular-nums text-right">{aud(i.amountPaid)}</td>
                    <td className="py-2 pr-3">{i.status === "PAID" ? "Paid" : i.status === "PARTIALLY_PAID" ? "Part paid" : day(i.dueDate) < defaults.today ? "Overdue" : "Upcoming"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.status === "DEFAULTED" && <p className="mt-3 text-sm text-red-700">Marked as not followed: {plan.defaultReason}</p>}
          {(plan.status === "ACTIVE" || plan.status === "DEFAULTED") && instalments.some((i) => i.status !== "PAID") && (
            <div className="mt-4 border-t border-line pt-4 space-y-2">
              <p className="text-sm font-semibold text-ink">Record a payment</p>
              <SmallActionForm
                action={recordPlanInstalmentPaymentAction.bind(null, id, plan.id)}
                submitLabel="Record payment"
                hidden={{ instalmentId: String(instalments.find((i) => i.status !== "PAID")?.id ?? "") }}
                fields={[
                  { name: "amount", label: `Amount paid towards instalment ${instalments.find((i) => i.status !== "PAID")?.instalmentNumber ?? ""} ($)`, type: "money" },
                  { name: "paidOn", label: "Date paid", type: "date", defaultValue: defaults.today, max: defaults.today },
                ]}
              />
              <p className="text-xs text-ink-muted">This records the payment against the plan. Receipt the money to the levy notices in the ledger as usual.</p>
            </div>
          )}
          {plan.status === "ACTIVE" && (
            <div className="mt-4 border-t border-line pt-4 space-y-2">
              <p className="text-sm font-semibold text-ink">Plan not followed</p>
              <p className="text-xs text-ink-muted">Recovery steps from the notice before action onwards wait while the plan is being followed. Mark it as not followed only if the owner has not kept to it.</p>
              <SmallActionForm action={markPaymentPlanNotFollowedAction.bind(null, id, plan.id)} submitLabel="Mark as not followed" fields={[{ name: "reason", label: "How the plan was not followed", type: "textarea" }]} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
