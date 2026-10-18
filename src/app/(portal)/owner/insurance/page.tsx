import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getInsuranceForSchemes } from "@/lib/queries/insurance";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { connection } from "next/server";

const policyTypeLabels: Record<string, string> = {
  BUILDING: "Building",
  PUBLIC_LIABILITY: "Public Liability",
  WORKERS_COMP: "Workers Compensation",
  OFFICE_BEARERS: "Office Bearers",
  FIDELITY_GUARANTEE: "Fidelity Guarantee",
  MACHINERY: "Machinery Breakdown",
  VOLUNTARY_WORKERS: "Voluntary Workers",
  OTHER: "Other",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  PENDING_RENEWAL: "Pending Renewal",
};

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  EXPIRED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-700",
  PENDING_RENEWAL: "bg-amber-100 text-amber-700",
};

function formatCurrency(value: string | number): string {
  return Number(value).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });
}

export default async function OwnerInsurancePage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const policies = await getInsuranceForSchemes(schemeIds);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Insurance Policies"
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
        <div className="flex flex-col gap-4">
          {policies.map((policy) => (
            <Card key={policy.id}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    {policyTypeLabels[policy.policyType] ?? policy.policyType}
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {policy.scheme.name}
                    {" · "}
                    Policy #{policy.policyNumber}
                    {" · "}
                    {policy.insurer}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${statusStyles[policy.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {statusLabels[policy.status] ?? policy.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-ink-muted">Coverage</p>
                  <p className="font-medium text-ink">
                    {formatCurrency(String(policy.coverageAmount))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">Premium</p>
                  <p className="font-medium text-ink">
                    {formatCurrency(String(policy.premium))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">Expires</p>
                  <p className="font-medium text-ink">
                    {new Date(String(policy.endDate)).toLocaleDateString(
                      "en-AU",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </p>
                </div>
              </div>
              {policy.broker ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Broker: {policy.broker}
                  {policy.brokerContact ? ` (${policy.brokerContact})` : ""}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
