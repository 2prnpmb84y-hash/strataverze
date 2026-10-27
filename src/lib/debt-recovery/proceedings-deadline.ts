/**
 * The deadline to start proceedings for a long outstanding debt (stage 2,
 * step 8, 27 Oct 2026), pure. A pack whose DEBT_RECOVERY records
 * `mustStartProceedings` (Queensland: a debt outstanding for 2 years needs
 * proceedings within 2 months after, SM s 166(2)) flags each lot whose oldest
 * unpaid contribution has been outstanding that long with no proceedings
 * recorded. A pack without the rule (NSW) flags nothing.
 *
 * The years are counted from the date for payment of the oldest unpaid
 * contribution (StrataVerze's reading, in the Queensland pack's FOR_REVIEW):
 * a contribution due on 27 Oct 2024 is flagged from 27 Oct 2026, and
 * proceedings must start by 27 Dec 2026.
 */
import type { StatutoryRules } from "@/config/statutory";
import { addMonths } from "@/lib/finance/statutory-interest";

export interface ProceedingsDeadlineRule {
  overdueYears: number;
  withinMonths: number;
  /** The provision, as the warning cites it ("Standard Module s 166(2)"). */
  citation: string;
}

/** The building's rule, or null when its pack has none (nothing is flagged). */
export function proceedingsDeadlineRule(rules: Pick<StatutoryRules, "DEBT_RECOVERY">): ProceedingsDeadlineRule | null {
  const must = rules.DEBT_RECOVERY?.mustStartProceedings;
  if (!must) return null;
  return { overdueYears: must.overdueYears, withinMonths: must.withinMonths, citation: must.citation };
}

/** The last due date that can be flagged today: today less the rule's years (clamped to the month end). */
export function flaggableDueOnOrBefore(rule: Pick<ProceedingsDeadlineRule, "overdueYears">, today: string): string {
  return addMonths(today, -rule.overdueYears * 12);
}

const CLOSED_CASE = /^CLOSED/;

/**
 * Each lot's oldest unpaid contribution and whether proceedings for it have
 * started, from the building's unpaid notices and its cases (pure). A case
 * counts only while it is open and if it was opened on or after the oldest
 * unpaid due date (a case settled in 2023 says nothing about a contribution
 * due in 2024), and only if its PROCEEDINGS step is complete or it has a
 * court file number.
 */
export function lotDebtsFrom(
  notices: ReadonlyArray<{ lotId: string; lotNumber: string; dueDate: string; balanceCents: number }>,
  cases: ReadonlyArray<{ id: string; lotId: string; status: string; openedOn: string; courtFileNumber: string | null }>,
  casesWithProceedingsCompleted: ReadonlySet<string>,
): LotDebt[] {
  const byLot = new Map<string, LotDebt>();
  for (const n of notices) {
    if (!n.dueDate || n.balanceCents <= 0) continue;
    const lot = byLot.get(n.lotId);
    if (!lot) byLot.set(n.lotId, { lotId: n.lotId, lotNumber: n.lotNumber, oldestUnpaidDueDate: n.dueDate, proceedingsStarted: false });
    else if (lot.oldestUnpaidDueDate == null || n.dueDate < lot.oldestUnpaidDueDate) lot.oldestUnpaidDueDate = n.dueDate;
  }
  for (const lot of byLot.values()) {
    lot.proceedingsStarted = cases.some(
      (c) =>
        c.lotId === lot.lotId &&
        !CLOSED_CASE.test(c.status) &&
        lot.oldestUnpaidDueDate != null &&
        c.openedOn >= lot.oldestUnpaidDueDate &&
        (casesWithProceedingsCompleted.has(c.id) || (c.courtFileNumber ?? "").trim() !== ""),
    );
  }
  return [...byLot.values()];
}

export interface LotDebt {
  lotId: string;
  lotNumber: string;
  /** The date for payment (YYYY-MM-DD) of the lot's oldest unpaid contribution, or null when nothing is unpaid. */
  oldestUnpaidDueDate: string | null;
  /** Whether proceedings to recover the debt have started. */
  proceedingsStarted: boolean;
}

export interface ProceedingsDeadlineFlag {
  lotId: string;
  lotNumber: string;
  oldestUnpaidDueDate: string;
  /** The day the debt has been outstanding for the rule's years. */
  outstandingSince: string;
  /** The last day to start proceedings. */
  deadline: string;
  /** Whether the deadline has passed. */
  passed: boolean;
}

/** The lots that must have proceedings started, oldest debt first. `today` is the building's day (YYYY-MM-DD). */
export function proceedingsDeadlineFlags(
  rule: Pick<ProceedingsDeadlineRule, "overdueYears" | "withinMonths"> | null,
  lots: readonly LotDebt[],
  today: string,
): ProceedingsDeadlineFlag[] {
  if (!rule) return [];
  const flags: ProceedingsDeadlineFlag[] = [];
  for (const lot of lots) {
    if (!lot.oldestUnpaidDueDate || lot.proceedingsStarted) continue;
    const outstandingSince = addMonths(lot.oldestUnpaidDueDate, rule.overdueYears * 12);
    if (today < outstandingSince) continue;
    // From the day the period ends (clamped), so 29 Feb 2024 gives 28 Feb 2026 and then 28 Apr 2026.
    const deadline = addMonths(outstandingSince, rule.withinMonths);
    flags.push({ lotId: lot.lotId, lotNumber: lot.lotNumber, oldestUnpaidDueDate: lot.oldestUnpaidDueDate, outstandingSince, deadline, passed: today > deadline });
  }
  return flags.sort((a, b) => a.oldestUnpaidDueDate.localeCompare(b.oldestUnpaidDueDate) || a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }));
}

/** The warning the adviser debt recovery page shows for one lot. `formatDate` turns YYYY-MM-DD into the page's date format. */
export function proceedingsDeadlineWarning(
  flag: ProceedingsDeadlineFlag,
  rule: Pick<ProceedingsDeadlineRule, "overdueYears" | "withinMonths">,
  terms: Pick<StatutoryRules["TERMINOLOGY"], "levy" | "ownersCorporation">,
  formatDate: (day: string) => string,
): string {
  const start = `the ${terms.ownersCorporation} must start proceedings`;
  return flag.passed
    ? `Lot ${flag.lotNumber}: the oldest unpaid ${terms.levy} (due ${formatDate(flag.oldestUnpaidDueDate)}) has been outstanding for more than ${rule.overdueYears} years. ${capitalise(start)} within ${rule.withinMonths} months after that, by ${formatDate(flag.deadline)}. That date has passed.`
    : `Lot ${flag.lotNumber}: the oldest unpaid ${terms.levy} (due ${formatDate(flag.oldestUnpaidDueDate)}) has been outstanding for ${rule.overdueYears} years. ${capitalise(start)} by ${formatDate(flag.deadline)}.`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
