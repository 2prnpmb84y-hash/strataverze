/**
 * The daily reminder for the deadline to start proceedings (QLD go-live gap,
 * stage 2, step 8, 27 Oct 2026), pure. A lot the adviser debt recovery page
 * flags (proceedings-deadline.ts) is emailed once at each stage, in order:
 * when it is first flagged, at 30, 14 and 7 days or fewer before the
 * deadline, and once after the deadline has passed. A run that was missed
 * catches up with one email for the latest stage, never one for each stage
 * skipped. Each stage is claimed in proceedings_deadline_reminders, so a
 * retried run sends it once (proceedings-reminder-run.ts).
 *
 * A deadline that passed more than PASSED_REMINDER_WITHIN_DAYS before the
 * building's day gets no reminder, so a building's first run (at go-live)
 * never sends a burst of emails about deadlines long gone. The adviser page
 * still shows them.
 *
 * The words come from the building's pack: the subject and heading
 * (DEBT_RECOVERY.proceedingsReminder), its terms, the rule's years and
 * months, and its citation. The deadline is StrataVerze's reading of the rule
 * (counted from the date for payment of the oldest unpaid contribution, in
 * the Queensland pack's FOR_REVIEW), and the email says so.
 */
import type { StatutoryRules } from "@/config/statutory";
import { proceedingsDeadlineWarning, type ProceedingsDeadlineFlag, type ProceedingsDeadlineRule } from "./proceedings-deadline";

/** The days before the deadline a reminder goes out, largest first (a StrataVerze choice, not a rule of law). */
export const PROCEEDINGS_REMINDER_DAYS_BEFORE = [30, 14, 7] as const;

/** The stages, in the order they are sent. Stored in proceedings_deadline_reminders.last_stage. */
export const PROCEEDINGS_REMINDER_STAGES = ["FLAGGED", "DAYS_30", "DAYS_14", "DAYS_7", "PASSED"] as const;
export type ProceedingsReminderStage = (typeof PROCEEDINGS_REMINDER_STAGES)[number];

/** How long after the deadline the PASSED reminder may still go (a StrataVerze choice). */
export const PASSED_REMINDER_WITHIN_DAYS = 30;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The stage a flagged lot is at on the building's day `today` (YYYY-MM-DD). */
export function proceedingsReminderStage(flag: Pick<ProceedingsDeadlineFlag, "deadline" | "passed">, today: string): ProceedingsReminderStage {
  if (flag.passed) return "PASSED";
  const daysLeft = daysBetween(today, flag.deadline);
  // Smallest first, so 5 days left is DAYS_7, not DAYS_30.
  for (const d of [...PROCEEDINGS_REMINDER_DAYS_BEFORE].reverse()) if (daysLeft <= d) return `DAYS_${d}` as ProceedingsReminderStage;
  return "FLAGGED";
}

/** Whether a flagged lot is reminded at all today: not once its deadline passed more than 30 days ago. */
export function remindable(flag: Pick<ProceedingsDeadlineFlag, "deadline" | "passed">, today: string): boolean {
  return !flag.passed || daysBetween(flag.deadline, today) <= PASSED_REMINDER_WITHIN_DAYS;
}

/** The stages sent before `stage`: a row holding one of them may be claimed for `stage`. */
export function stagesBefore(stage: ProceedingsReminderStage): ProceedingsReminderStage[] {
  return PROCEEDINGS_REMINDER_STAGES.slice(0, PROCEEDINGS_REMINDER_STAGES.indexOf(stage));
}

export interface ProceedingsReminderContent {
  subject: string;
  heading: string;
  lines: string[];
  buttonLabel: string;
}

/** The pack's subject and heading for the reminder (DEBT_RECOVERY.proceedingsReminder). */
export type ProceedingsReminderWords = NonNullable<NonNullable<StatutoryRules["DEBT_RECOVERY"]>["proceedingsReminder"]>;

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, k: string) => values[k] ?? all);

/**
 * The email for one lot, to an adviser or a committee member (never an
 * owner). `formatDate` turns YYYY-MM-DD into the email's date format.
 */
export function proceedingsReminderContent(input: {
  flag: ProceedingsDeadlineFlag;
  rule: ProceedingsDeadlineRule;
  words: ProceedingsReminderWords;
  terms: Pick<StatutoryRules["TERMINOLOGY"], "levy" | "ownersCorporation">;
  schemeName: string;
  adviser: boolean;
  formatDate: (day: string) => string;
}): ProceedingsReminderContent {
  const { flag, rule, words, terms, formatDate } = input;
  const values = { lot: flag.lotNumber, date: formatDate(flag.deadline), scheme: input.schemeName };
  return {
    subject: fill(flag.passed ? words.subjectPassed : words.subject, values),
    heading: fill(flag.passed ? words.headingPassed : words.heading, values),
    lines: [
      proceedingsDeadlineWarning(flag, rule, terms, formatDate),
      `StrataVerze counts the ${rule.overdueYears} years from the date for payment of the oldest unpaid ${terms.levy}. This date is StrataVerze's reading of ${rule.citation}, so check it before relying on it.`,
      input.adviser
        ? "Once proceedings start, complete the proceedings step on the lot's debt recovery case or record the court file number. The reminders then stop."
        : "Once proceedings start and are recorded in StrataVerze, the reminders stop.",
    ],
    buttonLabel: input.adviser ? "Open debt recovery" : "Open StrataVerze",
  };
}
