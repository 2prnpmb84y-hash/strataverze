import { notFound } from "next/navigation";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { financialYearRange, getStatutoryStatementsPack } from "@/lib/finance/statutory-pack";
import { resolutionMeetings } from "@/lib/finance/resolutions";
import { formatAud } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatutoryPackView } from "@/components/finance/statutory-pack-view";
import { AdoptPackForm, FundBasisSelect } from "./pack-controls";

export default async function StatutoryPackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  await connection();
  const { id } = await params;
  const { year } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();

  const today = await schemeToday(id);
  // Default: the last financial year that has ended.
  let defaultYear = Number(today.slice(0, 4));
  while (financialYearRange(defaultYear, String(scheme.financialYearEnd ?? "06-30")).end >= today) defaultYear--;
  const financialYear = year && /^\d{4}$/.test(year) ? Number(year) : defaultYear;
  const [pack, agms] = await Promise.all([getStatutoryStatementsPack(id, financialYear), resolutionMeetings(id, ["AGM", "FIRST_AGM"])]);
  const base = `/adviser/schemes/${id}/finance/reports/statutory-pack`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statutory Statements"
        description={`Financial year ${pack.start} to ${pack.end}. The statement of key financial information, income and expenditure, balance sheet, levy register and notes, per fund.`}
        backHref={`/adviser/schemes/${id}/finance/reports`}
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
      </form>

      {pack.adopted ? (
        <p className="rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Adopted at the AGM on {pack.adopted.adoptedAt.slice(0, 10)} and locked.{" "}
          <a href={`/api/finance/statutory-pack/${pack.adopted.snapshotId}`} className="underline">
            Download the locked copy
          </a>
          . The figures below are recalculated from the ledger today and may differ if entries were changed later.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title={pack.audit.required ? "An audit is required" : "Audit"}
          description={
            pack.audit.required
              ? `This scheme must have its accounts audited (${pack.audit.byLots ? `more than ${pack.rules.auditThreshold.lotsMoreThan} lots, not counting parking or utility lots` : `levies raised for the year of ${formatAud(pack.audit.annualBudgetCents)} are more than ${formatAud(pack.rules.auditThreshold.leviesRaisedMoreThanCents)}`}).${pack.rules.auditThreshold.timing ? ` The audit must be done ${pack.rules.auditThreshold.timing}, in accordance with ${pack.rules.auditThreshold.standard}.` : ""} Give the auditor the audit export.`
              : `Not required by size (levies raised for the year ${formatAud(pack.audit.annualBudgetCents)}, ${pack.audit.lotsCounted ?? pack.scheme.lots} lots${pack.audit.lotsExcluded ? ` counted, ${pack.audit.lotsExcluded} parking or utility lots not counted` : ""}). The AGM must consider whether to have the accounts audited.`
          }
        />
      </Card>

      <Card>
        <CardHeader title="Accounting basis" description="How each fund's statements recognise income and expenditure. Changing it does not change the ledger." />
        <div className="space-y-2">
          {pack.funds.map((f) => (
            <FundBasisSelect key={f.fundId} schemeId={id} fundId={f.fundId} fundName={f.fundName} basis={f.basis} locked={!!pack.adopted} />
          ))}
        </div>
      </Card>

      <StatutoryPackView pack={pack} reportsBase={`/adviser/schemes/${id}/finance/reports`} />

      {!pack.adopted && (
        <Card>
          <CardHeader
            title="Adopt at the AGM"
            description="Record the annual general meeting and the motion at which these statements were presented and adopted. A locked copy is kept as a financial document linked to the meeting."
          />
          <AdoptPackForm schemeId={id} financialYear={financialYear} meetings={agms} />
        </Card>
      )}
    </div>
  );
}
