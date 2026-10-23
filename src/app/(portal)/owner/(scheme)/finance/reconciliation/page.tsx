import { connection } from "next/server";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
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
  const schemeId = await getSelectedSchemeId();
  const header = (
    <PageHeader
      title="Three-way Reconciliation"
      description="Ledger, payment provider wallet and bank statement, with every difference listed."
      backHref="/owner/finance"
      backLabel="Finance"
    />
  );
  const isTreasurer = schemeId
    ? (
        await db.orm.public.SchemeMembership
          .where((m) => and(m.schemeId.eq(schemeId), m.profileId.eq(profile.id), m.isActive.eq(true), m.role.eq("COMMITTEE")))
          .limit(5)
          .all()
      ).some((m) => m.isTreasurer)
    : false;
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
