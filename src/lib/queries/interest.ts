import { logError } from "@/lib/log";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { getSystemAccountBySubType } from "./account-codes";
import {
  createJournalEntry,
  postJournalEntry,
  getNextEntryNumber,
} from "./journal-entries";
import { logActivity } from "./activity-log";
import { fromCents } from "@/lib/billing/money";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { getSchemeInterestSetting, statutoryInterestForScheme } from "@/lib/finance/interest-setting";
import { effectiveLateChargeMode, lateChargeApplies } from "@/lib/finance/statutory-interest";
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
    const charging = lateChargeApplies(rule, setting);
    return {
      notices: noticesWithInterest,
      /** The fixed annual rate while it is charged (NSW), else 0. */
      annualRate: charging ? (rule.annualRatePercent ?? 0) : 0,
      /** The resolved monthly rate while it is charged (Queensland), else 0. */
      monthlyRate: charging && rule.annualRatePercent == null ? (setting.monthlyRatePercent ?? 0) : 0,
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
    throw new Error("Interest amount must be greater than zero.");
  }

  // Fetch the notice to get current values
  const notice = await db.orm.public.LevyNotice
    .where((ln) => ln.id.eq(noticeId))
    .include("fund")
    .first();

  if (!notice || notice.schemeId !== schemeId) {
    throw new Error("Levy notice not found.");
  }

  // The building's rule pack, recorded on the interest journal, and its words for the late charge.
  const { label: rulePack, rules } = await rulesForScheme(schemeId);
  const t = rules.TERMINOLOGY;
  const LateCharge = capitalise(t.lateCharge);

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
  const newInterest = currentInterest + interestAmount;
  const newBalance = currentBalance + interestAmount;

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

  // Update the levy notice
  await db.orm.public.LevyNotice
    .where({ id: noticeId })
    .update({
      interestCharged: toNumeric(newInterest),
      balanceOutstanding: toNumeric(newBalance),
    });

  // Create and post the interest journal entry
  const entryNumber = await getNextEntryNumber(schemeId);
  // Dated today in the building's time zone (not UTC, which is the day before until 10 or 11 am in Sydney).
  const today = await schemeToday(schemeId);

  const entry = await createJournalEntry({
    schemeId,
    entryNumber,
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
  });

  await postJournalEntry(entry.id, actorId);

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
    journalEntryId: entry.id,
  };
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
    results.push(chargeResult);
    totalInterest += notice.additionalInterest;
  }

  return {
    charged: results.length,
    totalInterest,
    results,
  };
}
