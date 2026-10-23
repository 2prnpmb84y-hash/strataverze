import { connection } from "next/server";
import { getSelectedOwnerScheme } from "@/lib/owner/selected-scheme";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getThreeWayReconciliationReport } from "@/lib/finance/three-way-report";
import { sydneyToday } from "@/lib/finance/interest-setting";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ThreeWayReportView } from "@/components/finance/three-way-report-view";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The three-way reconciliation for the scheme's treasurer. */
export default async function TreasurerReconciliationPage({ searchParams }: { searchParams: Promise<{ asAt?: string }> }) {
  await connection();
  const { asAt } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  // The selected scheme, verified: the treasurer of THIS scheme only.
  const selected = await getSelectedOwnerScheme(["COMMITTEE"]);
  const schemeId = selected?.schemeId ?? null;
  const header = (
    <PageHeader
      title="Three-way Reconciliation"
      description="Ledger, payment provider wallet and bank statement, with every difference listed."
      backHref="/owner/finance"
      backLabel="Finance"
    />
  );
  const isTreasurer = !!selected?.memberships.some((m) => m.role === "COMMITTEE" && m.isTreasurer);
  if (!schemeId || !isTreasurer) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState title="Not available" description="The reconciliation report is for the treasurer of the selected scheme." />
      </div>
    );
  }
  const date = asAt && ISO.test(asAt) ? asAt : sydneyToday();
  const report = await getThreeWayReconciliationReport(schemeId, date);
  return (
    <div className="space-y-6">
      {header}
      <ThreeWayReportView report={report} formAction="/owner/finance/reconciliation" />
    </div>
  );
}
