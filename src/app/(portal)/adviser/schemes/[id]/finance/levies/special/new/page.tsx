import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundsForScheme } from "@/lib/queries/funds";
import { PageHeader } from "@/components/ui/page-header";
import { SpecialLevyForm } from "./special-levy-form";
import { levyFormWords } from "@/lib/jurisdiction/screen-words";
import { capitalise } from "@/lib/jurisdiction/wording";

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
  // The building's words, from its rule pack.
  const { rules } = rulesForState(scheme.state);
  const words = levyFormWords(rules);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Raise a Special ${capitalise(words.levy)}`}
        description={`A one-off contribution resolved by the ${rules.TERMINOLOGY.ownersCorporation}.`}
        backHref={`/adviser/schemes/${id}/finance/levies`}
        backLabel={capitalise(words.levies)}
      />
      <SpecialLevyForm
        schemeId={id}
        funds={funds.map((f) => ({ id: String(f.id), name: String(f.name) }))}
        words={words}
      />
    </div>
  );
}
