/**
 * When each levy notice goes out (pure, 24 Oct 2026).
 *
 * Levies are paid in advance: an ordinary instalment falls due on the first
 * day of its period. Each notice goes out 35 days before it falls due
 * (StrataVerze practice; the Act requires at least 30). A notice whose
 * 35-day mark has passed goes out now, if the Adviser confirms; one with less
 * than 30 days left has its due date moved to 30 days after today, the
 * statutory minimum.
 */
import type { LevyNoticeRule } from "@/lib/finance/levy-notice-content";
import { addDays } from "./notice-plan";
import { auDate } from "@/lib/onboarding/property-onboarding";

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The day a notice due on `dueDate` goes out. */
export function issueDateFor(dueDate: string, rule: LevyNoticeRule): string {
  return addDays(dueDate, -rule.issueDaysBeforeDue);
}

export type IssueTiming =
  /** Goes out on `issueOn`, 35 days before it falls due. */
  | { kind: "planned"; issueOn: string; dueDate: string }
  /** Its 35-day mark has passed but 30 days or more are left: goes out today. */
  | { kind: "late"; issueOn: string; dueDate: string; daysNotice: number }
  /** Fewer than 30 days left: goes out today, due 30 days from today instead of `originalDueDate`. */
  | { kind: "moved"; issueOn: string; dueDate: string; originalDueDate: string };

export function issueTiming(dueDate: string, today: string, rule: LevyNoticeRule): IssueTiming {
  const issueOn = issueDateFor(dueDate, rule);
  if (issueOn >= today) return { kind: "planned", issueOn, dueDate };
  const left = daysBetween(today, dueDate);
  if (left >= rule.minimumNoticeDays) return { kind: "late", issueOn: today, dueDate, daysNotice: left };
  return { kind: "moved", issueOn: today, dueDate: addDays(today, rule.minimumNoticeDays), originalDueDate: dueDate };
}

/** A plain-English line for a notice that cannot be given 5 weeks. */
export function lateMessage(t: IssueTiming, label: string, rule: LevyNoticeRule): string | null {
  if (t.kind === "late") return `${label}: due ${auDate(t.dueDate)}, so it goes out today with ${t.daysNotice} days' notice instead of 5 weeks.`;
  if (t.kind === "moved") return `${label}: due ${auDate(t.originalDueDate)}, fewer than ${rule.minimumNoticeDays} days away, so it goes out today and falls due on ${auDate(t.dueDate)} (the statutory ${rule.minimumNoticeDays} days).`;
  return null;
}
