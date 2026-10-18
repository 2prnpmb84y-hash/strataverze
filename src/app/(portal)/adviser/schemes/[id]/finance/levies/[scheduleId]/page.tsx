import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getLevyScheduleById } from "@/lib/queries/levy-schedules";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU");
}

const scheduleStatusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  APPROVED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-amber-100 text-amber-700",
};

const noticeStatusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-purple-100 text-purple-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  WRITTEN_OFF: "bg-zinc-100 text-zinc-600",
};

const noticeStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  WRITTEN_OFF: "Written Off",
};

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">
        {value ? String(value) : "—"}
      </dd>
    </div>
  );
}

export default async function LevyScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string; scheduleId: string }>;
}) {
  const { id, scheduleId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const schedule = await getLevyScheduleById(scheduleId);
  if (!schedule) notFound();

  const notices = schedule.levyNotices ?? [];
  const totalDue = notices.reduce(
    (sum, n) => sum + Number(n.amountDue ?? 0),
    0,
  );
  const totalPaid = notices.reduce(
    (sum, n) => sum + Number(n.amountPaid ?? 0),
    0,
  );
  const totalOutstanding = notices.reduce(
    (sum, n) => sum + Number(n.balanceOutstanding ?? 0),
    0,
  );
  const paidCount = notices.filter((n) => n.status === "PAID").length;
  const overdueCount = notices.filter((n) => n.status === "OVERDUE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Levy Schedule ${schedule.financialYear}`}
        backHref={`/adviser/schemes/${id}/finance/levies`}
        backLabel="Levy Schedules"
      />

      {/* Status badge */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            scheduleStatusStyles[schedule.status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {schedule.status}
        </span>
      </div>

      {/* Schedule Details */}
      <Card>
        <CardHeader title="Schedule Details" />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Financial Year"
            value={String(schedule.financialYear)}
          />
          <DetailItem
            label="Fund"
            value={schedule.fund ? String(schedule.fund.name) : null}
          />
          <DetailItem label="Frequency" value={String(schedule.frequency)} />
          <DetailItem
            label="Budget Amount"
            value={formatCurrency(schedule.budgetAmount)}
          />
          <DetailItem
            label="Total Lots"
            value={String(schedule.totalLots)}
          />
          <DetailItem
            label="Total Entitlement"
            value={String(schedule.totalEntitlement)}
          />
          {schedule.approvedAt && (
            <DetailItem
              label="Approved At"
              value={formatDate(schedule.approvedAt)}
            />
          )}
          <DetailItem
            label="Created"
            value={formatDate(schedule.createdAt)}
          />
        </dl>
      </Card>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Due"
          value={formatCurrency(totalDue)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(totalPaid)}
          accent="bg-green-500"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          accent="bg-amber-500"
        />
        <StatCard
          label="Overdue"
          value={String(overdueCount)}
          accent="bg-red-500"
        />
      </div>

      {/* Levy Notices */}
      <Card>
        <CardHeader
          title="Levy Notices"
          description={`${notices.length} notice${notices.length !== 1 ? "s" : ""} — ${paidCount} paid`}
        />

        {notices.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="No levy notices"
              description="No levy notices have been generated for this schedule yet."
            />
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid sm:grid-cols-[80px_1fr_100px_100px_120px_120px_100px] gap-4 px-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
              <div>Notice #</div>
              <div>Lot</div>
              <div>Period</div>
              <div>Due Date</div>
              <div className="text-right">Amount Due</div>
              <div className="text-right">Paid</div>
              <div className="text-right">Status</div>
            </div>

            <div className="divide-y divide-border">
              {notices.map((notice) => {
                const isOverdue =
                  notice.status !== "PAID" &&
                  notice.status !== "WRITTEN_OFF" &&
                  new Date(String(notice.dueDate)) < new Date();

                return (
                  <div
                    key={String(notice.id)}
                    className="grid grid-cols-1 sm:grid-cols-[80px_1fr_100px_100px_120px_120px_100px] gap-2 sm:gap-4 px-6 py-3 items-center"
                  >
                    <div className="text-sm font-mono text-foreground">
                      {String(notice.noticeNumber)}
                    </div>
                    <div className="text-sm text-foreground">
                      {notice.lot
                        ? `Lot ${String(notice.lot.lotNumber ?? notice.lot.id)}`
                        : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(notice.periodStart)}
                    </div>
                    <div className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      {formatDate(notice.dueDate)}
                    </div>
                    <div className="text-sm text-foreground text-right font-medium">
                      {formatCurrency(notice.amountDue)}
                    </div>
                    <div className="text-sm text-foreground text-right">
                      {formatCurrency(notice.amountPaid)}
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          noticeStatusStyles[notice.status] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {noticeStatusLabels[notice.status] ?? notice.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
