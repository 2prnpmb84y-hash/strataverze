/**
 * The "Platform charges" report (pure): what StrataVerze has charged a scheme,
 * by fee code and month, and its cost per lot per year for comparison with
 * what strata managing agents charge.
 */
import { sydneyMonth } from "./invoice";

/**
 * Comparison figure for agency fees, as stated in the platform billing brief
 * (Launch Document v1.8). Not independently verified: confirm against the
 * source report before relying on it.
 */
export const AGENT_BENCHMARK = {
  centsPerLotPerYear: 57200,
  label: "Macquarie 2026 benchmark for NSW strata managing agents, as quoted in the StrataVerze launch document",
};

export interface ReportFeeEvent {
  code: string;
  status: string;
  occurredAt: string;
  exGstCents: number;
  gstCents: number;
}

export interface CodeMonthCell {
  code: string;
  month: string;
  totalCents: number;
  count: number;
}

/** Net totals (incl. GST) by fee code and Sydney month. Waived charges are left out. */
export function feesByCodeAndMonth(events: ReportFeeEvent[]): CodeMonthCell[] {
  const cells = new Map<string, CodeMonthCell>();
  for (const e of events) {
    if (e.status === "WAIVED") continue;
    const month = sydneyMonth(new Date(e.occurredAt));
    const key = `${e.code}|${month}`;
    const cell = cells.get(key) ?? { code: e.code, month, totalCents: 0, count: 0 };
    cell.totalCents += e.exGstCents + e.gstCents;
    if (e.status !== "REVERSED") cell.count += 1;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) => a.month.localeCompare(b.month) || a.code.localeCompare(b.code));
}

/**
 * The scheme's StrataVerze cost per lot over the 12 months to `asAt`,
 * including GST. Null when the scheme has no lots.
 */
export function costPerLotPerYear(events: ReportFeeEvent[], lotCount: number, asAt: Date): number | null {
  if (lotCount <= 0) return null;
  const from = new Date(asAt);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const total = events
    .filter((e) => e.status !== "WAIVED")
    .filter((e) => {
      const t = new Date(e.occurredAt).getTime();
      return t > from.getTime() && t <= asAt.getTime();
    })
    .reduce((s, e) => s + e.exGstCents + e.gstCents, 0);
  return Math.round(total / lotCount);
}
