import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { FundForm } from "../fund-form";
import { connection } from "next/server";

export default async function NewFundPage({
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
    <div className="max-w-3xl">
      <PageHeader
        title="New Fund"
        description={`Add a fund to ${scheme.name}.`}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      <FundForm schemeId={id} mode="create" />
    </div>
  );
}
