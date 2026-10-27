/**
 * Wording worked out from a building's rules (multi-jurisdiction plan, phase
 * 1d). Pure, so it can be used in the browser too. Text that states a rule
 * ("5 weeks", "one month") is built from the rule's value, so it cannot drift
 * from what the platform does.
 */
import type { StatutoryRules } from "@/config/statutory";
import { needRule } from "@/config/statutory/need-rule";
import { lateChargeApplies, type InterestRule, type LateChargeSetting } from "@/lib/finance/statutory-interest";
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** How long before the due date a notice goes out: "5 weeks", "1 week" or "40 days". */
export function noticeLeadText(rule: { issueDaysBeforeDue: number }): string {
  const d = rule.issueDaysBeforeDue;
  if (d > 0 && d % 7 === 0) return d === 7 ? "1 week" : `${d / 7} weeks`;
  return d === 1 ? "1 day" : `${d} days`;
}

/** The point a notice should have gone out by: "5-week mark", "40-day mark". */
export function noticeLeadMark(rule: { issueDaysBeforeDue: number }): string {
  const d = rule.issueDaysBeforeDue;
  return d > 0 && d % 7 === 0 ? `${d / 7}-week mark` : `${d}-day mark`;
}

/** The levy notice timing words a screen needs, from the building's rule. */
export interface NoticeTimingWords {
  /** "5 weeks" */
  lead: string;
  /** "5-week mark" */
  mark: string;
  /** The statutory minimum notice, in days (30). */
  minimumDays: number;
  /** The minimum notice for an urgent special levy, in days (14), or null where the pack has none (the option is not offered). */
  urgentDays: number | null;
}

/** From the building's `rules.NOTICE_RULES`. */
export function noticeTimingWords(rule: { issueDaysBeforeDue: number; minimumNoticeDays: number; urgentNoticeDays: number | null }): NoticeTimingWords {
  return { lead: noticeLeadText(rule), mark: noticeLeadMark(rule), minimumDays: rule.minimumNoticeDays, urgentDays: rule.urgentNoticeDays };
}

/** A small count in words ("two quotes"), as the platform writes rule counts. */
export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** The interest grace period: "one month", "two months". */
export function graceText(rule: { graceMonths: number }): string {
  const n = rule.graceMonths;
  const word = NUMBER_WORDS[n] ?? String(n);
  return n === 1 ? `${word} month` : `${word} months`;
}

/** The governing Act with its jurisdiction: "Strata Schemes Management Act 2015 (NSW)". */
export function actName(terms: { act: string; jurisdictionShort: string }): string {
  return `${terms.act} (${terms.jurisdictionShort})`;
}

/** The first letter in capitals, for a term at the start of a sentence ("Owners corporation"). */
export function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** The interest wording a screen needs, from the building's rules. */
export interface InterestWords {
  /** 10 */
  ratePercent: number;
  /** "one month" */
  grace: string;
  /** "SSMA 2015 s 85" */
  citation: string;
  /** "Strata Schemes Management Act 2015 (NSW) s 85" */
  fullCitation: string;
  /** "SSMA 2015 s 85(3)" */
  noInterestCitation: string;
  /** "s 85(3)" */
  noInterestSection: string;
  /** "owners corporation" */
  ownersCorporation: string;
}

export function interestWords(rules: StatutoryRules): InterestWords {
  const interest = needRule(rules, "STATUTORY_INTEREST");
  const citations = needRule(rules, "CITATIONS");
  return {
    ratePercent: interest.annualRatePercent,
    grace: graceText(interest),
    citation: citations.interest,
    fullCitation: `${actName(rules.TERMINOLOGY)} ${citations.interestSection}`,
    noInterestCitation: citations.noInterestResolution,
    noInterestSection: citations.noInterestSection,
    ownersCorporation: rules.TERMINOLOGY.ownersCorporation,
  };
}

/** The building's words for its legal entity, plan, levies and late charges (`rules.TERMINOLOGY`). */
export type Terms = StatutoryRules["TERMINOLOGY"];

// ─── The late charge (stage 2, step 6) ─────────────────────────────────────

/** A rate as written: 2.5 is "2.5", 2 is "2", 1.25 is "1.25". */
export function percentText(rate: number): string {
  return String(Number(rate.toFixed(2)));
}

/** A monthly penalty as a notice states it: the resolved rate, or null where none applies. */
export interface MonthlyPenaltyTerms {
  monthlyRatePercent: number | null;
  source: string;
}

/** What a notice says about late payment: an annual interest rule (NSW) or a monthly penalty (Queensland). */
export type NoticeLateChargeRule = InterestRule | MonthlyPenaltyTerms;

/** The late charge fields of a levy notice (email and PDF). */
export interface NoticeLateCharge {
  /** NSW: the owners corporation resolved not to charge interest. Queensland: no penalty applies. */
  noInterest: boolean;
  interest: NoticeLateChargeRule;
}

