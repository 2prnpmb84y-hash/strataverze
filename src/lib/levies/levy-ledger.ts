/**
 * Levy ledger views (pure, no I/O): notice labels and status, owner
 * statements and aged arrears, all built from levy notices and the payments
 * recorded against them.
 */
import { toIsoDay } from "./notice-plan";

export interface LedgerNotice {
  id: string;
  lotId: string;
  noticeNumber: string;
  dueDate: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  amountDue: unknown;
  amountPaid: unknown;
  balanceOutstanding: unknown;
  interestCharged?: unknown;
  status: string;
  paidInFullAt?: unknown;
  updatedAt?: unknown;
  fund?: { name: unknown } | null;
  levySchedule?: { levyType?: unknown; title?: unknown; financialYear?: unknown } | null;
}

export interface LedgerPayment {
  id: string;
  levyNoticeId: string;
  amount: unknown;
  paymentDate: unknown;
  reference?: unknown;
  /** Set when the payment was reversed (wrong lot, dishonoured, entered in error). */
  reversedAt?: unknown;
  reversalDate?: unknown;
  reversalReason?: string | null;
  reversalNote?: string | null;
}

const REVERSAL_TEXT: Record<string, string> = {
  WRONG_LOT: "allocated to the wrong lot",
  DISHONOURED: "dishonoured",
  ENTERED_IN_ERROR: "entered in error",
};

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** What the notice is for, e.g. "Special levy: Roof" or "Administrative Fund levy, Jul–Sep 2026". */
export function noticeLabel(n: LedgerNotice): string {
  const schedule = n.levySchedule;
  if (schedule && String(schedule.levyType ?? "") === "SPECIAL") {
    return `Special levy: ${String(schedule.title ?? "Untitled")}`;
  }
  const fund = n.fund?.name ? String(n.fund.name) : "Levy";
  const start = toIsoDay(n.periodStart);
  const end = toIsoDay(n.periodEnd);
  if (start && end) {
    const [sm, em] = [monthYear(start), monthYear(end)];
    const range = sm.slice(-4) === em.slice(-4) ? `${sm.slice(0, 3)}–${em}` : `${sm}–${em}`;
    return `${fund} levy, ${range}`;
  }
  return `${fund} levy`;
}

export type DisplayStatus = "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "WRITTEN_OFF" | "DRAFT";

/** The notice's status, showing OVERDUE once an unpaid notice is past its due date. */
export function effectiveStatus(n: LedgerNotice, today: string): DisplayStatus {
  const status = String(n.status) as DisplayStatus;
  if ((status === "ISSUED" || status === "PARTIALLY_PAID") && num(n.balanceOutstanding) > 0) {
    if (toIsoDay(n.dueDate) < today) return "OVERDUE";
  }
  return status;
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  WRITTEN_OFF: "Written off",
};

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  WRITTEN_OFF: "bg-zinc-100 text-zinc-600",
};

export interface StatementLine {
  id: string;
  date: string;
  type: "Levy" | "Interest" | "Payment" | "Refund" | "Reversal";
  description: string;
  charge: number;
  payment: number;
  balance: number;
}

export interface Statement {
  openingBalance: number;
  lines: StatementLine[];
  totalCharges: number;
  totalPayments: number;
  closingBalance: number;
}

/**
 * Build a statement for one lot: a charge for each notice (on its due date),
 * any interest charged, and each payment on the date it was received. Entries
 * before `startDate` roll into the opening balance; entries after `endDate`
 * are left out.
 *
 * Notices paid before payment receipts were kept have no receipt rows. Any
 * amount paid that the receipts do not account for is shown as one payment on
 * the date the notice was paid in full (or last updated).
 */
export interface LedgerCreditMovement {
  id: string;
  type: string; // OVERPAYMENT, APPLIED, REFUNDED, ADJUSTED, REVERSED
  amount: unknown;
  /** The date the movement took effect (payment date, application date, refund date). */
  effectiveDate: unknown;
  levyPaymentId?: string | null;
}

/**
 * Owner credit on a statement: the part of a payment held as credit is a
 * payment (taking the balance below zero), credit later applied to a notice is
 * not money received again so it is not shown twice, and a refund of credit
 * is a charge. A negative closing balance is the owner's credit.
 */
