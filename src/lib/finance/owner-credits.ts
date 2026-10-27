/**
 * Owner credits (server side): holding an overpayment as the owner's credit,
 * applying credit to later notices, and refunding it under the scheme's
 * payment controls.
 *
 * Credit is kept per lot per fund. The balance row is a running total; the
 * credit transactions are the record, and every change recomputes the
 * balance from them.
 */
import { db } from "@/prisma/db";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { fromCents, toCents } from "@/lib/billing/money";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { ensureLeviesInAdvanceAccount } from "@/lib/queries/seed-chart-of-accounts";
import { createPostedJournalEntryIn, getNextEntryNumber, validatePeriodForPosting } from "@/lib/queries/journal-entries";
import { addNumberedJournal, numberedTransaction, type Tx } from "@/lib/queries/journal-numbering";
import { logActivity } from "@/lib/queries/activity-log";
import { getApprovalMembers, getAuthorisations, getPaymentSettings, hashIp } from "@/lib/queries/payment-controls";
import {
  approvalComplete,
  approversRequired,
  checkSegregation,
  eligibleApprovers,
  isEligibleApprover,
  type InvoiceForControls,
} from "./payment-controls";
import { availableCredit, creditJournalAccounts, planCreditApplication, refundProblem } from "./owner-credit";
import type { StatutoryRules } from "@/config/statutory";
import { capitalise } from "@/lib/jurisdiction/wording";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { lateChargePart } from "./statutory-interest";
import { getSchemeInterestSetting, lateChargeFirstRules } from "./interest-setting";
import { chargeLockedNotice, lateChargeAccounts, lockLateCharge, logLateChargeCharged } from "@/lib/queries/interest";
import { PaymentControlError, type ApprovalOutcome } from "./invoice-approval";

type Orm = typeof db.orm;

const num = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (v: string) => v as unknown as TimestampString<3>;
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;
const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

/** REVERSED: credit taken back out when the receipt that created it is reversed. */
export type CreditType = "OVERPAYMENT" | "APPLIED" | "REFUNDED" | "ADJUSTED" | "REVERSED";
/** Credit added (+1) or used (-1) by each movement. ADJUSTED adds credit. */
const SIGN: Record<CreditType, 1 | -1> = { OVERPAYMENT: 1, ADJUSTED: 1, APPLIED: -1, REFUNDED: -1, REVERSED: -1 };

export interface CreditKey {
  schemeId: string;
  lotId: string;
  fundId: string;
}

/** The credit for a lot in a fund, from its movements, in cents. */
export async function creditBalanceCents(orm: Orm, key: CreditKey): Promise<number> {
  const rows = await orm.public.OwnerCreditTransaction
    .where((t) => and(t.schemeId.eq(key.schemeId), t.lotId.eq(key.lotId), t.fundId.eq(key.fundId)))
    .limit(10000)
    .all();
  return rows.reduce((s, r) => s + SIGN[r.type as CreditType] * toCents(String(r.amount)), 0);
}

async function syncBalance(orm: Orm, key: CreditKey, ownerId: string | null) {
  const cents = await creditBalanceCents(orm, key);
  if (cents < 0) throw new Error("Owner credit cannot go below zero.");
  const existing = await orm.public.OwnerCreditBalance
    .where((b) => and(b.schemeId.eq(key.schemeId), b.lotId.eq(key.lotId), b.fundId.eq(key.fundId)))
    .first();
  const values = { balance: num(cents), updatedAt: ts(new Date().toISOString()), ...(ownerId ? { ownerId } : {}) };
  if (existing) await orm.public.OwnerCreditBalance.where((b) => b.id.eq(existing.id)).update(values);
  // Only the key's own fields: callers pass a whole movement as the key, and
  // its other fields (type, amount) are not columns here (25 Oct 2026 fix).
  else await orm.public.OwnerCreditBalance.create({ schemeId: key.schemeId, lotId: key.lotId, fundId: key.fundId, ownerId, balance: num(cents), updatedAt: values.updatedAt });
  return cents;
}

