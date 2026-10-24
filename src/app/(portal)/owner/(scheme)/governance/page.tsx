import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme, scopeSchemeIds } from "@/lib/owner/scheme-scope";
import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { CommitteeMeetingList } from "@/components/committee-meeting-list";
import { connection } from "next/server";

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

      <CommitteeMeetingList meetings={paginatedMeetings} schemeNames={schemeNames} />

      <Pagination
        page={meta.page}
        hasMore={meta.hasMore}
      />
    </div>
  );
}
