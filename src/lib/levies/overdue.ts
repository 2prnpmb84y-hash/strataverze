/**
 * Whether a levy notice is overdue on the building's day (overdue notices
 * fix, 30 Oct 2026), pure. The one definition debt recovery reads.
 *
 * Nothing in StrataVerze stores a notice as OVERDUE: an issued notice stays
 * ISSUED or PARTIALLY_PAID until it is paid, and the screens show it as
 * overdue once its due day has passed (effectiveStatus in ./levy-ledger). A
 * reader that looked only for stored OVERDUE notices found none. This gives
 * the same answer as effectiveStatus for an ISSUED or PARTIALLY_PAID notice,
 * and asks the same of a notice stored as OVERDUE (past its due day, with a
 * balance), so a stored status can never make a notice overdue early.
 *
 * A notice is overdue on `today` (YYYY-MM-DD, the building's day: schemeToday
 * or todayIn with the building's time zone) when
 *   - its status is ISSUED, PARTIALLY_PAID or OVERDUE (never DRAFT, PAID,
 *     WRITTEN_OFF or any other status);
 *   - its balance outstanding, to the cent, is more than zero; and
 *   - its due day (a date column, read as YYYY-MM-DD) is before today. A
 *     notice due today is not overdue.
 *
 * Fail closed: a notice whose answer depends on a due day or a balance that
 * cannot be read throws UnreadableNoticeError, so it is never counted, or
 * left out, without anyone knowing. Each caller decides what to do with it.
 * noticeCents reads a notice's other amounts the same way (30 Oct 2026, for
 * the debt recovery case amount, src/lib/debt-recovery/case-amount.ts).
 */
import { toIsoDay } from "./notice-plan";

/** The statuses a notice can be overdue in. */
export const OVERDUE_NOTICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

/** The fields the check reads. */
export interface OverdueCheckNotice {
  id?: unknown;
  status: unknown;
  dueDate: unknown;
  balanceOutstanding: unknown;
}

/** A notice field the checks read. */
export type NoticeField = "dueDate" | "balanceOutstanding" | "amountDue" | "amountPaid" | "interestCharged" | "payments";

const FIELD_WORDS: Record<NoticeField, string> = {
  dueDate: "due date",
  balanceOutstanding: "balance outstanding",
  amountDue: "amount due",
  amountPaid: "amount paid",
  interestCharged: "late charge",
  payments: "payments",
};

/** A notice whose due day, an amount or its payments cannot be read (or do not agree), so what it owes is not known. */
export class UnreadableNoticeError extends Error {
  constructor(
    readonly noticeId: string | null,
    readonly field: NoticeField,
    value: unknown,
    reason = "cannot be read",
  ) {
    const unknown = field === "dueDate" || field === "balanceOutstanding" ? "whether it is overdue" : "what it owes";
    super(`Notice ${noticeId ?? "(no id)"}: its ${FIELD_WORDS[field]} (${String(value)}) ${reason}, so ${unknown} is not known.`);
    this.name = "UnreadableNoticeError";
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An amount in whole cents (rounded as the ledger rounds it), or null when it cannot be read. */
function centsOrNull(value: unknown): number | null {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * One of a notice's amounts in whole cents. Throws UnreadableNoticeError when
 * it cannot be read (missing, empty, not a number), so it is never taken as 0.
 */
export function noticeCents(notice: { id?: unknown } & Partial<Record<NoticeField, unknown>>, field: Exclude<NoticeField, "dueDate" | "payments">): number {
  const cents = centsOrNull(notice[field]);
  if (cents == null) throw new UnreadableNoticeError(notice.id == null ? null : String(notice.id), field, notice[field]);
  return cents;
}

/** Whether `notice` is overdue on the building's day `today` (YYYY-MM-DD). Throws UnreadableNoticeError (see above). */
export function isOverdueOn(notice: OverdueCheckNotice, today: string): boolean {
  if (!DAY.test(today)) throw new RangeError(`Not a day (YYYY-MM-DD): ${String(today)}`);
  if (!(OVERDUE_NOTICE_STATUSES as readonly string[]).includes(String(notice.status))) return false;
  const due = toIsoDay(notice.dueDate);
  if (!DAY.test(due)) throw new UnreadableNoticeError(notice.id == null ? null : String(notice.id), "dueDate", notice.dueDate);
  if (due >= today) return false;
  return noticeCents(notice, "balanceOutstanding") > 0;
}

/** The notices overdue on `today`, in the order given. Throws UnreadableNoticeError (see above). */
export function overdueOn<T extends OverdueCheckNotice>(notices: readonly T[], today: string): T[] {
  return notices.filter((n) => isOverdueOn(n, today));
}