/** Record a credit movement and update the balance. Call inside a transaction. */
export async function recordCreditMovement(
  orm: Orm,
  input: CreditKey & {
    ownerId: string | null;
    type: CreditType;
    amountCents: number;
    levyNoticeId?: string | null;
    levyPaymentId?: string | null;
    refundId?: string | null;
    note?: string | null;
    createdBy: string | null;
    /** YYYY-MM-DD the movement took effect. Defaults to today. */
    effectiveDate?: string;
  },
) {
  if (!(input.amountCents > 0)) throw new Error("A credit movement must be more than zero.");
  if (SIGN[input.type] < 0) {
    const current = await creditBalanceCents(orm, input);
    if (input.amountCents > current) throw new Error("There is not enough credit for this.");
  }
  const tx = await orm.public.OwnerCreditTransaction.create({
    schemeId: input.schemeId,
    lotId: input.lotId,
    fundId: input.fundId,
    ownerId: input.ownerId,
    type: input.type,
    amount: num(input.amountCents),
    levyNoticeId: input.levyNoticeId ?? null,
    levyPaymentId: input.levyPaymentId ?? null,
    refundId: input.refundId ?? null,
    journalEntryId: null,
    effectiveDate: ts(input.effectiveDate ?? (await schemeToday(input.schemeId, new Date(), orm))),
    note: input.note ?? null,
    createdBy: input.createdBy,
  });
  await syncBalance(orm, input, input.ownerId);
  return tx;
}

