/**
 * The amount a debt recovery case is opened for, from the lot's overdue
 * notices (overdue notices fix, C1: "Balance only", decided by Matthew
 * Wrigley on 30 Oct 2026). All in cents.
 *
 * The total is the sum of the notices' balances outstanding. A notice's
 * balance already includes its late charge (every writer keeps balance =
 * amount due + late charge - amount paid), so the late charge is never added
 * again. The late charge part is what is still owing of each notice's late
 * charge once what was paid is applied in the building's order
 * (noticeOwingSplit, the split the payment plan figure lotArrears uses):
 *   - levy first (NSW, and the VIC, ACT and WA draft packs): payments pay the
 *     levy, then the late charge;
 *   - late charge first (Queensland, SM s 166(5)): the part of the payments
 *     recorded as paid to the penalty (noticeLateChargePaid, the one figure
 *     receipting, owner credit and lotArrears use).
 * The principal is the total less the late charge part.
 *
 * A notice brought across at takeover holds in amountPaid the late charge
 * the old system collected (migratedInterestPaid). That part pays the late
 * charge first, whatever the order (M1, 30 Oct 2026; noticeOwingSplit).
 *
 * Fail closed, so the split is never guessed:
 *   - an amount, the late charge paid before takeover, or payments (late
 *     charge first) that cannot be read throw UnreadableNoticeError;
 *   - figures that do not agree with the payments (the late charge owing is
 *     more than the balance, or more was paid before takeover than is paid
 *     now) throw NoticeFiguresDisagreeError;
 *   - more receipts than MAX_RECEIPTS throws, rather than reading some.
 */
import { db } from "@/prisma/db";
import { lateChargeFirst, noticeOwingSplit, type PaymentAllocationOrder } from "@/lib/finance/statutory-interest";
import { noticeCents, UnreadableNoticeError } from "@/lib/levies/overdue";

/** The most receipts read for a lot's notices at once; more is refused, never cut short. */
export const MAX_RECEIPTS = 50000;

/** A notice whose figures do not agree with its payments, so what it owes cannot be split. */
export class NoticeFiguresDisagreeError extends Error {
  constructor(
    readonly noticeId: string,
    detail: string,
  ) {
    super(`Notice ${noticeId}: its figures do not agree with its payments (${detail}).`);
    this.name = "NoticeFiguresDisagreeError";
  }
}

export interface CaseNotice {
  id: string;
  amountDue: unknown;
  amountPaid: unknown;
  interestCharged: unknown;
  balanceOutstanding: unknown;
  /** Set on a notice brought across at takeover. */
  migrationBatchId?: unknown;
  /** The late charge the old system collected, on a takeover notice. */
  migratedInterestPaid?: unknown;
}

export interface CaseAmount {
  totalCents: number;
  /** The late charge still owing within the total. */
  lateChargeCents: number;
  /** The total less the late charge. */
  principalCents: number;
}

/** The sum of the notices' balances, in cents. Throws UnreadableNoticeError for a balance that cannot be read. */
export function balancesCents(notices: readonly Pick<CaseNotice, "id" | "balanceOutstanding">[]): number {
  return notices.reduce((sum, n) => sum + noticeCents(n, "balanceOutstanding"), 0);
}

/**
 * The case amount for `notices` (the lot's overdue notices), with payments
 * applied in `order` (the pack's PAYMENT_ALLOCATION_ORDER). Payments are read
 * only for a late charge first order and only for a notice with both a late
 * charge and an amount paid (otherwise nothing paid can have gone to it).
 */
export async function caseAmountCents(notices: readonly CaseNotice[], order: PaymentAllocationOrder | null | undefined, orm: typeof db.orm = db.orm): Promise<CaseAmount> {
  const parsed = notices.map((n) => ({
    n,
    balance: noticeCents(n, "balanceOutstanding"),
    due: noticeCents(n, "amountDue"),
    paid: noticeCents(n, "amountPaid"),
    charged: noticeCents(n, "interestCharged"),
    takeover: n.migrationBatchId ? noticeCents(n, "migratedInterestPaid") : 0,
  }));
  const chargeFirst = lateChargeFirst(order);
  const needPayments = chargeFirst ? parsed.filter((p) => p.paid > 0 && p.charged > 0) : [];
  let chargePaidOf: (n: CaseNotice) => number = () => 0;
  if (needPayments.length) {
    const { noticeLateChargePaid } = await import("@/lib/finance/interest-setting");
    const { livePayments } = await import("@/lib/finance/levy-reversal");
    const ids = needPayments.map((p) => p.n.id);
    const rows = await orm.public.LevyPayment.where((p) => p.levyNoticeId.in(ids)).limit(MAX_RECEIPTS + 1).all();
    if (rows.length > MAX_RECEIPTS) throw new Error(`More than ${MAX_RECEIPTS} receipts on the lot's notices: not all could be read.`);
    const payments = livePayments(rows);
    chargePaidOf = (n) => noticeLateChargePaid(n, payments);
  }
  let totalCents = 0;
  let lateChargeCents = 0;
  for (const { n, balance, due, paid, charged, takeover } of parsed) {
    const chargePaidCents = chargeFirst && paid > 0 && charged > 0 ? chargePaidOf(n) : 0;
    if (!Number.isInteger(chargePaidCents)) throw new UnreadableNoticeError(n.id, "payments", chargePaidCents);
    if (n.migrationBatchId && (takeover < 0 || (takeover > 0 && takeover > paid))) throw new NoticeFiguresDisagreeError(n.id, `${takeover} cents of late charge paid before takeover, ${paid} cents paid in all`);
    const takeoverChargePaidCents = takeover;
    const { lateChargeCents: owing } = noticeOwingSplit({ dueCents: due, paidCents: paid, chargedCents: charged, chargePaidCents, takeoverChargePaidCents }, order);
    if (owing > balance) throw new NoticeFiguresDisagreeError(n.id, `${owing} cents of late charge owing, more than its balance of ${balance} cents`);
    totalCents += balance;
    lateChargeCents += owing;
  }
  return { totalCents, lateChargeCents, principalCents: totalCents - lateChargeCents };
}
