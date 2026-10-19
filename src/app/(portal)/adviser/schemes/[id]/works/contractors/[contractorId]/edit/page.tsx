import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getContractorBusinessById } from "@/lib/queries/works";
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

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const contractor = await getContractorBusinessById(contractorId);
  if (!contractor) notFound();

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
