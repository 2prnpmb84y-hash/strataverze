import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getJournalEntriesForScheme } from "@/lib/queries/journal-entries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IncomeExpenditureClient } from "./income-expenditure-client";
import { connection } from "next/server";

export default async function IncomeExpenditurePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fund?: string; startDate?: string; endDate?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { fund: fundFilter, startDate, endDate } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const funds = await getFundsForScheme(id);

  // Fetch posted journal entries for the period
  const entries = await getJournalEntriesForScheme(id, {
    status: "POSTED",
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  // Build account-level aggregates from journal lines
  type AccountAggregate = {
    code: string;
    name: string;
    accountType: string;
    fundId: string | null;
    fundName: string;
    totalDebit: number;
    totalCredit: number;
    netAmount: number;
  };

  const accountMap = new Map<string, AccountAggregate>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      // Filter by fund if selected
      if (fundFilter && line.fundId !== fundFilter) continue;

      const accountCode = line.accountCode;
      if (!accountCode) continue;

      const key = `${accountCode.id}-${line.fundId ?? "none"}`;
      const existing = accountMap.get(key);
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if (existing) {
        existing.totalDebit += debit;
        existing.totalCredit += credit;
      } else {
        accountMap.set(key, {
          code: String(accountCode.code),
          name: String(accountCode.name),
          accountType: String(accountCode.accountType),
          fundId: accountCode.fundId ?? null,
          fundName: line.fund ? String(line.fund.name) : "Unallocated",
          totalDebit: debit,
          totalCredit: credit,
          netAmount: 0,
        });
      }
    }
  }

  // Calculate net amounts
  const accounts = Array.from(accountMap.values()).map((acc) => {
    // For income accounts, net = credits - debits (normal credit balance)
    // For expense accounts, net = debits - credits (normal debit balance)
    if (acc.accountType === "INCOME") {
      acc.netAmount = acc.totalCredit - acc.totalDebit;
    } else {
      acc.netAmount = acc.totalDebit - acc.totalCredit;
    }
    return acc;
  });

  // Separate income and expense accounts, filter zero values by default
  const incomeAccounts = accounts
    .filter((a) => a.accountType === "INCOME")
    .sort((a, b) => a.code.localeCompare(b.code));
  const expenseAccounts = accounts
    .filter((a) => a.accountType === "EXPENSE")
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalIncome = incomeAccounts.reduce((sum, a) => sum + a.netAmount, 0);
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + a.netAmount, 0);
  const netSurplus = totalIncome - totalExpenses;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income & Expenditure Statement"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <IncomeExpenditureClient
        schemeId={id}
        funds={funds.map((f) => ({ id: f.id, name: String(f.name) }))}
        selectedFund={fundFilter ?? ""}
        startDate={startDate ?? ""}
        endDate={endDate ?? ""}
        incomeAccounts={incomeAccounts}
        expenseAccounts={expenseAccounts}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        netSurplus={netSurplus}
      />
    </div>
  );
}
