import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { getFundsForScheme } from "@/lib/queries/funds";
import { LevyScheduleForm } from "../levy-schedule-form";

export default async function NewLevySchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    <div className="max-w-2xl">
      <PageHeader
        title="New Levy Schedule"
        backHref={`/adviser/schemes/${id}/finance/levies`}
        backLabel="Levies"
      />
      <LevyScheduleForm
        schemeId={id}
        funds={funds.map((f) => ({ id: String(f.id), name: String(f.name) }))}
      />
    </div>
  );
}
