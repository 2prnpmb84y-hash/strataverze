/**
 * The first draft of a section 184 certificate's items, from StrataVerze's
 * records (server side). Each item is text the adviser checks and completes
 * before the certificate is issued: an item StrataVerze holds nothing for
 * says so, and is never presented as nil.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { meetingZone, storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { getSchemeInterestSetting } from "@/lib/finance/interest-setting";
import { graceText } from "@/lib/jurisdiction/wording";
import { toCents } from "@/lib/billing/money";
import { addMonths } from "@/lib/levies/notice-plan";
import { lotArrears } from "@/lib/debt-recovery/payment-plan-requests";

export interface CertificateItem {
  no: string;
  title: string;
  text: string;
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const NOT_HELD = "StrataVerze holds no record of this. Check and complete.";
const HELD_MEETING = ["IN_PROGRESS", "MINUTES_DRAFT", "PUBLISHED"];
const MEETING_LABEL: Record<string, string> = { AGM: "Annual general meeting", FIRST_AGM: "First annual general meeting", EGM: "General meeting", COMMITTEE: "Strata committee meeting" };

/** The lot's levy notices for one kind of fund, as instalment lines with what is unpaid. */
function contributionText(notices: Array<{ dueDate: unknown; amountDue: unknown; amountPaid: unknown; periodStart: unknown; periodEnd: unknown }>, today: string) {
  if (!notices.length) return "No levy notices for this fund are recorded in StrataVerze for the lot. Check and complete.";
  const lines = notices.map((n) => {
    const due = toCents(String(n.amountDue));
    const paid = toCents(String(n.amountPaid ?? 0));
    const state = paid >= due ? "paid" : paid > 0 ? `${aud(due - paid)} unpaid` : day(n.dueDate) < today ? "unpaid (overdue)" : "not yet due";
    return `Due ${day(n.dueDate)} (period ${day(n.periodStart)} to ${day(n.periodEnd)}): ${aud(due)}, ${state}`;
  });
  const outstanding = notices.reduce((s, n) => s + Math.max(0, toCents(String(n.amountDue)) - toCents(String(n.amountPaid ?? 0))), 0);
  return [...lines, `Total outstanding on these notices: ${aud(outstanding)}. Amounts in credit and any early payment discount: check and complete.`].join("\n");
}

