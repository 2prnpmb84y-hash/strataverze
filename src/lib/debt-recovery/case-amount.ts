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
 * Fail closed: an amount that cannot be read, payments that cannot be read
 * (late charge first), or a late charge owing that is more than the notice's
 * balance throws UnreadableNoticeError, so the split is never guessed.
 */
import { db } from "@/prisma/db";
import { lateChargeFirst, noticeOwingSplit, type PaymentAllocationOrder } from "@/lib/finance/statutory-interest";
import { noticeCents, UnreadableNoticeError } from "@/lib/levies/overdue";

export interface CaseNotice {
  id: string;
  amountDue: unknown;
  amountPaid: unknown;
  interestCharged: unknown;
  balanceOutstanding: unknown;
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
  }));
  const chargeFirst = lateChargeFirst(order);
  const needPayments = chargeFirst ? parsed.filter((p) => p.paid > 0 && p.charged > 0) : [];
  let chargePaidOf: (n: CaseNotice) => number = () => 0;
  if (needPayments.length) {
    const { noticeLateChargePaid } = await import("@/lib/finance/interest-setting");
    const { livePayments } = await import("@/lib/finance/levy-reversal");
    const ids = needPayments.map((p) => p.n.id);
    const payments = livePayments(await orm.public.LevyPayment.where((p) => p.levyNoticeId.in(ids)).limit(50000).all());
    chargePaidOf = (n) => noticeLateChargePaid(n, payments);
  }
  let totalCents = 0;
  let lateChargeCents = 0;
  for (const { n, balance, due, paid, charged } of parsed) {
    const chargePaidCents = chargeFirst && paid > 0 && charged > 0 ? chargePaidOf(n) : 0;
    if (!Number.isInteger(chargePaidCents)) throw new UnreadableNoticeError(n.id, "payments", chargePaidCents);
    const { lateChargeCents: owing } = noticeOwingSplit({ dueCents: due, paidCents: paid, chargedCents: charged, chargePaidCents }, order);
    if (owing > balance) throw new UnreadableNoticeError(n.id, "interestCharged", n.interestCharged, `leaves ${owing} cents owing, more than its balance of ${balance} cents`);
    totalCents += balance;
    lateChargeCents += owing;
  }
  return { totalCents, lateChargeCents, principalCents: totalCents - lateChargeCents };
}