async function fundTypeOf(fundId: string) {
  const fund = await db.orm.public.Fund.where((f) => f.id.eq(fundId)).first();
  return (fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
}

/**
 * Post a two-line journal and link it to the credit movement, in the
 * caller's transaction (which holds the building's numbering lock), numbered
 * under the lock. The caller skips it when the accounts are missing.
 */
async function postCreditJournal(tx: Tx, args: {
  schemeId: string;
  fundId: string;
  lotId: string;
  date: string;
  description: string;
  sourceType: string;
  sourceId: string;
  actorId: string;
  debitAccountId: string;
  creditAccountId: string;
  amountCents: number;
  creditTxId?: string;
}) {
  const amount = fromCents(args.amountCents);
  const { entry } = await addNumberedJournal(
    tx,
    {
      schemeId: args.schemeId,
      transactionDate: args.date,
      description: args.description,
      entryType: "AUTO",
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      createdBy: args.actorId,
      lines: [
        { accountCodeId: args.debitAccountId, fundId: args.fundId, debit: amount, description: args.description, lotId: args.lotId },
        { accountCodeId: args.creditAccountId, fundId: args.fundId, credit: amount, description: args.description, lotId: args.lotId },
      ],
    },
    args.actorId,
  );
  if (args.creditTxId) {
    await tx.orm.public.OwnerCreditTransaction.where((t) => t.id.eq(args.creditTxId!)).update({ journalEntryId: entry.id });
  }
  return entry.id;
}

/** The fund's levies-paid-in-advance account id (created for older schemes if missing). */
export async function leviesInAdvanceAccountId(schemeId: string, fundId: string) {
  return (await ensureLeviesInAdvanceAccount(schemeId, fundId))?.id ?? null;
}

// ─── Applying credit to notices ─────────────────────────────────────────────

/**
 * Apply each lot's available credit to its open notices in the same fund,
 * earliest due first. Used after notices are issued (when the scheme has
 * auto-apply on) and from the owner credits page. Returns the total applied.
 *
 * Where the building applies payments to the late charge first (Queensland's
 * penalty, SM s 166(5)), see applyOwnerCreditLateChargeFirst.
 */
export async function applyOwnerCredit(input: { schemeId: string; lotIds?: string[]; actorId: string; date?: string }) {
  const date = input.date ?? (await schemeToday(input.schemeId));
  // Late charge first (Queensland) only; null for NSW, which goes on exactly as before.
  const chargeFirst = await lateChargeFirstRules(input.schemeId);
  if (chargeFirst) return applyOwnerCreditLateChargeFirst(input, date, chargeFirst);
  const balances = await db.orm.public.OwnerCreditBalance.where((b) => b.schemeId.eq(input.schemeId)).limit(5000).all();
  let periodChecked = false;
  const pending = await pendingRefundsByKey(input.schemeId);
  let appliedTotal = 0;

  for (const b of balances) {
    if (input.lotIds && !input.lotIds.includes(b.lotId)) continue;
    const key = { schemeId: b.schemeId, lotId: b.lotId, fundId: b.fundId };
    const available = availableCredit(toCents(String(b.balance)), pending.get(`${b.lotId}:${b.fundId}`) ?? 0);
    if (available <= 0) continue;

    const notices = await db.orm.public.LevyNotice
      .where((n) => and(n.schemeId.eq(b.schemeId), n.lotId.eq(b.lotId), n.fundId.eq(b.fundId), n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"])))
      .limit(500)
      .all();
    const plan = planCreditApplication(
      available,
      notices.map((n) => ({ id: n.id, dueDate: isoDay(n.dueDate), owingCents: toCents(String(n.balanceOutstanding)) })),
    );
    if (plan.length === 0) continue;

    const advanceId = await leviesInAdvanceAccountId(b.schemeId, b.fundId);
    const receivable = await getSystemAccountBySubType(b.schemeId, "ACCOUNTS_RECEIVABLE", await fundTypeOf(b.fundId));
    // The credit journals are dated `date`: refused before anything is written if its period is closed or locked.
    if (advanceId && receivable && !periodChecked) {
      await validatePeriodForPosting(input.schemeId, date, "AUTO");
      periodChecked = true;
    }

    for (const step of plan) {
      const notice = notices.find((n) => n.id === step.noticeId)!;
      // The payment, the notice, the credit used and the credit journal together,
      // under the building's numbering lock and then the notice's lock.
      const applied = await numberedTransaction(b.schemeId, async (tx) => {
        // The notice as it stands under its lock: a receipt at the same moment is kept, and the credit never pays more than it owes.
        const current = await tx.orm.public.LevyNotice.where((n) => n.id.eq(notice.id)).forNoKeyUpdate().first();
        if (!current || !["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(String(current.status))) return null;
        // The credit still available, read under the lock with the refunds already requested (as the Queensland path does).
        await tx.orm.public.OwnerCreditBalance.where((x) => and(x.schemeId.eq(key.schemeId), x.lotId.eq(key.lotId), x.fundId.eq(key.fundId))).forNoKeyUpdate().first();
        const left = availableCredit(await creditBalanceCents(tx.orm, key), await pendingRefundCents(tx.orm, key));
        const owed = toCents(String(current.amountDue)) + toCents(String(current.interestCharged ?? 0));
        const take = Math.min(step.amountCents, left, Math.max(0, owed - toCents(String(current.amountPaid))));
        if (take <= 0) return null;
        const newPaid = toCents(String(current.amountPaid)) + take;
        const newBalance = Math.max(0, owed - newPaid);
        const receipt = await tx.orm.public.LevyPayment.create({
          schemeId: b.schemeId,
          levyNoticeId: notice.id,
          lotId: b.lotId,
          amount: num(take),
          paymentDate: ts(date),
          reference: "Owner credit applied",
          recordedBy: input.actorId,
        });
        await tx.orm.public.LevyNotice.where((n) => n.id.eq(notice.id)).update({
          amountPaid: num(newPaid),
          balanceOutstanding: num(newBalance),
          status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
          ...(newBalance <= 0 ? { paidInFullAt: ts(new Date().toISOString()) } : {}),
        });
        const creditTx = await recordCreditMovement(tx.orm, {
          ...key,
          ownerId: notice.ownerId ?? b.ownerId ?? null,
          type: "APPLIED",
          amountCents: take,
          levyNoticeId: notice.id,
          levyPaymentId: receipt.id,
          createdBy: input.actorId,
          effectiveDate: date,
        });
        if (advanceId && receivable) {
          await postCreditJournal(tx, {
            schemeId: b.schemeId,
            fundId: b.fundId,
            lotId: b.lotId,
            date,
            description: `Owner credit applied to notice ${String(notice.noticeNumber)}`,
            sourceType: "OWNER_CREDIT",
            sourceId: creditTx.id,
            actorId: input.actorId,
            ...creditJournalAccounts("APPLIED", { bankId: "", receivableId: receivable.id, advanceId }),
            amountCents: take,
            creditTxId: creditTx.id,
          });
        }
        return take;
      });
      if (applied == null) continue;
      await logActivity({
        schemeId: b.schemeId,
        actorId: input.actorId,
        action: "OWNER_CREDIT_APPLIED",
        entityType: "LevyNotice",
        entityId: notice.id,
        metadata: { amount: fromCents(applied), lotId: b.lotId },
      });
      appliedTotal += applied;
    }
  }
  return appliedTotal;
}

/**
 * applyOwnerCredit for a building that applies payments to the late charge
 * first: credit is applied like a payment on `date`, one notice at a time,
 * earliest due first, each in one transaction that locks the building's
 * journal numbering and then the notice (lockJournalNumbering,
 * lockLateCharge). Under the locks the late charge to `date` is worked out
 * again and charged (its journal dated `date`), the credit goes to the late
 * charge still owing and then the levy, the part is recorded on the payment,
 * and the credit journal (late charge and levy lines) is posted, all or none.
 * A date after the building's today, or in a closed or locked period, is
 * refused before anything is written.
 */
async function applyOwnerCreditLateChargeFirst(
  input: { schemeId: string; lotIds?: string[]; actorId: string },
  date: string,
  pack: { rules: StatutoryRules; label: string },
) {
  const setting = await getSchemeInterestSetting(input.schemeId);
  const today = todayIn(setting.timeZone);
  if (date > today) throw new Error(`Credit cannot be applied on ${date}, which is after today (${today}).`);
  // Both journals are dated `date`: refuse before anything is written if its period is closed or locked.
  await validatePeriodForPosting(input.schemeId, date, "INTEREST");
  await validatePeriodForPosting(input.schemeId, date, "AUTO");
  const t = pack.rules.TERMINOLOGY;
  const balances = await db.orm.public.OwnerCreditBalance.where((b) => b.schemeId.eq(input.schemeId)).limit(5000).all();
  const pending = await pendingRefundsByKey(input.schemeId);
  let appliedTotal = 0;

  for (const b of balances) {
    if (input.lotIds && !input.lotIds.includes(b.lotId)) continue;
    const key = { schemeId: b.schemeId, lotId: b.lotId, fundId: b.fundId };
    // A first look only: the credit is read again under the lock before any is applied.
    if (availableCredit(toCents(String(b.balance)), pending.get(`${b.lotId}:${b.fundId}`) ?? 0) <= 0) continue;
    const notices = (
      await db.orm.public.LevyNotice
        .where((n) => and(n.schemeId.eq(b.schemeId), n.lotId.eq(b.lotId), n.fundId.eq(b.fundId), n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"])))
        .limit(500)
        .all()
    ).sort((x, y) => isoDay(x.dueDate).localeCompare(isoDay(y.dueDate)) || x.id.localeCompare(y.id));
    if (notices.length === 0) continue;
    // Everything the transaction needs from outside it, found first, so it makes no second connection while it holds the locks.
    const fundType = await fundTypeOf(b.fundId);
    const advanceId = await leviesInAdvanceAccountId(b.schemeId, b.fundId);
    const receivable = await getSystemAccountBySubType(b.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
    const chargeAccounts = (await lateChargeAccounts(b.schemeId, [fundType])).get(fundType);

    for (const candidate of notices) {
      const done = await numberedTransaction(b.schemeId, async (tx) => {
        const l = await lockLateCharge(tx, { schemeId: b.schemeId, noticeId: candidate.id, asAt: date, setting });
        if (!l || !["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(String(l.notice.status))) return { stop: false as const, applied: null };
        // The credit still available, read under the lock (another application or a refund may have used some).
        await tx.orm.public.OwnerCreditBalance.where((x) => and(x.schemeId.eq(key.schemeId), x.lotId.eq(key.lotId), x.fundId.eq(key.fundId))).forNoKeyUpdate().first();
        const left = availableCredit(await creditBalanceCents(tx.orm, key), await pendingRefundCents(tx.orm, key));
        if (left <= 0) return { stop: true as const, applied: null };
        const { notice, position } = l;
        const chargedCents = toCents(String(notice.interestCharged ?? 0)) + position.additionalCents;
        const owed = toCents(String(notice.amountDue)) + chargedCents;
        const paid = toCents(String(notice.amountPaid));
        const take = Math.min(left, Math.max(0, owed - paid));
        if (take <= 0) return { stop: false as const, applied: null };
        const charge =
          position.additionalCents > 0
            ? await chargeLockedNotice(tx, {
                schemeId: b.schemeId,
                notice,
                amountCents: position.additionalCents,
                date,
                actorId: input.actorId,
                rulePack: pack.label,
                terms: t,
                accounts: chargeAccounts,
              })
            : null;
        const chargeCents = lateChargePart(take, { chargedCents, chargePaidCents: position.chargePaidCents, accruedByDateCents: position.accruedByDateCents, chargePaidByDateCents: position.chargePaidByDateCents });
        const newPaid = paid + take;
        const newBalance = Math.max(0, owed - newPaid);
        const receipt = await tx.orm.public.LevyPayment.create({
          schemeId: b.schemeId,
          levyNoticeId: notice.id,
          lotId: b.lotId,
          amount: num(take),
          lateChargeAmount: num(chargeCents),
          paymentDate: ts(date),
          reference: "Owner credit applied",
          recordedBy: input.actorId,
        });
        await tx.orm.public.LevyNotice.where((n) => n.id.eq(notice.id)).update({
          amountPaid: num(newPaid),
          balanceOutstanding: num(newBalance),
          status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
          ...(newBalance <= 0 ? { paidInFullAt: ts(new Date().toISOString()) } : {}),
        });
        const creditTx = await recordCreditMovement(tx.orm, {
          ...key,
          ownerId: notice.ownerId ?? b.ownerId ?? null,
          type: "APPLIED",
          amountCents: take,
          levyNoticeId: notice.id,
          levyPaymentId: receipt.id,
          createdBy: input.actorId,
          effectiveDate: date,
        });
        // The credit journal (DR levies paid in advance, CR receivable in two parts), in the same transaction.
        if (advanceId && receivable) {
          const number = String(notice.noticeNumber);
          const description = `Owner credit applied to notice ${number}`;
          const accounts = creditJournalAccounts("APPLIED", { bankId: "", receivableId: receivable.id, advanceId });
          const credits = [
            { amountCents: chargeCents, description: `${capitalise(t.lateCharge)} receivable reduced by owner credit, notice ${number}` },
            { amountCents: take - chargeCents, description: `${capitalise(t.levies)} receivable reduced by owner credit, notice ${number}` },
          ].filter((c) => c.amountCents > 0);
          const entry = await createPostedJournalEntryIn(
            tx.orm,
            {
              schemeId: b.schemeId,
              entryNumber: await getNextEntryNumber(b.schemeId, tx.orm),
              transactionDate: date,
              description,
              entryType: "AUTO",
              sourceType: "OWNER_CREDIT",
              sourceId: creditTx.id,
              createdBy: input.actorId,
              lines: [
                { accountCodeId: accounts.debitAccountId, fundId: b.fundId, debit: fromCents(take), description, lotId: b.lotId },
                ...credits.map((c) => ({ accountCodeId: accounts.creditAccountId, fundId: b.fundId, credit: fromCents(c.amountCents), description: c.description, lotId: b.lotId })),
              ],
            },
            input.actorId,
          );
          await tx.orm.public.OwnerCreditTransaction.where((x) => x.id.eq(creditTx.id)).update({ journalEntryId: entry.id });
        }
        return { stop: false as const, applied: { notice, take, chargeCents, charge, creditTx } };
      });
      if (done.stop) break;
      if (!done.applied) continue;
      const applied = done.applied;
      if (applied.charge) await logLateChargeCharged(b.schemeId, input.actorId, pack.label, applied.charge);
      await logActivity({
        schemeId: b.schemeId,
        actorId: input.actorId,
        action: "OWNER_CREDIT_APPLIED",
        entityType: "LevyNotice",
        entityId: applied.notice.id,
        metadata: { amount: fromCents(applied.take), lotId: b.lotId, lateChargePaid: fromCents(applied.chargeCents) },
      });
      appliedTotal += applied.take;
    }
  }
  return appliedTotal;
}

/** Refunds already requested for a lot's credit in a fund, read through `orm` (a transaction's, under its lock). */
async function pendingRefundCents(orm: Orm, key: CreditKey): Promise<number> {
  const rows = await orm.public.OwnerCreditRefund
    .where((r) => and(r.schemeId.eq(key.schemeId), r.lotId.eq(key.lotId), r.fundId.eq(key.fundId), r.status.in(OPEN_REFUND)))
    .limit(2000)
    .all();
  return rows.reduce((sum, r) => sum + toCents(String(r.amount)), 0);
}

/** Journal for the excess of a levy payment held as credit: DR bank, CR levies paid in advance. */
export async function postOverpaymentJournal(args: {
  schemeId: string;
  fundId: string;
  lotId: string;
  noticeNumber: string;
  date: string;
  actorId: string;
  amountCents: number;
  creditTxId: string;
}) {
  const advanceId = await leviesInAdvanceAccountId(args.schemeId, args.fundId);
  const bank = await getSystemAccountBySubType(args.schemeId, "BANK", "ADMINISTRATIVE");
  if (!advanceId || !bank) return null;
  return numberedTransaction(args.schemeId, (tx) =>
    postCreditJournal(tx, {
      ...args,
      description: `Overpayment held as owner credit (notice ${args.noticeNumber})`,
      sourceType: "OWNER_CREDIT",
      sourceId: args.creditTxId,
      ...creditJournalAccounts("HELD", { bankId: bank.id, receivableId: "", advanceId }),
    }),
  );
}

// ─── Reading credit ─────────────────────────────────────────────────────────

const OPEN_REFUND = ["AWAITING_APPROVAL", "APPROVED"];

async function pendingRefundsByKey(schemeId: string) {
  const rows = await db.orm.public.OwnerCreditRefund
    .where((r) => and(r.schemeId.eq(schemeId), r.status.in(OPEN_REFUND)))
    .limit(2000)
    .all();
  const map = new Map<string, number>();
  for (const r of rows) map.set(`${r.lotId}:${r.fundId}`, (map.get(`${r.lotId}:${r.fundId}`) ?? 0) + toCents(String(r.amount)));
  return map;
}

export interface OwnerCreditRow {
  lotId: string;
  lotNumber: string;
  fundId: string;
  fundName: string;
  ownerId: string | null;
  balanceCents: number;
  pendingRefundsCents: number;
  availableCents: number;
}

/** Every lot with credit in the scheme (or one lot), with refunds already requested. */
export async function getOwnerCredits(schemeId: string, lotId?: string): Promise<OwnerCreditRow[]> {
  const [balances, lots, funds, pending] = await Promise.all([
    db.orm.public.OwnerCreditBalance.where((b) => (lotId ? and(b.schemeId.eq(schemeId), b.lotId.eq(lotId)) : b.schemeId.eq(schemeId))).limit(5000).all(),
    db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
    db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(20).all(),
    pendingRefundsByKey(schemeId),
  ]);
  return balances
    .map((b) => {
      const balanceCents = toCents(String(b.balance));
      const pendingRefundsCents = pending.get(`${b.lotId}:${b.fundId}`) ?? 0;
      return {
        lotId: b.lotId,
        lotNumber: String(lots.find((l) => l.id === b.lotId)?.lotNumber ?? "?"),
        fundId: b.fundId,
        fundName: String(funds.find((f) => f.id === b.fundId)?.name ?? "Fund"),
        ownerId: b.ownerId ?? null,
        balanceCents,
        pendingRefundsCents,
        availableCents: availableCredit(balanceCents, pendingRefundsCents),
      };
    })
    .filter((r) => r.balanceCents > 0 || r.pendingRefundsCents > 0)
    .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, "en-AU", { numeric: true }) || a.fundName.localeCompare(b.fundName));
}

/** Total credit per lot (all funds), in cents. */
export async function getCreditTotalsByLot(schemeId: string): Promise<Map<string, number>> {
  const rows = await db.orm.public.OwnerCreditBalance.where((b) => b.schemeId.eq(schemeId)).limit(5000).all();
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.lotId, (map.get(r.lotId) ?? 0) + toCents(String(r.balance)));
  return map;
}

/** A lot's credit movements, newest first, for statements. */
export async function getCreditMovements(schemeId: string, lotId: string) {
  return db.orm.public.OwnerCreditTransaction
    .where((t) => and(t.schemeId.eq(schemeId), t.lotId.eq(lotId)))
    .orderBy((t) => t.createdAt.desc())
    .limit(500)
    .all();
}

// ─── Refunds ────────────────────────────────────────────────────────────────

export async function requestOwnerCreditRefund(input: CreditKey & {
  amountCents: number;
  payeeName: string;
  bsb: string;
  accountNumber: string;
  verificationMethod: string;
  reason: string | null;
  actorId: string;
}) {
  const balanceCents = await creditBalanceCents(db.orm, input);
  const pending = (await pendingRefundsByKey(input.schemeId)).get(`${input.lotId}:${input.fundId}`) ?? 0;
  const problem = refundProblem({ ...input, balanceCents, pendingRefundsCents: pending });
  if (problem) throw new PaymentControlError(problem);
  const balance = await db.orm.public.OwnerCreditBalance
    .where((b) => and(b.schemeId.eq(input.schemeId), b.lotId.eq(input.lotId), b.fundId.eq(input.fundId)))
    .first();
  const refund = await db.orm.public.OwnerCreditRefund.create({
    schemeId: input.schemeId,
    lotId: input.lotId,
    fundId: input.fundId,
    ownerId: balance?.ownerId ?? null,
    amount: num(input.amountCents),
    payeeName: varchar<200>(input.payeeName.trim().slice(0, 200)),
    bsb: varchar<7>(input.bsb.replace(/\s/g, "").replace(/^(\d{3})(\d{3})$/, "$1-$2")),
    accountNumber: varchar<20>(input.accountNumber.replace(/\s/g, "")),
    verificationMethod: input.verificationMethod,
    reason: input.reason,
    status: "AWAITING_APPROVAL",
    preparedById: input.actorId,
    paidAt: null,
    paidBy: null,
    journalEntryId: null,
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "OWNER_CREDIT_REFUND_REQUESTED",
    entityType: "OwnerCreditRefund",
    entityId: refund.id,
    metadata: { amount: fromCents(input.amountCents), lotId: input.lotId },
  });
  return refund;
}

export async function getOwnerCreditRefund(refundId: string) {
  return db.orm.public.OwnerCreditRefund.where((r) => r.id.eq(refundId)).first();
}

export async function getOwnerCreditRefunds(schemeIds: string[], statuses?: string[]) {
  if (schemeIds.length === 0) return [];
  return db.orm.public.OwnerCreditRefund
    .where((r) => (statuses ? and(r.schemeId.in(schemeIds), r.status.in(statuses)) : r.schemeId.in(schemeIds)))
    .orderBy((r) => r.createdAt.desc())
    .limit(500)
    .all();
}

export async function refundControls(refundId: string) {
  const refund = await getOwnerCreditRefund(refundId);
  if (!refund) return null;
  const auths = await getAuthorisations({ ownerCreditRefundId: refundId });
  const forControls: InvoiceForControls = {
    amountCents: toCents(String(refund.amount)),
    status: refund.status,
    preparedById: refund.preparedById,
    authorisedBy: auths.map((a) => a.approverId),
  };
  return { refund, auths, forControls };
}

/** One approval of a refund under the scheme payment policy. APPROVED once complete. */
export async function authoriseOwnerCreditRefund(input: {
  schemeId: string;
  refundId: string;
  actorId: string;
  ip?: string | null;
}): Promise<ApprovalOutcome> {
  const loaded = await refundControls(input.refundId);
  if (!loaded || loaded.refund.schemeId !== input.schemeId) throw new PaymentControlError("Refund not found.");
  const { forControls, refund } = loaded;
  // Nobody approves a refund to a lot they own or co-own.
  if (refund.ownerId === input.actorId) {
    throw new PaymentControlError("You cannot approve a refund to your own lot.");
  }
  const lotOwner = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.schemeId.eq(input.schemeId),
        m.lotId.eq(refund.lotId),
        m.profileId.eq(input.actorId),
        m.role.eq("OWNER"),
        m.isActive.eq(true),
      ),
    )
    .first();
  if (lotOwner) throw new PaymentControlError("You cannot approve a refund to your own lot.");
  const settings = await getPaymentSettings(input.schemeId);
  const members = await getApprovalMembers(input.schemeId);
  const decision = checkSegregation("APPROVE", input.actorId, forControls, {
    policy: settings.policy,
    eligibleApproverIds: eligibleApprovers(members, settings.policy),
  });
  if (decision.result === "blocked") throw new PaymentControlError(decision.reason);

  const asMember = members.find((m) => m.profileId === input.actorId && isEligibleApprover(m, settings.policy));
  const role = asMember ? (asMember.role === "COMMITTEE" ? "TREASURER" : asMember.role) : "UNKNOWN";
  const exception = decision.result === "exception" ? decision.reason : null;
  const sequence = forControls.authorisedBy.length + 1;
  const required = exception ? 1 : approversRequired(settings.policy, forControls.amountCents);
  const complete = approvalComplete(settings.policy, forControls.amountCents, sequence, exception != null);

  await db.transaction(async (tx) => {
    await tx.orm.public.PaymentAuthorisation.create({
      schemeId: input.schemeId,
      supplierInvoiceId: null,
      worksInvoiceId: null,
      ownerCreditRefundId: input.refundId,
      approverId: input.actorId,
      role,
      ipHash: hashIp(input.ip),
      sequence,
      isException: exception != null,
      exceptionReason: exception,
    });
    if (complete) await tx.orm.public.OwnerCreditRefund.where((r) => r.id.eq(input.refundId)).update({ status: "APPROVED" });
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "OWNER_CREDIT_REFUND_AUTHORISED",
    entityType: "OwnerCreditRefund",
    entityId: input.refundId,
    metadata: { sequence, required, complete },
  });
  if (exception) {
    await logActivity({
      schemeId: input.schemeId,
      actorId: input.actorId,
      action: "PAYMENT_CONTROL_EXCEPTION",
      entityType: "OwnerCreditRefund",
      entityId: input.refundId,
      metadata: { control: "SINGLE_APPROVER", reason: exception },
    });
  }
  return { complete, approvals: sequence, required, exception };
}

/** Record that an approved refund was paid: reduce the credit and post DR levies paid in advance, CR bank. */
export async function recordOwnerCreditRefundPaid(input: { schemeId: string; refundId: string; actorId: string; paidOn: string }) {
  const loaded = await refundControls(input.refundId);
  if (!loaded || loaded.refund.schemeId !== input.schemeId) throw new PaymentControlError("Refund not found.");
  const { refund, forControls } = loaded;
  const decision = checkSegregation("RECORD_PAYMENT", input.actorId, forControls, {
    policy: (await getPaymentSettings(input.schemeId)).policy,
    eligibleApproverIds: [],
  });
  if (decision.result === "blocked") throw new PaymentControlError(decision.reason);

  const amountCents = toCents(String(refund.amount));
  const key = { schemeId: refund.schemeId, lotId: refund.lotId, fundId: refund.fundId };
  // The accounts, found before the transaction, and the period, checked before anything is written.
  const advanceId = await leviesInAdvanceAccountId(refund.schemeId, refund.fundId);
  const bank = await getSystemAccountBySubType(refund.schemeId, "BANK", "ADMINISTRATIVE");
  if (advanceId && bank) await validatePeriodForPosting(refund.schemeId, input.paidOn, "AUTO");
  // The credit used, the refund marked paid and its journal, together, numbered under the building's lock.
  await numberedTransaction(refund.schemeId, async (tx) => {
    // Read again under the lock: a second click at the same moment has paid it already, or waits for this one.
    const current = await tx.orm.public.OwnerCreditRefund.where((r) => r.id.eq(refund.id)).forNoKeyUpdate().first();
    if (current?.status === "PAID") throw new PaymentControlError("This refund has already been paid.");
    if (current?.status !== "APPROVED") throw new PaymentControlError("This refund is not approved for payment.");
    const movement = await recordCreditMovement(tx.orm, {
      ...key,
      ownerId: refund.ownerId ?? null,
      type: "REFUNDED",
      amountCents,
      refundId: refund.id,
      createdBy: input.actorId,
      effectiveDate: input.paidOn,
    });
    await tx.orm.public.OwnerCreditRefund.where((r) => r.id.eq(refund.id)).update({
      status: "PAID",
      paidAt: ts(new Date().toISOString()),
      paidBy: input.actorId,
    });
    if (advanceId && bank) {
      const journalId = await postCreditJournal(tx, {
        ...key,
        date: input.paidOn,
        description: `Owner credit refunded to ${refund.payeeName}`,
        sourceType: "OWNER_CREDIT",
        sourceId: refund.id,
        actorId: input.actorId,
        ...creditJournalAccounts("REFUNDED", { bankId: bank.id, receivableId: "", advanceId }),
        amountCents,
        creditTxId: movement.id,
      });
      await tx.orm.public.OwnerCreditRefund.where((r) => r.id.eq(refund.id)).update({ journalEntryId: journalId });
    }
  });
  await logActivity({
    schemeId: refund.schemeId,
    actorId: input.actorId,
    action: "OWNER_CREDIT_REFUND_PAID",
    entityType: "OwnerCreditRefund",
    entityId: refund.id,
    metadata: { amount: fromCents(amountCents), paidOn: input.paidOn },
  });
  if (decision.result === "exception") {
    await logActivity({
      schemeId: refund.schemeId,
      actorId: input.actorId,
      action: "PAYMENT_CONTROL_EXCEPTION",
      entityType: "OwnerCreditRefund",
      entityId: refund.id,
      metadata: { control: "SEGREGATION", reason: decision.reason },
    });
  }
}

export async function cancelOwnerCreditRefund(input: { schemeId: string; refundId: string; actorId: string }) {
  const refund = await getOwnerCreditRefund(input.refundId);
  if (!refund || refund.schemeId !== input.schemeId) throw new PaymentControlError("Refund not found.");
  if (!OPEN_REFUND.includes(refund.status)) throw new PaymentControlError("Only a refund that has not been paid can be cancelled.");
  await db.orm.public.OwnerCreditRefund.where((r) => r.id.eq(refund.id)).update({ status: "CANCELLED" });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "OWNER_CREDIT_REFUND_CANCELLED",
    entityType: "OwnerCreditRefund",
    entityId: refund.id,
    metadata: {},
  });
}
