import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/ui/page-header";
import { OwnerMeetingList } from "@/components/owner-meeting-list";

export default async function OwnerMeetingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const meetings = await getUpcomingMeetingsForOwner(schemeIds);

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="My Meetings"
        description="Meetings and governance for your schemes."
      />

      <OwnerMeetingList
        meetings={meetings}
        schemeNames={schemeNames}
        profileId={profile.id}
      />
    </div>
  );
}
