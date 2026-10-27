import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundsForScheme } from "@/lib/queries/funds";
import { PageHeader } from "@/components/ui/page-header";
import { SpecialLevyForm } from "./special-levy-form";

export default async function NewSpecialLevyPage({
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

  const funds = await getFundsForScheme(id);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Raise a Special Levy"
        description={`A one-off contribution resolved by the ${rulesForState(scheme.state).rules.TERMINOLOGY.ownersCorporation}.`}
        backHref={`/adviser/schemes/${id}/finance/levies`}
        backLabel="Levies"
      />
      <SpecialLevyForm
        schemeId={id}
        funds={funds.map((f) => ({ id: String(f.id), name: String(f.name) }))}
      />
    </div>
  );
}
