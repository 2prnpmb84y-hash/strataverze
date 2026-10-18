import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundSummaryReport } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { FundSummaryClient } from "./fund-summary-client";

export default async function FundSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const { id } = await params;
  const { startDate: startParam, endDate: endParam } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  // Default to current financial year (1 Jul - 30 Jun)
  const now = new Date();
  const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultStart = `${fyStartYear}-07-01`;
  const defaultEnd = `${fyStartYear + 1}-06-30`;

  const startDate = startParam || defaultStart;
  const endDate = endParam || defaultEnd;

  const summaries = await getFundSummaryReport(id, startDate, endDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fund Summary"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <FundSummaryClient
        schemeId={id}
        startDate={startDate}
        endDate={endDate}
        summaries={summaries}
      />
    </div>
  );
}
