import Link from "next/link";
import { noticeLeadText } from "@/lib/jurisdiction/wording";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireSchemeMembership } from "@/lib/auth/require-membership";
import { getSchemeById } from "@/lib/queries/schemes";
import { loadIncomeBudget } from "@/lib/onboarding/save-income-budget";
import { PageHeader } from "@/components/ui/page-header";
import { IncomeBudgetClient } from "./income-budget-client";
import { levySharedBy } from "@/lib/jurisdiction/screen-words";

/** Onboarding: last year's income and expenditure, this year's budget and levies (24 Oct). */
export default async function IncomeBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  await requireSchemeMembership(id, ["ADVISER"]);
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  const data = await loadIncomeBudget(id);
  const cutoverBase = `/adviser/schemes/${id}/finance/migration/cutover`;
  // The building's words, from its rule pack.
  const { rules } = await rulesForScheme(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income, Expenditure and Budget"
        description={`Part of onboarding: last year's income and expenditure from the previous manager's statements, this year's budget, and the ${rules.TERMINOLOGY.levies} it sets.`}
        backHref={"problem" in data ? cutoverBase : `${cutoverBase}?batch=${data.cutover.id}`}
        backLabel="Cutover"
      />
      {"problem" in data ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {data.problem}{" "}
          <Link href={cutoverBase} className="font-medium underline">
            Go to the cutover
          </Link>
          .
        </div>
      ) : (
        <IncomeBudgetClient schemeId={id} ctx={data.ctx} saved={data.saved} locks={data.locks} cutoverHref={`${cutoverBase}?batch=${data.cutover.id}`} noticeLead={noticeLeadText(rules.NOTICE_RULES)}
          words={{ levy: rules.TERMINOLOGY.levy, levies: rules.TERMINOLOGY.levies, sharedBy: levySharedBy(rules) }}
        />
      )}
    </div>
  );
}
