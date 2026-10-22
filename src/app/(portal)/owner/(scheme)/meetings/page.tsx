import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { getOpenBallotsForMeetings } from "@/lib/queries/evoting";
import { getAgendaItemsForMeeting } from "@/lib/queries/agenda";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { OwnerMeetingList } from "@/components/owner-meeting-list";
import { OwnerBallotVoting } from "@/components/owner-ballot-voting";
export default async function OwnerMeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getSelectedSchemeId(),
  );
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const meetings = await getUpcomingMeetingsForOwner(schemeIds);

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedMeetings, meta } = paginateArray(meetings, page);

  // Open pre-meeting ballots the owner can vote in.
  const openBallots = await getOpenBallotsForMeetings(meetings.map((m) => m.id));
  const ballotCards = await Promise.all(
    openBallots.map(async (b) => {
      const meeting = meetings.find((m) => m.id === b.meetingId);
      const items = await getAgendaItemsForMeeting(b.meetingId);
      const myVotes = new Map(
        b.votes
          .filter((v) => v.profileId === profile.id)
          .map((v) => [v.agendaItemId, v.voteValue]),
      );
      return {
        meetingId: b.meetingId,
        meetingTitle: meeting?.title ?? "Meeting",
        schemeName: meeting ? (schemeNames[meeting.schemeId] ?? "") : "",
        items: items.map((i) => ({
          id: i.id,
          position: i.position,
          title: i.title,
          resolutionCategory: i.resolutionCategory,
          myVote: myVotes.get(i.id) ?? null,
        })),
      };
    }),
  );

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My Meetings"
        description="Meetings and governance for your schemes."
      />

      <OwnerBallotVoting cards={ballotCards} />

      <OwnerMeetingList
        meetings={paginatedMeetings}
        schemeNames={schemeNames}
        profileId={profile.id}
      />

      <Pagination
        page={meta.page}
        hasMore={meta.hasMore}
      />
    </div>
  );
}
