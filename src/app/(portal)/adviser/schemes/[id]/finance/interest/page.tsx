import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getOverdueLevyNoticesWithInterest } from "@/lib/queries/interest";
import { PageHeader } from "@/components/ui/page-header";
import { InterestClient } from "./interest-client";
import { InterestSettingForm, type ResolutionMeeting } from "./interest-setting-form";
import { Card } from "@/components/ui/card";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { getSchemeInterestSetting } from "@/lib/finance/interest-setting";
import { connection } from "next/server";

export default async function InterestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const [interestData, setting, meetings] = await Promise.all([
    getOverdueLevyNoticesWithInterest(id),
    getSchemeInterestSetting(id),
    resolutionMeetings(id),
  ]);
  const notices = interestData?.notices ?? [];
  const annualRate = interestData?.annualRate ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interest on Overdue Levies"
        description={
          annualRate > 0
            ? `Statutory interest: ${annualRate}% a year simple interest on levies unpaid one month after the due date (SSMA 2015 s 85).`
            : "No interest: the owners corporation resolved that contributions bear no interest (SSMA 2015 s 85(3))."
        }
      />

      <Card>
        <InterestSettingForm
          schemeId={id}
          mode={setting.mode}
          meetingId={setting.meetingId}
          motionId={setting.motionId}
          meetings={meetings}
        />
      </Card>

      <InterestClient
        schemeId={id}
        notices={notices.map((n) => ({
          id: n.id,
          noticeNumber: String(n.noticeNumber),
          lotNumber: n.lot ? String(n.lot.lotNumber) : "—",
          fundName: n.fund ? String(n.fund.name) : "—",
          dueDate: String(n.dueDate),
          balanceOutstanding: Number(n.balanceOutstanding),
          daysOverdue: n.daysOverdue,
          calculatedInterest: n.calculatedInterest,
          previouslyCharged: n.previouslyCharged,
          additionalInterest: n.additionalInterest,
          graceEnds: n.graceEnds,
          interestReason: n.interestReason,
        }))}
        annualRate={annualRate}
      />
    </div>
  );
}

/** General meetings of the scheme with their carried motions, newest first. */
async function resolutionMeetings(schemeId: string): Promise<ResolutionMeeting[]> {
  const meetings = await db.orm.public.Meeting
    .where((m) => and(m.schemeId.eq(schemeId), m.meetingType.in(["AGM", "EGM", "SGM", "FIRST_AGM"])))
    .orderBy((m) => m.scheduledAt.desc())
    .limit(100)
    .all();
  if (meetings.length === 0) return [];
  const items = await db.orm.public.AgendaItem
    .where((a) => a.meetingId.in(meetings.map((m) => m.id)))
    .orderBy((a) => a.position.asc())
    .limit(5000)
    .all();
  return meetings
    .map((m) => ({
      id: m.id,
      label: `${m.title} (${new Date(String(m.scheduledAt)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" })})`,
      motions: items
        .filter((a) => a.meetingId === m.id && (a.status === "CARRIED" || a.outcome === "RESOLVED"))
        .map((a) => ({ id: a.id, label: `${a.position}. ${a.title}` })),
    }))
    .filter((m) => m.motions.length > 0);
}
