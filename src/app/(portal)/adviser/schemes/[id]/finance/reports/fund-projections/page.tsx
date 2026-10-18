import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundBalanceProjections } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { FundProjectionsClient } from "./fund-projections-client";

export default async function FundProjectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    years?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const yearsAhead = sp.years ? parseInt(sp.years, 10) : 5;
  const validYears = [3, 5, 7, 10].includes(yearsAhead) ? yearsAhead : 5;

  const data = await getFundBalanceProjections(id, validYears);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fund Balance Projections"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <FundProjectionsClient
        schemeId={id}
        yearsAhead={validYears}
        data={data}
      />
    </div>
  );
}
