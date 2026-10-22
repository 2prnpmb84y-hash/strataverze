import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { effectiveStatus, noticeLabel, noticeTotals, STATUS_LABELS, STATUS_STYLES } from "@/lib/levies/levy-ledger";
import { toIsoDay } from "@/lib/levies/notice-plan";
import { getFundsForSchemes } from "@/lib/queries/funds";
import { PageHeader } from "@/components/ui/page-header";
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

export default async function OwnerFinancePage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getSelectedSchemeId(),
  );

  if (schemes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Finance"
          description="Your levy contributions and fund balances."
        />
        <EmptyState
          title="No properties found"
          description="You are not currently registered as an owner in any strata scheme."
        />
      </div>
    );
  }

  const schemeIds = schemes.map((s) => s.id);
  const schemeNames = new Map(schemes.map((s) => [s.id, String(s.name)]));

  // Get the owner's lot IDs from their memberships
  const lotEntries = schemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId)
      .map((m) => ({
        lotId: m.lotId!,
        schemeId: s.id,
        lot: m.lot,
      })),
  );
  const lotIds = lotEntries.map((e) => e.lotId);

  // Fetch levy notices and funds in parallel
  const [notices, funds] = await Promise.all([
    getLevyNoticesForLots(lotIds),
    getFundsForSchemes(schemeIds),
  ]);

  const issued = notices.filter((n) => String(n.status) !== "DRAFT");
  const today = new Date().toISOString().slice(0, 10);
  const totals = noticeTotals(issued);
  const totalDue = totals.levied;
  const totalPaid = totals.paid;
  const totalOutstanding = totals.outstanding;

  interface DisplayLevy {
    id: string;
    title: string;
    dueDate: string;
    fundName: string;
    status: string;
    schemeId: string;
    amountDue: number;
    amountPaid: number;
    balance: number;
    interestCharged: number;
  }

  const displayLevies: DisplayLevy[] = issued.map((notice) => {
    const entry = lotEntries.find((e) => e.lotId === notice.lotId);
    return {
      id: notice.id,
      title: `${noticeLabel(notice)} (${String(notice.noticeNumber)})`,
      dueDate: toIsoDay(notice.dueDate),
      fundName: notice.fund ? String(notice.fund.name) : "",
      status: effectiveStatus(notice, today),
      schemeId: entry?.schemeId ?? notice.schemeId,
      amountDue: Number(notice.amountDue ?? 0) + Number(notice.interestCharged ?? 0),
      amountPaid: Number(notice.amountPaid ?? 0),
      balance: Number(notice.balanceOutstanding ?? 0),
      interestCharged: Number(notice.interestCharged ?? 0),
    };
  });

  const totalInterest = displayLevies.reduce((s, l) => s + l.interestCharged, 0);

  const outstandingLevies = displayLevies.filter((l) => l.balance > 0);
  const paidLevies = displayLevies.filter((l) => l.balance <= 0 && l.amountDue > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Your levy contributions and fund balances."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" href="/owner/finance/approvals">
              Payment Approvals
            </Button>
            <Button variant="secondary" href="/owner/finance/platform-fees">
              StrataVerze Fees
            </Button>
          </div>
        }
      />

      {/* Upload payment button */}
      <div className="flex justify-end">
        <Button variant="primary" href="/owner/finance/payment">
          Upload Payment Confirmation
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Levied"
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
        {totalInterest > 0 && (
          <StatCard
            label="Interest Charged"
            value={formatCurrency(totalInterest)}
            accent="bg-amber-500"
          />
        )}
      </div>

      {/* Fund Balances */}
      {funds.length > 0 && (
        <Card>
          <CardHeader
            title="Fund Balances"
            description="Current balances across your scheme funds."
          />
          <div className="flex flex-col gap-2 px-6 pb-6">
            {funds.map((fund) => {
              const balance = Number(fund.balance);
              return (
                <div
                  key={fund.id}
                  className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {fund.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {schemeNames.get(fund.schemeId) ?? ""}
                      {" · "}
                      {String(fund.fundType).replace("_", " ")}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      balance >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {formatCurrency(balance)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {displayLevies.length === 0 ? (
        <EmptyState
          title="No levies yet"
          description="No levies have been issued for your lots. Your strata manager will create levy notices when contributions are due."
        />
      ) : (
        <>
          {/* Outstanding levies */}
          {outstandingLevies.length > 0 && (
            <Card>
              <CardHeader
                title="Outstanding Levies"
                description={`${outstandingLevies.length} lev${outstandingLevies.length === 1 ? "y" : "ies"} with amounts due.`}
              />
              <div className="flex flex-col gap-2 px-6 pb-6">
                {outstandingLevies.map((levy) => {
                  const dueDate = new Date(levy.dueDate);
                  const pct =
                    levy.amountDue > 0
                      ? Math.round((levy.amountPaid / levy.amountDue) * 100)
                      : 0;

                  return (
                    <div
                      key={levy.id}
                      className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-sm font-medium text-ink">
                          {levy.title}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[levy.status] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {STATUS_LABELS[levy.status] ?? levy.status}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted mb-1">
                        {schemeNames.get(levy.schemeId) ?? ""}
                        {levy.fundName ? ` · ${levy.fundName}` : ""}
                        {" · Due "}
                        {dueDate.toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <div className="flex items-center justify-between text-sm mt-2">
                        <span className="text-ink-muted">
                          Balance due
                        </span>
                        <span className="font-semibold tabular-nums text-red-600">
                          {formatCurrency(levy.balance)}
                        </span>
                      </div>
                      {levy.interestCharged > 0 && (
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-ink-muted">
                            Interest charged
                          </span>
                          <span className="tabular-nums text-amber-600">
                            {formatCurrency(levy.interestCharged)}
                          </span>
                        </div>
                      )}
                      {levy.amountPaid > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                            <span>{pct}% paid</span>
                            <span>
                              {formatCurrency(levy.amountPaid)} of{" "}
                              {formatCurrency(levy.amountDue)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-line overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Paid levies */}
          {paidLevies.length > 0 && (
            <Card>
              <CardHeader
                title="Paid Levies"
                description={`${paidLevies.length} lev${paidLevies.length === 1 ? "y" : "ies"} fully paid.`}
              />
              <div className="flex flex-col gap-2 px-6 pb-6">
                {paidLevies.map((levy) => {
                  const dueDate = new Date(levy.dueDate);

                  return (
                    <div
                      key={levy.id}
                      className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {levy.title}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {schemeNames.get(levy.schemeId) ?? ""}
                          {levy.fundName ? ` · ${levy.fundName}` : ""}
                          {" · Paid · "}
                          {dueDate.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums text-ink">
                          {formatCurrency(levy.amountDue)}
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
