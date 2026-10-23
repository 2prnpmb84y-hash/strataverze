import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { effectiveStatus, noticeLabel, STATUS_LABELS, STATUS_STYLES } from "@/lib/levies/levy-ledger";
import { toIsoDay } from "@/lib/levies/notice-plan";
import { PageHeader } from "@/components/ui/page-header";
import { formatLotLabel } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { connection } from "next/server";

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OwnerLeviesPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
  );
  if (schemes.length === 0) notFound();

  // Get the owner's lot IDs from their memberships
  const lotEntries = schemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId)
      .map((m) => ({
        lotId: m.lotId!,
        schemeId: s.id,
        lotNumber: m.lot ? String(m.lot.lotNumber) : "",
        unitNumber: m.lot?.unitNumber ? String(m.lot.unitNumber) : null,
      })),
  );
  const lotIds = lotEntries.map((e) => e.lotId);
  const lotLabels = new Map(
    lotEntries.map((e) => [
      e.lotId,
      `${formatLotLabel(e.lotNumber)}${e.unitNumber ? ` (Unit ${e.unitNumber})` : ""}`,
    ]),
  );

  const notices = (await getLevyNoticesForLots(lotIds)).filter(
    (n) => String(n.status) !== "DRAFT",
  );
  const today = new Date().toISOString().slice(0, 10);

  interface DisplayItem {
    id: string;
    lotId: string;
    lotLabel: string;
    schemeId: string;
    title: string;
    noticeNumber: string;
    fundName: string;
    dueDate: string;
    status: string;
    amountDue: number;
    amountPaid: number;
    balance: number;
    interestCharged: number;
  }

  const displayItems: DisplayItem[] = notices.map((notice) => {
    const entry = lotEntries.find((e) => e.lotId === notice.lotId);
    return {
      id: notice.id,
      lotId: notice.lotId,
      lotLabel: lotLabels.get(notice.lotId) ?? "",
      schemeId: entry?.schemeId ?? notice.schemeId,
      title: noticeLabel(notice),
      noticeNumber: String(notice.noticeNumber),
      fundName: notice.fund ? String(notice.fund.name) : "",
      dueDate: toIsoDay(notice.dueDate),
      status: effectiveStatus(notice, today),
      amountDue: Number(notice.amountDue ?? 0) + Number(notice.interestCharged ?? 0),
      amountPaid: Number(notice.amountPaid ?? 0),
      balance: Number(notice.balanceOutstanding ?? 0),
      interestCharged: Number(notice.interestCharged ?? 0),
    };
  });

  // Sort newest first
  displayItems.sort(
    (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
  );

  // Summary totals
  const totalDue = displayItems.reduce((s, i) => s + i.amountDue, 0);
  const totalPaid = displayItems.reduce((s, i) => s + i.amountPaid, 0);
  const totalOutstanding = displayItems.reduce((s, i) => s + i.balance, 0);

  const outstanding = displayItems.filter((i) => i.balance > 0);
  const paid = displayItems.filter((i) => i.balance <= 0 && i.amountDue > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Levies"
        description="Levies and contributions due for your lots."
      />

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

      {/* Action links */}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" href="/owner/levies/debt-recovery">
          Debt Recovery
        </Button>
        <Button variant="secondary" href="/owner/levies/statement">
          View Statement
        </Button>
      </div>

      {displayItems.length === 0 ? (
        <EmptyState
          title="No levies yet"
          description="No levies have been issued for your lots yet."
        />
      ) : (
        <>
          {/* Outstanding */}
          {outstanding.length > 0 && (
            <Card>
              <CardHeader
                title="Outstanding"
                description={`${outstanding.length} lev${outstanding.length === 1 ? "y" : "ies"} with amounts due.`}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
                      <th scope="col" className="text-left px-6 py-2">Levy</th>
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
                              ? ` · includes ${formatCurrency(item.interestCharged)} interest`
                              : ""}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-ink">
                          {item.lotLabel}
                        </td>
                        <td className="px-4 py-2 text-ink-muted whitespace-nowrap">
                          {new Date(item.dueDate).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
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
                description={`${paid.length} lev${paid.length === 1 ? "y" : "ies"} fully paid.`}
              />
              <div className="flex flex-col gap-2 px-6 pb-6">
                {paid.map((item) => {
                  const dueDate = new Date(item.dueDate);
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
                          {dueDate.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
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
    </div>
  );
}
