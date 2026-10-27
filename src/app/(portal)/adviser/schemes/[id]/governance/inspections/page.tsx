import { connection } from "next/server";
import { notFound } from "next/navigation";
import { db } from "@/prisma/db";
import { requireAdviserScheme } from "../../_sections/require-adviser-scheme";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeTimeZone, schemeToday } from "@/lib/jurisdiction/scheme-time";
import { formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { inspectionDeadlines } from "@/lib/records/fees";
import { cancelInspectionAction, completeInspectionAction, createInspectionAction, recordFeePaidAction, scheduleInspectionAction } from "@/lib/actions/records";
import { formatLotLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { ConfirmButton, RecordsForm } from "@/components/records/records-forms";
import { needRule } from "@/config/statutory";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const aud = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Requests to inspect the owners corporation's records (s 182). */
export default async function InspectionsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;
  const [{ rules }, today, tz, rows, lots] = await Promise.all([
    rulesForScheme(id),
    schemeToday(id),
    schemeTimeZone(id),
    db.orm.public.RecordsInspection.where((r) => r.schemeId.eq(id)).orderBy((r) => r.createdAt.desc()).limit(200).all(),
    db.orm.public.Lot.where((l) => l.schemeId.eq(id)).limit(5000).all(),
  ]);
  if (!rules.FEATURES.recordsInspections) notFound();
  const r = needRule(rules, "RECORDS_INSPECTION");
  const lotLabel = new Map(lots.map((l) => [l.id, formatLotLabel(String(l.lotNumber))]));
  const lotOptions = [...lots].sort((a, b) => String(a.lotNumber).localeCompare(String(b.lotNumber), "en-AU", { numeric: true })).map((l) => ({ value: l.id, label: formatLotLabel(String(l.lotNumber)) }));
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Records inspections"
        description={`${r.section}. If a time and place cannot be agreed within ${r.agreeWithinDays} days, the owners corporation may set a date within ${r.setWithinDays} days of the request by written notice. Fees include GST and are paid into ${r.paidInto}: an owner ${aud(r.fees.OWNER.firstHourCents)} for the first hour and ${aud(r.fees.OWNER.extraHalfHourCents)} for each further half hour; another authorised person ${aud(r.fees.AUTHORISED_PERSON.firstHourCents)} and ${aud(r.fees.AUTHORISED_PERSON.extraHalfHourCents)}. ${r.partHalfHour}`}
        backHref={`/adviser/schemes/${id}/governance`}
        backLabel="Governance"
      />
      {rows.map((x) => {
        const d = inspectionDeadlines(day(x.requestedOn), r);
        const open = x.status === "REQUESTED" || x.status === "SCHEDULED";
        return (
          <Card key={x.id}>
            <CardHeader
              title={`${x.inspectorName} (${x.inspectorType === "OWNER" ? "owner" : `authorised by ${x.authorisedBy}`}), ${lotLabel.get(x.lotId) ?? ""}`}
              description={`Requested ${day(x.requestedOn)}.${open && !x.scheduledFor ? ` Agree a time by ${d.agreeBy}, or set one by notice for a date by ${d.setBy}.` : ""}${x.scheduledFor ? ` ${x.setByNotice ? "Set by notice" : "Agreed"}: ${formatDateTimeIn(tz, x.scheduledFor)}, ${x.place}.` : ""}`}
              action={<StatusChip status={x.status === "REQUESTED" ? "Requested" : x.status === "SCHEDULED" ? "Scheduled" : x.status === "COMPLETED" ? "Completed" : "Cancelled"} variant={x.status === "COMPLETED" ? "success" : x.status === "CANCELLED" ? "default" : "warning"} />}
            />
            {open && (
              <div className="space-y-4">
                <RecordsForm
                  action={scheduleInspectionAction.bind(null, id, x.id)}
                  submitLabel="Record time and place"
                  fields={[
                    { name: "when", label: "Date and time", type: "datetime-local" },
                    { name: "place", label: "Place (or how the records are given electronically)", type: "text" },
                    { name: "setByNotice", label: "Set by the owners corporation's written notice (not agreed)", type: "checkbox", wide: true },
                  ]}
                />
                <RecordsForm action={completeInspectionAction.bind(null, id, x.id)} submitLabel="Record inspection made" fields={[{ name: "minutes", label: "How long it took (minutes)", type: "number" }]} />
                <ConfirmButton label="Cancel request" confirmText="Cancel this request?" act={cancelInspectionAction.bind(null, id, x.id)} />
              </div>
            )}
            {x.status === "COMPLETED" && (
              <div className="space-y-2 text-sm">
                <p>
                  {x.minutes} minutes. Fee {aud(x.feeCents ?? 0)} including GST. {x.feePaidOn ? `Paid ${day(x.feePaidOn)}.` : "Not yet recorded as paid (collected outside StrataVerze)."}
                </p>
                {!x.feePaidOn && (x.feeCents ?? 0) > 0 && (
                  <RecordsForm action={recordFeePaidAction.bind(null, id, "inspection", x.id)} submitLabel="Record payment" fields={[{ name: "paidOn", label: "Date the fee was paid", type: "date", max: today, defaultValue: today }]} />
                )}
              </div>
            )}
          </Card>
        );
      })}
      <Card>
        <CardHeader title="Record a request" description="Owners may inspect; anyone else needs the owner's authority." />
        <RecordsForm
          action={createInspectionAction.bind(null, id)}
          submitLabel="Record request"
          fields={[
            { name: "lotId", label: "Lot of the owner", type: "select", options: lotOptions, defaultValue: lotOptions[0]?.value },
            { name: "inspectorType", label: "Who will inspect", type: "select", options: [{ value: "OWNER", label: "The owner" }, { value: "AUTHORISED_PERSON", label: "A person the owner authorised" }], defaultValue: "OWNER" },
            { name: "inspectorName", label: "Name of the person inspecting", type: "text" },
            { name: "authorisedBy", label: "If authorised: the owner who authorised it", type: "text", required: false },
            { name: "requestedOn", label: "Date of the request", type: "date", max: today, defaultValue: today },
            { name: "notes", label: "Records asked for (optional)", type: "text", required: false },
          ]}
        />
      </Card>
    </div>
  );
}
