/**
 * Wording worked out from a building's rules (multi-jurisdiction plan, phase
 * 1d). Pure, so it can be used in the browser too. Text that states a rule
 * ("5 weeks", "one month") is built from the rule's value, so it cannot drift
 * from what the platform does.
 */
import type { StatutoryRules } from "@/config/statutory";
import { needRule } from "@/config/statutory/need-rule";
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
  /** The minimum notice for an urgent special levy, in days (14). */
  urgentDays: number;
}

export function noticeTimingWords(rule: { issueDaysBeforeDue: number; minimumNoticeDays: number; urgentSpecialLevyNoticeDays: number }): NoticeTimingWords {
  return { lead: noticeLeadText(rule), mark: noticeLeadMark(rule), minimumDays: rule.minimumNoticeDays, urgentDays: rule.urgentSpecialLevyNoticeDays };
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
