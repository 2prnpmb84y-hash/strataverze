/**
 * Mapping a payment received through Zai to a lot's levy notices and to the
 * receipt journal (pure).
 *
 * Nothing here receipts anything. It finds the lot from the reference Zai
 * issued for it, proposes how the payment is spread over the lot's open
 * notices, and works out the journal lines with the shared receipting code
 * (receiptJournalLines in src/lib/finance/levy-reversal.ts), so the lines are
 * the ones every other receipt posts. The receipt itself is written by the
 * existing receipting (prepareLevyReceipt), which checks every notice again
 * under its lock; see ./webhook-processor.ts.
 *
 * Lot identification: under option B every lot pays into the owners
 * corporation's one wallet, so the wallet alone never identifies a lot. The
 * only payer reference the Zai docs show in a payin payload is an NPP
 * payin's payin_details.pay_id (and remittance_information), so a payment is
 * matched only by a PayID Zai registered for the lot. A BPAY payin's
 * documented payload carries no payer reference, so it always goes to the
 * unmatched queue until Zai confirms how a lot's CRN reaches us
 * (NOT_CONFIRMED NC-BPAY-LOT-REFERENCE).
 */
import { OVERDUE_NOTICE_STATUSES, noticeCents } from "@/lib/levies/overdue";
import { toIsoDay } from "@/lib/levies/notice-plan";
import { noticeAfterReversal, receiptJournalLines, type ReceiptLine, type ReceiptPart } from "@/lib/finance/levy-reversal";
import type { ZaiTransactionPayload } from "./webhook-payload";

// ─── The lot ────────────────────────────────────────────────────────────────

export interface RegisteredReference {
  lotId: string;
  method: "PAYID" | "VIRTUAL_ACCOUNT" | "BPAY_CRN";
  value: string;
  zaiWalletAccountId: string;
  status: string;
}

export type LotMatch =
  | { matched: true; lotId: string; referenceValue: string }
  | { matched: false; reason: string; referenceValue: string | null };

/**
 * The lot a payin belongs to, from the active PayID registered for a lot on
 * the wallet it arrived in. Anything else is unmatched, with the reason.
 */
export function matchPayinToLot(payin: Pick<ZaiTransactionPayload, "typeMethod" | "accountId" | "payId">, references: readonly RegisteredReference[]): LotMatch {
  if (payin.typeMethod !== "npp_payin") {
    return { matched: false, reason: `A ${payin.typeMethod} payin carries no payer reference in Zai's documented payload (NC-BPAY-LOT-REFERENCE).`, referenceValue: null };
  }
  if (!payin.payId) return { matched: false, reason: "The NPP payin has no PayID.", referenceValue: null };
  const key = payin.payId.trim().toLowerCase();
  const found = references.filter(
    (r) => r.method === "PAYID" && r.status === "active" && r.zaiWalletAccountId === payin.accountId && r.value.trim().toLowerCase() === key,
  );
  const lots = new Set(found.map((r) => r.lotId));
  if (lots.size === 0) return { matched: false, reason: "No active PayID registered for a lot matches this payment.", referenceValue: payin.payId };
  if (lots.size > 1) return { matched: false, reason: "The PayID is registered for more than one lot.", referenceValue: payin.payId };
  return { matched: true, lotId: [...lots][0], referenceValue: payin.payId };
}

// ─── The notices ────────────────────────────────────────────────────────────

export interface OpenNotice {
  levyNoticeId: string;
  noticeNumber: string;
  lotId: string;
  fundId: string;
  dueDate: string;
  /** What the notice owes now (amount due and late charge, less paid), as receipting works it out. */
  owedCents: number;
}

/**
 * A lot's notices that a payment can go to: issued (ISSUED, PARTIALLY_PAID
 * or OVERDUE) and owing more than nothing, oldest due first, then by number.
 * Throws UnreadableNoticeError when an amount cannot be read, so a notice is
 * never left out silently.
 */
export function openNotices(
  rows: ReadonlyArray<{ id: unknown; noticeNumber: unknown; lotId: unknown; fundId: unknown; dueDate: unknown; status: unknown; amountDue: unknown; amountPaid: unknown; interestCharged?: unknown }>,
): OpenNotice[] {
  return rows
    .filter((n) => (OVERDUE_NOTICE_STATUSES as readonly string[]).includes(String(n.status)))
    .map((n) => ({
      levyNoticeId: String(n.id),
      noticeNumber: String(n.noticeNumber),
      lotId: String(n.lotId),
      fundId: String(n.fundId),
      dueDate: toIsoDay(n.dueDate),
      owedCents: noticeCents(n, "amountDue") + noticeCents({ ...n, interestCharged: n.interestCharged ?? 0 }, "interestCharged") - noticeCents(n, "amountPaid"),
    }))
    .filter((n) => n.owedCents > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.noticeNumber.localeCompare(b.noticeNumber));
}

