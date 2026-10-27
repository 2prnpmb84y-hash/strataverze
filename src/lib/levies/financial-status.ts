/**
 * Whether a lot is financial (pure). Decided 25 Oct 2026: a lot is
 * unfinancial when any issued levy, interest or arrears carried over at
 * takeover is past its due date and not fully paid. Amounts issued but not
 * yet due, drafts and written-off amounts do not count.
 *
 * This is StrataVerze's display rule for the roll. Whether an owner may
 * vote at a meeting is a separate question under the Act (it turns on
 * contributions due and unpaid at the time of the meeting).
 */

export interface FinancialNotice {
  status: unknown;
  dueDate: unknown;
  balanceOutstanding: unknown;
}

export interface FinancialStatus {
  financial: boolean;
  /** The overdue amount, in cents. */
  overdueCents: number;
  /** The earliest due date among the overdue notices (yyyy-mm-dd), or null. */
  oldestOverdue: string | null;
}

/** The notice statuses that can make a lot unfinancial (an issued amount not yet paid in full). */
export const UNFINANCIAL_NOTICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;
const COUNTED = new Set<string>(UNFINANCIAL_NOTICE_STATUSES);
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);

export function lotFinancialStatus(notices: readonly FinancialNotice[], today: string): FinancialStatus {
  let overdueCents = 0;
  let oldestOverdue: string | null = null;
  for (const n of notices) {
    if (!COUNTED.has(String(n.status))) continue;
    const balance = cents(n.balanceOutstanding);
    const due = isoDay(n.dueDate);
    if (balance <= 0 || !due || due >= today) continue;
    overdueCents += balance;
    if (!oldestOverdue || due < oldestOverdue) oldestOverdue = due;
  }
  return { financial: overdueCents === 0, overdueCents, oldestOverdue };
}
