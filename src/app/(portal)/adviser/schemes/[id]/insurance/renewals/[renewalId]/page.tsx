import { notFound } from "next/navigation";
import Link from "next/link";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getRenewalById } from "@/lib/queries/insurance-renewals";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { RenewalWorkspace, type QuoteView } from "./renewal-workspace";
import {
  POLICY_TYPE_LABELS,
  RENEWAL_STAGE_LABELS,
} from "@/lib/insurance/constants";
import {
  RENEWAL_STAGES,
  canAdvanceRenewal,
} from "@/lib/insurance/status";
import { detectContinuity } from "@/lib/insurance/renewal";
import { connection } from "next/server";
import { referralIncomeEnabled } from "@/lib/billing/referral";
import { getReferralIncomeForPolicies } from "@/lib/queries/referral-income";
import { ReferralIncomeDisclosure } from "@/components/billing/referral-income-disclosure";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function dateForInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

export default async function RenewalDetailPage({
  params,
}: {
  params: Promise<{ id: string; renewalId: string }>;
}) {
  await connection();
  const { id, renewalId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const renewal = await getRenewalById(renewalId);
  if (!renewal || renewal.schemeId !== id) notFound();

  const expiring = renewal.expiringPolicy;
  // Commission StrataVerze received on the expiring or renewed policy.
  const referralIncome = referralIncomeEnabled()
    ? await getReferralIncomeForPolicies([renewal.expiringPolicyId, renewal.successorPolicyId ?? ""])
    : [];
  const quotes: QuoteView[] = (renewal.quotes ?? []).map((q) => ({
    id: q.id,
    insurer: q.insurer,
    broker: q.broker ?? null,
    periodStart: q.periodStart ? String(q.periodStart) : null,
    periodEnd: q.periodEnd ? String(q.periodEnd) : null,
    premium: q.premium != null ? String(q.premium) : null,
    sumInsured: q.sumInsured != null ? String(q.sumInsured) : null,
    excesses:
      q.excesses && typeof q.excesses === "object"
        ? ((q.excesses as { text?: string }).text ?? null)
        : null,
    exclusions: q.exclusions ?? null,
    materialDifferences: q.materialDifferences ?? null,
    validUntil: q.validUntil ? String(q.validUntil) : null,
  }));

  const selectedQuote =
    quotes.find((q) => q.id === renewal.selectedQuoteId) ?? null;
  const declaration = (renewal.declaration ?? {}) as Record<string, string>;
  const allowedStages = RENEWAL_STAGES.filter((s) =>
    canAdvanceRenewal(renewal.stage, s),
  );
  const isComplete =
    renewal.stage === "COMPLETED" || renewal.stage === "NOT_PROCEEDING";

  const continuity =
    renewal.successorPolicyId && expiring && selectedQuote?.periodStart
      ? detectContinuity(
          new Date(String(expiring.endDate)),
          new Date(selectedQuote.periodStart),
        )
      : null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Insurance renewal"
        description={
          expiring
            ? `${scheme.name} · ${POLICY_TYPE_LABELS[expiring.policyType] ?? expiring.policyType} ${expiring.policyNumber}`
            : scheme.name
        }
        backHref={`/adviser/schemes/${id}/insurance`}
        backLabel="Insurance"
      />

      {/* Expiring policy */}
      {expiring && (
        <Card className="mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-ink-muted">Expiring policy</p>
              <p className="font-medium text-ink">{expiring.insurer}</p>
              <p className="text-xs text-ink-muted">{expiring.policyNumber}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Expires</p>
              <p className="font-medium text-ink">
                {fmtDate(String(expiring.endDate))}
              </p>
            </div>
            {renewal.dueDate && (
              <div>
                <p className="text-xs text-ink-muted">Target date</p>
                <p className="font-medium text-ink">
                  {fmtDate(String(renewal.dueDate))}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      <ReferralIncomeDisclosure rows={referralIncome} title="StrataVerze referral income on this policy" />

      {/* Completed summary */}
      {isComplete && (
        <Card className="mb-6">
          <CardHeader
            title={
              renewal.stage === "COMPLETED"
                ? "Renewal completed"
                : "Renewal not proceeding"
            }
          />
          {renewal.stage === "COMPLETED" ? (
            <div className="text-sm text-ink space-y-2">
              {renewal.successorPolicyId && (
                <p>
                  Successor policy created.{" "}
                  <Link
                    href={`/adviser/schemes/${id}/insurance/${renewal.successorPolicyId}`}
                    className="text-turquoise hover:underline"
                  >
                    View the new policy
                  </Link>
                  .
                </p>
              )}
              {continuity && continuity.type !== "CONTIGUOUS" && (
                <p className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                  Flagged for review: {continuity.days}-day {continuity.type.toLowerCase()}{" "}
                  between the expiring policy and the successor. Confirm the cover
                  dates.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink">
              {renewal.notProceedingReason ?? "This renewal was closed without placing cover."}
            </p>
          )}
          <p className="text-xs text-ink-muted mt-3">
            Stage: {RENEWAL_STAGE_LABELS[renewal.stage] ?? renewal.stage}
          </p>
        </Card>
      )}

      <RenewalWorkspace
        schemeId={id}
        renewalId={renewalId}
        stage={renewal.stage}
        allowedStages={allowedStages}
        prep={{
          dueDate: dateForInput(renewal.dueDate ? String(renewal.dueDate) : null),
          reminderLeadDays:
            renewal.reminderLeadDays != null ? String(renewal.reminderLeadDays) : "",
          declaredChanges: renewal.declaredChanges ?? "",
          outstandingInfo: renewal.outstandingInfo ?? "",
          notes: renewal.notes ?? "",
        }}
        declaration={declaration}
        quotes={quotes}
        selectedQuoteId={renewal.selectedQuoteId ?? null}
        selectionRationale={renewal.selectionRationale ?? ""}
        approval={{
          approvedBy: renewal.approvedBy ?? "",
          placementInstructions: renewal.placementInstructions ?? "",
        }}
        selectedQuote={selectedQuote}
        isComplete={isComplete}
      />
    </div>
  );
}
