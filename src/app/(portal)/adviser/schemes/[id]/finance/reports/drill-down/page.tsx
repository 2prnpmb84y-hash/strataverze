import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { parseDrillDownParams } from "@/lib/finance/drill-down";
import { getEntrySources, getJournalEntriesForReportCell } from "@/lib/finance/report-drill-down";
import { PageHeader } from "@/components/ui/page-header";
import { ReportCellDrillDown } from "@/components/finance/report-cell-drill-down";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { packWordsFor } from "@/lib/jurisdiction/screen-words";

/** TC-013: from a report figure to the journal entries, source records and documents behind it. */
export default async function ReportDrillDownPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();

  const p = parseDrillDownParams(await searchParams);
  if (!p) notFound();
  const cell = await getJournalEntriesForReportCell(id, p.accountId, p.fundId, { start: p.start, end: p.end }, p.mode);
  if (!cell) notFound();
  const { rules } = rulesForState(scheme.state);
  const sources = await getEntrySources(id, cell.rows.map((r) => ({ id: r.entryId, sourceType: r.sourceType, sourceId: r.sourceId })), rules.TERMINOLOGY);
  const base = `/adviser/schemes/${id}/finance`;

  return (
    <div className="space-y-6">
      <PageHeader title="Behind this figure" description={String(scheme.name)} backHref={`${base}/reports`} backLabel="Reports" />
      <ReportCellDrillDown
        cell={cell}
        sources={sources}
        words={packWordsFor(rules)}
        links={{
          entry: (entryId) => `${base}/journal/${entryId}`,
          source: (s) => {
            switch (s.kind) {
              case "SUPPLIER_INVOICE":
                return `${base}/invoices/${s.id}`;
              case "LEVY_SCHEDULE":
                return `${base}/levies/${s.id}`;
              case "LEVY_NOTICE":
                return s.levyScheduleId ? `${base}/levies/${s.levyScheduleId}` : `/api/finance/pdf/levy-notice/${s.id}`;
              case "BANK_TRANSACTION":
              case "SUSPENSE_ITEM":
                return `${base}/reconciliation`;
              case "OWNER_CREDIT":
              case "OWNER_CREDIT_REFUND":
                return `${base}/owner-credits`;
              case "JOURNAL_ENTRY":
                return `${base}/journal/${s.id}`;
              default:
                return null;
            }
          },
          document: (d) => `${base}/documents/${d.id}`,
          bankTransaction: () => `${base}/reconciliation`,
        }}
      />
    </div>
  );
}
