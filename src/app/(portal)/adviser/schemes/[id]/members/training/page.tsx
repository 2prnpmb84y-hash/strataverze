import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { committeeTrainingRows } from "@/lib/governance/committee-training-store";
import { TRAINING_STATUS_LABELS, type TrainingStatus } from "@/lib/governance/committee-training";
import { saveCommitteeTrainingAction } from "@/lib/actions/committee-training";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { MemberTrainingForm } from "@/components/governance/training-forms";

const VARIANT: Record<TrainingStatus, "default" | "success" | "warning" | "danger"> = {
  SCHEME_EXEMPT: "default",
  EXEMPT: "default",
  TRAINED: "success",
  COMPLETED_LATE: "danger",
  APPOINTMENT_NOT_RECORDED: "warning",
  NOT_YET_REQUIRED: "default",
  DUE: "warning",
  OVERDUE: "danger",
};

/** Committee training: who has completed it, who is due or overdue. */
export default async function CommitteeTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();
  const data = await committeeTrainingRows(id);
  if (!data) notFound();
  const t = data.rules;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Committee training"
        description={`Committee members appointed from ${t.startsOn} must complete ${t.course} within ${t.withinMonths} months of being appointed, unless the scheme or the member is exempt.`}
        backHref={`/adviser/schemes/${id}/members`}
        backLabel="Members"
      />
      <Card>
        <CardHeader
          title="Members"
          description={`Record each member's appointment date (the AGM or meeting that appointed them, and again when they are re-elected). Once it is recorded, members get email reminders 14, 7 and 1 days before their date. ${t.consequence}`}
        />
        {data.rows.length === 0 ? (
          <p className="text-sm text-ink-muted">No committee members.</p>
        ) : (
          <div className="divide-y divide-line">
            {data.rows.map((r) => (
              <div key={r.profileId} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-ink-muted">
                      Appointed {r.appointedOn}
                      {r.appointedOnRecorded ? "" : " (the date their committee access began, not their appointment: record the appointment date)"}
                      {r.dueOn ? ` · due by ${r.dueOn}` : ""}
                      {r.completedOn ? ` · completed ${r.completedOn}` : ""}
                      {r.exemption ? ` · ${t.exemptions[r.exemption as keyof typeof t.exemptions] ?? r.exemption}` : ""}
                    </p>
                    {r.status === "OVERDUE" && (
                      <p className="mt-1 text-xs text-red-700">
                        No completion recorded by {r.dueOn}. If the appointment date is right and the training was not completed by then, under the training rule they are no longer a committee member. Check, then update the committee.
                      </p>
                    )}
                    {r.status === "COMPLETED_LATE" && (
                      <p className="mt-1 text-xs text-red-700">
                        Completed on {r.completedOn}, after the date it was due ({r.dueOn}). Under the training rule they stopped being a committee member, so they need to be appointed again.
                      </p>
                    )}
                    {r.status === "NOT_YET_REQUIRED" && <p className="mt-1 text-xs text-ink-muted">Update the appointment date when they are next appointed (for example at the next AGM).</p>}
                    {r.checkAppointment && <p className="mt-1 text-xs text-amber-700">Appointed more than 15 months ago. If they were re-elected at a later AGM, update the appointment date.</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip
                      status={r.status === "DUE" && r.daysLeft != null ? (r.daysLeft === 0 ? "Due today" : `Due in ${r.daysLeft} ${r.daysLeft === 1 ? "day" : "days"}`) : TRAINING_STATUS_LABELS[r.status]}
                      variant={VARIANT[r.status]}
                    />
                  </div>
                </div>
                <MemberTrainingForm
                  action={saveCommitteeTrainingAction.bind(null, id, r.profileId)}
                  appointedOn={r.appointedOn}
                  completedOn={r.completedOn}
                  exemption={r.exemption}
                  note={r.note}
                  today={data.today}
                  exemptions={t.exemptions}
                />
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-muted">
          {t.recommendation} {t.repeatNote}
        </p>
      </Card>
    </div>
  );
}
