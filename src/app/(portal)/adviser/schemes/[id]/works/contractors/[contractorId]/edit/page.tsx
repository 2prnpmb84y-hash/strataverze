import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getContractorBusinessById, isContractorVisibleToScheme } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ContractorForm } from "../../new/contractor-form";

export default async function EditContractorPage({
  params,
}: {
  params: Promise<{ id: string; contractorId: string }>;
}) {
  await connection();
  const { id, contractorId } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;
  const { profile } = access;
  // Contractor identity details are maintained by StrataVerze staff only.
  if (!profile.isPlatformAdmin) notFound();

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const contractor = await getContractorBusinessById(contractorId);
  if (!contractor || !(await isContractorVisibleToScheme(contractor, id))) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Edit Contractor"
        description={`Update details for ${contractor.companyName}`}
        backHref={`/adviser/schemes/${id}/works/contractors/${contractorId}`}
        backLabel="Contractor Details"
      />

      <Card className="p-6">
        <ContractorForm
          schemeId={id}
          contractor={{
            id: contractor.id,
            companyName: String(contractor.companyName),
            tradingName: contractor.tradingName ? String(contractor.tradingName) : null,
            abn: contractor.abn ? String(contractor.abn) : null,
            acn: contractor.acn ? String(contractor.acn) : null,
            registeredAddress: contractor.registeredAddress ? String(contractor.registeredAddress) : null,
            phone: contractor.phone ? String(contractor.phone) : null,
            email: contractor.email ? String(contractor.email) : null,
            website: contractor.website ? String(contractor.website) : null,
            tradeCategories: contractor.tradeCategories as string[],
            gstRegistered: contractor.gstRegistered,
            notes: contractor.notes ? String(contractor.notes) : null,
          }}
        />
      </Card>
    </div>
  );
}
