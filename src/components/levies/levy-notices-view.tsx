import type { ReactNode } from "react";
import type { LevyItem } from "@/lib/levies/levy-ledger";
import { levyItemTotals, STATUS_LABELS, STATUS_STYLES } from "@/lib/levies/levy-ledger";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { LevyWords } from "@/lib/jurisdiction/screen-words";

/**
 * An owner's levies: totals, the notices with amounts outstanding and those
 * paid (moved from the owner's levies page, 24 Oct 2026, so the Adviser's
 * "Owner's view" of a lot shows exactly the same). Presentational only.
 * The levy and late charge words are the building's (`words`, from its rule
 * pack through the server page).
 */

const upper = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A due date is a calendar day, so it is shown in UTC: the same on the server and in any browser.
const SHORT_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function shortDate(isoDay: string): string {
  return isoDay ? SHORT_DATE.format(new Date(`${isoDay.slice(0, 10)}T00:00:00Z`)) : "";
}

export function LevyNoticesView({
  items,
  actions,
  emptyDescription,
  words,
  lateChargeByScheme,
}: {
  /** The building's words for a levy and a late charge (sharedLevyWords where several buildings are shown). */
  words: Pick<LevyWords, "levy" | "levies" | "lateCharge">;
  /**
   * Each building's own word for a late charge, by scheme id, for the rows
   * where several buildings are shown: a row says what its own building
   * charged ("interest", "penalty"). Without it every row uses `words`.
   */
  lateChargeByScheme?: Readonly<Record<string, string>>;
  items: LevyItem[];
  /** Links shown above the lists (the owner's Debt Recovery and View Statement). */
  actions?: ReactNode;
  emptyDescription?: string;
}) {
  const displayItems = items;
  const { totalDue, totalPaid, totalOutstanding } = levyItemTotals(items);
  const outstanding = displayItems.filter((i) => i.balance > 0);
  const paid = displayItems.filter((i) => i.balance <= 0 && i.amountDue > 0);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Due"
          value={formatCurrency(totalDue)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Paid"
          value={formatCurrency(totalPaid)}
          accent="bg-green-500"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          accent={totalOutstanding > 0 ? "bg-red-500" : "bg-green-500"}
        />
      </div>

      {actions && <div className="flex justify-end gap-3">{actions}</div>}

      {displayItems.length === 0 ? (
        <EmptyState
          title={`No ${words.levies} yet`}
          description={emptyDescription ?? `No ${words.levies} have been issued for your lots yet.`}
        />
      ) : (
        <>
          {/* Outstanding */}
          {outstanding.length > 0 && (
            <Card>
              <CardHeader
                title="Outstanding"
                description={`${outstanding.length} ${outstanding.length === 1 ? words.levy : words.levies} with amounts due.`}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
                      <th scope="col" className="text-left px-6 py-2">{upper(words.levy)}</th>
                      <th scope="col" className="text-left px-4 py-2">Lot</th>
                      <th scope="col" className="text-left px-4 py-2">Due Date</th>
                      <th scope="col" className="text-right px-4 py-2">Amount</th>
                      <th scope="col" className="text-right px-4 py-2">Paid</th>
                      <th scope="col" className="text-right px-4 py-2">Balance</th>
                      <th scope="col" className="text-right px-6 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstanding.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-line/50"
                      >
                        <td className="px-6 py-2">
                          <p className="font-medium text-ink">
                            {item.title}
                          </p>
                          <p className="text-xs text-ink-muted">
                            <a href={`/api/finance/pdf/levy-notice/${item.id}`} target="_blank" rel="noopener" className="underline">
                              {item.noticeNumber} (PDF)
                            </a>
                            {item.interestCharged > 0
                              ? ` · includes ${formatCurrency(item.interestCharged)} ${lateChargeByScheme?.[item.schemeId] ?? words.lateCharge}`
                              : ""}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-ink">
                          {item.lotLabel}
                        </td>
                        <td className="px-4 py-2 text-ink-muted whitespace-nowrap">
                          {shortDate(item.dueDate)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-ink">
                          {formatCurrency(item.amountDue)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-green-600">
                          {formatCurrency(item.amountPaid)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-red-600">
                          {formatCurrency(item.balance)}
                        </td>
                        <td className="px-6 py-2 text-right">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status] ?? "bg-gray-100 text-gray-700"}`}
                          >
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-semibold">
                      <td className="px-6 py-3 text-ink" colSpan={3}>
                        Total Outstanding
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">
                        {formatCurrency(
                          outstanding.reduce((s, i) => s + i.amountDue, 0),
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-600">
                        {formatCurrency(
                          outstanding.reduce((s, i) => s + i.amountPaid, 0),
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">
                        {formatCurrency(
                          outstanding.reduce((s, i) => s + i.balance, 0),
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* Paid in full */}
          {paid.length > 0 && (
            <Card>
              <CardHeader
                title="Paid"
                description={`${paid.length} ${paid.length === 1 ? words.levy : words.levies} fully paid.`}
              />
              <div className="flex flex-col gap-2 px-6 pb-6">
                {paid.map((item) => {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {item.title}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {item.lotLabel}
                          {" · "}
                          <a href={`/api/finance/pdf/levy-notice/${item.id}`} target="_blank" rel="noopener" className="underline">
                            {item.noticeNumber} (PDF)
                          </a>
                          {" · Due "}
                          {shortDate(item.dueDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums text-ink">
                          {formatCurrency(item.amountDue)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          Paid
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
