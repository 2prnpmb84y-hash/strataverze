import Link from "next/link";
import { getJournalEntriesForScheme } from "@/lib/queries/journal-entries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  POSTED: "bg-green-100 text-green-700",
  REVERSED: "bg-red-100 text-red-700",
};

export default async function JournalEntriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  // Adviser finance: checked here as well as in the layout.
  if (!(await requirePageAccess(id, "finance.write"))) return null;
  const entries = await getJournalEntriesForScheme(id);

  const totalEntries = entries.length;
  const postedCount = entries.filter((e) => e.status === "POSTED").length;
  const draftCount = entries.filter((e) => e.status === "DRAFT").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Journal Entries
        </h1>
        <Button variant="primary" href={`/adviser/schemes/${id}/finance/journal/new`}>
          New Journal Entry
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Entries" value={totalEntries} accent="bg-turquoise" />
        <StatCard label="Posted" value={postedCount} accent="bg-green-500" />
        <StatCard label="Draft" value={draftCount} accent="bg-zinc-400" />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon="book-open"
          title="No journal entries"
          description="Create your first journal entry to start recording financial transactions for this scheme."
          actionLabel="New Journal Entry"
          actionHref={`/adviser/schemes/${id}/finance/journal/new`}
        />
      ) : (
        <Card>
          <div className="divide-y divide-line">
            {entries.map((entry) => {
              const totalDebit = entry.lines.reduce(
                (sum, line) => sum + Number(line.debit ?? 0),
                0
              );

              return (
                <Link key={entry.id} href={`/adviser/schemes/${id}/finance/journal/${entry.id}`} className="block p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-ink-muted">
                          {String(entry.entryNumber)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[entry.status] ?? "bg-zinc-100 text-zinc-600"}`}
                        >
                          {entry.status}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {entry.entryType}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium">
                        {String(entry.description)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {new Date(
                          String(entry.transactionDate)
                        ).toLocaleDateString("en-AU")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {formatCurrency(totalDebit)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        Total Debit
                      </p>
                    </div>
                  </div>

                  {entry.lines.length > 0 && (
                    <div className="mt-2 ml-4 border-l-2 border-line pl-4 space-y-1">
                      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 text-xs font-medium text-ink-muted pb-1">
                        <span>Account</span>
                        <span>Fund</span>
                        <span className="text-right">Debit</span>
                        <span className="text-right">Credit</span>
                      </div>
                      {entry.lines.map((line, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 text-sm"
                        >
                          <span className="truncate">
                            <span className="font-mono text-xs text-ink-muted">
                              {String(line.accountCode.code)}
                            </span>{" "}
                            {String(line.accountCode.name)}
                          </span>
                          <span className="truncate text-ink-muted">
                            {line.fund?.name ?? "—"}
                          </span>
                          <span className="text-right tabular-nums">
                            {line.debit ? formatCurrency(line.debit) : "—"}
                          </span>
                          <span className="text-right tabular-nums">
                            {line.credit ? formatCurrency(line.credit) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
