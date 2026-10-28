import { notFound } from "next/navigation";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCashFlowForecast } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CashFlowClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/cash-flow/cash-flow-client";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { packWordsFor } from "@/lib/jurisdiction/screen-words";

export default async function AccountantCashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ months?: string }>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;

  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const monthsAhead = sp.months ? parseInt(sp.months, 10) : 6;
  const validMonths = [3, 6, 9, 12].includes(monthsAhead) ? monthsAhead : 6;

  const forecast = await getCashFlowForecast(id, validMonths);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow Forecast"
        description={String(scheme.name)}
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <CashFlowClient
        schemeId={id}
        monthsAhead={validMonths}
        forecast={forecast}
        words={packWordsFor(rulesForState(scheme.state).rules)}
        basePath={`/accountant/schemes/${id}/finance/reports`}
      />
    </div>
  );
}
