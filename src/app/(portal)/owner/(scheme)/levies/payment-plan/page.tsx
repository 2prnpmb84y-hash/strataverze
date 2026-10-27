import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { ownerMaySeeRequest } from "@/lib/debt-recovery/payment-plan-requests";
import { ownerRequestPaymentPlanAction } from "@/lib/actions/payment-plans";
import { formatLotLabel } from "@/lib/format";
import { formatAud, toCents } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { PaymentPlanRequestForm } from "@/components/debt-recovery/payment-plan-forms";
import { OwnerWithdrawButton } from "./withdraw-button";
import { needRule } from "@/config/statutory";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const aud = (v: unknown) => formatAud(toCents(String(v ?? 0)));
const FREQ: Record<string, string> = { WEEKLY: "weekly", FORTNIGHTLY: "fortnightly", MONTHLY: "monthly" };

/** Owner portal: ask for a payment plan for overdue levies, and see the reply and the plan. */
export default async function OwnerPaymentPlanPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const schemes = scopeToSelectedScheme(await getSchemesForOwner(profile.id), await getVerifiedSelectedSchemeId());
  if (schemes.length === 0) notFound();
  // Only buildings whose rule pack has the payment plan workflow.
  const planSchemes = schemes.filter((s) => rulesForState(s.state).rules.FEATURES.statutoryPaymentPlans);
  if (planSchemes.length === 0) notFound();

  const lots = planSchemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId && m.role === "OWNER" && m.isActive && m.profileId === profile.id)
      .map((m) => ({ scheme: s, lotId: m.lotId!, ownerSince: storedDayIn(timeZoneOf(s), m.startDate), label: `${formatLotLabel(m.lot ? String(m.lot.lotNumber) : "")}${m.lot?.unitNumber ? ` (Unit ${m.lot.unitNumber})` : ""}` })),
  );
  const lotIds = lots.map((l) => l.lotId);
  const [requests, plans] = lotIds.length
    ? await Promise.all([
        db.orm.public.PaymentPlanRequest.where((r) => r.lotId.in(lotIds)).orderBy((r) => r.createdAt.desc()).limit(200).all(),
        db.orm.public.PaymentPlan.where((p) => and(p.lotId.in(lotIds), p.status.in(["ACTIVE", "DEFAULTED", "COMPLETED"]))).orderBy((p) => p.createdAt.desc()).limit(200).all(),
      ])
    : [[], []];
  const planIds = plans.map((p) => p.id);
  const instalments = planIds.length
    ? await db.orm.public.PaymentPlanInstalment.where((i) => i.planId.in(planIds)).orderBy((i) => i.instalmentNumber.asc()).limit(2000).all()
    : [];
  const name = `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Payment plan" description="If you are in financial hardship and cannot pay overdue levies in full, you can ask for a payment plan." backHref="/owner/levies" backLabel="My Levies" />
      {lots.map((lot) => {
        const pack = rulesForState(lot.scheme.state).rules;
        const pp = needRule(pack, "PAYMENT_PLANS");
        const hardship = pack.NOTICE_RULES.hardship?.information ?? null;
        const oc = pack.TERMINOLOGY.ownersCorporation;
        const today = todayIn(timeZoneOf(lot.scheme));
        // Only requests and plans from this owner's own ownership (not the previous owner's).
        const viewer = { profileId: profile.id, ownerSince: lot.ownerSince };
        const lotRequests = requests.filter((r) => r.lotId === lot.lotId && ownerMaySeeRequest(r, viewer));
        const seen = new Set(lotRequests.map((r) => r.id));
        const open = requests.find((r) => r.lotId === lot.lotId && r.status === "RECEIVED");
        const active = plans.find((p) => p.lotId === lot.lotId && p.status === "ACTIVE");
        const lotPlans = plans.filter((p) => p.lotId === lot.lotId && ((p.requestId && seen.has(p.requestId)) || (!p.requestId && day(p.agreedOn) >= lot.ownerSince)));
        return (
          <div key={lot.lotId} className="space-y-4">
            <h2 className="text-base font-semibold text-ink">
              {lot.label}, {String(lot.scheme.name)}
            </h2>
            {lotPlans.map((p) => {
              const its = instalments.filter((i) => i.planId === p.id);
              return (
                <Card key={p.id}>
                  <CardHeader
                    title="Your payment plan"
                    description={`${aud(p.totalAmount)} in ${p.numberOfInstalments} ${FREQ[String(p.frequency)] ?? ""} instalments, agreed ${day(p.agreedOn)}.`}
                    action={<StatusChip status={p.status === "ACTIVE" ? "Current" : p.status === "COMPLETED" ? "Completed" : "Not followed"} variant={p.status === "ACTIVE" ? "success" : p.status === "COMPLETED" ? "default" : "danger"} />}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-ink-muted border-b border-line">
                          <th className="py-2 pr-3">#</th>
                          <th className="py-2 pr-3">Due</th>
                          <th className="py-2 pr-3 text-right">Amount</th>
                          <th className="py-2 pr-3 text-right">Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {its.map((i) => (
                          <tr key={i.id} className="border-b border-line last:border-0">
                            <td className="py-2 pr-3">{i.instalmentNumber}</td>
                            <td className="py-2 pr-3 tabular-nums">{day(i.dueDate)}</td>
                            <td className="py-2 pr-3 tabular-nums text-right">{aud(i.amount)}</td>
                            <td className="py-2 pr-3 tabular-nums text-right">{aud(i.amountPaid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {p.paymentMethods && <p className="mt-3 text-sm text-ink">How to pay: {p.paymentMethods}</p>}
                  <p className="mt-2 text-xs text-ink-muted">{pp.extensionStatement} Keep paying new levies as they fall due.</p>
                </Card>
              );
            })}
            {lotRequests.map((r) => (
              <Card key={r.id}>
                <CardHeader
                  title={`Request sent ${day(r.receivedOn)}`}
                  description={
                    r.status === "RECEIVED"
                      ? `Waiting for a decision. The ${oc} must give you a written reply by ${day(r.replyDueOn)}.`
                      : r.status === "APPROVED"
                        ? "Approved."
                        : r.status === "REFUSED"
                          ? "Not approved."
                          : "Withdrawn."
                  }
                />
                {r.status === "REFUSED" && (
                  <div className="space-y-2 text-sm">
                    <p className="whitespace-pre-line text-ink">{r.refusalReasons}</p>
                    <p className="text-xs text-ink-muted">{pp.mediation}</p>
                  </div>
                )}
                {(r.status === "APPROVED" || r.status === "REFUSED") && (
                  <a className="mt-3 inline-block text-sm text-turquoise underline" href={`/api/debt-recovery/payment-plan-reply/${r.id}?schemeId=${lot.scheme.id}`} target="_blank" rel="noreferrer">
                    {r.status === "APPROVED" ? "Payment plan statement (PDF)" : "Written reply (PDF)"}
                  </a>
                )}
                {r.status === "RECEIVED" && (
                  <div className="mt-3">
                    <OwnerWithdrawButton schemeId={lot.scheme.id} lotId={lot.lotId} requestId={r.id} />
                  </div>
                )}
              </Card>
            ))}
            {((open && !seen.has(open.id)) || (active && !lotPlans.some((p) => p.id === active.id))) && (
              <Card>
                <p className="text-sm text-ink">A payment plan request or plan from before your ownership is still open for this lot. Contact your strata manager.</p>
              </Card>
            )}
            {!open && !active && (
              <Card>
                <CardHeader
                  title="Ask for a payment plan"
                  description={`A plan can run for up to ${pp.maxMonths} months. There is no fee. The ${oc} decides at a meeting and must reply in writing within ${pp.replyWithinDays} days. While the plan is followed, no recovery action can be taken for the levies it covers.`}
                />
                <PaymentPlanRequestForm
                  action={ownerRequestPaymentPlanAction.bind(null, lot.scheme.id, lot.lotId)}
                  maxMonths={pp.maxMonths}
                  formName={`This form has the questions of ${pp.requestForm}.`}
                  today={today}
                  defaultOwnerNames={name}
                  owner
                  ownersCorporation={oc}
                />
                {hardship && (
                  <p className="mt-3 text-xs text-ink-muted">
                    Free financial counselling: {hardship.helplineName}, {hardship.helplinePhone}, {hardship.helplineWeb}. More information: {pp.helpUrl}
                  </p>
                )}
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}
