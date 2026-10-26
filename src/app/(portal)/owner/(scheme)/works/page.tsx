import Link from "next/link";
import { formatDateIn } from "@/lib/jurisdiction/time-zone";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { connection } from "next/server";
import { getSelectedOwnerScheme } from "@/lib/owner/selected-scheme";
import { listRequests } from "@/lib/works/requests";
import { awaitingMyVote, committeeMembers } from "@/lib/works/review";
import { requestStatusLabel } from "@/lib/works/decision-rules";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip, type ChipStatus } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

function formatDate(timeZone: string, value: unknown): string {
  if (!value) return "";
  return formatDateIn(timeZone, String(value));
}

function chip(status: string, returned: boolean): ChipStatus {
  if (returned) return "warning";
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "warning";
  if (status === "CLOSED") return "default";
  return "success";
}

type Row = Awaited<ReturnType<typeof listRequests>>[number];

function RequestList({ rows, highlight, timeZone }: { rows: Row[]; highlight?: Set<string>; timeZone: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const returned = r.status === "DRAFT" && !!r.returnReason;
        return (
          <li key={r.id}>
            <Link href={`/owner/works/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-muted p-4 hover:bg-muted/70 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-ink-muted">{String(r.requestNumber)}</span>
                  <StatusChip status={requestStatusLabel({ status: String(r.status), isEmergency: !!r.isEmergency, returnReason: r.returnReason ? String(r.returnReason) : null })} variant={chip(String(r.status), returned)} />
                  {r.isEmergency && <StatusChip status="Urgent" variant="danger" />}
                  {highlight?.has(r.id) && <StatusChip status="Your vote needed" variant="warning" />}
                </div>
                <p className="text-sm font-medium text-ink truncate">{String(r.title)}</p>
                <p className="text-xs text-ink-muted mt-1">
                  {r.trade ? `${String(r.trade)} · ` : ""}
                  {formatDate(timeZone, r.submittedAt ?? r.createdAt)}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Works requests for the selected building (works marketplace stage 1,
 * 25 Oct 2026). Owners see the requests they raised. Committee members see
 * every request, with the ones waiting on their vote first.
 */
export default async function OwnerWorksPage() {
  await connection();
  const selected = await getSelectedOwnerScheme(["OWNER", "COMMITTEE"]);
  if (!selected) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Works requests" description="Report something in the building that needs fixing." />
        <EmptyState title="Choose a building" description="Choose a building from My properties to see its works requests." />
      </div>
    );
  }
  const { schemeId, profile } = selected;
  const members = await committeeMembers(schemeId);
  const tz = await schemeTimeZone(schemeId);
  const isCommittee = members.includes(profile.id);

  const all = await listRequests(schemeId);
  const visible = isCommittee ? all : all.filter((r) => r.raisedById === profile.id);
  const needVote = isCommittee ? new Set((await awaitingMyVote(schemeId, profile.id)).map((d) => d.requestId)) : new Set<string>();

  const waiting = visible.filter((r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW" || needVote.has(r.id));
  const returnedToMe = visible.filter((r) => r.status === "DRAFT" && r.returnReason && r.raisedById === profile.id);
  const rest = visible.filter((r) => !waiting.includes(r) && !returnedToMe.includes(r));

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Works requests"
        description={isCommittee ? "Requests raised in the building, and the committee's decisions on them." : "Report something in the building that needs fixing, and follow what the committee decides."}
        action={
          <div className="flex flex-wrap gap-3">
            {isCommittee && (
              <Button href="/owner/works/settings" variant="secondary">
                Works settings
              </Button>
            )}
            <Button href="/owner/works/new">Report something</Button>
          </div>
        }
      />

      {returnedToMe.length > 0 && (
        <Card>
          <CardHeader title="Returned to you" description="The committee needs more detail before it can decide." />
          <RequestList rows={returnedToMe} timeZone={tz} />
        </Card>
      )}

      {isCommittee && (
        <Card>
          <CardHeader title="For the committee" description="Requests waiting for a decision. Decisions are made by vote here, with no meeting needed." />
          {waiting.length ? <RequestList rows={waiting} highlight={needVote} timeZone={tz} /> : <p className="text-sm text-ink-muted">Nothing is waiting for the committee.</p>}
        </Card>
      )}

      <Card>
        <CardHeader title={isCommittee ? "All requests" : "Your requests"} />
        {(isCommittee ? rest : [...waiting, ...rest]).length === 0 ? (
          <EmptyState title="No works requests" description={isCommittee ? "No other requests have been raised." : "You have not reported anything yet."} />
        ) : (
          <RequestList rows={isCommittee ? rest : [...waiting, ...rest]} timeZone={tz} />
        )}
      </Card>

      <p className="text-xs text-ink-muted">
        Earlier maintenance work orders are still on the <Link href="/owner/maintenance" className="underline">maintenance page</Link>.
      </p>
    </div>
  );
}
