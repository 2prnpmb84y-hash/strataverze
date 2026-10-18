import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getCashFlowForecast } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CashFlowClient } from "./cash-flow-client";
import { connection } from "next/server";

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    months?: string;
  }>;
}) {
  await connection();
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

  const monthsAhead = sp.months ? parseInt(sp.months, 10) : 6;
  const validMonths = [3, 6, 9, 12].includes(monthsAhead) ? monthsAhead : 6;

  const forecast = await getCashFlowForecast(id, validMonths);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow Forecast"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <CashFlowClient
        schemeId={id}
        monthsAhead={validMonths}
        forecast={forecast}
      />
    </div>
  );
}
