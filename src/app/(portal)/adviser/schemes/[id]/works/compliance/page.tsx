import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getComplianceRequirements } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";

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

export default async function CompliancePage({
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

  const requirements = await getComplianceRequirements(id);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Compliance Requirements"
        description="Define and manage compliance requirements for contractors and works."
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
        action={
          <Button href={`/adviser/schemes/${id}/works/compliance/new`}>
            Add Requirement
          </Button>
        }
      />

      {requirements.length === 0 ? (
        <Card className="p-6">
          <div className="text-center py-8">
            <p className="text-sm text-ink-muted">
              No compliance requirements have been defined yet. Add requirements
              to track licences, insurance, and certifications for contractors.
            </p>
            <Button
              href={`/adviser/schemes/${id}/works/compliance/new`}
              className="mt-4"
            >
              Add First Requirement
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {requirements.map((req) => (
            <Link
              key={req.id}
              href={`/adviser/schemes/${id}/works/compliance/${req.id}`}
              className="block rounded-[var(--radius-card)] bg-white border border-line px-5 py-4 hover:border-turquoise transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {req.name}
                  </p>
                  {req.description && (
                    <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">
                      {req.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {layerLabel[req.layer] ?? req.layer}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {docTypeLabel[String(req.documentType)] ?? String(req.documentType)}
                    </span>
                    {req.isMandatory && (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                        Mandatory
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <StatusChip
                    status={req.isActive ? "Active" : "Inactive"}
                    variant={req.isActive ? "success" : "default"}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
