import { notFound } from "next/navigation";
import Link from "next/link";
import { getInsuranceOverview } from "@/lib/queries/insurance";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  POLICY_TYPE_LABELS,
  CLAIM_STATUS_LABELS,
} from "@/lib/insurance/constants";
import { formatMoney } from "@/lib/insurance/premium";
import { derivePolicyStatus, daysUntilExpiry } from "@/lib/insurance/status";
import { connection } from "next/server";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function InsuranceOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const { policies, claims } = await getInsuranceOverview(id);

  const active = policies.filter((p) => {
    const s = derivePolicyStatus({
      startDate: new Date(String(p.startDate)),
      endDate: new Date(String(p.endDate)),
      status: p.status,
    });
    return s === "ACTIVE" || s === "UPCOMING";
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Insurance"
        description={scheme.name}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
        action={
          <Button href={`/adviser/schemes/${id}/insurance/new`} variant="primary">
            Add policy
          </Button>
        }
      />

      {/* Policies */}
      {policies.length === 0 ? (
        <Card className="mb-6">
          <EmptyState
            title="No policies recorded"
            description="Add the scheme's insurance policies to track cover, premiums, documents, claims and renewals."
            actionLabel="Add a policy"
            actionHref={`/adviser/schemes/${id}/insurance/new`}
          />
        </Card>
      ) : (
        <div className="space-y-3 mb-6">
          {policies.map((p) => {
            const status = derivePolicyStatus({
              startDate: new Date(String(p.startDate)),
              endDate: new Date(String(p.endDate)),
              status: p.status,
            });
            const until = daysUntilExpiry(new Date(String(p.endDate)));
            return (
              <Link
                key={p.id}
                href={`/adviser/schemes/${id}/insurance/${p.id}`}
                className="block rounded-[var(--radius-card)] border border-line bg-white p-4 hover:border-turquoise transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-semibold text-ink text-sm">
                        {POLICY_TYPE_LABELS[p.policyType] ?? p.policyType}
                      </span>
                      <StatusChip status={status} />
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {p.insurer} · Policy {p.policyNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink tabular-nums">
                      {formatMoney(String(p.coverageAmount), p.currency ?? "AUD")}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Expires {formatDate(String(p.endDate))}
                      {status === "ACTIVE" && until >= 0 && until <= 60
                        ? ` · ${until} days`
                        : ""}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Claims */}
      <Card className="mb-6">
        <CardHeader
          title="Claims"
          description="Insurance claims lodged for this scheme."
        />
        {claims.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No claims recorded. Claim lodgement and tracking is part of the claims
            workflow.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Claim</th>
                  <th className="py-2 pr-4 font-medium">Reference</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Incident</th>
                  <th className="py-2 font-medium">Lodged</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink">{c.title}</td>
                    <td className="py-2 pr-4 text-ink-muted">
                      {c.claimNumber ?? c.insurerClaimRef ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusChip
                        status={CLAIM_STATUS_LABELS[c.status] ?? c.status}
                      />
                    </td>
                    <td className="py-2 pr-4 text-ink-muted">
                      {formatDate(c.incidentDate ? String(c.incidentDate) : null)}
                    </td>
                    <td className="py-2 text-ink-muted">
                      {formatDate(c.lodgedAt ? String(c.lodgedAt) : null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {active.length > 0 && (
        <p className="text-xs text-ink-muted">
          {active.length} active or upcoming{" "}
          {active.length === 1 ? "policy" : "policies"} · {policies.length} total
        </p>
      )}
    </div>
  );
}
