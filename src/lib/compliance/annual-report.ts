/**
 * Strata Hub annual report status (pure). The rules come from the
 * building's rule pack (`rules.ANNUAL_REPORTING`): the report is due within
 * the set months of each AGM, except for exempt (two-lot) schemes from the
 * exemption date.
 */
import { addMonths } from "@/lib/levies/notice-plan";

export interface ReportingRules {
  withinMonthsOfAgm: number;
  exemptLotCount: number;
  exemptFrom: string;
}

export type ReportStatus = "EXEMPT" | "NO_AGM" | "DUE" | "OVERDUE" | "REPORTED";

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function reportDueOn(agmOn: string, rules: Pick<ReportingRules, "withinMonthsOfAgm">): string {
  return addMonths(agmOn, rules.withinMonthsOfAgm);
}

/** The status of the report for the scheme's latest AGM. */
export function annualReportStatus(
  input: { lastAgmOn: string | null; reportedOn: string | null; schemeLots: number; today: string },
  rules: ReportingRules,
): { status: ReportStatus; dueOn: string | null; daysLeft: number | null } {
  if (input.schemeLots === rules.exemptLotCount && input.today >= rules.exemptFrom) return { status: "EXEMPT", dueOn: null, daysLeft: null };
  if (!input.lastAgmOn) return { status: "NO_AGM", dueOn: null, daysLeft: null };
  const dueOn = reportDueOn(input.lastAgmOn, rules);
  if (input.reportedOn) return { status: "REPORTED", dueOn, daysLeft: null };
  const daysLeft = daysBetween(input.today, dueOn);
  return { status: daysLeft < 0 ? "OVERDUE" : "DUE", dueOn, daysLeft };
}

export interface RetentionRules {
  byCategory: Readonly<Record<string, number | null>>;
  generalYears: number;
}

/**
 * The last day a record must be kept: the set number of years after its
 * date, or "LIFE" for the life of the scheme. A category not listed is kept
 * for the general period.
 */
export function keepUntil(category: string, recordDate: string, rules: RetentionRules): string | "LIFE" {
  const years = category in rules.byCategory ? rules.byCategory[category] : rules.generalYears;
  if (years == null) return "LIFE";
  return addMonths(recordDate.slice(0, 10), years * 12);
}
