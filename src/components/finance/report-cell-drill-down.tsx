import Link from "next/link";
import { formatAud } from "@/lib/billing/money";
import { modeLabel, normalSide } from "@/lib/finance/drill-down";
import type { EntryBankTransaction, EntryDocument, EntrySourceRecord, EntrySources, ReportCell } from "@/lib/finance/report-drill-down";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { entryTypeLabel, type PackWords } from "@/lib/jurisdiction/screen-words";

export interface DrillDownLinks {
  /** The journal entry page, where the portal has one. */
  entry?: (entryId: string) => string;
  /** The source record's page, where the portal has one. */
  source?: (source: EntrySourceRecord) => string | null;
  document: (doc: EntryDocument) => string;
  bankTransaction?: (txn: EntryBankTransaction) => string | null;
}

/** How an entry was recognised, in the building's words. */
const viaLabels = (w: Pick<PackWords, "Levy">): Record<string, string> => ({
  LEVY_RECEIPT: `${w.Levy} received`,
  INVOICE_PAYMENT: "Invoice paid",
});

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function period(start: string | null, end: string | null) {
  if (start && end) return `${longDate(start)} to ${longDate(end)}`;
  if (end) return `All entries to ${longDate(end)}`;
  if (start) return `From ${longDate(start)}`;
  return "All periods";
}

/** The journal entries behind one report figure, each with where it came from. */
/** `words` are the building's (packWordsFor). */
export function ReportCellDrillDown({ cell, sources, links, words }: { cell: ReportCell; sources: Map<string, EntrySources>; links: DrillDownLinks; words: Pick<PackWords, "Levy" | "levy" | "levies" | "lateCharge"> }) {
  const side = normalSide(cell.account.accountType);
  const VIA = viaLabels(words);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={`${cell.account.code} ${cell.account.name}`}
          description={[cell.fund?.name ?? "All funds", period(cell.params.start, cell.params.end), modeLabel(cell.params.mode, words)].join(" · ")}
        />
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Entries</dt>
            <dd className="mt-1 tabular-nums text-ink">{cell.rows.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Debits</dt>
            <dd className="mt-1 tabular-nums text-ink">{formatAud(cell.debitCents)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Credits</dt>
            <dd className="mt-1 tabular-nums text-ink">{formatAud(cell.creditCents)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Report figure</dt>
            <dd className="mt-1 tabular-nums font-semibold text-ink">
              {formatAud(cell.totalCents)} <span className="text-xs font-normal text-ink-muted">{side === "DEBIT" ? "Dr" : "Cr"}</span>
            </dd>
          </div>
        </dl>
      </Card>

      {cell.rows.length === 0 ? (
        <EmptyState title="No entries behind this figure" description="No posted journal entries make up this amount for the selected period." />
      ) : (
        <Card>
          <CardHeader title="Journal entries" description="Oldest first. Each entry links to the record it came from, its documents and any bank transaction it was matched to." />
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="px-2 py-2 text-left">Date</th>
                  <th scope="col" className="px-2 py-2 text-left">Entry</th>
                  <th scope="col" className="px-2 py-2 text-left">Description</th>
                  <th scope="col" className="px-2 py-2 text-left">Source and documents</th>
                  <th scope="col" className="px-2 py-2 text-right">Debit</th>
                  <th scope="col" className="px-2 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {cell.rows.map((r) => {
                  const s = sources.get(r.entryId);
                  const sourceHref = s?.source && links.source ? links.source(s.source) : null;
                  return (
                    <tr key={r.entryId} className="border-b border-line/60 align-top">
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums text-ink-muted">{longDate(r.date)}</td>
                      <td className="px-2 py-2 whitespace-nowrap font-mono text-xs">
                        {links.entry ? (
                          <Link href={links.entry(r.entryId)} className="text-turquoise underline">
                            {r.entryNumber}
                          </Link>
                        ) : (
                          r.entryNumber
                        )}
                      </td>
                      <td className="px-2 py-2 min-w-0">
                        <p className="text-ink">{r.description}</p>
                        {r.notes.length > 0 && <p className="text-xs text-ink-muted">{r.notes.join("; ")}</p>}
                        {VIA[r.via] && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-ink-muted">{VIA[r.via]}</span>}
                      </td>
                      <td className="px-2 py-2 min-w-0 space-y-1">
                        {s?.source ? (
                          sourceHref ? (
                            <Link href={sourceHref} className="block text-turquoise underline">
                              {s.source.label}
                            </Link>
                          ) : (
                            <p className="text-ink">{s.source.label}</p>
                          )
                        ) : (
                          <p className="text-ink-muted">{r.sourceType ? `${entryTypeLabel(r.sourceType, words).toLowerCase().replace(/_/g, " ")} entry` : "Manual entry"}</p>
                        )}
                        {s?.documents.map((d) => (
                          <a key={d.id} href={links.document(d)} className="block text-xs text-turquoise underline" target="_blank" rel="noreferrer">
                            {d.fileName}
                          </a>
                        ))}
                        {s?.bankTransactions.map((t) => {
                          const href = links.bankTransaction?.(t);
                          const text = `Bank ${longDate(t.date)} ${formatAud(t.amountCents)} (${t.status.toLowerCase()})`;
                          return href ? (
                            <Link key={t.id} href={href} className="block text-xs text-turquoise underline">
                              {text}
                            </Link>
                          ) : (
                            <p key={t.id} className="text-xs text-ink-muted">
                              {text}
                            </p>
                          );
                        })}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.debitCents ? formatAud(r.debitCents) : ""}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.creditCents ? formatAud(r.creditCents) : ""}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td colSpan={4} className="px-2 py-2 text-ink">
                    Total ({formatAud(cell.totalCents)} {side === "DEBIT" ? "Dr" : "Cr"})
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatAud(cell.debitCents)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatAud(cell.creditCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
