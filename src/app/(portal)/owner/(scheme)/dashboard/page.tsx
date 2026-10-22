import { redirect } from "next/navigation";
import { getCurrentProfile, hasCommitteeRole } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { effectiveStatus, noticeLabel } from "@/lib/levies/levy-ledger";
import { toIsoDay } from "@/lib/levies/notice-plan";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FinancialCard } from "@/components/ui/financial-card";
import { StatusChip } from "@/components/ui/status-chip";
import { getDashboardFinancialSummary } from "@/lib/queries/reports";
import { connection } from "next/server";

const statusLabels: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function OwnerDashboard() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const selectedSchemeId = await getSelectedSchemeId();
  if (!selectedSchemeId) {
    redirect("/owner");
  }

  const scheme = await getSchemeById(selectedSchemeId);
  if (!scheme) {
    redirect("/owner");
  }

  const isCommittee = await hasCommitteeRole(profile.id);

  const schemeIds = [selectedSchemeId];

  // Fetch owner's lots for this scheme
  const ownerMemberships = scheme.memberships.filter(
    (m) => m.profileId === profile.id && m.role === "OWNER",
  );
  const ownerLotIds = new Set(
    ownerMemberships
      .filter((m) => m.lotId)
      .map((m) => m.lotId as string),
  );

  const [meetings, workOrders, levies, financialSummary] = await Promise.all([
    getUpcomingMeetingsForOwner(schemeIds),
    getWorkOrdersForSchemes(schemeIds),
    getLevyNoticesForLots([...ownerLotIds]),
    getDashboardFinancialSummary(selectedSchemeId),
  ]);

  const upcomingMeetings = meetings.filter((m) => m.status === "SCHEDULED");

  // Outstanding levy balance on the owner's lots in this scheme
  const today = new Date().toISOString().slice(0, 10);
  const unpaid = levies.filter(
    (n) =>
      n.schemeId === selectedSchemeId &&
      String(n.status) !== "DRAFT" &&
      Number(n.balanceOutstanding ?? 0) > 0,
  );
  const outstandingBalance = unpaid.reduce((s, n) => s + Number(n.balanceOutstanding ?? 0), 0);
  const unpaidCount = unpaid.length;
  const overdueCount = unpaid.filter((n) => effectiveStatus(n, today) === "OVERDUE").length;

  const recentWorkOrders = workOrders.slice(0, 5);

  return (
    <div>
      {/* The scheme header and section pills come from the shared owner scheme layout. */}
      {/* Financial dashboard — committee view */}
      {isCommittee && (
        <div className="mt-8">
          <h2 className="text-lg font-bold font-heading text-ink mb-4">
            Financial Dashboard
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FinancialCard
              title="Bank Account"
              badge="Reconciled"
              badgeColour="bg-green-100 text-green-700"
              stats={scheme.funds.map((fund) => ({
                label: fund.name,
                value: `$${Number(fund.balance).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
                colour:
                  fund.fundType === "ADMIN"
                    ? "bg-turquoise"
                    : fund.fundType === "SINKING"
                      ? "bg-blue-400"
                      : "bg-amber-400",
              }))}
              chartBars={scheme.funds.map((fund) => ({
                label: fund.name,
                value: Math.abs(Number(fund.balance)),
                colour:
                  fund.fundType === "ADMIN"
                    ? "bg-turquoise"
                    : fund.fundType === "SINKING"
                      ? "bg-blue-400"
                      : "bg-amber-400",
              }))}
            />

            <FinancialCard
              title="Levies Receivable"
              stats={[
                {
                  label: `${unpaidCount} Awaiting payment`,
                  value: `$${outstandingBalance.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
                  colour: "bg-amber-400",
                },
                {
                  label: `${overdueCount} Overdue`,
                  value: overdueCount > 0
                    ? `$${outstandingBalance.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
                    : "$0.00",
                  colour: "bg-danger",
                },
              ]}
              action={
                <Button variant="ghost" href="/owner/levies">
                  View all
                </Button>
              }
            />

            <FinancialCard
              title="Cash Flow"
              badge="This month"
              badgeColour="bg-blue-100 text-blue-700"
              stats={[
                {
                  label: "Cash in",
                  value: `$${financialSummary.cashIn.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
                  colour: "bg-green-400",
                },
                {
                  label: "Cash out",
                  value: `$${financialSummary.cashOut.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
                  colour: "bg-red-400",
                },
              ]}
              action={
                <Button variant="ghost" href="/owner/finance/reports">
                  View reports
                </Button>
              }
            />

            <FinancialCard
              title="Bills to Pay"
              stats={[
                {
                  label: `${financialSummary.billsAwaitingCount} Awaiting payment`,
                  value: `$${financialSummary.billsAwaiting.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
                  colour: "bg-amber-400",
                },
                {
                  label: `${financialSummary.billsOverdueCount} Overdue`,
                  value: financialSummary.billsOverdue > 0
                    ? `$${financialSummary.billsOverdue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
                    : "$0.00",
                  colour: "bg-danger",
                },
              ]}
              action={
                <Button variant="ghost" href="/owner/finance/supplier-invoices">
                  View all
                </Button>
              }
            />
          </div>
        </div>
      )}

      {/* Owner levy summary — non-committee owners see their outstanding balance */}
      {!isCommittee && outstandingBalance > 0 && (
        <Card className="mt-8">
          <CardHeader
            title="Outstanding Levies"
            action={
              <Button variant="ghost" href="/owner/levies">
                View all
              </Button>
            }
          />
          <div className="flex flex-col gap-2">
            {[...unpaid]
              .sort((x, y) => toIsoDay(x.dueDate).localeCompare(toIsoDay(y.dueDate)))
              .slice(0, 3)
              .map((notice) => {
                const owed = Number(notice.balanceOutstanding ?? 0);
                const dueDate = new Date(`${toIsoDay(notice.dueDate)}T00:00:00`);
                return (
                  <div
                    key={notice.id}
                    className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-sm font-medium text-ink">
                        {noticeLabel(notice)}
                      </p>
                      <span className="text-sm font-semibold text-ink tabular-nums">
                        ${owed.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {String(notice.noticeNumber)} · Due{" "}
                      {dueDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {effectiveStatus(notice, today) === "OVERDUE" ? " · Overdue" : ""}
                    </p>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Upcoming Meetings"
            action={
              <Button variant="ghost" href="/owner/meetings">
                View all
              </Button>
            }
          />
          <div className="flex flex-col gap-2">
            {upcomingMeetings.slice(0, 3).map((meeting) => {
              const scheduledDate = new Date(String(meeting.scheduledAt));
              const pendingCount = meeting.motions.filter(
                (mo) => mo.status === "PROPOSED",
              ).length;

              return (
                <div
                  key={meeting.id}
                  className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-medium text-ink">
                      {meeting.title}
                    </p>
                    <StatusChip status="Scheduled" />
                  </div>
                  <p className="text-xs text-ink-muted">
                    {scheduledDate.toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {pendingCount > 0 &&
                      ` · ${pendingCount} motion${pendingCount === 1 ? "" : "s"} to vote on`}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent work orders */}
      {recentWorkOrders.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Recent Maintenance Requests"
            action={
              <Button variant="ghost" href="/owner/maintenance">
                View all
              </Button>
            }
          />
          <div className="flex flex-col gap-2">
            {recentWorkOrders.map((wo) => {
              const createdDate = new Date(String(wo.createdAt));

              return (
                <div
                  key={wo.id}
                  className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-medium text-ink">
                      {wo.title}
                    </p>
                    <StatusChip status={statusLabels[wo.status] ?? wo.status} />
                  </div>
                  <p className="text-xs text-ink-muted">
                    {createdDate.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {wo.comments.length > 0 &&
                      ` · ${wo.comments.length} comment${wo.comments.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