/**
 * The late charge a building's notices state, from its rule
 * (`rules.LATE_CHARGE`) and setting: NSW the interest rule and whether a
 * resolution removed it, as the notices always had; Queensland the resolved
 * monthly penalty, or none.
 */
export function noticeLateCharge(rule: StatutoryRules["LATE_CHARGE"], setting: LateChargeSetting): NoticeLateCharge {
  if (rule.method === "DAILY_SIMPLE_ANNUAL" && rule.annualRatePercent != null) {
    return {
      noInterest: setting.mode === "NO_INTEREST",
      interest: { annualRatePercent: rule.annualRatePercent, graceMonths: rule.graceMonths, source: rule.source },
    };
  }
  const applies = lateChargeApplies(rule, setting);
  return { noInterest: !applies, interest: { monthlyRatePercent: applies ? (setting.monthlyRatePercent ?? null) : null, source: rule.source } };
}

/**
 * The notice's sentence on late payment, in the building's words, or null
 * where none is stated (a Queensland building with no penalty). NSW: the
 * statutory interest, or the resolution not to charge it, as the notice has
 * always said. Queensland: the monthly penalty the body corporate resolved,
 * for each whole month in arrears (the notice must state any monthly penalty).
 */
export function lateChargeSentence(p: NoticeLateCharge, t: Pick<Terms, "ownersCorporation" | "levy" | "levies" | "lateCharge">): string | null {
  const rule = p.interest;
  if ("monthlyRatePercent" in rule) {
    if (p.noInterest || rule.monthlyRatePercent == null || rule.monthlyRatePercent <= 0) return null;
    return `${capitalise(t.lateCharge)}: if this ${t.levy} is not paid by the due date, a ${t.lateCharge} of ${percentText(rule.monthlyRatePercent)}% a month is charged on the amount unpaid for each whole month it is in arrears after the date for payment (${rule.source}).`;
  }
  return p.noInterest
    ? `The ${t.ownersCorporation} has resolved not to charge ${t.lateCharge} on overdue ${t.levies}.`
    : `${capitalise(t.lateCharge)}: if this ${t.levy} is not paid within ${graceText(rule)} after the due date, simple ${t.lateCharge} of ${rule.annualRatePercent}% a year is charged from the due date until it is paid (${rule.source}).`;
}

/** One late charge setting the interest page offers. */
export interface LateChargeOption {
  mode: string;
  label: string;
  /** The setting needs the general meeting resolution that decided it. */
  needsResolution: boolean;
  /** The setting needs the monthly rate the resolution set. */
  needsRate: boolean;
}

/** The late charge wording the interest page and its form need (plain data, so it can go to the browser). */
export interface LateChargeWords {
  /** "interest", "penalty" */
  term: string;
  /** "Interest", "Penalty" */
  Term: string;
  levy: string;
  levies: string;
  ownersCorporation: string;
  /** The page heading: "Interest on Overdue Levies". */
  title: string;
  /** The page description, for the building's setting. */
  description: string;
  /** The form's heading: "Interest on overdue levies". */
  legend: string;
  options: LateChargeOption[];
  /** The highest monthly rate a resolution may set, or null where none can be set. */
  maxMonthlyRatePercent: number | null;
  rateLabel: string;
  rateHelp: string;
  /** Why nothing is charged on a notice, by reason. */
  reasons: Record<string, string>;
  /** Shown when the setting charges nothing. */
  noCharge: { title: string; description: string };
}

/**
 * The interest page's words, from the building's rules and setting. NSW
 * (DAILY_SIMPLE_ANNUAL) gives the words the page has always used, from its
 * interest rule and citations. Queensland gives the penalty in plain words.
 * `charging` is whether the setting charges anything (worked out from the
 * setting unless the page already has it).
 */