export function buildStatement(
  notices: LedgerNotice[],
  payments: LedgerPayment[],
  range: { startDate?: string; endDate?: string } = {},
  credits: LedgerCreditMovement[] = [],
): Statement {
  const entries: Omit<StatementLine, "balance">[] = [];
  const appliedReceipts = new Set(credits.filter((c) => c.type === "APPLIED" && c.levyPaymentId).map((c) => c.levyPaymentId!));
  for (const n of notices) {
    if (String(n.status) === "DRAFT") continue;
    const due = toIsoDay(n.dueDate);
    const label = noticeLabel(n);
    const amountDue = num(n.amountDue);
    if (amountDue > 0) {
      entries.push({ id: `${n.id}-charge`, date: due, type: "Levy", description: `${label} (${n.noticeNumber})`, charge: amountDue, payment: 0 });
    }
    const interest = num(n.interestCharged);
    if (interest > 0) {
      entries.push({ id: `${n.id}-interest`, date: due, type: "Interest", description: `Interest on ${n.noticeNumber}`, charge: interest, payment: 0 });
    }
    const own = payments.filter((p) => p.levyNoticeId === n.id);
    for (const p of own) {
      // Credit applied to this notice was already shown when it was received.
      if (appliedReceipts.has(p.id)) continue;
      const ref = p.reference ? ` (${String(p.reference)})` : "";
      entries.push({ id: `pay-${p.id}`, date: toIsoDay(p.paymentDate), type: "Payment", description: `Payment for ${n.noticeNumber}${ref}`, charge: 0, payment: num(p.amount) });
      // A reversed payment stays on the statement, followed by its reversal with the reason (TC-008).
      if (p.reversedAt || p.reversalDate) {
        const why = REVERSAL_TEXT[String(p.reversalReason ?? "")] ?? "reversed";
        const extra = p.reversalNote ? `: ${String(p.reversalNote)}` : "";
        const date = toIsoDay(p.reversalDate) || toIsoDay(p.reversedAt) || toIsoDay(p.paymentDate);
        entries.push({ id: `rev-${p.id}`, date, type: "Reversal", description: `Payment for ${n.noticeNumber} reversed, ${why}${extra}`, charge: num(p.amount), payment: 0 });
      }
    }
    const live = own.filter((p) => !(p.reversedAt || p.reversalDate));
    const unreceipted = Math.round((num(n.amountPaid) - live.reduce((s, p) => s + num(p.amount), 0)) * 100) / 100;
    if (unreceipted > 0) {
      const date = toIsoDay(n.paidInFullAt) || toIsoDay(n.updatedAt) || due;
      entries.push({ id: `${n.id}-paid`, date, type: "Payment", description: `Payment for ${n.noticeNumber}`, charge: 0, payment: unreceipted });
    }
  }

  for (const c of credits) {
    const date = toIsoDay(c.effectiveDate);
    const amount = num(c.amount);
    if (c.type === "OVERPAYMENT") {
      entries.push({ id: `credit-${c.id}`, date, type: "Payment", description: "Payment held as credit", charge: 0, payment: amount });
    } else if (c.type === "ADJUSTED") {
      entries.push({ id: `credit-${c.id}`, date, type: "Payment", description: "Credit adjustment", charge: 0, payment: amount });
    } else if (c.type === "REFUNDED") {
      entries.push({ id: `credit-${c.id}`, date, type: "Refund", description: "Credit refunded", charge: amount, payment: 0 });
    } else if (c.type === "REVERSED") {
      entries.push({ id: `credit-${c.id}`, date, type: "Reversal", description: "Credit taken back with its reversed receipt", charge: amount, payment: 0 });
    }
  }
  const order = { Levy: 0, Interest: 1, Payment: 2, Refund: 3, Reversal: 4 } as const;
  entries.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);

  let opening = 0;
  const lines: StatementLine[] = [];
  let running = 0;
  for (const e of entries) {
    if (range.startDate && e.date < range.startDate) {
      opening = Math.round((opening + e.charge - e.payment) * 100) / 100;
      continue;
    }
    if (range.endDate && e.date > range.endDate) continue;
    if (lines.length === 0) running = opening;
    running = Math.round((running + e.charge - e.payment) * 100) / 100;
    lines.push({ ...e, balance: running });
  }
  const totalCharges = Math.round(lines.reduce((s, l) => s + l.charge, 0) * 100) / 100;
  const totalPayments = Math.round(lines.reduce((s, l) => s + l.payment, 0) * 100) / 100;
  return {
    openingBalance: opening,
    lines,
    totalCharges,
    totalPayments,
    closingBalance: Math.round((opening + totalCharges - totalPayments) * 100) / 100,
  };
}

export interface ArrearsRow {
  lotId: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
  total: number;
}

/** Outstanding balances by lot, bucketed by days past the due date. */
export function agedArrears(notices: LedgerNotice[], today: string): ArrearsRow[] {
  const rows = new Map<string, ArrearsRow>();
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  for (const n of notices) {
    const status = String(n.status);
    if (status === "DRAFT" || status === "WRITTEN_OFF") continue;
    const balance = num(n.balanceOutstanding);
    if (balance <= 0) continue;
    const days = Math.floor((todayMs - Date.parse(`${toIsoDay(n.dueDate)}T00:00:00Z`)) / 86_400_000);
    const row = rows.get(n.lotId) ?? { lotId: n.lotId, current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0, total: 0 };
    const bucket = days <= 0 ? "current" : days <= 30 ? "days30" : days <= 60 ? "days60" : days <= 90 ? "days90" : "days90Plus";
    row[bucket] = Math.round((row[bucket] + balance) * 100) / 100;
    row.total = Math.round((row.total + balance) * 100) / 100;
    rows.set(n.lotId, row);
  }
  return [...rows.values()];
}

