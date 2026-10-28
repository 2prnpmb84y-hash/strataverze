import { notFound } from "next/navigation";
import { lateChargeWaiverWords, lateChargeWords } from "@/lib/jurisdiction/wording";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getOverdueLevyNoticesWithInterest } from "@/lib/queries/interest";
import { PageHeader } from "@/components/ui/page-header";
import { InterestClient } from "./interest-client";
import { InterestSettingForm } from "./interest-setting-form";
import { LateChargeWaiverForm, type RecordedWaiver } from "./late-charge-waiver-form";
import { Card } from "@/components/ui/card";
import { resolutionMeetings } from "@/lib/finance/resolutions";
import { getSchemeInterestSetting } from "@/lib/finance/interest-setting";
import { db } from "@/prisma/db";
import { formatDateIn } from "@/lib/jurisdiction/time-zone";
import { fromCents } from "@/lib/billing/money";
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
  // The one-case waiver, where the building's pack gives one (VIC and WA); NSW and Queensland have none, and the table is not read for them.
  const waiverWords = lateChargeWaiverWords(setting.rules.rules);
  const waivers: RecordedWaiver[] = waiverWords ? await recordedWaivers(id, setting.timeZone, words.Term) : [];

  return (
    <div className="space-y-6">
      <PageHeader title={words.title} description={words.description} />

      <Card>
        <InterestSettingForm
          schemeId={id}
          mode={setting.mode}
          monthlyRatePercent={setting.monthlyRatePercent}
          annualRatePercent={setting.annualRatePercent}
          meetingId={setting.meetingId}
          motionId={setting.motionId}
          meetings={meetings}
          words={words}
        />
      </Card>

      {waiverWords && (
        <Card>
          <LateChargeWaiverForm
            schemeId={id}
            notices={notices.map((n) => ({ id: n.id, label: `${String(n.noticeNumber)}, lot ${n.lot ? String(n.lot.lotNumber) : "?"}` }))}
            meetings={meetings}
            waivers={waivers}
            words={waiverWords}
          />
        </Card>
      )}

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

/** The waivers recorded for the building's notices, as the page lists them. */
async function recordedWaivers(schemeId: string, timeZone: string, Term: string): Promise<RecordedWaiver[]> {
  const rows = await db.orm.public.LateChargeWaiver.where((w) => w.schemeId.eq(schemeId)).limit(500).all();
  if (rows.length === 0) return [];
  const notices = await db.orm.public.LevyNotice.where((n) => n.id.in(rows.map((r) => r.levyNoticeId))).limit(500).all();
  const numberOf = new Map(notices.map((n) => [n.id, String(n.noticeNumber)]));
  const day = (v: unknown) => formatDateIn(timeZone, String(v).slice(0, 10));
  return rows.map((r) => ({
    id: r.id,
    notice: numberOf.get(r.levyNoticeId) ?? "Notice",
    what:
      r.kind === "WHOLE"
        ? `${Term} waived in full`
        : r.kind === "AMOUNT"
          ? `$${fromCents(Math.round(Number(r.amount) * 100)).toFixed(2)} of ${Term.toLowerCase()} waived`
          : `${Term} waived from ${day(r.fromDate)} to ${day(r.toDate)}`,
    decidedOn: day(r.decidedOn),
    reasons: r.reasons ?? null,
  }));
}