export function lateChargeWords(rules: StatutoryRules, setting: LateChargeSetting, charging: boolean = lateChargeApplies(rules.LATE_CHARGE, setting)): LateChargeWords {
  const rule = rules.LATE_CHARGE;
  const t = rules.TERMINOLOGY;
  const Term = capitalise(t.lateCharge);
  const common = {
    term: t.lateCharge,
    Term,
    levy: t.levy,
    levies: t.levies,
    ownersCorporation: t.ownersCorporation,
    title: `${Term} on Overdue ${capitalise(t.levies)}`,
    legend: `${Term} on overdue ${t.levies}`,
    maxMonthlyRatePercent: rule.maxMonthlyRatePercent,
  };
  if (rule.method === "DAILY_SIMPLE_ANNUAL") {
    const w = interestWords(rules);
    const option = (mode: (typeof rule.modes)[number]): LateChargeOption => ({
      mode,
      label:
        mode === "STATUTORY"
          ? `Statutory ${t.lateCharge}: simple ${t.lateCharge} at ${w.ratePercent}% a year on ${t.levies} unpaid ${w.grace} after the due date. This is the default under the ${w.fullCitation}. The rate cannot be changed.`
          : `No ${t.lateCharge}, because a general meeting resolved that contributions bear no ${t.lateCharge} (${w.noInterestSection}).`,
      needsResolution: rule.resolutionRequiredFor.includes(mode),
      needsRate: false,
    });
    return {
      ...common,
      description: charging
        ? `Statutory ${t.lateCharge}: ${w.ratePercent}% a year simple ${t.lateCharge} on ${t.levies} unpaid ${w.grace} after the due date (${w.citation}).`
        : `No ${t.lateCharge}: the ${t.ownersCorporation} resolved that contributions bear no ${t.lateCharge} (${w.noInterestCitation}).`,
      options: rule.modes.map(option),
      rateLabel: "",
      rateHelp: "",
      reasons: {
        IN_GRACE: `In the ${w.grace} grace period`,
        PAID_IN_GRACE: "Paid within the grace period",
        NOT_YET_DUE: "Not yet due",
        NOTHING_OWING: "Nothing owing",
        NO_INTEREST_RESOLUTION: `No ${t.lateCharge} by resolution`,
      },
      noCharge: {
        title: `No ${t.lateCharge} is charged`,
        description: `The ${t.ownersCorporation} has resolved that contributions bear no ${t.lateCharge} (${w.noInterestCitation}). Change the setting above if that resolution is revoked.`,
      },
    };
  }
  const max = rule.maxMonthlyRatePercent;
  const rate = setting.monthlyRatePercent ?? 0;
  return {
    ...common,
    description: charging
      ? `${Term}: ${percentText(rate)}% a month on ${t.levies} unpaid after the date for payment, for each whole month in arrears, at the rate the ${t.ownersCorporation} resolved.`
      : `No ${t.lateCharge}: the ${t.ownersCorporation} has not resolved to charge one.`,
    options: rule.modes.map((mode) => ({
      mode,
      label: mode === "RESOLVED_RATE" ? `${Term} at the rate the ${t.ownersCorporation} resolved` : `No ${t.lateCharge}`,
      needsResolution: rule.resolutionRequiredFor.includes(mode),
      needsRate: mode === "RESOLVED_RATE",
    })),
    rateLabel: `Monthly ${t.lateCharge} rate (%)`,
    rateHelp: `${max != null ? `At most ${percentText(max)}% a month. ` : ""}Charged on the amount unpaid for each whole month a ${t.levy} is in arrears after the date for payment.`,
    reasons: {
      NOT_YET_DUE: "Not yet due",
      NOTHING_OWING: "Nothing owing",
      NO_INTEREST_RESOLUTION: `No ${t.lateCharge} resolved`,
      NOT_A_MONTH_IN_ARREARS: "Less than a whole month in arrears",
    },
    noCharge: {
      title: `No ${t.lateCharge} is charged`,
      description: `No ${t.lateCharge} applies until the ${t.ownersCorporation} resolves to charge one. Record the resolution and its rate above.`,
    },
  };
}

/** The plan as notices and PDFs name it: "Strata Plan 12345", or null when there is no plan number. */
export function planLine(terms: Pick<Terms, "planLabel">, planNumber: string | null | undefined): string | null {
  return planNumber ? `${terms.planLabel} ${planNumber}` : null;
}

/** The building, for filling a name template. */
export interface NamedPlan {
  name: string;
  planNumber: string | null | undefined;
}

function fillName(template: string, scheme: NamedPlan): string {
  return template.replace(/\{(plan|name)\}/g, (_m, key: string) => (key === "plan" ? String(scheme.planNumber ?? "") : scheme.name));
}

/** "Owners Corporation" from "owners corporation". */
const titleCase = (text: string) => text.replace(/(^|\s)(\S)/g, (_m, space: string, letter: string) => space + letter.toUpperCase());

/**
 * The legal entity's name, from the pack's template: "The Owners - Strata Plan
 * No. 12345", "Body corporate for Harbour View community titles scheme 12345".
 * With no plan number the name cannot be formed, so the entity is named
 * generically: "The " and the pack's term in title case ("The Owners
 * Corporation", as the NSW invoice has always shown; "The Body Corporate").
 */
export function bodyCorporateName(terms: Pick<Terms, "bodyCorporateName" | "ownersCorporation">, scheme: NamedPlan): string {
  if (!scheme.planNumber) return `The ${titleCase(terms.ownersCorporation)}`;
  return fillName(terms.bodyCorporateName, scheme);
}

/**
 * The legal entity's name as meeting notices and minutes head it ("The Owners
 * - Strata Plan 12345" for NSW). A building always has a plan number, so the
 * template is always filled, as the headings always were.
 */
export function bodyCorporateShortName(terms: Pick<Terms, "bodyCorporateShortName">, scheme: NamedPlan, opts: { upperCase?: boolean } = {}): string {
  if (!opts.upperCase) return fillName(terms.bodyCorporateShortName, scheme);
  // Headings are in capitals, but the plan number stays as it was entered, as the headings always had it.
  return fillName(terms.bodyCorporateShortName.toUpperCase().replace(/\{(PLAN|NAME)\}/g, (m) => m.toLowerCase()), { ...scheme, name: scheme.name.toUpperCase() });
}
