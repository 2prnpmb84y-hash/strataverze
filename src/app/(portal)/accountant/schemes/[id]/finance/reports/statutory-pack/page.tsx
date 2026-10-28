import { notFound } from "next/navigation";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { connection } from "next/server";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { financialYearRange, getStatutoryStatementsPack } from "@/lib/finance/statutory-pack";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { packWordsFor } from "@/lib/jurisdiction/screen-words";
import { PageHeader } from "@/components/ui/page-header";
import { StatutoryPackView } from "@/components/finance/statutory-pack-view";

export default async function AccountantStatutoryPackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  await connection();
  const { id } = await params;
  const { year } = await searchParams;
  try {
    await requireFinancialReadAccess(id);
  } catch {
    notFound();
  }
  const today = await schemeToday(id);
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!rulesForState(scheme.state).rules.FEATURES.keyFinancialInformation) notFound();
  let defaultYear = Number(today.slice(0, 4));
  while (financialYearRange(defaultYear, String(scheme.financialYearEnd ?? "06-30")).end >= today) defaultYear--;
  const financialYear = year && /^\d{4}$/.test(year) ? Number(year) : defaultYear;
  const pack = await getStatutoryStatementsPack(id, financialYear);
  const base = `/accountant/schemes/${id}/finance/reports/statutory-pack`;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Statutory Statements"
        description={`Financial year ${pack.start} to ${pack.end}.${pack.adopted ? " Adopted at the AGM and locked." : ""}`}
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />
      <form action={base} method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">Financial year starting in</span>
          <input name="year" type="number" min="2000" max="2100" defaultValue={financialYear} className="w-32 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-zinc-50">
          Show
        </button>
        <a href={`/api/finance/audit-export?schemeId=${id}&year=${financialYear}`} className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-zinc-50">
          Download audit export (zip)
        </a>
        <a href={`/api/finance/pdf/statutory-pack?schemeId=${id}&year=${financialYear}`} target="_blank" rel="noopener" className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-zinc-50">
          Financial statements (PDF)
        </a>
        {pack.adopted && (
          <a href={`/api/finance/statutory-pack/${pack.adopted.snapshotId}`} className="text-sm underline">
            Download the locked copy
          </a>
        )}
      </form>
      <StatutoryPackView pack={pack} reportsBase={`/accountant/schemes/${id}/finance/reports`} words={packWordsFor(rulesForState(scheme.state).rules)} />
    </div>
  );
}
