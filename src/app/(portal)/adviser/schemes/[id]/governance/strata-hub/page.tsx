import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireAdviserScheme } from "../../_sections/require-adviser-scheme";
import { annualReportOverview } from "@/lib/compliance/annual-report-store";
import { recordAgmHeldAction, recordReportedAction, removeRecordedAgmAction } from "@/lib/actions/annual-report";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { ReportForm } from "@/components/compliance/report-forms";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

/** Strata Hub annual report: when it is due, what it asks for, and when it was made. */
export default async function StrataHubPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;
  const o = await annualReportOverview(id);
  if (!o) notFound();
  const r = o.rules;
  const chip =
    o.status === "EXEMPT"
      ? { label: "Not required (two-lot scheme)", variant: "default" as const }
      : o.status === "NO_AGM"
        ? { label: "No AGM recorded", variant: "warning" as const }
        : o.status === "REPORTED"
          ? { label: `Reported ${day(o.row?.reportedOn)}`, variant: "success" as const }
          : o.status === "OVERDUE"
            ? { label: `Overdue (due ${o.dueOn})`, variant: "danger" as const }
            : { label: `Due by ${o.dueOn} (${o.daysLeft === 1 ? "1 day" : `${o.daysLeft} days`})`, variant: "warning" as const };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Strata Hub annual report"
        description={`Report to ${r.portal} within ${r.withinMonthsOfAgm} months of each AGM. Changes to the secretary, chairperson, strata managing agent, building manager or emergency contacts are updated within ${r.updateWithinDays} days.`}
        backHref={`/adviser/schemes/${id}/governance`}
        backLabel="Governance"
      />
      <Card>
        <CardHeader title={o.lastAgmOn ? `For the AGM of ${o.lastAgmOn}` : "Annual report"} action={<StatusChip status={chip.label} variant={chip.variant} />} />
        {o.status === "OVERDUE" && <p className="text-sm text-red-700">{r.penalty}</p>}
        {o.status === "NO_AGM" && <p className="text-sm text-ink">{r.noAgmNote}</p>}
        {o.row?.reference && <p className="text-sm text-ink">Strata Hub reference: {o.row.reference}</p>}
        <p className="mt-2 text-xs text-ink-muted">
          The reporter pays ${(r.feePerLotCents / 100).toFixed(2)} a lot on {r.portal} ({o.schemeLots} lots). Advisers and the committee get email reminders 14, 7 and 1 days before the date, and after it.{" "}
          <a className="underline" href={r.helpUrl} target="_blank" rel="noreferrer">
            About annual reporting
          </a>
        </p>
      </Card>

      {o.status !== "EXEMPT" && (
        <Card>
          <CardHeader title="What the report asks for" description="Values StrataVerze holds today. Check each before you report." />
          <dl className="text-sm">
            {o.info.map(([k, val]) => (
              <div key={k} className="flex flex-wrap justify-between gap-2 py-1.5 border-b border-line last:border-0">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-ink text-right min-w-0">{val}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {o.agms.length > 0 && o.status !== "EXEMPT" && (
        <Card>
          <CardHeader title="Record the report made" />
          <ReportForm
            action={recordReportedAction.bind(null, id)}
            submitLabel="Record report"
            fields={[
              { name: "agmOn", label: "AGM", type: "select", options: o.agms, defaultValue: o.agms[0] },
              { name: "reportedOn", label: "Date reported", type: "date", max: o.today, defaultValue: o.today },
              { name: "reference", label: "Strata Hub reference (optional)", type: "text", required: false },
            ]}
          />
        </Card>
      )}

      <Card>
        <CardHeader title="AGM held outside StrataVerze" description="AGMs run in StrataVerze are found from the meetings. Record one held another way." />
        <ReportForm action={recordAgmHeldAction.bind(null, id)} submitLabel="Record AGM" fields={[{ name: "agmOn", label: "Date of the AGM", type: "date", max: o.today }]} />
        {o.recordedAgms.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-sm text-ink-muted">Recorded by hand: {o.recordedAgms.join(", ")}. Remove one entered by mistake (only if no report is recorded for it).</p>
            <ReportForm action={removeRecordedAgmAction.bind(null, id)} submitLabel="Remove AGM" fields={[{ name: "agmOn", label: "AGM recorded by hand", type: "select", options: o.recordedAgms, defaultValue: o.recordedAgms[0] }]} />
          </div>
        )}
      </Card>
    </div>
  );
}
