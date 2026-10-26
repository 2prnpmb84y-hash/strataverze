/**
 * One definition of levy arrears (financials review B11, 26 Oct 2026).
 *
 * The Overview, Fund Summary and committee pack used three different
 * formulas and showed three figures for the same day. They now all use this:
 *
 *   Arrears = what is still owing (levy and interest) on issued notices whose
 *   due date has passed.
 *
 * - A notice not yet due is not in arrears.
 * - Drafts, paid and written-off notices are left out.
 * - Interest charged and not yet paid is included, because the owner owes it.
 *
 * The figure uses each notice's current balance. A notice brought across at
 * takeover records the interest the old system received as its amount paid,
 * so its interest and levy cannot be told apart once more is paid on it; that
 * is why no separate interest figure is worked out here.
 */

/** Notice statuses that are never arrears. */
export const NOT_ARREARS_STATUSES: readonly string[] = ["DRAFT", "WRITTEN_OFF", "CANCELLED", "PAID"];

export interface ArrearsNotice {
  status: string;
  /** YYYY-MM-DD. */
  dueDate: string;
  /** Levy and interest still owing on the notice, in cents. */
  balanceCents: number;
}

/** Whether a notice is in arrears on `asAt` (YYYY-MM-DD): issued, past its due date and not paid. */
export function isInArrears(n: ArrearsNotice, asAt: string): boolean {
  return !NOT_ARREARS_STATUSES.includes(n.status) && n.dueDate < asAt && n.balanceCents > 0;
}

/** Total arrears on `asAt`, in cents, and how many notices are in arrears. */
export function arrearsCents(notices: ArrearsNotice[], asAt: string): { totalCents: number; count: number } {
  let totalCents = 0;
  let count = 0;
  for (const n of notices) {
    if (!isInArrears(n, asAt)) continue;
    totalCents += n.balanceCents;
    count++;
  }
  return { totalCents, count };
}

/** A levy notice row in the shape `arrearsCents` takes. */
export function toArrearsNotice(n: { status: unknown; dueDate: unknown; balanceOutstanding: unknown }): ArrearsNotice {
  return {
    status: String(n.status),
    dueDate: String(n.dueDate).slice(0, 10),
    balanceCents: Math.round(Number(n.balanceOutstanding ?? 0) * 100),
  };
}
