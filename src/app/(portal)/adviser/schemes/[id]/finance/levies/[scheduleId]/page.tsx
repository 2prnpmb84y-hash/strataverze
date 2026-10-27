import { issueDateFor, issueTiming } from "@/lib/levies/issue-timing";
import { noticeLeadText, noticeTimingWords } from "@/lib/jurisdiction/wording";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getLevyScheduleById } from "@/lib/queries/levy-schedules";
import { loadPlanLots } from "@/lib/levies/load-plan-lots";
import {
  FREQUENCY_LABELS,
  INSTALMENTS_PER_YEAR,
  checkPlan,
  financialYearStart,
  fromCents,
  planNotices,
  toCents,
  toIsoDay,
  type LevyFrequency,
} from "@/lib/levies/notice-plan";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ApproveScheduleForm,
  IssueNoticesForm,
  OverdueNoticesForm,
  StopPlannedNoticesForm,
  RecordPaymentForm,
} from "./schedule-actions";
import { connection } from "next/server";
import { transactionFeeTable } from "@/lib/billing/capture";
import { needRule } from "@/config/statutory";

function formatCurrency(value: number | string | null): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    Number(value ?? 0),
  );
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  APPROVED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-amber-100 text-amber-700",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  ACTIVE: "Issued",
  SUPERSEDED: "Superseded",
};

const noticeStatusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  WRITTEN_OFF: "bg-zinc-100 text-zinc-600",
};

