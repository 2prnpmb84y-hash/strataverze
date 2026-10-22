import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getInsuranceForScheme } from "@/lib/queries/insurance";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function InsuranceCard({
  id, insurancePolicies,
}: {
  id: string;
  insurancePolicies: Awaited<ReturnType<typeof getInsuranceForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Insurance Policies"
        description={
          insurancePolicies.length === 0
            ? "No insurance policies recorded yet."
            : `${insurancePolicies.length} polic${insurancePolicies.length === 1 ? "y" : "ies"} on file.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/insurance`} variant="secondary">
            Manage insurance
          </Button>
        }
      />
      {insurancePolicies.length > 0 ? (
        <div className="flex flex-col gap-2">
          {insurancePolicies.map((policy) => {
            const insuranceStatusStyle: Record<string, string> = {
              ACTIVE: "bg-green-100 text-green-700",
              EXPIRED: "bg-red-100 text-red-700",
              CANCELLED: "bg-gray-100 text-gray-700",
              PENDING_RENEWAL: "bg-amber-100 text-amber-700",
            };
            const insuranceStatusLabel: Record<string, string> = {
              ACTIVE: "Active",
              EXPIRED: "Expired",
              CANCELLED: "Cancelled",
              PENDING_RENEWAL: "Pending Renewal",
            };
            const insuranceTypeLabels: Record<string, string> = {
              BUILDING: "Building",
              PUBLIC_LIABILITY: "Public Liability",
              WORKERS_COMP: "Workers Comp",
              OFFICE_BEARERS: "Office Bearers",
              FIDELITY_GUARANTEE: "Fidelity Guarantee",
              MACHINERY: "Machinery",
              VOLUNTARY_WORKERS: "Voluntary Workers",
              OTHER: "Other",
            };
            return (
              <Link
                key={policy.id}
                href={`/adviser/schemes/${id}/insurance/${policy.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {insuranceTypeLabels[policy.policyType] ?? policy.policyType}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {policy.insurer}
                    {" · #"}
                    {policy.policyNumber}
                    {" · Expires "}
                    {new Date(String(policy.endDate)).toLocaleDateString(
                      "en-AU",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${insuranceStatusStyle[policy.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {insuranceStatusLabel[policy.status] ?? policy.status}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Add insurance policies to track coverage for this scheme.
        </p>
      )}
    </Card>
  );
}
