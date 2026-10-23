import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getThreeWayReconciliationReport } from "@/lib/finance/three-way-report";
import { sydneyToday } from "@/lib/finance/interest-setting";
import { PageHeader } from "@/components/ui/page-header";
import { ThreeWayReportView } from "@/components/finance/three-way-report-view";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ThreeWayReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asAt?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { asAt } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();
  const date = asAt && ISO.test(asAt) ? asAt : sydneyToday();
  const report = await getThreeWayReconciliationReport(id, date);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Three-way Reconciliation"
        description="Ledger, payment provider wallet and bank statement, with every difference listed."
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />
      <ThreeWayReportView report={report} formAction={`/adviser/schemes/${id}/finance/reports/three-way-reconciliation`} />
    </div>
  );
}
