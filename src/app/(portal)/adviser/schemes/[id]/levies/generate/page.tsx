import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { GenerateForm } from "./generate-form";
import { connection } from "next/server";

export default async function GenerateLeviesPage({
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

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Generate Levies"
        description={`Bulk-generate levies for ${scheme.name}.`}
        backHref={`/adviser/schemes/${id}`}
        backLabel={scheme.name}
      />

      <Card>
        <div className="p-6">
          <GenerateForm
            schemeId={id}
            financialYearEnd={scheme.financialYearEnd}
          />
        </div>
      </Card>
    </div>
  );
}
