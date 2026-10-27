/**
 * The first draft of a certificate's items, from StrataVerze's records
 * (server side): the NSW section 184 certificate, or the Queensland body
 * corporate certificate (stage 2, step 9). Each item is text the adviser
 * checks and completes before the certificate is issued: an item StrataVerze
 * holds nothing for says so, and is never presented as nil.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { meetingZone, storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { getSchemeInterestSetting, statutoryInterestForScheme } from "@/lib/finance/interest-setting";
import { graceText } from "@/lib/jurisdiction/wording";
import { toCents } from "@/lib/billing/money";
import { addMonths } from "@/lib/levies/notice-plan";
import { lotArrears } from "@/lib/debt-recovery/payment-plan-requests";
import { needRule, type StatutoryRules } from "@/config/statutory";
import { entitlementFor, regulationModuleLabel } from "@/lib/jurisdiction/building-data";

export interface CertificateItem {
  no: string;
  title: string;
  text: string;
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const NOT_HELD = "StrataVerze holds no record of this. Check and complete.";
const HELD_MEETING = ["IN_PROGRESS", "MINUTES_DRAFT", "PUBLISHED", "ADJOURNED"];
/** Items worked out from StrataVerze's records (refreshed from them before issue); the rest are the adviser's. */
export const FIGURE_ITEMS = ["3", "4", "6", "11", "12", "13", "14", "18", "19"] as const;
/** The same for the Queensland body corporate certificate (stage 2, step 9). */
export const BODY_CORPORATE_FIGURE_ITEMS = ["4", "6", "8"] as const;

/** Which items a building's certificate refreshes from the records, and how the refresh button asks. */
export function certificateDrafting(rules: Pick<StatutoryRules, "FEATURES">): { figureItems: readonly string[]; refreshPrompt: string } {
  if (rules.FEATURES.bodyCorporateCertificate) return { figureItems: BODY_CORPORATE_FIGURE_ITEMS, refreshPrompt: "Replace items 4, 6 and 8 with today's figures? Your other items are kept." };
  return { figureItems: FIGURE_ITEMS, refreshPrompt: "Replace items 3, 4, 6, 11 to 14, 18 and 19 with today's figures? Your other items are kept." };
}
const MEETING_LABEL: Record<string, string> = { AGM: "Annual general meeting", FIRST_AGM: "First annual general meeting", EGM: "General meeting", COMMITTEE: "Strata committee meeting" };

