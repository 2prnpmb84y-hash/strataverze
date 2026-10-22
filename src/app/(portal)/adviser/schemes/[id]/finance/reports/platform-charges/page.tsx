import { connection } from "next/server";
import { getLotsForScheme } from "@/lib/queries/lots";
import { getPlatformFeesData } from "@/lib/queries/platform-billing";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformChargesReport } from "@/components/billing/platform-charges-report";

/** Platform charges report. Adviser access is checked by the finance layout. */
export default async function PlatformChargesReportPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const lots = await getLotsForScheme(id);
  const data = await getPlatformFeesData(id, lots.length);
  return (
    <div>
      <PageHeader
        title="Platform Charges"
        description="What StrataVerze has charged this scheme, by month, and its cost per lot per year."
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />
      <PlatformChargesReport data={data} />
    </div>
  );
}
