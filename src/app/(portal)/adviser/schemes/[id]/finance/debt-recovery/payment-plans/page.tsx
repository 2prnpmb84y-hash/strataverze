import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { paymentPlanOverview } from "@/lib/debt-recovery/payment-plan-requests";
import { daysToReply } from "@/lib/debt-recovery/payment-plans";
import { recordPaymentPlanRequestAction } from "@/lib/actions/payment-plans";
import { formatLotLabel } from "@/lib/format";
import { formatAud, toCents } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { PaymentPlanRequestForm } from "@/components/debt-recovery/payment-plan-forms";
import { needRule } from "@/config/statutory";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

const REQUEST_STATUS: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  RECEIVED: { label: "Awaiting decision", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REFUSED: { label: "Refused", variant: "danger" },
  WITHDRAWN: { label: "Withdrawn", variant: "default" },
};
const PLAN_STATUS: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  ACTIVE: { label: "Being followed", variant: "success" },
  DEFAULTED: { label: "Not followed", variant: "danger" },
  COMPLETED: { label: "Completed", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "default" },
  PROPOSED: { label: "Proposed", variant: "default" },
};

export default async function PaymentPlansPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();

  const [{ rules }, today, overview] = await Promise.all([rulesForScheme(id), schemeToday(id), paymentPlanOverview(id)]);
  if (!rules.FEATURES.statutoryPaymentPlans) notFound();
  const pp = needRule(rules, "PAYMENT_PLANS");
  const lots = [...overview.lotNumber.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "en-AU", { numeric: true }))
    .map(([lotId, n]) => ({ id: lotId, label: formatLotLabel(n) }));
  const base = `/adviser/schemes/${id}/finance/debt-recovery/payment-plans`;
  const waiting = overview.requests.filter((r) => r.status === "RECEIVED");
  const replyMissing = overview.requests.filter((r) => (r.status === "APPROVED" || r.status === "REFUSED") && !r.repliedOn);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Payment plans"
        description={`Requests on the standard form, decided by ${pp.decidedBy}. The written reply is due within ${pp.replyWithinDays} days of a complete request, and a plan can run for up to ${pp.maxMonths} months.`}
        backHref={`/adviser/schemes/${id}/finance/debt-recovery`}
        backLabel="Debt Recovery"
      />

      <Card>
        <CardHeader
          title="Requests"
          description={
            waiting.length || replyMissing.length
              ? `${waiting.length} awaiting a decision, ${replyMissing.length} decided without a reply date recorded.`
              : "Nothing is waiting."
          }
        />
        {overview.requests.length === 0 ? (
          <p className="text-sm text-ink-muted">No requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="py-2 pr-3">Lot</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Received</th>
                  <th className="py-2 pr-3">Reply due</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.requests.map((r) => {
                  const due = day(r.replyDueOn);
                  const left = daysToReply(due, today);
                  const open = r.status === "RECEIVED" || ((r.status === "APPROVED" || r.status === "REFUSED") && !r.repliedOn);
                  const s = REQUEST_STATUS[String(r.status)] ?? { label: String(r.status), variant: "default" as const };
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`${base}/${r.id}`} className="text-turquoise underline">
                          {formatLotLabel(overview.lotNumber.get(r.lotId) ?? "")}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{r.ownerNames}</td>
                      <td className="py-2 pr-3 tabular-nums">{day(r.receivedOn)}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {r.repliedOn ? `Replied ${day(r.repliedOn)}` : due}
                        {open && !r.repliedOn && (
                          <span className={`ml-2 text-xs ${left < 0 ? "text-red-600" : left <= 7 ? "text-amber-700" : "text-ink-muted"}`}>
                            {left < 0 ? `${-left} days overdue` : `${left} days left`}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusChip status={s.label} variant={s.variant} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Plans" description={`While a plan is being followed, the ${rules.TERMINOLOGY.ownersCorporation} cannot take recovery action for the levies it covers.`} />
        {overview.plans.length === 0 ? (
          <p className="text-sm text-ink-muted">No plans yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="py-2 pr-3">Lot</th>
                  <th className="py-2 pr-3">Covers</th>
                  <th className="py-2 pr-3">Instalments</th>
                  <th className="py-2 pr-3">Ends</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.plans.map((p) => {
                  const s = PLAN_STATUS[String(p.status)] ?? { label: String(p.status), variant: "default" as const };
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3">
                        {p.requestId ? (
                          <Link href={`${base}/${p.requestId}`} className="text-turquoise underline">
                            {formatLotLabel(overview.lotNumber.get(p.lotId) ?? "")}
                          </Link>
                        ) : (
                          formatLotLabel(overview.lotNumber.get(p.lotId) ?? "")
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{formatAud(toCents(String(p.totalAmount)))}</td>
                      <td className="py-2 pr-3">
                        {p.numberOfInstalments} {String(p.frequency).toLowerCase()}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{day(p.endDate)}</td>
                      <td className="py-2 pr-3">
                        <StatusChip status={s.label} variant={s.variant} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Record a request received" description="For a request that came by email, post or in person. Owners can also ask in the owner portal." />
        <PaymentPlanRequestForm
          action={recordPaymentPlanRequestAction.bind(null, id)}
          lots={lots}
          maxMonths={pp.maxMonths}
          formName={`${pp.requestForm}, prescribed under ${pp.requestFormSource}.`}
          today={today}
          ownersCorporation={rules.TERMINOLOGY.ownersCorporation}
        />
      </Card>
    </div>
  );
}
