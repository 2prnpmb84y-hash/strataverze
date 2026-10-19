import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksContractById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { VariationForm } from "./variation-form";

export default async function NewVariationPage({
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

  const contract = await getWorksContractById(contractId);
  if (!contract) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Variation"
        description={`Add a variation to ${contract.title}`}
        backHref={`/adviser/schemes/${id}/works/contracts/${contractId}`}
        backLabel="Contract"
      />

      <Card className="p-6">
        <VariationForm schemeId={id} contractId={contractId} />
      </Card>
    </div>
  );
}
