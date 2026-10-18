import { notFound } from "next/navigation";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFundSummaryReport } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { FundSummaryClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/fund-summary/fund-summary-client";
import { connection } from "next/server";

export default async function AccountantFundSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { startDate: startParam, endDate: endParam } = await searchParams;

  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

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
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <FundSummaryClient
        schemeId={id}
        startDate={startDate}
        endDate={endDate}
        summaries={summaries}
        basePath={`/accountant/schemes/${id}/finance/reports`}
      />
    </div>
  );
}
