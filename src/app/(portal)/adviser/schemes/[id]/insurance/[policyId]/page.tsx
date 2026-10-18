import { notFound } from "next/navigation";
import { getInsurancePolicyById } from "@/lib/queries/insurance";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { InsurancePolicyEditForm } from "../insurance-form";
import { DeleteInsuranceButton } from "./delete-insurance-button";
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

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function InsurancePolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string; policyId: string }>;
}) {
  await connection();
  const { id, policyId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const policy = await getInsurancePolicyById(policyId);
  if (!policy || policy.schemeId !== id) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`${policyTypeLabels[policy.policyType] ?? policy.policyType} Insurance`}
        description={policy.scheme.name}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* Policy summary */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted mb-4">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[policy.status] ?? "bg-gray-100 text-gray-700"}`}
          >
            {statusLabels[policy.status] ?? policy.status}
          </span>
          <span>·</span>
          <span>Policy #{policy.policyNumber}</span>
          <span>·</span>
          <span>{policy.insurer}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
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
          {policy.excessAmount ? (
            <div>
              <p className="text-xs text-ink-muted">Excess</p>
              <p className="font-medium text-ink">
                {formatCurrency(String(policy.excessAmount))}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-ink-muted">Start Date</p>
            <p className="font-medium text-ink">
              {formatDate(String(policy.startDate))}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">End Date</p>
            <p className="font-medium text-ink">
              {formatDate(String(policy.endDate))}
            </p>
          </div>
          {policy.renewalDate ? (
            <div>
              <p className="text-xs text-ink-muted">Renewal Date</p>
              <p className="font-medium text-ink">
                {formatDate(String(policy.renewalDate))}
              </p>
            </div>
          ) : null}
          {policy.broker ? (
            <div>
              <p className="text-xs text-ink-muted">Broker</p>
              <p className="font-medium text-ink">{policy.broker}</p>
              {policy.brokerContact ? (
                <p className="text-xs text-ink-muted mt-0.5">
                  {policy.brokerContact}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {policy.notes ? (
          <div className="mt-4 rounded-[var(--radius-card)] bg-muted px-4 py-3">
            <p className="text-xs font-medium text-ink-muted mb-1">
              Notes
            </p>
            <p className="text-sm text-ink whitespace-pre-wrap">
              {policy.notes}
            </p>
          </div>
        ) : null}
      </Card>

      {/* Edit form */}
      <Card className="mb-6">
        <CardHeader title="Edit Policy" />
        <InsurancePolicyEditForm
          schemeId={id}
          policyId={policyId}
          defaults={{
            policyNumber: policy.policyNumber,
            policyType: policy.policyType,
            insurer: policy.insurer,
            broker: policy.broker,
            brokerContact: policy.brokerContact,
            coverageAmount: String(policy.coverageAmount),
            premium: String(policy.premium),
            excessAmount: policy.excessAmount
              ? String(policy.excessAmount)
              : null,
            startDate: String(policy.startDate),
            endDate: String(policy.endDate),
            status: policy.status,
            renewalDate: policy.renewalDate
              ? String(policy.renewalDate)
              : null,
            notes: policy.notes,
          }}
        />
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="This action cannot be undone."
        />
        <DeleteInsuranceButton schemeId={id} policyId={policyId} />
      </Card>
    </div>
  );
}