export type AllocationKind = "EXACT" | "PARTIAL" | "OVERPAID" | "NO_OPEN_NOTICES";

export interface Allocation {
  kind: AllocationKind;
  /** The receipts, as receiptLevyPayments takes them. */
  receipts: Array<{ levyNoticeId: string; amountCents: number }>;
  /** The parts, as the receipt journal reads them. */
  parts: ReceiptPart[];
  /** Above everything the lot's open notices owe (held as the owner's credit on the newest notice). */
  excessCents: number;
}

/**
 * Spread a payment over a lot's open notices, oldest due first: each notice
 * takes what it owes until the money runs out (PARTIAL leaves the last one
 * part paid). Money above what they all owe is put on the newest notice as
 * an overpayment (OVERPAID), which receipting holds as the owner's credit
 * only once a person confirms it. With no open notice nothing is allocated.
 */
export function allocatePayment(notices: readonly OpenNotice[], amountCents: number): Allocation {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError("A payment must be a whole number of cents above zero.");
  if (notices.length === 0) return { kind: "NO_OPEN_NOTICES", receipts: [], parts: [], excessCents: amountCents };
  let left = amountCents;
  const parts: ReceiptPart[] = [];
  for (const n of notices) {
    if (left === 0) break;
    const applied = Math.min(left, n.owedCents);
    left -= applied;
    parts.push({ levyNoticeId: n.levyNoticeId, noticeNumber: n.noticeNumber, lotId: n.lotId, fundId: n.fundId, appliedCents: applied, excessCents: 0 });
  }
  const totalOwed = notices.reduce((s, n) => s + n.owedCents, 0);
  if (left > 0) parts[parts.length - 1] = { ...parts[parts.length - 1], excessCents: left };
  const receipts = parts.map((p) => ({ levyNoticeId: p.levyNoticeId, amountCents: p.appliedCents + p.excessCents }));
  const kind: AllocationKind = left > 0 ? "OVERPAID" : amountCents === totalOwed ? "EXACT" : "PARTIAL";
  return { kind, receipts, parts, excessCents: left };
}

// ─── The journal ────────────────────────────────────────────────────────────

export interface ReceiptAccounts {
  /** The account the money is debited to (see the design: the wallet's cash account, decision D3). */
  debitAccountId: string;
  receivableByFund: Record<string, string>;
  advanceByFund: Record<string, string | null>;
}

/** The receipt journal's lines, by the shared receipting code. */
export function zaiReceiptJournalLines(parts: ReceiptPart[], accounts: ReceiptAccounts): ReceiptLine[] {
  return receiptJournalLines(parts, accounts, "Zai receipt, levy payment");
}

/** Whether lines balance: in total and within each fund, debits equal credits, and nothing is negative. */
export function journalBalances(lines: readonly Pick<ReceiptLine, "fundId" | "debitCents" | "creditCents">[]): boolean {
  if (lines.length === 0) return false;
  const byFund = new Map<string, number>();
  for (const l of lines) {
    const d = l.debitCents ?? 0;
    const c = l.creditCents ?? 0;
    if (d < 0 || c < 0 || !Number.isSafeInteger(d) || !Number.isSafeInteger(c)) return false;
    byFund.set(l.fundId, (byFund.get(l.fundId) ?? 0) + d - c);
  }
  return [...byFund.values()].every((v) => v === 0);
}

// ─── A reversal ─────────────────────────────────────────────────────────────

/**
 * What reversing a receipted Zai payment does, for the person who reviews it:
 * the receipt's lines turned round, and each notice as it is after its
 * payment is taken off (noticeAfterReversal, the shared rule). The reversal
 * itself is done by the existing reverseLevyReceipt, never automatically:
 * the Zai docs do not say which state a returned payin moves to
 * (NOT_CONFIRMED NC-PAYIN-REVERSAL).
 */
export function reversalPlan(
  lines: readonly ReceiptLine[],
  notices: ReadonlyArray<{ levyNoticeId: string; owedCents: number; paidCents: number }>,
  parts: readonly ReceiptPart[],
): { lines: ReceiptLine[]; notices: Array<{ levyNoticeId: string } & ReturnType<typeof noticeAfterReversal>> } {
  const reversed = lines.map((l) => ({
    ...l,
    debitCents: l.creditCents,
    creditCents: l.debitCents,
    description: `Reversal: ${l.description}`,
  }));
  const after = parts.map((p) => {
    const n = notices.find((x) => x.levyNoticeId === p.levyNoticeId);
    if (!n) throw new Error(`Notice ${p.noticeNumber} is not in the reversal.`);
    return { levyNoticeId: p.levyNoticeId, ...noticeAfterReversal(n, p.appliedCents) };
  });
  return { lines: reversed, notices: after };
}