/** Owner-facing totals for a set of notices. */
export function noticeTotals(notices: LedgerNotice[]) {
  const live = notices.filter((n) => String(n.status) !== "DRAFT");
  const r = (x: number) => Math.round(x * 100) / 100;
  const levied = r(live.reduce((s, n) => s + num(n.amountDue) + num(n.interestCharged), 0));
  const paid = r(live.reduce((s, n) => s + num(n.amountPaid), 0));
  const outstanding = r(live.reduce((s, n) => s + num(n.balanceOutstanding), 0));
  return { levied, paid, outstanding };
}

export interface RegisterNotice extends LedgerNotice {
  levyScheduleId: string;
  lot?: { lotNumber: unknown; unitNumber?: unknown } | null;
  levySchedule?: {
    id?: unknown;
    levyType?: unknown;
    title?: unknown;
    financialYear?: unknown;
    frequency?: unknown;
    budgetAmount?: unknown;
    status?: unknown;
  } | null;
}

export interface RegisterGroup {
  id: string;
  title: string;
  levyType: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  items: {
    id: string;
    lot: { lotNumber: string; unitNumber: string | null } | null;
    label: string;
    amount: number;
    paidAmount: number;
    balance: number;
    status: string;
  }[];
}

/** Group issued notices by levy (schedule) for the levy register. */
export function levyRegister(notices: RegisterNotice[], today: string): RegisterGroup[] {
  const groups = new Map<string, RegisterGroup>();
  for (const n of notices) {
    if (String(n.status) === "DRAFT") continue;
    const s = n.levySchedule;
    const isSpecial = String(s?.levyType ?? "") === "SPECIAL";
    const g =
      groups.get(n.levyScheduleId) ??
      {
        id: n.levyScheduleId,
        title: isSpecial
          ? `Special levy: ${String(s?.title ?? "Untitled")}`
          : `FY ${String(s?.financialYear ?? "")} budget levy${n.fund?.name ? `, ${String(n.fund.name)}` : ""}`,
        levyType: isSpecial ? "Special" : "Budget",
        dueDate: toIsoDay(n.dueDate),
        status: String(s?.status ?? ""),
        totalAmount: 0,
        items: [],
      };
    const amount = num(n.amountDue) + num(n.interestCharged);
    g.totalAmount = Math.round((g.totalAmount + amount) * 100) / 100;
    if (toIsoDay(n.dueDate) < g.dueDate) g.dueDate = toIsoDay(n.dueDate);
    g.items.push({
      id: n.id,
      lot: n.lot ? { lotNumber: String(n.lot.lotNumber), unitNumber: n.lot.unitNumber ? String(n.lot.unitNumber) : null } : null,
      label: `${n.noticeNumber} · due ${toIsoDay(n.dueDate)}`,
      amount,
      paidAmount: num(n.amountPaid),
      balance: num(n.balanceOutstanding),
      status: effectiveStatus(n, today),
    });
    groups.set(n.levyScheduleId, g);
  }
  return [...groups.values()].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

// ─── An owner's levy list ───────────────────────────────────────────────────

/** One levy notice as the owner's levies page shows it. */
export interface LevyItem {
  id: string;
  lotId: string;
  lotLabel: string;
  schemeId: string;
  title: string;
  noticeNumber: string;
  fundName: string;
  dueDate: string;
  status: string;
  /** Levy plus interest charged. */
  amountDue: number;
  amountPaid: number;
  balance: number;
  interestCharged: number;
}

/**
 * The owner's levy list: issued notices only (never planned ones, DRAFT),
 * newest first. Used by the owner's levies page and the Adviser's view of a
 * lot as its owner sees it.
 */
export function levyItems(
  notices: Array<LedgerNotice & { schemeId: string }>,
  today: string,
  lots: Map<string, { label: string; schemeId: string }>,
): LevyItem[] {
  const items = notices
    .filter((n) => String(n.status) !== "DRAFT")
    .map((n) => ({
      id: n.id,
      lotId: n.lotId,
      lotLabel: lots.get(n.lotId)?.label ?? "",
      schemeId: lots.get(n.lotId)?.schemeId ?? n.schemeId,
      title: noticeLabel(n),
      noticeNumber: String(n.noticeNumber),
      fundName: n.fund ? String(n.fund.name) : "",
      dueDate: toIsoDay(n.dueDate),
      status: effectiveStatus(n, today),
      amountDue: Number(n.amountDue ?? 0) + Number(n.interestCharged ?? 0),
      amountPaid: Number(n.amountPaid ?? 0),
      balance: Number(n.balanceOutstanding ?? 0),
      interestCharged: Number(n.interestCharged ?? 0),
    }));
  items.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return items;
}

export function levyItemTotals(items: LevyItem[]) {
  return {
    totalDue: items.reduce((s, i) => s + i.amountDue, 0),
    totalPaid: items.reduce((s, i) => s + i.amountPaid, 0),
    totalOutstanding: items.reduce((s, i) => s + i.balance, 0),
  };
}