const noticeStatusLabels: Record<string, string> = {
  DRAFT: "Planned",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  WRITTEN_OFF: "Written off",
};

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</dt>
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
  if (!schedule || schedule.schemeId !== id) notFound();

  const status = String(schedule.status);
  const isSpecial = schedule.levyType === "SPECIAL";
  const feeTable = await transactionFeeTable();
  const frequency = (isSpecial ? "ONE_OFF" : schedule.frequency) as LevyFrequency;
  const notices = [...(schedule.levyNotices ?? [])].sort(
    (a, b) => String(a.noticeNumber).localeCompare(String(b.noticeNumber)),
  );

  // Planned notices (DRAFT) are not levied until they go out.
  const issuedNotices = notices.filter((n) => String(n.status) !== "DRAFT");
  const plannedNotices = notices.filter((n) => String(n.status) === "DRAFT");
  const totalLevied = issuedNotices.reduce((s, n) => s + Number(n.amountDue ?? 0), 0);
  const totalPlanned = plannedNotices.reduce((s, n) => s + Number(n.amountDue ?? 0), 0);
  const totalPaid = notices.reduce((s, n) => s + Number(n.amountPaid ?? 0), 0);
  // Planned notices past their 5-week mark wait for the Adviser to confirm.
  const today = await schemeToday(id);
  const levyRule = needRule(rulesForState(scheme.state).rules, "LEVY_NOTICE_RULES");
  const overdueCount = status === "ACTIVE" ? plannedNotices.filter((n) => issueTiming(toIsoDay(n.dueDate), today, levyRule).kind !== "planned").length : 0;

  // Preview of the notices this schedule will raise (before issue).
  const fyStart = financialYearStart(Number(schedule.financialYear), String(scheme.financialYearEnd));
  const lots = status === "APPROVED" && notices.length === 0 ? await loadPlanLots(id) : [];
  const totalCents = toCents(String(schedule.budgetAmount));
  const planIssues =
    status === "APPROVED" && notices.length === 0
      ? checkPlan({ lots, totalEntitlement: Number(schedule.totalEntitlement), totalCents })
      : [];
  const preview =
    status === "APPROVED" && notices.length === 0 && planIssues.length === 0
      ? planNotices({
          lots,
          totalCents,
          frequency,
          periodStart: isSpecial ? toIsoDay(schedule.approvedAt ?? schedule.dueDate) : fyStart,
          // Paid in advance: each instalment falls due on the first day of its period.
          firstDueDate: isSpecial ? toIsoDay(schedule.dueDate) : fyStart,
        })
      : [];
  const previewByLot = lots.map((lot) => {
    const own = preview.filter((n) => n.lotId === lot.lotId);
    return {
      lot,
      instalment: own[0]?.amountCents ?? 0,
      total: own.reduce((s, n) => s + n.amountCents, 0),
    };
  });

  const title = isSpecial
    ? `Special levy: ${String(schedule.title ?? "Untitled")}`
    : `FY ${String(schedule.financialYear)} levy schedule`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={isSpecial ? (schedule.description ? String(schedule.description) : undefined) : undefined}
        backHref={`/adviser/schemes/${id}/finance/levies`}
        backLabel="Levies"
      />

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles[status] ?? "bg-zinc-100 text-zinc-600"}`}
        >
          {statusLabels[status] ?? status}
        </span>
        <span className="text-xs text-ink-muted">{isSpecial ? "Special levy" : "Budget levy"}</span>
      </div>

      <Card>
        <CardHeader title="Details" />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Fund" value={schedule.fund ? String(schedule.fund.name) : null} />
          {isSpecial ? (
            <DetailItem label="Due date" value={formatDate(schedule.dueDate)} />
          ) : (
            <DetailItem label="Financial year" value={`Starts ${formatDate(fyStart)}`} />
          )}
          <DetailItem label="Frequency" value={FREQUENCY_LABELS[frequency] ?? frequency} />
          <DetailItem label={isSpecial ? "Amount" : "Budget amount"} value={formatCurrency(schedule.budgetAmount)} />
          <DetailItem label="Total lots" value={String(schedule.totalLots)} />
          <DetailItem label="Total unit entitlement" value={String(Number(schedule.totalEntitlement))} />
          <DetailItem label="Resolution date" value={formatDate(schedule.approvedAt)} />
        </dl>
      </Card>

      {status === "DRAFT" && (
        <Card>
          <CardHeader
            title="1. Record approval"
            description="Contributions are set by the owners corporation at a general meeting. Record the resolution before notices are issued."
          />
          <div className="px-6 pb-6">
            <ApproveScheduleForm schemeId={id} scheduleId={scheduleId} />
          </div>
        </Card>
      )}

      {status === "APPROVED" && notices.length === 0 && (
        <Card>
          <CardHeader
            title="2. Issue notices"
            description={`One notice per lot${isSpecial ? "" : ` for each of the ${INSTALMENTS_PER_YEAR[frequency]} instalments`}, in proportion to unit entitlement. Amounts are rounded to the cent so they add up exactly to ${formatCurrency(schedule.budgetAmount)}.`}
          />
          <div className="px-6 pb-6 space-y-4">
            {planIssues.length > 0 && (
              <div role="alert" className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
                {planIssues.map((issue) => (
                  <p key={issue.kind}>{issue.message}</p>
                ))}
              </div>
            )}
            {previewByLot.length > 0 && planIssues.length === 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th scope="col" className="py-2 font-medium">Lot</th>
                      <th scope="col" className="py-2 font-medium text-right">Unit entitlement</th>
                      <th scope="col" className="py-2 font-medium">Owner on platform</th>
                      {!isSpecial && <th scope="col" className="py-2 font-medium text-right">First instalment</th>}
                      <th scope="col" className="py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {previewByLot.map(({ lot, instalment, total }) => (
                      <tr key={lot.lotId}>
                        <td className="py-2 text-ink">Lot {lot.lotNumber}</td>
                        <td className="py-2 text-right tabular-nums">{lot.entitlement}</td>
                        <td className="py-2 text-ink-muted">{lot.ownerId ? "Yes" : "No"}</td>
                        {!isSpecial && <td className="py-2 text-right tabular-nums">{formatCurrency(fromCents(instalment))}</td>}
                        <td className="py-2 text-right tabular-nums">{formatCurrency(fromCents(total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <IssueNoticesForm
              schemeId={id}
              scheduleId={scheduleId}
              isSpecial={isSpecial}
              noticeCount={preview.length}
              blocked={planIssues.length > 0}
              timing={noticeTimingWords(levyRule)}
            />
          </div>
        </Card>
      )}

      {notices.length > 0 && (
        <Card>
          <CardHeader title="Summary" />
          <div className="px-6 pb-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Total levied</span>
              <span className="text-ink tabular-nums">{formatCurrency(totalLevied)}</span>
            </div>
            {plannedNotices.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">
                  Planned, not yet sent ({plannedNotices.length} notice{plannedNotices.length === 1 ? "" : "s"}, each {noticeLeadText(levyRule)} before it falls due)
                </span>
                <span className="text-ink tabular-nums">{formatCurrency(totalPlanned)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Total paid</span>
              <span className="text-ink tabular-nums">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-line pt-3">
              <span className="text-ink">Outstanding</span>
              <span className="text-ink tabular-nums">{formatCurrency(totalLevied - totalPaid)}</span>
            </div>
          </div>
        </Card>
      )}

      {status === "ACTIVE" && plannedNotices.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Planned notices" description={`Each goes out by email ${noticeLeadText(levyRule)} before it falls due.`} />
          <div className="px-6 pb-6 space-y-6">
            {overdueCount > 0 && <OverdueNoticesForm schemeId={id} scheduleId={scheduleId} count={overdueCount} timing={noticeTimingWords(levyRule)} />}
            <StopPlannedNoticesForm schemeId={id} scheduleId={scheduleId} count={plannedNotices.length} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Levy notices"
          description={`${notices.length} notice${notices.length !== 1 ? "s" : ""}`}
        />
        {notices.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="No levy notices yet"
              description={status === "DRAFT" ? "Record approval, then issue the notices." : "Issue the notices above."}
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {notices.map((notice) => {
              const noticeStatus = String(notice.status);
              const balance = Number(notice.balanceOutstanding ?? 0);
              const payable = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(noticeStatus) && balance > 0;
              return (
                <div key={notice.id} className="px-6 py-3 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-[90px_1fr_110px_110px_110px_100px] gap-2 sm:gap-4 items-center text-sm">
                    <div className="text-ink-muted tabular-nums">
                      {noticeStatus === "DRAFT" ? (
                        String(notice.noticeNumber)
                      ) : (
                        <a href={`/api/finance/pdf/levy-notice/${notice.id}`} target="_blank" rel="noopener" className="underline" title="Open the notice as a PDF">
                          {String(notice.noticeNumber)}
                        </a>
                      )}
                    </div>
                    <div className="text-ink font-medium">
                      {notice.lot ? `Lot ${String(notice.lot.lotNumber)}` : "—"}
                    </div>
                    <div className="text-ink-muted">
                      Due {formatDate(notice.dueDate)}
                      {noticeStatus === "DRAFT" && <span className="block text-xs">Goes out {formatDate(issueDateFor(toIsoDay(notice.dueDate), levyRule))}</span>}
                    </div>
                    <div className="text-ink text-right tabular-nums">{formatCurrency(notice.amountDue)}</div>
                    <div className="text-ink text-right tabular-nums">
                      {Number(notice.amountPaid) > 0 ? `Paid ${formatCurrency(notice.amountPaid)}` : "—"}
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${noticeStatusStyles[noticeStatus] ?? "bg-zinc-100 text-zinc-600"}`}
                      >
                        {noticeStatusLabels[noticeStatus] ?? noticeStatus}
                      </span>
                    </div>
                  </div>
                  {payable && <RecordPaymentForm
                      schemeId={id}
                      noticeId={notice.id}
                      balance={balance}
                      isSpecialLevy={isSpecial}
                      feeTable={feeTable}
                      today={today}
                    />}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
