import { notFound } from "next/navigation";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { connection } from "next/server";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getThreeWayReconciliationReport } from "@/lib/finance/three-way-report";
import { PageHeader } from "@/components/ui/page-header";
import { ThreeWayReportView } from "@/components/finance/three-way-report-view";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function AccountantThreeWayReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asAt?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { asAt } = await searchParams;
  try {
    await requireFinancialReadAccess(id);
  } catch {
    notFound();
  }
  const date = asAt && ISO.test(asAt) ? asAt : await schemeToday(id);
  const report = await getThreeWayReconciliationReport(id, date);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Three-way Reconciliation"
        description="Ledger, payment provider wallet and bank statement, with every difference listed."
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />
      <ThreeWayReportView report={report} formAction={`/accountant/schemes/${id}/finance/reports/three-way-reconciliation`} />
    </div>
  );
}
