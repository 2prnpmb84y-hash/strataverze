import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { GeneratePeriodsForm } from "./generate-periods-form";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";

export default async function GeneratePeriodsPage({
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
    <div className="space-y-6">
      <PageHeader
        title="Generate Financial Periods"
        description="Create monthly accounting periods for a financial year. This will generate 12 monthly periods between the start and end dates."
        backHref={`/adviser/schemes/${id}/finance/periods`}
        backLabel="Periods"
      />
      <GeneratePeriodsForm schemeId={id} jurisdiction={rulesForState(scheme.state).rules.TERMINOLOGY.jurisdictionShort} />
    </div>
  );
}
