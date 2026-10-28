import { logError } from "@/lib/log";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { getSystemAccountBySubType } from "./account-codes";
import {
  createPostedJournalEntryIn,
  getNextEntryNumber,
  lockJournalNumbering,
  validatePeriodForPosting,
} from "./journal-entries";
import { addNumberedJournal, numberedTransaction } from "./journal-numbering";
import { logActivity } from "./activity-log";
import { fromCents, toCents } from "@/lib/billing/money";
import { messageTermsFor, rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { getSchemeInterestSetting, lateChargePosition, noticeLateCharge, statutoryInterestForScheme, type SchemeInterestSetting } from "@/lib/finance/interest-setting";
import { annualLateChargeMissing, annualLateChargeRate, effectiveLateChargeMode, lateChargeApplies, lateChargeFirst } from "@/lib/finance/statutory-interest";
import { livePayments } from "@/lib/finance/levy-reversal";
import { capitalise } from "@/lib/jurisdiction/wording";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric<P extends number = 12, S extends number = 2>(
  value: number | string,
): Numeric<P, S> {
  return String(value) as unknown as Numeric<P, S>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

// ─── Interest Calculation ────────────────────────────────────────

/**
 * Overdue levy notices for a scheme with the late charge owed to date, under
 * the building's `rules.LATE_CHARGE` (NSW, SSMA 2015 s 85: simple interest at
 * 10% a year on the unpaid levy, none if paid within one month of the due
 * date; Queensland: the resolved monthly penalty). See src/config/statutory.ts.
 */
export async function getOverdueLevyNoticesWithInterest(schemeId: string) {
  try {
    const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    const setting = await getSchemeInterestSetting(schemeId);
    const asAt = todayIn(setting.timeZone);
    const interest = await statutoryInterestForScheme(schemeId, asAt);
    const byNotice = new Map(interest.map((i) => [i.noticeId, i]));

    const notices = await db.orm.public.LevyNotice
      .where((ln) =>
        and(
          ln.schemeId.eq(schemeId),
          or(ln.status.eq("ISSUED"), ln.status.eq("PARTIALLY_PAID"), ln.status.eq("OVERDUE")),
          ln.dueDate.lt(toTimestamp(asAt)),
        ),
      )
      .include("lot")
      .include("fund")
      .orderBy((ln) => ln.dueDate.asc())
      .limit(500)
      .all();

    const dayMs = 86_400_000;
    const noticesWithInterest = notices.map((notice) => {
      const i = byNotice.get(notice.id);
      const due = String(notice.dueDate).slice(0, 10);
      const daysOverdue = Math.max(0, Math.round((Date.parse(`${asAt}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / dayMs));
      return {
        ...notice,
        daysOverdue,
        graceEnds: i?.graceEnds ?? null,
        interestReason: i?.reason ?? "NOT_YET_DUE",
        calculatedInterest: fromCents(i?.interestCents ?? 0),
        previouslyCharged: fromCents(i?.previouslyChargedCents ?? 0),
        additionalInterest: fromCents(i?.additionalCents ?? 0),
      };
    });

    const rule = setting.rules.rules.LATE_CHARGE;
    const order = setting.rules.rules.PAYMENT_ALLOCATION_ORDER;
    const charging = lateChargeApplies(rule, setting, order);
    return {
      notices: noticesWithInterest,
      /** The annual rate while it is charged (NSW's fixed rate; the statutory or resolved rate for VIC, ACT and WA), else 0. */
      annualRate: charging ? (rule.annual ? (annualLateChargeRate(rule, setting, order) ?? 0) : (rule.annualRatePercent ?? 0)) : 0,
      /** The resolved monthly rate while it is charged (Queensland), else 0. */
      monthlyRate: charging && rule.annualRatePercent == null && !rule.annual ? (setting.monthlyRatePercent ?? 0) : 0,
      /** An annual-rate rule only (VIC, ACT and WA): the rule values not confirmed, so nothing is charged. */
      ...(rule.annual ? { missing: annualLateChargeMissing(rule, setting, order) } : {}),
      /** Whether the building's setting charges anything. */
      charging,
      mode: setting.mode,
      /** The setting as the pack reads it (a mode the pack does not allow is its default). */
      effectiveMode: effectiveLateChargeMode(rule, setting.mode),
      terms: setting.rules.rules.TERMINOLOGY,
      schemeName: scheme ? String(scheme.name) : "",
    };
  } catch (err) {
    logError("[interest] Failed to calculate interest:", err);
    return null;
  }
}

/**
 * Charge interest on a single overdue levy notice.
 *
 * This:
 * 1. Updates LevyNotice.interestCharged with the new total
 * 2. Updates LevyNotice.balanceOutstanding to include the interest
 * 3. Creates an INTEREST journal entry (DR Levies Receivable, CR Interest Income)
 * 4. Auto-posts the journal entry
 * 5. Logs the activity
 */
export async function chargeInterest(data: {
  schemeId: string;
  noticeId: string;
  interestAmount: number;
  actorId: string;
  /** Set by the batch, which has just worked out the statutory interest for each notice. */
  alreadyVerified?: boolean;
}) {
  const { schemeId, noticeId, interestAmount, actorId } = data;

  if (interestAmount <= 0) {
    throw new Error(`${capitalise((await messageTermsFor(schemeId)).lateCharge)} amount must be greater than zero.`);
  }

  // Fetch the notice to get current values
  const notice = await db.orm.public.LevyNotice
    .where((ln) => ln.id.eq(noticeId))
    .include("fund")
    .first();

  if (!notice || notice.schemeId !== schemeId) {
    throw new Error(`${capitalise((await messageTermsFor(schemeId)).levy)} notice not found.`);
  }

  // The building's rule pack, recorded on the interest journal, and its words for the late charge.
  const { label: rulePack, rules } = await rulesForScheme(schemeId);
  const t = rules.TERMINOLOGY;
  const LateCharge = capitalise(t.lateCharge);

  // Late charge first (Queensland): worked out and charged with the notice locked, like a payment.
  if (lateChargeFirst(rules.PAYMENT_ALLOCATION_ORDER)) {
    return chargeInterestLocked({ ...data, rulePack, terms: t, fundType: String(notice.fund?.fundType ?? "ADMINISTRATIVE") });
  }

  // Never charge more than the statutory interest owed to date.
  const owed = data.alreadyVerified
    ? { additionalCents: Math.round(interestAmount * 100) }
    : (await statutoryInterestForScheme(schemeId)).find((i) => i.noticeId === noticeId);
  if (!owed || Math.round(interestAmount * 100) > owed.additionalCents) {
    throw new Error(
      `No more than $${fromCents(owed?.additionalCents ?? 0).toFixed(2)} of ${t.lateCharge} is owed on this notice to date.`,
    );
  }

  const currentInterest = Number(notice.interestCharged ?? 0);
  const currentBalance = Number(notice.balanceOutstanding);

  const fundType = (notice.fund?.fundType ?? "ADMINISTRATIVE") as
    | "ADMINISTRATIVE"
    | "CAPITAL_WORKS";

  // Look up the required system accounts
  const receivableAccount = await getSystemAccountBySubType(
    schemeId,
    "ACCOUNTS_RECEIVABLE",
    fundType,
  );
  const interestIncomeAccount = await getSystemAccountBySubType(
    schemeId,
    "INTEREST_INCOME",
    fundType,
  );

  if (!receivableAccount || !interestIncomeAccount) {
    throw new Error(
      "Required system accounts (Accounts Receivable and Interest Income) not found. Please seed the chart of accounts first.",
    );
  }

  // Dated today in the building's time zone (not UTC, which is the day before until 10 or 11 am in Sydney).
  const today = await schemeToday(schemeId);
  // Refused before anything is written if today's period is closed or locked.
  await validatePeriodForPosting(schemeId, today, "INTEREST");

  // The notice and the interest journal (DR Levies Receivable, CR Interest
  // Income) together or not at all, numbered under the building's lock, then
  // the notice (as receipting locks them).
  const charged = await numberedTransaction(schemeId, async (tx) => {
    const locked = await lockedNoticeRead(tx, noticeId);
    // Charged at the same moment by another run: the batch skips it, a single charge is refused.
    if (!locked || String(locked.interestCharged ?? 0) !== String(notice.interestCharged ?? 0)) {
      if (data.alreadyVerified) return null;
      throw new Error(`${LateCharge} was charged on notice ${String(notice.noticeNumber)} at the same time. Check the notice and try again.`);
    }
    // A pack with a one-case waiver (VIC, ACT and WA stage 2, PR 5): worked out again under the lock, with the
    // notice's waivers as they stand, so a waiver recorded while this was worked out is respected. NSW and
    // Queensland have none and go on as before.
    if (rules.LATE_CHARGE.annual?.waiver) {
      const setting = await getSchemeInterestSetting(schemeId);
      const payments = livePayments(await tx.orm.public.LevyPayment.where((p) => p.levyNoticeId.eq(noticeId)).limit(5000).all());
      const waivers = await tx.orm.public.LateChargeWaiver.where((w) => w.levyNoticeId.eq(noticeId)).limit(500).all();
      const now = noticeLateCharge(locked, payments, rules.LATE_CHARGE, setting, today, waivers);
      if (Math.round(interestAmount * 100) > now.additionalCents) {
        if (data.alreadyVerified) return null;
        throw new Error(`No more than $${fromCents(now.additionalCents).toFixed(2)} of ${t.lateCharge} is owed on this notice to date.`);
      }
    }
    // Worked out from the notice as it stands under the lock, so a receipt
    // committed while this waited is kept (owed = levy + interest - paid).
    const newInterestCents = cents(locked.interestCharged) + Math.round(interestAmount * 100);
    const newBalanceCents = cents(locked.amountDue) + newInterestCents - cents(locked.amountPaid);
    const newInterest = fromCents(newInterestCents);
    const newBalance = fromCents(newBalanceCents);
    await tx.orm.public.LevyNotice
      .where({ id: noticeId })
      .update({
        interestCharged: toNumeric(newInterest),
        balanceOutstanding: toNumeric(newBalance),
      });

    const journal = await addNumberedJournal(
      tx,
      {
        schemeId,
        transactionDate: today,
        description: `${LateCharge} charged on overdue ${t.levy} — notice ${String(notice.noticeNumber)}`,
        entryType: "INTEREST",
        sourceType: "INTEREST",
        sourceId: noticeId,
        rulePack,
        createdBy: actorId,
        lines: [
          {
            accountCodeId: receivableAccount.id,
            fundId: notice.fundId,
            debit: interestAmount,
            description: `${LateCharge} receivable — notice ${String(notice.noticeNumber)}`,
            lotId: notice.lotId,
          },
          {
            accountCodeId: interestIncomeAccount.id,
            fundId: notice.fundId,
            credit: interestAmount,
            description: `${LateCharge} income on overdue ${t.levy}`,
          },
        ],
      },
      actorId,
    );
    return { ...journal, newInterest, newBalance };
  });
  if (!charged) {
    return { noticeId, interestAmount: 0, totalInterestCharged: currentInterest, newBalance: currentBalance, journalEntryId: null as string | null };
  }
  const { entry, entryNumber, newInterest, newBalance } = charged;

  // Log activity
  await logActivity({
    schemeId,
    actorId,
    action: "INTEREST_CHARGED",
    entityType: "LevyNotice",
    entityId: noticeId,
    metadata: {
      interestAmount,
      totalInterestCharged: newInterest,
      newBalance,
      journalEntryId: entry.id,
      entryNumber,
      rulePack,
    },
  });

  return {
    noticeId,
    interestAmount,
    totalInterestCharged: newInterest,
    newBalance,
    journalEntryId: entry.id as string | null,
  };
}

type Tx = { orm: typeof db.orm };
type LockedNotice = NonNullable<Awaited<ReturnType<typeof lockedNoticeRead>>>;
const lockedNoticeRead = (tx: Tx, noticeId: string) => tx.orm.public.LevyNotice.where((n) => n.id.eq(noticeId)).forNoKeyUpdate().first();
const cents = (v: unknown) => toCents(String(v ?? 0));
const money = (c: number) => toNumeric(fromCents(c));

/** The building's journal numbering lock, taken first by every journal writer (src/lib/queries/journal-entries.ts). */
export { lockJournalNumbering };

/**
 * Lock a levy notice in the caller's transaction (FOR NO KEY UPDATE, held
 * until the transaction ends) and work out, under the lock, where it stands
 * for a payment or a charge dated `asAt`, late charge first (Queensland, SM
 * s 166(5)). Two receipts, a receipt and a charge run, or two runs on the
 * same notice queue on the lock, so the second sees what the first charged
 * and paid and cannot charge the same month again. Nothing is written.
 * Null when the notice is not the building's.
 */
export async function lockLateCharge(tx: Tx, input: { schemeId: string; noticeId: string; asAt: string; setting: SchemeInterestSetting }) {
  const notice = await lockedNoticeRead(tx, input.noticeId);
  if (!notice || notice.schemeId !== input.schemeId) return null;
  const payments = livePayments(await tx.orm.public.LevyPayment.where((p) => p.levyNoticeId.eq(input.noticeId)).limit(5000).all());
  const position = lateChargePosition(notice, payments, input.setting.rules.rules.LATE_CHARGE, input.setting, input.asAt);
  return { notice, payments, position };
}

export interface LateChargeCharged {
  noticeId: string;
  interestAmount: number;
  totalInterestCharged: number;
  newBalance: number;
  journalEntryId: string;
  entryNumber: string;
}

/**
 * Charge a late charge on a notice locked by lockLateCharge, in the same
 * transaction: the notice's late charge and balance, and the journal (DR
 * receivable, CR late charge income, in the notice's fund), posted with it
 * and dated `date` (the payment date, or the run's day), whose period must be
 * open. The caller holds lockJournalNumbering, and logs the activity once the
 * transaction has committed (logLateChargeCharged).
 */
export async function chargeLockedNotice(
  tx: Tx,
  input: {
    schemeId: string;
    notice: LockedNotice;
    amountCents: number;
    date: string;
    actorId: string;
    rulePack: string;
    terms: { lateCharge: string; levy: string };
    /** The notice fund's accounts, found before the transaction (lateChargeAccounts). */
    accounts: LateChargeAccounts | null | undefined;
  },
): Promise<LateChargeCharged> {
  const { notice, amountCents } = input;
  const receivableAccount = input.accounts ? { id: input.accounts.receivableId } : null;
  const interestIncomeAccount = input.accounts ? { id: input.accounts.incomeId } : null;
  if (!receivableAccount || !interestIncomeAccount) {
    throw new Error("Required system accounts (Accounts Receivable and Interest Income) not found. Please seed the chart of accounts first.");
  }
  const totalCents = cents(notice.interestCharged) + amountCents;
  const balanceCents = cents(notice.balanceOutstanding) + amountCents;
  await tx.orm.public.LevyNotice.where((n) => n.id.eq(notice.id)).update({ interestCharged: money(totalCents), balanceOutstanding: money(balanceCents) });
  const LateCharge = capitalise(input.terms.lateCharge);
  const amount = fromCents(amountCents);
  const entryNumber = await getNextEntryNumber(input.schemeId, tx.orm);
  const entry = await createPostedJournalEntryIn(
    tx.orm,
    {
      schemeId: input.schemeId,
      entryNumber,
      transactionDate: input.date,
      description: `${LateCharge} charged on overdue ${input.terms.levy}, notice ${String(notice.noticeNumber)}`,
      entryType: "INTEREST",
      sourceType: "INTEREST",
      sourceId: notice.id,
      rulePack: input.rulePack,
      createdBy: input.actorId,
      lines: [
        { accountCodeId: receivableAccount.id, fundId: notice.fundId, debit: amount, description: `${LateCharge} receivable, notice ${String(notice.noticeNumber)}`, lotId: notice.lotId },
        { accountCodeId: interestIncomeAccount.id, fundId: notice.fundId, credit: amount, description: `${LateCharge} income on overdue ${input.terms.levy}` },
      ],
    },
    input.actorId,
  );
  return { noticeId: notice.id, interestAmount: amount, totalInterestCharged: fromCents(totalCents), newBalance: fromCents(balanceCents), journalEntryId: entry.id, entryNumber };
}

/** The accounts a late charge posts to in one fund: the receivable and the late charge income. */
export interface LateChargeAccounts {
  receivableId: string;
  incomeId: string;
}

/**
 * The late charge accounts for each fund type given, found before a locked
 * transaction opens, so it makes no second connection while it holds the
 * locks. A fund type whose accounts are missing is left out (charging then
 * refuses, as chargeInterest does).
 */
export async function lateChargeAccounts(schemeId: string, fundTypes: Iterable<string>): Promise<Map<string, LateChargeAccounts>> {
  const out = new Map<string, LateChargeAccounts>();
  for (const fundType of new Set(fundTypes)) {
    const t = (fundType || "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
    const [receivable, income] = await Promise.all([
      getSystemAccountBySubType(schemeId, "ACCOUNTS_RECEIVABLE", t),
      getSystemAccountBySubType(schemeId, "INTEREST_INCOME", t),
    ]);
    if (receivable && income) out.set(t, { receivableId: receivable.id, incomeId: income.id });
  }
  return out;
}

/** The activity for a late charge charged under a lock, once its transaction has committed. */
export async function logLateChargeCharged(schemeId: string, actorId: string, rulePack: string, c: LateChargeCharged) {
  await logActivity({
    schemeId,
    actorId,
    action: "INTEREST_CHARGED",
    entityType: "LevyNotice",
    entityId: c.noticeId,
    metadata: {
      interestAmount: c.interestAmount,
      totalInterestCharged: c.totalInterestCharged,
      newBalance: c.newBalance,
      journalEntryId: c.journalEntryId,
      entryNumber: c.entryNumber,
      rulePack,
    },
  });
}

/**
 * chargeInterest for a building that applies payments to the late charge
 * first: the amount owed is worked out again with the notice locked, so a
 * receipt or another run at the same time cannot make it charge twice. From
 * the run (`alreadyVerified`), it charges what is owed under the lock, which
 * may be less than the run worked out, or nothing (interestAmount 0, no
 * journal). Otherwise it refuses more than is owed.
 */
async function chargeInterestLocked(data: {
  schemeId: string;
  noticeId: string;
  interestAmount: number;
  actorId: string;
  alreadyVerified?: boolean;
  rulePack: string;
  terms: { lateCharge: string; levy: string };
  fundType: string;
}) {
  const setting = await getSchemeInterestSetting(data.schemeId);
  const asAt = todayIn(setting.timeZone);
  const accounts = (await lateChargeAccounts(data.schemeId, [data.fundType])).get(data.fundType);
  const wanted = Math.round(data.interestAmount * 100);
  const charged = await numberedTransaction(data.schemeId, async (tx) => {
    const locked = await lockLateCharge(tx, { schemeId: data.schemeId, noticeId: data.noticeId, asAt, setting });
    if (!locked) throw new Error(`${capitalise(data.terms.levy)} notice not found.`);
    const owed = locked.position.additionalCents;
    if (!data.alreadyVerified && wanted > owed) {
      throw new Error(`No more than $${fromCents(owed).toFixed(2)} of ${data.terms.lateCharge} is owed on this notice to date.`);
    }
    const amountCents = Math.min(wanted, owed);
    if (amountCents <= 0) return null;
    return chargeLockedNotice(tx, { schemeId: data.schemeId, notice: locked.notice, amountCents, date: asAt, actorId: data.actorId, rulePack: data.rulePack, terms: data.terms, accounts });
  });
  if (!charged) {
    const n = await db.orm.public.LevyNotice.where((x) => x.id.eq(data.noticeId)).first();
    return { noticeId: data.noticeId, interestAmount: 0, totalInterestCharged: Number(n?.interestCharged ?? 0), newBalance: Number(n?.balanceOutstanding ?? 0), journalEntryId: null as string | null };
  }
  await logLateChargeCharged(data.schemeId, data.actorId, data.rulePack, charged);
  return { noticeId: charged.noticeId, interestAmount: charged.interestAmount, totalInterestCharged: charged.totalInterestCharged, newBalance: charged.newBalance, journalEntryId: charged.journalEntryId as string | null };
}

/**
 * Charge interest on all overdue levy notices for a scheme in one batch.
 * Only charges notices that have additional interest owed (calculatedInterest > previouslyCharged).
 */
export async function chargeInterestBatch(data: {
  schemeId: string;
  actorId: string;
}) {
  const { schemeId, actorId } = data;

  const result = await getOverdueLevyNoticesWithInterest(schemeId);
  if (!result) {
    return { charged: 0, totalInterest: 0, results: [] };
  }
  const { notices, effectiveMode, charging, terms: t } = result;

  if ("missing" in result && result.missing && result.missing.length > 0) {
    throw new Error(`No ${t.lateCharge} can be charged yet, because this building's rules do not yet confirm how it is worked out.`);
  }
  if (effectiveMode === "NO_INTEREST") {
    throw new Error(
      `The ${t.ownersCorporation} has resolved that contributions bear no ${t.lateCharge}, so none can be charged.`,
    );
  }
  if (!charging) {
    throw new Error(`No ${t.lateCharge} applies until the ${t.ownersCorporation} records the resolution that sets its rate, so none can be charged.`);
  }

  const chargeable = notices.filter((n) => n.additionalInterest > 0);

  if (chargeable.length === 0) {
    return { charged: 0, totalInterest: 0, results: [] };
  }

  const results = [];
  let totalInterest = 0;

  for (const notice of chargeable) {
    const chargeResult = await chargeInterest({
      schemeId,
      noticeId: notice.id,
      interestAmount: notice.additionalInterest,
      actorId,
      alreadyVerified: true,
    });
    // Late charge first: a receipt at the same moment may have charged it already (worked out again under the notice's lock).
    if (chargeResult.interestAmount <= 0) continue;
    results.push(chargeResult);
    // What was charged, which under the lock may be less than the run worked out.
    totalInterest += chargeResult.interestAmount;
  }

  return {
    charged: results.length,
    totalInterest,
    results,
  };
}
