import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { getBudgetLinesForScheme, getBudgetVsActual } from "@/lib/queries/budget";
import { PageHeader } from "@/components/ui/page-header";
import { BudgetClient } from "./budget-client";
import { connection } from "next/server";
import { getBudgets } from "@/lib/finance/budgets";
import { workingBudgets } from "@/lib/finance/budget-status";
import { resolutionMeetings } from "@/lib/finance/resolutions";
import { BudgetStatusPanel, type FundBudgetStatus } from "./budget-status-panel";

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; fund?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { year: yearParam, fund: fundParam } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  // Default to current Australian financial year (Jul-Jun)
  const now = new Date();
  const currentFY = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const financialYear = yearParam ? parseInt(yearParam, 10) : currentFY;

  const [funds, accountCodes, budgetLines, budgets, meetings] = await Promise.all([
    getFundsForScheme(id),
    getAccountCodesForScheme(id),
    getBudgetLinesForScheme(id, financialYear),
    getBudgets(id, financialYear),
    resolutionMeetings(id),
  ]);
  const working = workingBudgets(budgets);
  const meetingLabels = new Map(meetings.map((m) => [m.id, m.label]));
  const statusRows: FundBudgetStatus[] = funds.map((f) => {
    const b = working.find((x) => x.fundId === f.id) ?? null;
    return {
      fundId: f.id,
      fundName: String(f.name),
      budgetId: b?.id ?? null,
      version: b?.version ?? null,
      status: b?.status ?? null,
      adoptedLabel: b?.adoptedMeetingId ? (meetingLabels.get(b.adoptedMeetingId) ?? "a general meeting") : null,
    };
  });

  // Get budget vs actual for the selected fund (or all funds)
  const selectedFundId = fundParam || (funds[0]?.id ?? "");
  let budgetVsActual = null;
  if (selectedFundId) {
    budgetVsActual = await getBudgetVsActual(id, selectedFundId, financialYear);
  }

  // Build account code map for display
  const accountCodeMap = accountCodes.map((ac) => ({
    id: ac.id,
    code: String(ac.code),
    name: String(ac.name),
    accountType: ac.accountType,
    fundId: ac.fundId,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget Management"
        description={`${String(scheme.name)} — FY ${financialYear}/${financialYear + 1}`}
        backHref={`/adviser/schemes/${id}/finance`}
        backLabel="Finance"
      />

      <BudgetStatusPanel schemeId={id} rows={statusRows} meetings={meetings} />

      <BudgetClient
        schemeId={id}
        financialYear={financialYear}
        funds={funds.map((f) => ({
          id: f.id,
          name: String(f.name),
          fundType: f.fundType,
        }))}
        accountCodes={accountCodeMap}
        budgetLines={budgetLines.map((bl) => ({
          id: bl.id,
          fundId: bl.fundId,
          accountCodeId: bl.accountCodeId,
          financialYear: bl.financialYear,
          budgetAmount: Number(bl.budgetAmount),
          notes: bl.notes,
          fundName: bl.fund ? String(bl.fund.name) : "—",
        }))}
        selectedFundId={selectedFundId}
        budgetVsActual={budgetVsActual}
      />
    </div>
  );
}
