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
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { fromCents, toCents } from "@/lib/billing/money";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { ensureLeviesInAdvanceAccount } from "@/lib/queries/seed-chart-of-accounts";
import { createJournalEntry, getNextEntryNumber, postJournalEntry } from "@/lib/queries/journal-entries";
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
import { PaymentControlError, type ApprovalOutcome } from "./invoice-approval";

type Orm = typeof db.orm;

const num = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (v: string) => v as unknown as TimestampString<3>;
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;
const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

export type CreditType = "OVERPAYMENT" | "APPLIED" | "REFUNDED" | "ADJUSTED";
/** Credit added (+1) or used (-1) by each movement. ADJUSTED adds credit. */
const SIGN: Record<CreditType, 1 | -1> = { OVERPAYMENT: 1, ADJUSTED: 1, APPLIED: -1, REFUNDED: -1 };

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
  else await orm.public.OwnerCreditBalance.create({ ...key, ownerId, balance: num(cents), updatedAt: values.updatedAt });
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
    effectiveDate: ts(input.effectiveDate ?? new Date().toISOString().slice(0, 10)),
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

/** Post a two-line journal and link it to the credit movement. Skips quietly if the accounts are missing. */
async function postCreditJournal(args: {
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
  const entryNumber = await getNextEntryNumber(args.schemeId);
  const amount = fromCents(args.amountCents);
  const entry = await createJournalEntry({
    schemeId: args.schemeId,
    entryNumber,
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
  });
  await postJournalEntry(entry.id, args.actorId);
  if (args.creditTxId) {
    await db.orm.public.OwnerCreditTransaction.where((t) => t.id.eq(args.creditTxId!)).update({ journalEntryId: entry.id });
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
 */
export async function applyOwnerCredit(input: { schemeId: string; lotIds?: string[]; actorId: string; date?: string }) {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const balances = await db.orm.public.OwnerCreditBalance.where((b) => b.schemeId.eq(input.schemeId)).limit(5000).all();
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

    for (const step of plan) {
      const notice = notices.find((n) => n.id === step.noticeId)!;
      const creditTx = await db.transaction(async (tx) => {
        const owed = toCents(String(notice.amountDue)) + toCents(String(notice.interestCharged ?? 0));
        const newPaid = toCents(String(notice.amountPaid)) + step.amountCents;
        const newBalance = Math.max(0, owed - newPaid);
        const receipt = await tx.orm.public.LevyPayment.create({
          schemeId: b.schemeId,
          levyNoticeId: notice.id,
          lotId: b.lotId,
          amount: num(step.amountCents),
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
        return recordCreditMovement(tx.orm, {
          ...key,
          ownerId: notice.ownerId ?? b.ownerId ?? null,
          type: "APPLIED",
          amountCents: step.amountCents,
          levyNoticeId: notice.id,
          levyPaymentId: receipt.id,
          createdBy: input.actorId,
          effectiveDate: date,
        });
      });
      if (advanceId && receivable) {
        await postCreditJournal({
          schemeId: b.schemeId,
          fundId: b.fundId,
          lotId: b.lotId,
          date,
          description: `Owner credit applied to notice ${String(notice.noticeNumber)}`,
          sourceType: "OWNER_CREDIT",
          sourceId: creditTx.id,
          actorId: input.actorId,
          ...creditJournalAccounts("APPLIED", { bankId: "", receivableId: receivable.id, advanceId }),
          amountCents: step.amountCents,
          creditTxId: creditTx.id,
        });
      }
      await logActivity({
        schemeId: b.schemeId,
        actorId: input.actorId,
        action: "OWNER_CREDIT_APPLIED",
        entityType: "LevyNotice",
        entityId: notice.id,
        metadata: { amount: fromCents(step.amountCents), lotId: b.lotId },
      });
      appliedTotal += step.amountCents;
    }
  }
  return appliedTotal;
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
  return postCreditJournal({
    ...args,
    description: `Overpayment held as owner credit (notice ${args.noticeNumber})`,
    sourceType: "OWNER_CREDIT",
    sourceId: args.creditTxId,
    ...creditJournalAccounts("HELD", { bankId: bank.id, receivableId: "", advanceId }),
  });
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
  const { forControls } = loaded;
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
  const creditTx = await db.transaction(async (tx) => {
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
    return movement;
  });

  const advanceId = await leviesInAdvanceAccountId(refund.schemeId, refund.fundId);
  const bank = await getSystemAccountBySubType(refund.schemeId, "BANK", "ADMINISTRATIVE");
  if (advanceId && bank) {
    const journalId = await postCreditJournal({
      ...key,
      date: input.paidOn,
      description: `Owner credit refunded to ${refund.payeeName}`,
      sourceType: "OWNER_CREDIT",
      sourceId: refund.id,
      actorId: input.actorId,
      ...creditJournalAccounts("REFUNDED", { bankId: bank.id, receivableId: "", advanceId }),
      amountCents,
      creditTxId: creditTx.id,
    });
    await db.orm.public.OwnerCreditRefund.where((r) => r.id.eq(refund.id)).update({ journalEntryId: journalId });
  }
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
