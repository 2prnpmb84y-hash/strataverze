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
 * Calculate simple interest for a single overdue levy notice.
 *
 * Formula: interest = (balanceOutstanding * annualRate / 100 * daysOverdue) / 365
 *
 * Returns the calculated interest amount rounded to 2 decimal places.
 */
export function calculateInterestForNotice(
  balanceOutstanding: number,
  dueDate: string | Date,
  annualRatePercent: number,
  asAtDate?: Date,
): number {
  if (annualRatePercent <= 0 || balanceOutstanding <= 0) return 0;

  const due = new Date(String(dueDate));
  const now = asAtDate ?? new Date();
  const diffMs = now.getTime() - due.getTime();
  const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (daysOverdue <= 0) return 0;

  const interest =
    (balanceOutstanding * (annualRatePercent / 100) * daysOverdue) / 365;

  return Math.round(interest * 100) / 100;
}

/**
 * Fetch overdue levy notices for a scheme with calculated interest amounts.
 * Includes the scheme's interest rate and computes per-notice interest.
 */
export async function getOverdueLevyNoticesWithInterest(schemeId: string) {
  try {
    // Get the scheme's interest rate
    const scheme = await db.orm.public.Scheme
      .where((s) => s.id.eq(schemeId))
      .first();

    const annualRate = Number(scheme?.interestRate ?? 0);

    // Fetch overdue notices
    const today = new Date().toISOString().split("T")[0];
    const notices = await db.orm.public.LevyNotice
      .where((ln) =>
        and(
          ln.schemeId.eq(schemeId),
          or(ln.status.eq("ISSUED"), ln.status.eq("PARTIALLY_PAID")),
          ln.dueDate.lt(toTimestamp(today)),
        ),
      )
      .include("lot")
      .include("fund")
      .orderBy((ln) => ln.dueDate.asc())
      .limit(500)
      .all();

    const now = new Date();

    const noticesWithInterest = notices.map((notice) => {
      const balance = Number(notice.balanceOutstanding);
      const dueDate = String(notice.dueDate);
      const due = new Date(dueDate);
      const diffMs = now.getTime() - due.getTime();
      const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      const calculatedInterest = calculateInterestForNotice(
        balance,
        dueDate,
        annualRate,
        now,
      );
      const previouslyCharged = Number(notice.interestCharged ?? 0);
      const additionalInterest = Math.max(
        0,
        Math.round((calculatedInterest - previouslyCharged) * 100) / 100,
      );

      return {
        ...notice,
        daysOverdue,
        calculatedInterest,
        previouslyCharged,
        additionalInterest,
      };
    });

    return {
      notices: noticesWithInterest,
      annualRate,
      schemeName: scheme ? String(scheme.name) : "",
    };
  } catch {
    // Table may not exist yet
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

  if (!notice) {
    throw new Error("Levy notice not found.");
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
  const today = new Date().toISOString().split("T")[0];

  const entry = await createJournalEntry({
    schemeId,
    entryNumber,
    transactionDate: today,
    description: `Interest charged on overdue levy — notice ${String(notice.noticeNumber)}`,
    entryType: "INTEREST",
    sourceType: "INTEREST",
    sourceId: noticeId,
    createdBy: actorId,
    lines: [
      {
        accountCodeId: receivableAccount.id,
        fundId: notice.fundId,
        debit: interestAmount,
        description: `Interest receivable — notice ${String(notice.noticeNumber)}`,
        lotId: notice.lotId,
      },
      {
        accountCodeId: interestIncomeAccount.id,
        fundId: notice.fundId,
        credit: interestAmount,
        description: `Interest income on overdue levy`,
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
  const { notices, annualRate } = result;

  if (annualRate <= 0) {
    throw new Error(
      "No interest rate configured for this scheme. Set an interest rate in scheme settings first.",
    );
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
