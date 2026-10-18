import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { LevyForm } from "../levy-form";
import { connection } from "next/server";

export default async function NewLevyPage({
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
        title="Create Levy"
        description={`Create a new levy for ${scheme.name}. The total amount will be split across all registered lots based on their entitlement shares.`}
        backHref={`/adviser/schemes/${id}`}
        backLabel={scheme.name}
      />

      <LevyForm mode="create" schemeId={id} />
    </div>
  );
}
