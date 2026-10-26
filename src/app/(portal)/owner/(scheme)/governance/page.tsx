import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme, scopeSchemeIds } from "@/lib/owner/scheme-scope";
import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { isUpcomingMeeting } from "@/lib/meetings/lifecycle";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { CommitteeMeetingList } from "@/components/committee-meeting-list";
import { connection } from "next/server";
import { logError } from "@/lib/log";
import { committeeTrainingRows } from "@/lib/governance/committee-training-store";
import { TRAINING_STATUS_LABELS } from "@/lib/governance/committee-training";
import { recordMyTrainingAction } from "@/lib/actions/committee-training";
import { Card, CardHeader } from "@/components/ui/card";
import { MyTrainingForm } from "@/components/governance/training-forms";

export default async function OwnerGovernancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const access = await requireCommitteeAccess();
  if (!access) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Governance" description="You do not have committee access to view this page." />
      </div>
    );
  }

  const selectedSchemeId = await getVerifiedSelectedSchemeId(["COMMITTEE"]);
  const schemes = scopeToSelectedScheme(access.schemes, selectedSchemeId);
  const schemeIds = scopeSchemeIds(access.schemeIds, selectedSchemeId);
  const meetings =
    schemeIds.length > 0 ? await getUpcomingMeetingsForOwner(schemeIds) : [];

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  const now = new Date();
  const scheduled = meetings.filter((m) => isUpcomingMeeting(String(m.status), new Date(String(m.scheduledAt)), now));
  const totalMotions = meetings.reduce(
    (sum, m) => sum + m.motions.length,
    0,
  );
  const pendingMotions = meetings.reduce(
    (sum, m) =>
      sum + m.motions.filter((mo) => mo.status === "PROPOSED").length,
    0,
  );

  // The member's own committee training, for each scheme they are on the committee of.
  const training = (
    await Promise.all(
      schemes.map(async (s) => {
        try {
          const data = await committeeTrainingRows(s.id);
          const row = data?.rows.find((r) => r.profileId === access.profile.id);
          return data && row ? { schemeId: s.id, schemeName: String(s.name), row, rules: data.rules, today: data.today } : null;
        } catch (err) {
          // Training is extra: a failure never stops the governance page.
          logError("[governance] committee training failed:", err);
          return null;
        }
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedMeetings, meta } = paginateArray(meetings, page);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Governance"
        description="Meetings, motions, and voting for your schemes."
        action={
          <Button href="/owner/governance/new">Schedule Meeting</Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Upcoming Meetings"
          value={scheduled.length}
          accent="bg-owner"
        />
        <StatCard
          label="Total Motions"
          value={totalMotions}
          accent="bg-owner"
        />
        <StatCard
          label="Pending Votes"
          value={pendingMotions}
          accent="bg-yellow-500"
        />
      </div>

      {training.map((t) => (
        <Card key={t.schemeId} className="mb-6">
          <CardHeader
            title={`Committee training: ${t.schemeName}`}
            description={
              t.row.status === "DUE"
                ? `Complete ${t.rules.course} by ${t.row.dueOn}. ${t.rules.consequence}`
                : t.row.status === "OVERDUE"
                  ? `Your training was due by ${t.row.dueOn}. ${t.rules.consequence} Contact your strata manager or the secretary.`
                  : t.row.status === "APPOINTMENT_NOT_RECORDED"
                    ? `Committee members appointed from ${t.rules.startsOn} complete ${t.rules.course} within ${t.rules.withinMonths} months of appointment. Your strata manager will record your appointment date; you can record your completion now.`
                    : `${TRAINING_STATUS_LABELS[t.row.status]}${t.row.completedOn ? ` (${t.row.completedOn})` : ""}.`
            }
          />
          {(t.row.status === "DUE" || t.row.status === "OVERDUE" || t.row.status === "NOT_YET_REQUIRED" || t.row.status === "APPOINTMENT_NOT_RECORDED") && (
            <div className="space-y-3">
              <a href={t.rules.helpUrl} target="_blank" rel="noreferrer" className="text-sm text-turquoise underline">
                About the training and where to do it
              </a>
              <MyTrainingForm action={recordMyTrainingAction.bind(null, t.schemeId)} today={t.today} />
            </div>
          )}
        </Card>
      ))}

      <CommitteeMeetingList meetings={paginatedMeetings} schemeNames={schemeNames} />

      <Pagination
        page={meta.page}
        hasMore={meta.hasMore}
      />
    </div>
  );
}
