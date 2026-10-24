import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { LotForm } from "../lot-form";
import { connection } from "next/server";

export default async function NewLotPage({
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

  // Lots are part of the locked building record: StrataVerze only (24 Oct).
  if (!profile.isPlatformAdmin) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add Lot"
        description={`Add a new lot to ${scheme.name}.`}
        backHref={`/adviser/schemes/${id}/lots`}
        backLabel="Lots / Owners"
      />

      <LotForm mode="create" schemeId={id} />
    </div>
  );
}