export async function draftCertificateItems(schemeId: string, lotId: string, now: Date = new Date()): Promise<CertificateItem[]> {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) throw new Error("Scheme not found");
  const tz = timeZoneOf(scheme);
  const today = todayIn(tz, now);
  const pack = rulesForState(scheme.state).rules;
  const yearAgo = addMonths(today, -12);
  const sixMonthsAgo = addMonths(today, -6);

  const [funds, notices, schedules, setting, arrears, meetings, lotDetail, committee, bylaws, policies] = await Promise.all([
    db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(50).all(),
    db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.lotId.eq(lotId), n.status.neq("DRAFT"), n.status.neq("WRITTEN_OFF"))).orderBy((n) => n.dueDate.asc()).limit(2000).all(),
    db.orm.public.LevySchedule.where((x) => x.schemeId.eq(schemeId)).limit(500).all(),
    getSchemeInterestSetting(schemeId),
    lotArrears(schemeId, lotId, today),
    db.orm.public.Meeting.where((m) => m.schemeId.eq(schemeId)).limit(1000).all(),
    db.orm.public.LotDetail.where((d) => d.lotId.eq(lotId)).first(),
    db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.eq("COMMITTEE"), m.isActive.eq(true))).limit(50).all(),
    db.orm.public.ByLaw.where((b) => b.schemeId.eq(schemeId)).limit(500).all(),
    db.orm.public.InsurancePolicy.where((p) => and(p.schemeId.eq(schemeId), p.status.eq("ACTIVE"))).limit(20).all(),
  ]);
  const fundType = new Map(funds.map((f) => [f.id, String(f.fundType).toUpperCase()]));
  const special = new Set(schedules.filter((x) => String(x.levyType) === "SPECIAL").map((x) => x.id));
  // The current and coming instalments, and any earlier ones still unpaid.
  const relevant = notices.filter((n) => day(n.dueDate) >= yearAgo || toCents(String(n.amountPaid ?? 0)) < toCents(String(n.amountDue)));
  const ordinary = (type: string) => relevant.filter((n) => !special.has(n.levyScheduleId) && (fundType.get(n.fundId) ?? "").includes(type));
  const specials = relevant.filter((n) => special.has(n.levyScheduleId));

  const i = pack.STATUTORY_INTEREST;
  const interestText =
    setting.mode === "NO_INTEREST"
      ? `The ${pack.TERMINOLOGY.ownersCorporation} has resolved that contributions bear no interest (${pack.CITATIONS.noInterestResolution}).`
      : `Simple interest at ${i.annualRatePercent}% a year on contributions not paid ${graceText(i)} after they are due (${pack.CITATIONS.interest}).`;

  const held = meetings
    .filter((m) => HELD_MEETING.includes(String(m.status)))
    .map((m) => ({ m, d: storedDayIn(meetingZone(m, tz), m.startTime ?? m.scheduledAt) }))
    .filter((x) => x.d >= yearAgo && x.d <= today)
    .sort((a, b) => a.d.localeCompare(b.d));
  const upcoming = meetings
    .filter((m) => String(m.status) === "NOTICE_ISSUED")
    .map((m) => ({ m, d: storedDayIn(meetingZone(m, tz), m.startTime ?? m.scheduledAt) }))
    .filter((x) => x.d >= today)
    .sort((a, b) => a.d.localeCompare(b.d));

  const members = committee.length ? await db.orm.public.Profile.where((p) => p.id.in(committee.map((c) => c.profileId))).limit(50).all() : [];
  const recentBylaws = bylaws.filter((b) => !b.deletedAt && day(b.effectiveDate) >= sixMonthsAgo);

  const text: Record<string, string> = {
    "1": "No strata renewal committee is recorded in StrataVerze. Check and complete.",
    "2": `Whether there is an exclusive supply network, and which services (electricity, gas, hot water, chilled water, internet, other): ${NOT_HELD}`,
    "3": contributionText(ordinary("ADMIN"), today),
    "4": contributionText(ordinary("CAPITAL"), today),
    "5": NOT_HELD,
    "6": specials.length ? contributionText(specials, today) + "\nPurpose of each special contribution: check and complete." : `No special levies are recorded in StrataVerze for the lot. ${NOT_HELD}`,
    "7": NOT_HELD,
    "8": NOT_HELD,
    "9": NOT_HELD,
    "10": NOT_HELD,
    "11": `${interestText}\nInterest payable on outstanding contributions: ${aud(arrears.interestCents)}.`,
    "12": `Contributions overdue and recoverable: ${aud(arrears.leviesCents)} in levies and ${aud(arrears.interestCents)} in interest. Monetary penalties: ${NOT_HELD}`,
    "12A": NOT_HELD,
    "13": held.length ? held.map((x) => `${x.d}: ${MEETING_LABEL[String(x.m.meetingType)] ?? String(x.m.meetingType)}`).join("\n") : "No meetings held in the 12 months are recorded in StrataVerze. Check and complete.",
    "14": upcoming.length ? upcoming.map((x) => `${x.d}: ${MEETING_LABEL[String(x.m.meetingType)] ?? String(x.m.meetingType)}`).join("\n") : "No meetings notified but not yet held are recorded in StrataVerze. Check and complete.",
    "15": [
      `Owner: ${lotDetail?.rollOwnerName?.trim() || "not recorded"}`,
      `Address: ${lotDetail?.ownerAddress?.trim() || "not recorded"}`,
      "Mortgagees or covenant chargees who have given notice of their interest, and their addresses for notices: check and complete.",
    ].join("\n"),
    "16": NOT_HELD,
    "17": members.length
      ? [...members.map((p) => `${`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()} (address: check and complete)`), "Chairperson, secretary and treasurer: check and complete."].join("\n")
      : `No committee members are recorded in StrataVerze. ${NOT_HELD}`,
    "18": recentBylaws.length
      ? [...recentBylaws.map((b) => `By-law ${b.bylawNumber}, ${b.title}, effective ${day(b.effectiveDate)}`), "Whether each is lodged with the Registrar-General: check and complete."].join("\n")
      : "No by-laws made in the previous six months are recorded in StrataVerze. Check and complete.",
    "19": policies.length
      ? policies
          .slice(0, 4)
          .map((p) => `${String(p.policyType).replace(/_/g, " ").toLowerCase()}: ${p.insurer}, policy ${p.policyNumber}, sum insured ${aud(toCents(String(p.coverageAmount)))}, due ${day(p.endDate)}, premium ${aud(toCents(String(p.premium)))}${p.broker ? `, broker ${p.broker}` : ""}. Last premium date: check and complete.`)
          .join("\n")
      : `No active insurance policies are recorded in StrataVerze. ${NOT_HELD}`,
    "20": "Only if the scheme is part of a community scheme. Check and complete.",
    "21": "Only if the scheme is part of a community scheme. Check and complete.",
    "22": "Only if the scheme is a member of a building management committee. Check and complete.",
    "23": NOT_HELD,
  };
  return pack.SALE_CERTIFICATE.items.map(([no, title]) => ({ no, title, text: text[no] ?? NOT_HELD }));
}
