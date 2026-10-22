import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getInsuranceForSchemes } from "@/lib/queries/insurance";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { POLICY_TYPE_LABELS } from "@/lib/insurance/constants";
import { formatMoney } from "@/lib/insurance/premium";
import { derivePolicyStatus } from "@/lib/insurance/status";
import { connection } from "next/server";

export default async function OwnerInsurancePage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const policies = await getInsuranceForSchemes(schemeIds);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Insurance"
        description="View the insurance coverage for your scheme."
        backHref="/owner"
        backLabel="Dashboard"
      />

      {policies.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No insurance policies have been recorded for your scheme yet.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {policies.map((policy) => {
            const status = derivePolicyStatus({
              startDate: new Date(String(policy.startDate)),
              endDate: new Date(String(policy.endDate)),
              status: policy.status,
            });
            return (
              <Link
                key={policy.id}
                href={`/owner/insurance/${policy.id}`}
                className="block rounded-[var(--radius-card)] border border-line bg-white p-4 hover:border-turquoise transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-ink">
                        {POLICY_TYPE_LABELS[policy.policyType] ?? policy.policyType}
                      </h3>
                      <StatusChip status={status} />
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {policy.scheme.name} · Policy {policy.policyNumber} ·{" "}
                      {policy.insurer}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-ink tabular-nums">
                      {formatMoney(String(policy.coverageAmount), policy.currency ?? "AUD")}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Expires{" "}
                      {new Date(String(policy.endDate)).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