/** The lot's levy (or contribution) notices for one kind of fund, as instalment lines with what is unpaid. */
function contributionText(notices: Array<{ dueDate: unknown; amountDue: unknown; amountPaid: unknown; periodStart: unknown; periodEnd: unknown }>, today: string, levy: string) {
  if (!notices.length) return `No ${levy} notices for this fund are recorded in StrataVerze for the lot. Check and complete.`;
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
  if (pack.FEATURES.bodyCorporateCertificate) return draftBodyCorporateCertificate({ schemeId, lotId, scheme, today, tz, pack });
  const yearAgo = addMonths(today, -12);
  const sixMonthsAgo = addMonths(today, -6);

  const [funds, notices, schedules, setting, arrears, meetings, lotDetail, committee, bylaws, policies] = await Promise.all([
    db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(50).all(),
    db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.lotId.eq(lotId), n.status.neq("DRAFT"), n.status.neq("WRITTEN_OFF"))).orderBy((n) => n.dueDate.asc()).limit(2000).all(),
    db.orm.public.LevySchedule.where((x) => x.schemeId.eq(schemeId)).limit(500).all(),
    getSchemeInterestSetting(schemeId),
    lotArrears(schemeId, lotId, today, pack.PAYMENT_ALLOCATION_ORDER),
    db.orm.public.Meeting.where((m) => and(m.schemeId.eq(schemeId), m.deletedAt.isNull())).limit(1000).all(),
    db.orm.public.LotDetail.where((d) => d.lotId.eq(lotId)).first(),
    db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.eq("COMMITTEE"), m.isActive.eq(true))).limit(50).all(),
    db.orm.public.ByLaw.where((b) => and(b.schemeId.eq(schemeId), b.status.eq("ACTIVE"))).limit(500).all(),
    db.orm.public.InsurancePolicy.where((p) => and(p.schemeId.eq(schemeId), p.status.eq("ACTIVE"), p.deletedAt.isNull())).limit(50).all(),
  ]);
  // Interest to date on the lot's notices: what is posted and unpaid, plus what has accrued since it was last posted.
  const lotNoticeIds = new Set(notices.map((n) => n.id));
  const accruedCents = (await statutoryInterestForScheme(schemeId, today)).filter((x) => lotNoticeIds.has(x.noticeId)).reduce((sum, x) => sum + Math.max(0, x.additionalCents), 0);
  const fundType = new Map(funds.map((f) => [f.id, String(f.fundType).toUpperCase()]));
  const special = new Set(schedules.filter((x) => String(x.levyType) === "SPECIAL").map((x) => x.id));
  // The current and coming instalments, and any earlier ones still unpaid.
  const relevant = notices.filter((n) => day(n.dueDate) >= yearAgo || toCents(String(n.amountPaid ?? 0)) < toCents(String(n.amountDue)));
  const ordinary = (type: string) => relevant.filter((n) => !special.has(n.levyScheduleId) && (fundType.get(n.fundId) ?? "").includes(type));
  const specials = relevant.filter((n) => special.has(n.levyScheduleId));

  const i = needRule(pack, "STATUTORY_INTEREST");
  const citations = needRule(pack, "CITATIONS");
  const interestText =
    setting.mode === "NO_INTEREST"
      ? `The ${pack.TERMINOLOGY.ownersCorporation} has resolved that contributions bear no interest (${citations.noInterestResolution}).`
      : `Simple interest at ${i.annualRatePercent}% a year on contributions not paid ${graceText(i)} after they are due (${citations.interest}).`;

  // Meetings that opened (or were adjourned), and legacy SCHEDULED meetings whose date has passed (to confirm).
  const held = meetings
    .filter((m) => HELD_MEETING.includes(String(m.status)) || String(m.status) === "SCHEDULED")
    .map((m) => ({ m, d: storedDayIn(meetingZone(m, tz), m.openedAt ?? m.startTime ?? m.scheduledAt), confirm: String(m.status) === "SCHEDULED" }))
    .filter((x) => x.d >= yearAgo && x.d <= today)
    .sort((a, b) => a.d.localeCompare(b.d));
  const upcoming = meetings
    .filter((m) => String(m.status) === "NOTICE_ISSUED")
    .map((m) => ({ m, d: storedDayIn(meetingZone(m, tz), m.startTime ?? m.scheduledAt) }))
    .filter((x) => x.d >= today)
    .sort((a, b) => a.d.localeCompare(b.d));

  const members = committee.length ? await db.orm.public.Profile.where((p) => p.id.in(committee.map((c) => c.profileId))).limit(50).all() : [];
  // Candidates only: StrataVerze does not record lodgement with the Registrar-General.
  const recentBylaws = bylaws.filter((b) => !b.deletedAt && storedDayIn(tz, b.effectiveDate) >= sixMonthsAgo);
  // Building and strata cover first, then the rest; the form has room for four.
  const rank = (t: string) => (t === "STRATA" || t === "BUILDING" ? 0 : t === "PUBLIC_LIABILITY" ? 1 : 2);
  const sortedPolicies = [...policies].sort((a, b) => rank(String(a.policyType)) - rank(String(b.policyType)));

  const text: Record<string, string> = {
    "1": "No strata renewal committee is recorded in StrataVerze. Check and complete.",
    "2": `Whether there is an exclusive supply network, and which services (electricity, gas, hot water, chilled water, internet, other): ${NOT_HELD}`,
    "3": contributionText(ordinary("ADMIN"), today, pack.TERMINOLOGY.levy),
    "4": contributionText(ordinary("CAPITAL"), today, pack.TERMINOLOGY.levy),
    "5": NOT_HELD,
    "6": specials.length ? contributionText(specials, today, pack.TERMINOLOGY.levy) + "\nPurpose of each special contribution: check and complete." : `No special levies are recorded in StrataVerze for the lot. ${NOT_HELD}`,
    "7": NOT_HELD,
    "8": NOT_HELD,
    "9": NOT_HELD,
    "10": NOT_HELD,
    "11": `${interestText}\nInterest payable on outstanding contributions at ${today}: ${aud(arrears.interestCents + accruedCents)} (${aud(arrears.interestCents)} charged and unpaid, ${aud(accruedCents)} accrued since). Check and complete.`,
    "12": `Contributions overdue and recoverable at ${today}: ${aud(arrears.leviesCents)} in levies and ${aud(arrears.interestCents + accruedCents)} in interest. Monetary penalties: ${NOT_HELD}`,
    "12A": NOT_HELD,
    "13": held.length
      ? [...held.map((x) => `${x.d}: ${MEETING_LABEL[String(x.m.meetingType)] ?? String(x.m.meetingType)}${x.confirm ? " (recorded as scheduled: confirm it was held)" : ""}`), "Meetings held outside StrataVerze: check and complete."].join("\n")
      : "No meetings held in the 12 months are recorded in StrataVerze. Check and complete.",
    "14": upcoming.length
      ? [...upcoming.map((x) => `${x.d}: ${MEETING_LABEL[String(x.m.meetingType)] ?? String(x.m.meetingType)}`), "Meetings notified outside StrataVerze: check and complete."].join("\n")
      : "No meetings notified but not yet held are recorded in StrataVerze. Check and complete.",
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
      ? [
          "By-laws in force recorded with a date in the previous six months (StrataVerze does not record lodgement):",
          ...recentBylaws.map((b) => `By-law ${b.bylawNumber}, ${b.title}, dated ${storedDayIn(tz, b.effectiveDate)}`),
          "List here only by-laws made in the previous six months that are not yet lodged with the Registrar-General: check and complete.",
        ].join("\n")
      : "No by-laws made in the previous six months are recorded in StrataVerze. Check and complete.",
    "19": sortedPolicies.length
      ? [
          ...sortedPolicies
            .slice(0, 4)
            .map((p) => `${String(p.policyType).replace(/_/g, " ").toLowerCase()}: ${p.insurer}, policy ${p.policyNumber}, sum insured ${aud(toCents(String(p.coverageAmount)))}, due ${storedDayIn(tz, p.endDate)}, premium ${aud(toCents(String(p.premium)))}${p.broker ? `, broker ${p.broker}` : ""}. Last premium date: check and complete.`),
          ...(sortedPolicies.length > 4 ? [`${sortedPolicies.length - 4} more active policies are recorded; the form has room for four.`] : []),
        ].join("\n")
      : `No active insurance policies are recorded in StrataVerze. ${NOT_HELD}`,
    "20": "Only if the scheme is part of a community scheme. Check and complete.",
    "21": "Only if the scheme is part of a community scheme. Check and complete.",
    "22": "Only if the scheme is a member of a building management committee. Check and complete.",
    "23": NOT_HELD,
  };
  return needRule(pack, "SALE_CERTIFICATE").items.map(([no, title]) => ({ no, title, text: text[no] ?? NOT_HELD }));
}

