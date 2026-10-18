import { notFound } from "next/navigation";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFundBalanceProjections } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { FundProjectionsClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/fund-projections/fund-projections-client";
import { connection } from "next/server";

export default async function AccountantFundProjectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ years?: string }>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;

  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const yearsAhead = sp.years ? parseInt(sp.years, 10) : 5;
  const validYears = [3, 5, 7, 10].includes(yearsAhead) ? yearsAhead : 5;

  const data = await getFundBalanceProjections(id, validYears);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fund Balance Projections"
        description={String(scheme.name)}
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <FundProjectionsClient
        schemeId={id}
        yearsAhead={validYears}
        data={data}
        basePath={`/accountant/schemes/${id}/finance/reports`}
      />
    </div>
  );
}
