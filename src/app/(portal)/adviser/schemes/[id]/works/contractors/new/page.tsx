import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ContractorForm } from "./contractor-form";

export default async function NewContractorPage({
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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Register Contractor"
        description="Add a new contractor business to the registry."
        backHref={`/adviser/schemes/${id}/works/contractors`}
        backLabel="Contractors"
      />

      <Card className="p-6">
        <ContractorForm schemeId={id} />
      </Card>
    </div>
  );
}
