import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { parseDrillDownParams } from "@/lib/finance/drill-down";
import { getEntrySources, getJournalEntriesForReportCell } from "@/lib/finance/report-drill-down";
import { PageHeader } from "@/components/ui/page-header";
import { ReportCellDrillDown } from "@/components/finance/report-cell-drill-down";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { packWordsFor } from "@/lib/jurisdiction/screen-words";

/** TC-013 for the scheme's accountant: read only, with the documents behind each entry. */
export default async function AccountantReportDrillDownPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { id } = await params;
  await requireFinancialReadAccess(id);
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const p = parseDrillDownParams(await searchParams);
  if (!p) notFound();
  const cell = await getJournalEntriesForReportCell(id, p.accountId, p.fundId, { start: p.start, end: p.end }, p.mode);
  if (!cell) notFound();
  const { rules } = rulesForState(scheme.state);
  const sources = await getEntrySources(id, cell.rows.map((r) => ({ id: r.entryId, sourceType: r.sourceType, sourceId: r.sourceId })), rules.TERMINOLOGY);

  return (
    <div className="space-y-6">
      <PageHeader title="Behind this figure" description={String(scheme.name)} backHref={`/accountant/schemes/${id}/finance/reports`} backLabel="Reports" />
      <ReportCellDrillDown
        cell={cell}
        sources={sources}
        words={packWordsFor(rules)}
        links={{
          source: (s) => (s.kind === "LEVY_NOTICE" ? `/api/finance/pdf/levy-notice/${s.id}` : null),
          document: (d) => `/api/finance/documents/${d.id}`,
        }}
      />
    </div>
  );
}
