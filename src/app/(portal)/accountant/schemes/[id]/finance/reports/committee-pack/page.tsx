import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getCommitteeReportingPack } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CommitteePackClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/committee-pack/committee-pack-client";

export default async function CommitteePackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    year?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const { id } = await params;
  await requireFinancialReadAccess(id);
  const sp = await searchParams;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  // Default to current Australian financial year (Jul-Jun)
  const now = new Date();
  const currentFY = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const financialYear = sp.year ? parseInt(sp.year, 10) : currentFY;

  const startDate = sp.startDate || `${financialYear}-07-01`;
  const endDate = sp.endDate || `${financialYear + 1}-06-30`;

  const pack = await getCommitteeReportingPack(id, startDate, endDate, financialYear);

  // Build FY options (current + 2 previous)
  const fyOptions = Array.from({ length: 3 }, (_, i) => {
    const fy = currentFY - i;
    return { value: String(fy), label: `FY ${fy}/${fy + 1}` };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Committee Reporting Pack"
        description={String(scheme.name)}
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <CommitteePackClient
        schemeId={id}
        financialYear={financialYear}
        fyOptions={fyOptions}
        startDate={startDate}
        endDate={endDate}
        pack={pack}
        basePath={`/accountant/schemes/${id}/finance/reports/committee-pack`}
      />
    </div>
  );
}
