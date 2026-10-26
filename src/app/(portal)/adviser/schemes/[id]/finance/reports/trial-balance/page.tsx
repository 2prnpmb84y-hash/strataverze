import { notFound } from "next/navigation";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getTrialBalanceReport } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { TrialBalanceClient } from "./trial-balance-client";
import { connection } from "next/server";

export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fund?: string; asAtDate?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { fund: fundFilter, asAtDate } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const funds = await getFundsForScheme(id);

  // Default to today if no date specified
  const reportDate = asAtDate || (await schemeToday(id));

  const report = await getTrialBalanceReport(
    id,
    reportDate,
    fundFilter || null,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <TrialBalanceClient
        schemeId={id}
        funds={funds.map((f) => ({ id: f.id, name: String(f.name) }))}
        selectedFund={fundFilter ?? ""}
        asAtDate={reportDate}
        lines={report.lines}
        totalDebits={report.totalDebits}
        totalCredits={report.totalCredits}
        isBalanced={report.isBalanced}
      />
    </div>
  );
}
