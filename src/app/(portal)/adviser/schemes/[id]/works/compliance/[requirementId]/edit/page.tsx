import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getComplianceRequirementById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ComplianceRequirementForm } from "../../new/compliance-requirement-form";

export default async function EditComplianceRequirementPage({
  params,
}: {
  params: Promise<{ id: string; requirementId: string }>;
}) {
  await connection();
  const { id, requirementId } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.manage");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const requirement = await getComplianceRequirementById(requirementId);
  if (!requirement || requirement.schemeId !== id) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Edit Requirement"
        description={`Update ${requirement.name}`}
        backHref={`/adviser/schemes/${id}/works/compliance/${requirementId}`}
        backLabel="Requirement Details"
      />

      <Card className="p-6">
        <ComplianceRequirementForm
          schemeId={id}
          requirement={{
            id: requirement.id,
            name: String(requirement.name),
            description: requirement.description ? String(requirement.description) : null,
            layer: requirement.layer,
            documentType: String(requirement.documentType),
            isMandatory: requirement.isMandatory,
            validityPeriod: requirement.validityPeriod,
            tradeCategories: requirement.tradeCategories as string[],
            isActive: requirement.isActive,
          }}
        />
      </Card>
    </div>
  );
}
