import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getLevyScheduleById } from "@/lib/queries/levy-schedules";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";

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

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  APPROVED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-amber-100 text-amber-700",
};

const noticeStatusStyles: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
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
      <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}

export default async function LevyScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string; scheduleId: string }>;
}) {
  await connection();
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

  const status = String(schedule.status);
  const notices = schedule.levyNotices ?? [];

  const totalNoticeAmount = notices.reduce(
    (sum, n) => sum + Number(n.amountDue ?? 0),
    0,
  );
  const totalPaid = notices.reduce(
    (sum, n) => sum + Number(n.amountPaid ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`FY ${String(schedule.financialYear)} Levy Schedule`}
        backHref={`/adviser/schemes/${id}/finance/levies`}
        backLabel="Levy Schedules"
      />

      {/* Status badge */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            statusStyles[status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {status}
        </span>
      </div>

      {/* Schedule details */}
      <Card>
        <CardHeader title="Schedule Details" />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Fund"
            value={schedule.fund ? String(schedule.fund.name) : null}
          />
          <DetailItem
            label="Financial Year"
            value={String(schedule.financialYear)}
          />
          <DetailItem
            label="Frequency"
            value={String(schedule.frequency)}
          />
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
          <DetailItem
            label="Approved At"
            value={formatDate(schedule.approvedAt)}
          />
          <DetailItem
            label="Approved By"
            value={schedule.approvedBy ? String(schedule.approvedBy) : null}
          />
        </dl>
      </Card>

      {/* Financial summary */}
      <Card>
        <CardHeader title="Financial Summary" />
        <div className="px-6 pb-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Total Levied</span>
              <span className="text-ink">
                {formatCurrency(totalNoticeAmount)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Total Paid</span>
              <span className="text-ink">
                {formatCurrency(totalPaid)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-line pt-3">
              <span className="text-ink">Outstanding</span>
              <span className="text-ink">
                {formatCurrency(totalNoticeAmount - totalPaid)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Levy notices */}
      <Card>
        <CardHeader
          title="Levy Notices"
          description={`${notices.length} notice${notices.length !== 1 ? "s" : ""}`}
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
            <div className="hidden sm:grid sm:grid-cols-[1fr_100px_100px_100px_100px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
              <div>Lot</div>
              <div className="text-right">Amount</div>
              <div>Due Date</div>
              <div className="text-right">Paid</div>
              <div className="text-right">Status</div>
            </div>

            <div className="divide-y divide-line">
              {notices.map((notice, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_100px_100px] gap-2 sm:gap-4 px-6 py-3 items-center"
                >
                  <div className="text-sm text-ink font-medium">
                    {notice.lot
                      ? String(
                          notice.lot.unitNumber ?? notice.lot.lotNumber ?? "—",
                        )
                      : "—"}
                  </div>
                  <div className="text-sm text-ink text-right tabular-nums">
                    {formatCurrency(notice.amountDue)}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {formatDate(notice.dueDate)}
                  </div>
                  <div className="text-sm text-ink text-right tabular-nums">
                    {notice.amountPaid
                      ? formatCurrency(notice.amountPaid)
                      : "—"}
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        noticeStatusStyles[String(notice.status)] ??
                        "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {String(notice.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
