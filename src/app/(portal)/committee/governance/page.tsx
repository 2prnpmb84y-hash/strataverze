import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { CommitteeMeetingList } from "@/components/committee-meeting-list";

export default async function CommitteeGovernancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const meetings =
    schemeIds.length > 0 ? await getUpcomingMeetingsForOwner(schemeIds) : [];

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  const scheduled = meetings.filter((m) => m.status === "SCHEDULED");
  const totalMotions = meetings.reduce(
    (sum, m) => sum + m.motions.length,
    0,
  );
  const pendingMotions = meetings.reduce(
    (sum, m) =>
      sum + m.motions.filter((mo) => mo.status === "PROPOSED").length,
    0,
  );

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedMeetings, meta } = paginateArray(meetings, page);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Governance"
        description="Meetings, motions, and voting for your schemes."
        action={
          <Button href="/committee/governance/new">Schedule Meeting</Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Upcoming Meetings"
          value={scheduled.length}
          accent="bg-committee"
        />
        <StatCard
          label="Total Motions"
          value={totalMotions}
          accent="bg-committee"
        />
        <StatCard
          label="Pending Votes"
          value={pendingMotions}
          accent="bg-yellow-500"
        />
      </div>

      <CommitteeMeetingList meetings={paginatedMeetings} schemeNames={schemeNames} />

      <Pagination
        currentPage={meta.currentPage}
        totalPages={meta.totalPages}
        basePath="/committee/governance"
      />
    </div>
  );
}
