import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getLevySchedulesForScheme } from "@/lib/queries/levy-schedules";
import { toIsoDay } from "@/lib/levies/notice-plan";
import type { PackWords } from "@/lib/jurisdiction/screen-words";

function money(value: number): string {
  return value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  ACTIVE: "Issued",
  SUPERSEDED: "Superseded",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  APPROVED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-amber-100 text-amber-700",
};

/** Summary of the scheme's levies (budget schedules and special levies), in the building's words. */
export function LeviesCard({
  id,
  schedules,
  className = "mb-6",
  today,
  words: w,
}: {
  id: string;
  schedules: Awaited<ReturnType<typeof getLevySchedulesForScheme>>;
  className?: string;
  /** Today in the building's time zone. */
  today: string;
  /** The building's words (packWordsFor). */
  words: PackWords;
}) {
  const rows = schedules.map((s) => {
    const notices = (s.levyNotices ?? []).filter((n) => String(n.status) !== "DRAFT");
    const outstanding = notices.reduce((sum, n) => sum + Number(n.balanceOutstanding ?? 0), 0);
    const overdue = notices.filter(
      (n) => Number(n.balanceOutstanding ?? 0) > 0 && toIsoDay(n.dueDate) < today,
    ).length;
    return {
      id: s.id,
      title:
        s.levyType === "SPECIAL"
          ? `Special ${w.levy}: ${String(s.title ?? "Untitled")}`
          : `FY ${String(s.financialYear)} budget ${w.levy}`,
      fund: s.fund ? String(s.fund.name) : "",
      status: String(s.status),
      amount: Number(s.budgetAmount ?? 0),
      noticeCount: notices.length,
      outstanding,
      overdue,
    };
  });

  return (
    <Card className={className}>
      <CardHeader
        title={w.Levies}
        description={
          rows.length === 0
            ? `No ${w.levies} raised yet.`
            : `${rows.length} ${rows.length === 1 ? w.levy : w.levies} on record.`
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button href={`/adviser/schemes/${id}/finance/levies/special/new`} variant="secondary">
              Raise Special {w.Levy}
            </Button>
            <Button href={`/adviser/schemes/${id}/finance/levies`} variant="secondary">
              Go to {w.Levies}
            </Button>
          </div>
        }
      />
      {rows.length > 0 ? (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/adviser/schemes/${id}/finance/levies/${row.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{row.title}</p>
                <p className="text-xs text-ink-muted">
                  {row.fund}
                  {row.fund ? " · " : ""}
                  {money(row.amount)}
                  {row.noticeCount > 0 ? ` · ${row.noticeCount} notices` : ""}
                  {row.overdue > 0 ? ` · ${row.overdue} overdue` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {row.noticeCount > 0 && (
                  <span className="text-sm font-medium text-ink tabular-nums">
                    {money(row.outstanding)} outstanding
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status] ?? "bg-zinc-100 text-zinc-600"}`}
                >
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Create a budget {w.levy} schedule or raise a special {w.levy} under Financials.
        </p>
      )}
    </Card>
  );
}
