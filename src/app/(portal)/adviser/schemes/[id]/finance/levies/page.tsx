import { getLevySchedulesForScheme, getOverdueLevyNotices } from "@/lib/queries/levy-schedules";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import Link from "next/link";
import { connection } from "next/server";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  APPROVED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-amber-100 text-amber-700",
};

export default async function LevySchedulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const [schedules, overdueNotices] = await Promise.all([
    getLevySchedulesForScheme(id),
    getOverdueLevyNotices(id),
  ]);

  const activeSchedules = schedules.filter((s) => s.status === "ACTIVE");
  const totalBudgeted = activeSchedules.reduce(
    (sum, s) => sum + Number(s.budgetAmount ?? 0),
    0
  );
  const overdueCount = overdueNotices.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-ink">
          Levy Schedules
        </h1>
        <Button
          variant="primary"
          href={`/adviser/schemes/${id}/finance/levies/new`}
        >
          Create Levy Schedule
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Budgeted"
          value={formatCurrency(totalBudgeted)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Active Schedules"
          value={String(activeSchedules.length)}
          accent="bg-green-500"
        />
        <StatCard
          label="Overdue Notices"
          value={String(overdueCount)}
          accent="bg-red-500"
        />
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No levy schedules"
          description="Create a levy schedule to start billing lot owners for their contributions."
          actionLabel="Create Levy Schedule"
          actionHref={`/adviser/schemes/${id}/finance/levies/new`}
        />
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <Link key={schedule.id} href={`/adviser/schemes/${id}/finance/levies/${schedule.id}`} className="block">
            <Card className="hover:border-primary-300 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="text-lg font-medium text-ink">
                      {schedule.financialYear}
                    </h3>
                    <p className="text-sm text-ink-muted">
                      {schedule.fund.name} &middot; {schedule.frequency}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      statusStyles[schedule.status] ?? ""
                    }`}
                  >
                    {schedule.status}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-ink-muted">Budget</p>
                    <p className="text-lg font-semibold text-ink">
                      {formatCurrency(schedule.budgetAmount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-ink-muted">Notices</p>
                    <p className="text-sm font-medium text-ink">
                      {schedule.levyNotices.length} / {schedule.totalLots}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
