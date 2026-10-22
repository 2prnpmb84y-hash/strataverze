/**
 * The published StrataVerze fee schedule (pure). Built only from price book
 * rows in force on a date, so the page always matches what will be charged.
 */
import { EXPLANATIONS, PAYER_LABELS } from "./disclosure";
import { splitGst } from "./money";
import { isEffective, type PriceBookEntry, type PriceUnit } from "./price-book";

export type FeeGroup =
  | "Subscription"
  | "Payments"
  | "Meetings and voting"
  | "Debt recovery"
  | "Works and insurance"
  | "Finance and access"
  | "Paid by others"
  | "Other";

export const FEE_GROUP_ORDER: FeeGroup[] = [
  "Subscription",
  "Payments",
  "Meetings and voting",
  "Debt recovery",
  "Works and insurance",
  "Finance and access",
  "Paid by others",
  "Other",
];

const GROUP_BY_CODE: Record<string, FeeGroup> = {
  SUBSCRIPTION_SMALL: "Subscription",
  SUBSCRIPTION_MEDIUM: "Subscription",
  SUBSCRIPTION_LARGE: "Subscription",
  EDUCATION: "Subscription",
  TXN_FEE: "Payments",
  TXN_FEE_FLAT: "Payments",
  MEETING_EGM: "Meetings and voting",
  BALLOT: "Meetings and voting",
  RECOVERY_STEP: "Debt recovery",
  WORKS_CONTRACT: "Works and insurance",
  WORKS_VARIATION: "Works and insurance",
  CLAIM_HANDLING: "Works and insurance",
  YEAR_END_PACK: "Finance and access",
  ACCOUNTANT_SEAT: "Finance and access",
  PAPER_NOTICE: "Finance and access",
  S184_CERTIFICATE: "Paid by others",
  S184_PLATFORM_SHARE: "Paid by others",
  S182_INSPECTION: "Paid by others",
  TRANSFER: "Paid by others",
  DEVELOPER_SETUP: "Paid by others",
};

export const UNIT_LABELS: Record<PriceUnit, string> = {
  PER_EVENT: "each time",
  PER_MONTH: "per month",
  PER_YEAR: "per year",
  PER_SEAT_MONTH: "per person per month",
  PER_STEP: "per step",
  PER_NOTICE: "per notice",
};

export interface FeeScheduleRow {
  code: string;
  variant: string | null;
  group: FeeGroup;
  description: string;
  explanation: string;
  unitLabel: string;
  /** Null when the price is quoted manually. */
  exGstCents: number | null;
  gstCents: number | null;
  totalCents: number | null;
  payerLabel: string;
  recoverableFromOwner: boolean;
  /** Sort key within a code: the band floor. */
  bandMin: number | null;
}

export interface FeeScheduleOptions {
  /**
   * When set, the transaction fee rows not used in this mode are left out, so
   * the schedule shows only the fee that will actually be charged.
   */
  transactionFeeMode?: "TIERED" | "FLAT";
}

/** Price book rows in force on `date`, grouped and ordered for display. */
export function feeSchedule(
  priceBook: PriceBookEntry[],
  date: string,
  options: FeeScheduleOptions = {},
): FeeScheduleRow[] {
  const hiddenTxnCode =
    options.transactionFeeMode === "FLAT" ? "TXN_FEE" : options.transactionFeeMode === "TIERED" ? "TXN_FEE_FLAT" : null;

  const rows = priceBook
    .filter((e) => isEffective(e, date))
    .filter((e) => e.code !== hiddenTxnCode)
    .map<FeeScheduleRow>((e) => {
      const split = e.amountCents == null ? null : splitGst(e.amountCents, e.gstInclusive);
      return {
        code: e.code,
        variant: e.variant ?? null,
        group: GROUP_BY_CODE[e.code] ?? "Other",
        description: e.description,
        explanation: EXPLANATIONS[e.code] ?? "",
        unitLabel: UNIT_LABELS[e.unit] ?? e.unit,
        exGstCents: split?.exGstCents ?? null,
        gstCents: split?.gstCents ?? null,
        totalCents: split?.totalCents ?? null,
        payerLabel: PAYER_LABELS[e.payerType] ?? "Charged to the owners corporation",
        recoverableFromOwner: e.recoverableFromOwner ?? false,
        bandMin: e.bandMin ?? null,
      };
    });

  return rows.sort(
    (a, b) =>
      FEE_GROUP_ORDER.indexOf(a.group) - FEE_GROUP_ORDER.indexOf(b.group) ||
      a.code.localeCompare(b.code) ||
      (a.bandMin ?? -1) - (b.bandMin ?? -1) ||
      (a.totalCents ?? 0) - (b.totalCents ?? 0),
  );
}

/** Rows grouped in display order, skipping empty groups. */
export function groupFeeSchedule(rows: FeeScheduleRow[]): { group: FeeGroup; rows: FeeScheduleRow[] }[] {
  return FEE_GROUP_ORDER.map((group) => ({ group, rows: rows.filter((r) => r.group === group) })).filter(
    (g) => g.rows.length > 0,
  );
}

export interface FeeEventSummaryInput {
  status: string;
  amountExGstCents: number;
  gstCents: number;
}

export interface FeeTotals {
  exGstCents: number;
  gstCents: number;
  totalCents: number;
  /** Charges counted, not including reversal rows. */
  count: number;
}

/**
 * Totals of fee events, net of reversals (a reversal row carries negative
 * amounts). Waived events are left out because they are never invoiced.
 * Filter the events first, e.g. to those not yet on an invoice.
 */
export function feeTotals(events: FeeEventSummaryInput[]): FeeTotals {
  const included = events.filter((e) => e.status !== "WAIVED");
  const exGstCents = included.reduce((s, e) => s + e.amountExGstCents, 0);
  const gstCents = included.reduce((s, e) => s + e.gstCents, 0);
  return {
    exGstCents,
    gstCents,
    totalCents: exGstCents + gstCents,
    count: included.filter((e) => e.status !== "REVERSED").length,
  };
}
