import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getWorksContractById,
  getWorksRequestsForScheme,
  getContractorBusinesses,
} from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ContractForm } from "../../new/contract-form";

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  await connection();
  const { id, contractId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const [contract, requests, contractors] = await Promise.all([
    getWorksContractById(contractId),
    getWorksRequestsForScheme(id, { limit: 200 }),
    getContractorBusinesses({ status: "APPROVED", limit: 200 }),
  ]);

  if (!contract) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Edit Contract"
        description={`Update ${contract.title}`}
        backHref={`/adviser/schemes/${id}/works/contracts/${contractId}`}
        backLabel="Contract Details"
      />

      <Card className="p-6">
        <ContractForm
          schemeId={id}
          contractors={contractors.map((c) => ({
            id: c.id,
            companyName: String(c.companyName),
          }))}
          requests={requests.map((r) => ({
            id: r.id,
            requestNumber: String(r.requestNumber),
            title: String(r.title ?? r.requestNumber),
          }))}
          contract={{
            id: contract.id,
            requestId: contract.requestId,
            quotationId: contract.quotationId,
            contractorBusinessId: contract.contractorBusinessId,
            title: String(contract.title),
            description: contract.description
              ? String(contract.description)
              : null,
            contractValue: String(contract.contractValue),
            gstAmount: String(contract.gstAmount),
            totalValue: String(contract.totalValue),
            startDate: contract.startDate
              ? String(contract.startDate).slice(0, 10)
              : null,
            endDate: contract.endDate
              ? String(contract.endDate).slice(0, 10)
              : null,
            retentionPercentage: contract.retentionPercentage
              ? String(contract.retentionPercentage)
              : null,
          }}
        />
      </Card>
    </div>
  );
}
