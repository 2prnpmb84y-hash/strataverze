import { notFound } from "next/navigation";
import { lateChargeWords } from "@/lib/jurisdiction/wording";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getOverdueLevyNoticesWithInterest } from "@/lib/queries/interest";
import { PageHeader } from "@/components/ui/page-header";
import { InterestClient } from "./interest-client";
import { InterestSettingForm } from "./interest-setting-form";
import { Card } from "@/components/ui/card";
import { resolutionMeetings } from "@/lib/finance/resolutions";
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
  // Whether the building's setting charges anything (NSW interest, Queensland penalty).
  const charging = interestData?.charging ?? false;
  // The building's late charge wording (its pack's modes, rate, grace period, citations).
  const words = lateChargeWords(setting.rules.rules, setting, charging);

  return (
    <div className="space-y-6">
      <PageHeader title={words.title} description={words.description} />

      <Card>
        <InterestSettingForm
          schemeId={id}
          mode={setting.mode}
          monthlyRatePercent={setting.monthlyRatePercent}
          meetingId={setting.meetingId}
          motionId={setting.motionId}
          meetings={meetings}
          words={words}
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
        charging={charging}
        words={words}
      />
    </div>
  );
}