/** An insurance policy as a certificate line. */
const policyLine = (tz: string, p: { policyType: unknown; insurer: unknown; policyNumber: unknown; coverageAmount: unknown; endDate: unknown; premium: unknown; broker: unknown }) =>
  `${String(p.policyType).replace(/_/g, " ").toLowerCase()}: ${p.insurer}, policy ${p.policyNumber}, sum insured ${aud(toCents(String(p.coverageAmount)))}, due ${storedDayIn(tz, p.endDate)}, premium ${aud(toCents(String(p.premium)))}${p.broker ? `, broker ${p.broker}` : ""}.`;

/**
 * The first draft of a Queensland body corporate certificate (stage 2,
 * step 9): the contributions, the amounts owing and the insurance from
 * StrataVerze's records (BODY_CORPORATE_FIGURE_ITEMS); every other item is the
 * adviser's to complete. Owners and buyers read it, so it says "contribution"
 * and "penalty" from the pack's words.
 */
async function draftBodyCorporateCertificate(input: {
  schemeId: string;
  lotId: string;
  scheme: { name: unknown; regulationModule?: string | null };
  today: string;
  tz: string;
  pack: StatutoryRules;
}): Promise<CertificateItem[]> {
  const { schemeId, lotId, today, tz, pack } = input;
  const terms = pack.TERMINOLOGY;
  const yearAgo = addMonths(today, -12);
  const [lot, funds, notices, schedules, arrears, policies] = await Promise.all([
    db.orm.public.Lot.where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId))).first(),
    db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(50).all(),
    db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.lotId.eq(lotId), n.status.neq("DRAFT"), n.status.neq("WRITTEN_OFF"))).orderBy((n) => n.dueDate.asc()).limit(2000).all(),
    db.orm.public.LevySchedule.where((x) => x.schemeId.eq(schemeId)).limit(500).all(),
    lotArrears(schemeId, lotId, today, pack.PAYMENT_ALLOCATION_ORDER),
    db.orm.public.InsurancePolicy.where((p) => and(p.schemeId.eq(schemeId), p.status.eq("ACTIVE"), p.deletedAt.isNull())).limit(50).all(),
  ]);
  const fundType = new Map(funds.map((f) => [f.id, String(f.fundType).toUpperCase()]));
  const special = new Set(schedules.filter((x) => String(x.levyType) === "SPECIAL").map((x) => x.id));
  const relevant = notices.filter((n) => day(n.dueDate) >= yearAgo || toCents(String(n.amountPaid ?? 0)) < toCents(String(n.amountDue)));
  const forFund = (ledgerFund: string) => relevant.filter((n) => !special.has(n.levyScheduleId) && (fundType.get(n.fundId) ?? "").includes(ledgerFund === "ADMINISTRATIVE" ? "ADMIN" : "CAPITAL"));
  const specials = relevant.filter((n) => special.has(n.levyScheduleId));
  const contributions = [
    ...pack.FUND_CATALOGUE.flatMap((f) => [`${f.label}:`, contributionText(forFund(f.ledgerFund), today, terms.levy)]),
    ...(specials.length ? [`Special ${terms.levies}:`, contributionText(specials, today, terms.levy)] : []),
    `Any discount for paying on time and any ${terms.lateCharge} for late payment, as resolved by the ${terms.ownersCorporation}: check and complete.`,
  ].join("\n");

  // The module and both lot entitlements (stage 2, step 10), from the
  // building's records. Missing ones are said plainly, never filled in.
  const selector = pack.REGULATION_MODULE;
  const moduleName = regulationModuleLabel(pack, input.scheme.regulationModule);
  const moduleLine = selector
    ? `${selector.label}: ${moduleName ? `${moduleName}.` : "not recorded for this building in StrataVerze. Check and complete."}`
    : "Regulation module: check and complete.";
  const entitlementLines = pack.ENTITLEMENT_SCHEDULES.map((schedule) => {
    const name = `${schedule.name[0].toUpperCase()}${schedule.name.slice(1)}`;
    try {
      return `${name}: ${entitlementFor({ lotNumber: lot?.lotNumber ?? null, entitlement: lot?.entitlement ?? null, interestScheduleEntitlement: lot?.interestScheduleEntitlement ?? null }, schedule)}`;
    } catch {
      return `${name}: not recorded for this lot in StrataVerze. Check and complete.`;
    }
  });

  const text: Record<string, string> = {
    "2": `Scheme name: ${String(input.scheme.name ?? "")}. ${moduleLine}`,
    "4": contributions,
    "5": [...entitlementLines, "From StrataVerze's records. Check them before the certificate is issued."].join("\n"),
    "6": [
      `Unpaid ${terms.levies} overdue at ${today}: ${aud(arrears.leviesCents)}.`,
      `${terms.lateCharge[0].toUpperCase()}${terms.lateCharge.slice(1)} charged and unpaid: ${aud(arrears.interestCents)}.`,
      `Any ${terms.lateCharge} since it was last charged, recovery costs and other amounts owing: check and complete.`,
    ].join("\n"),
    "8": policies.length ? [...policies.map((p) => policyLine(tz, p)), "Anything else the form asks about the insurance: check and complete."].join("\n") : `No active insurance policies are recorded in StrataVerze. ${NOT_HELD}`,
  };
  return needRule(pack, "CERTIFICATE").items.map(([no, title]) => ({ no, title, text: text[no] ?? NOT_HELD }));
}
