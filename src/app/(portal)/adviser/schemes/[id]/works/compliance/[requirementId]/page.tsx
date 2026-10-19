import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getComplianceRequirementById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const layerLabel: Record<string, string> = {
  SUPPLIER: "Supplier",
  JOB: "Job",
  SITE: "Site",
};

const docTypeLabel: Record<string, string> = {
  LICENCE: "Licence",
  INSURANCE: "Insurance",
  CERTIFICATE: "Certificate",
  INDUCTION: "Induction",
  SAFE_WORK_METHOD: "Safe Work Method Statement",
  OTHER: "Other",
};

const checkStatusVariant: Record<string, "success" | "warning" | "danger" | "default"> = {
  PENDING: "default",
  SUBMITTED: "warning",
  UNDER_REVIEW: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
  EXPIRED: "danger",
  WAIVED: "default",
};

export default async function ComplianceRequirementDetailPage({
  params,
}: {
  params: Promise<{ id: string; requirementId: string }>;
}) {
  await connection();
  const { id, requirementId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const requirement = await getComplianceRequirementById(requirementId);
  if (!requirement) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={String(requirement.name)}
        description={requirement.description ? String(requirement.description) : "Compliance requirement details"}
        backHref={`/adviser/schemes/${id}/works/compliance`}
        backLabel="Compliance"
        action={
          <Button href={`/adviser/schemes/${id}/works/compliance/${requirementId}/edit`}>
            Edit
          </Button>
        }
      />

      {/* Requirement details */}
      <Card className="mb-6">
        <CardHeader title="Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <dt className="text-xs text-ink-muted">Layer</dt>
              <dd className="text-sm text-ink">{layerLabel[requirement.layer] ?? requirement.layer}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Document Type</dt>
              <dd className="text-sm text-ink">
                {docTypeLabel[String(requirement.documentType)] ?? String(requirement.documentType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Mandatory</dt>
              <dd className="text-sm text-ink">{requirement.isMandatory ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Validity Period</dt>
              <dd className="text-sm text-ink">
                {requirement.validityPeriod ? `${requirement.validityPeriod} days` : "No expiry"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Status</dt>
              <dd>
                <StatusChip
                  status={requirement.isActive ? "Active" : "Inactive"}
                  variant={requirement.isActive ? "success" : "default"}
                />
              </dd>
            </div>
            {(requirement.tradeCategories as string[]).length > 0 && (
              <div>
                <dt className="text-xs text-ink-muted">Applicable Trades</dt>
                <dd className="flex flex-wrap gap-1 mt-0.5">
                  {(requirement.tradeCategories as string[]).map((cat, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted"
                    >
                      {cat}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Compliance checks */}
      <Card>
        <CardHeader
          title="Compliance Checks"
          description={`${requirement.checks.length} check${requirement.checks.length === 1 ? "" : "s"} recorded`}
        />
        {requirement.checks.length === 0 ? (
          <div className="px-5 pb-5 text-center py-6">
            <p className="text-sm text-ink-muted">
              No compliance checks have been submitted against this requirement yet.
            </p>
          </div>
        ) : (
          <div className="px-5 pb-5 flex flex-col gap-3">
            {requirement.checks.map((check) => (
              <div
                key={check.id}
                className="rounded-[var(--radius-card)] bg-surface-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {check.contractorBusiness && (
                      <p className="text-sm font-medium text-ink">
                        {String(check.contractorBusiness.companyName)}
                      </p>
                    )}
                    {check.documentName && (
                      <p className="text-xs text-ink-muted mt-0.5">
                        {String(check.documentName)}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted">
                      {check.expiryDate && (
                        <span>Expires: {formatDate(check.expiryDate)}</span>
                      )}
                      {check.verifiedBy && (
                        <span>
                          Verified by {check.verifiedBy.firstName} {check.verifiedBy.lastName}
                        </span>
                      )}
                      {check.verifiedAt && (
                        <span>on {formatDate(check.verifiedAt)}</span>
                      )}
                    </div>
                    {check.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">
                        Rejection: {String(check.rejectionReason)}
                      </p>
                    )}
                  </div>
                  <StatusChip
                    status={check.status.replace(/_/g, " ")}
                    variant={checkStatusVariant[check.status] ?? "default"}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
