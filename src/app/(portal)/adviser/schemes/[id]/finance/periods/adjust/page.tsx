import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFinancialPeriodById } from "@/lib/queries/financial-periods";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { getFundsForScheme } from "@/lib/queries/funds";
import { PageHeader } from "@/components/ui/page-header";
import { AdjustmentForm } from "./adjustment-form";

export default async function AdjustmentEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodId?: string }>;
}) {
  const { id } = await params;
  const { periodId } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  if (!periodId) {
    redirect(`/adviser/schemes/${id}/finance/periods`);
  }

  const period = await getFinancialPeriodById(periodId);
  if (!period || period.status === "LOCKED") {
    redirect(`/adviser/schemes/${id}/finance/periods`);
  }

  const [accountCodes, funds] = await Promise.all([
    getAccountCodesForScheme(id),
    getFundsForScheme(id),
  ]);

  const activeAccounts = accountCodes
    .filter((a) => a.isActive)
    .map((a) => ({
      id: a.id,
      code: String(a.code),
      name: String(a.name),
      accountType: a.accountType,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const activeFunds = funds
    .filter((f) => !f.deletedAt)
    .map((f) => ({
      id: f.id,
      name: String(f.name),
      fundType: f.fundType,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Post Adjustment Entry"
        description={`Period: ${String(period.name)} (${period.status}). Adjustment entries can be posted to closed periods without reopening them.`}
      />

      <AdjustmentForm
        schemeId={id}
        periodStartDate={String(period.startDate).slice(0, 10)}
        periodEndDate={String(period.endDate).slice(0, 10)}
        accounts={activeAccounts}
        funds={activeFunds}
      />
    </div>
  );
}
