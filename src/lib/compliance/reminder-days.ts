/**
 * When a statutory deadline reminder is sent (pure). A reminder goes out on
 * a few set days before and after the deadline, not every day, so a daily
 * run sends each one once.
 */
export const REMINDER_DAYS_BEFORE = [14, 7, 1] as const;
export const OVERDUE_REMINDER_DAYS = [1, 7, 14, 28] as const;

/** Whether to send a reminder today for a deadline `daysLeft` away (negative when passed). */
export function reminderDue(daysLeft: number): "UPCOMING" | "OVERDUE" | null {
  if ((REMINDER_DAYS_BEFORE as readonly number[]).includes(daysLeft)) return "UPCOMING";
  if ((OVERDUE_REMINDER_DAYS as readonly number[]).includes(-daysLeft)) return "OVERDUE";
  return null;
}
