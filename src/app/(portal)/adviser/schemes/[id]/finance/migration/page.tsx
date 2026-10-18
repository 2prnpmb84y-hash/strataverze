import { notFound } from "next/navigation";
import { requireSchemeMembership } from "@/lib/auth/require-membership";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { MigrationClient } from "./migration-client";

export default async function MigrationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSchemeMembership(id, ["ADVISER"]);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Migration"
        backHref={`/adviser/schemes/${id}/finance`}
        backLabel="Finance"
      />

      <MigrationClient schemeId={id} schemeName={scheme.name} />
    </div>
  );
}
