/**
 * When each levy notice goes out (pure, 24 Oct 2026).
 *
 * Levies are paid in advance: an ordinary instalment falls due on the first
 * day of its period. Each notice goes out 35 days before it falls due
 * (StrataVerze practice; the Act requires at least 30). A notice whose
 * 35-day mark has passed goes out now, if the Adviser confirms; one with less
 * than 30 days left has its due date moved to 30 days after today, the
 * statutory minimum.
 *
 * Every number comes from the building's notice rules through
 * `noticeTimingFor` (src/lib/levies/notice-rule-check.ts): NSW and Queensland
 * exactly as before; a pack with checked notice rules (VIC, ACT and WA stage
 * 2, PR 6a) from those, never beyond its maximum notice, and a due date the
 * rules do not let move is never moved (`cannotMove`).
 */
import type { NoticeRules } from "@/lib/finance/levy-notice-content";
import { noticeLeadText } from "@/lib/jurisdiction/wording";
import { addDays } from "./notice-plan";
import { auDate } from "@/lib/onboarding/property-onboarding";
import { noticeTimingFor, type NoticeTimingRule } from "./notice-rule-check";

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The day a notice due on `dueDate` goes out. */
export function issueDateFor(dueDate: string, rule: NoticeTimingRule): string {
  return addDays(dueDate, -noticeTimingFor(rule).leadDays);
}

export type IssueTiming =
  /** Goes out on `issueOn`, 35 days before it falls due. */
  | { kind: "planned"; issueOn: string; dueDate: string }
  /** Its 35-day mark has passed but 30 days or more are left: goes out today. */
  | { kind: "late"; issueOn: string; dueDate: string; daysNotice: number }
  /** Fewer than 30 days left: goes out today, due 30 days from today instead of `originalDueDate`. */
  | { kind: "moved"; issueOn: string; dueDate: string; originalDueDate: string }
  /**
   * Fewer than the minimum left, and the building's rules do not let its due
   * date move (WA: the levy decision fixes it): it cannot go out. `issueOn`
   * is today, the day it would have gone out.
   */
  | { kind: "cannotMove"; issueOn: string; dueDate: string; daysLeft: number };

export function issueTiming(dueDate: string, today: string, rule: NoticeTimingRule): IssueTiming {
  const timing = noticeTimingFor(rule);
  const issueOn = issueDateFor(dueDate, rule);
  if (issueOn >= today) return { kind: "planned", issueOn, dueDate };
  const left = daysBetween(today, dueDate);
  if (left >= timing.minimumDays) return { kind: "late", issueOn: today, dueDate, daysNotice: left };
  if (!timing.dueDateMayMove) return { kind: "cannotMove", issueOn: today, dueDate, daysLeft: left };
  return { kind: "moved", issueOn: today, dueDate: addDays(today, timing.minimumDays), originalDueDate: dueDate };
}

/** A plain-English line for a notice that cannot be given its full lead time (5 weeks in NSW). */
export function lateMessage(t: IssueTiming, label: string, rule: NoticeTimingRule): string | null {
  const timing = noticeTimingFor(rule);
  // "the statutory 30 days" where the minimum is the law's (NSW, Queensland), else StrataVerze's own minimum.
  const minimum = timing.minimumIsStatutory ? `the statutory ${timing.minimumDays} days` : `StrataVerze's minimum of ${timing.minimumDays} days`;
  if (t.kind === "late") return `${label}: due ${auDate(t.dueDate)}, so it goes out today with ${t.daysNotice} days' notice instead of ${noticeLeadText(rule)}.`;
  if (t.kind === "moved") return `${label}: due ${auDate(t.originalDueDate)}, fewer than ${timing.minimumDays} days away, so it goes out today and falls due on ${auDate(t.dueDate)} (${minimum}).`;
  if (t.kind === "cannotMove") return `${label}: due ${auDate(t.dueDate)}, fewer than ${timing.minimumDays} days away. Its due date cannot be moved under this building's rules, so it cannot go out.`;
  return null;
}

/**
 * Why an urgent special levy cannot be given the shorter notice, or null when
 * the building's pack has one (`NOTICE_RULES.urgentNoticeDays`).
 */
export function urgentNoticeProblem(rule: Pick<NoticeRules, "urgentNoticeDays">, terms: { levy: string }): string | null {
  if (rule.urgentNoticeDays != null) return null;
  return `A shorter notice for an urgent special ${terms.levy} is not available for this building. Issue the notice without the urgent option.`;
}
