/**
 * The treasurer's "this month" view (pure). One page with what needs the
 * treasurer's attention: bank transactions not yet matched, invoices waiting
 * for approval, overdue levies, money held in suspense and whether the
 * month's financial periods are open or closed.
 */
import { suspenseBlockingClose } from "./reconciliation";

export interface TreasurerInputs {
  /** Today in Sydney, as an ISO day. */
  today: string;
  unmatched: Array<{ id: string; date: string; amountCents: number; description: string }>;
  approvals: Array<{ id: string; kind: "SUPPLIER_INVOICE" | "WORKS_INVOICE" | "CREDIT_REFUND"; label: string; amountCents: number; dueDate: string | null }>;
  /** Issued notices with money still owing. */
  notices: Array<{ id: string; noticeNumber: string; lotNumber: string; dueDate: string; balanceCents: number; status: string }>;
  suspense: Array<{ id: string; transactionDate: string; amountCents: number; description: string }>;
  periods: Array<{ id: string; name: string; startDate: string; endDate: string; status: string }>;
}

export interface TreasurerMonth {
  month: { start: string; end: string; label: string };
  unmatched: { count: number; thisMonth: number; receiptsCents: number; paymentsCents: number; oldestDate: string | null; items: TreasurerInputs["unmatched"] };
  approvals: { count: number; totalCents: number; overdueCount: number; items: TreasurerInputs["approvals"] };
  overdue: { count: number; totalCents: number; lots: number; items: Array<TreasurerInputs["notices"][number] & { daysOverdue: number }> };
  suspense: { count: number; netCents: number; items: TreasurerInputs["suspense"] };
  periods: {
    current: { name: string; status: string } | null;
    /** Periods that have ended but are still open, oldest first. */
    endedOpen: Array<{ name: string; endDate: string; suspenseBlocking: number }>;
  };
  /** How many of the sections need something done. */
  attention: number;
}

const ITEMS = 8;

/** The calendar month containing an ISO day. */
export function monthOf(today: string): { start: string; end: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}`, label };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function treasurerMonth(input: TreasurerInputs): TreasurerMonth {
  const month = monthOf(input.today);

  const unmatched = [...input.unmatched].sort((a, b) => a.date.localeCompare(b.date));
  const approvals = [...input.approvals].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const overdue = input.notices
    .filter((n) => n.balanceCents > 0 && n.dueDate < input.today && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(n.status))
    .map((n) => ({ ...n, daysOverdue: daysBetween(n.dueDate, input.today) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balanceCents - a.balanceCents);
  const suspense = [...input.suspense].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  const current = input.periods.find((p) => p.startDate <= input.today && p.endDate >= input.today) ?? null;
  const endedOpen = input.periods
    .filter((p) => p.endDate < input.today && p.status === "OPEN")
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map((p) => ({
      name: p.name,
      endDate: p.endDate,
      suspenseBlocking: suspenseBlockingClose(p.endDate, suspense).length,
    }));

  const result: TreasurerMonth = {
    month,
    unmatched: {
      count: unmatched.length,
      thisMonth: unmatched.filter((t) => t.date >= month.start && t.date <= month.end).length,
      receiptsCents: unmatched.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0),
      paymentsCents: unmatched.filter((t) => t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0),
      oldestDate: unmatched[0]?.date ?? null,
      items: unmatched.slice(0, ITEMS),
    },
    approvals: {
      count: approvals.length,
      totalCents: approvals.reduce((s, a) => s + a.amountCents, 0),
      overdueCount: approvals.filter((a) => a.dueDate && a.dueDate < input.today).length,
      items: approvals.slice(0, ITEMS),
    },
    overdue: {
      count: overdue.length,
      totalCents: overdue.reduce((s, n) => s + n.balanceCents, 0),
      lots: new Set(overdue.map((n) => n.lotNumber)).size,
      items: overdue.slice(0, ITEMS),
    },
    suspense: {
      count: suspense.length,
      netCents: suspense.reduce((s, i) => s + i.amountCents, 0),
      items: suspense.slice(0, ITEMS),
    },
    periods: { current: current ? { name: current.name, status: current.status } : null, endedOpen },
    attention: 0,
  };
  result.attention = [result.unmatched.count, result.approvals.count, result.overdue.count, result.suspense.count, endedOpen.length].filter((n) => n > 0).length;
  return result;
}
