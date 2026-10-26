/**
 * A fund's position from the ledger (financials review B2 to B5, 26 Oct 2026).
 *
 * Every report that shows a fund balance or cash uses these, so they all
 * agree with the trial balance:
 *
 * - Fund balance (owners' funds): the fund's assets less its liabilities, from
 *   every ledger line dated on or before the day. This includes the opening
 *   balances brought forward at takeover, which sit in the balance sheet and
 *   equity accounts, not in income.
 * - Cash: the fund's share of the bank account (the bank lines tagged to the
 *   fund), on or before the day.
 *
 * The `balance` column on a fund is not used: it was a number set when the
 * fund was created and never changed by posting.
 */
import { db } from "@/prisma/db";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { LEDGER_STATUSES } from "./ledger-status";
import type { BasisEntry } from "./accounting-basis";

export interface FundPosition {
  /** Assets less liabilities, in cents. */
  balanceCents: number;
  /** The fund's bank lines (debits less credits), in cents. */
  cashCents: number;
}

/** Each fund's position from ledger lines up to and including `asAt` (YYYY-MM-DD). */
export function fundPositions(entries: Pick<BasisEntry, "date" | "lines">[], asAt: string): Map<string, FundPosition> {
  const out = new Map<string, FundPosition>();
  for (const e of entries) {
    if (e.date > asAt) continue;
    for (const l of e.lines) {
      const p = out.get(l.fundId) ?? { balanceCents: 0, cashCents: 0 };
      if (l.accountType === "ASSET") p.balanceCents += l.debitCents - l.creditCents;
      else if (l.accountType === "LIABILITY") p.balanceCents -= l.creditCents - l.debitCents;
      if (l.accountSubType === "BANK") p.cashCents += l.debitCents - l.creditCents;
      out.set(l.fundId, p);
    }
  }
  return out;
}

/** The most ledger lines read at once. Above this the totals would be wrong, so it stops instead. */
const LINE_LIMIT = 200_000;

export class LedgerTooLargeError extends Error {
  constructor() {
    super("This scheme has more ledger lines than the report can read at once. Contact StrataVerze.");
    this.name = "LedgerTooLargeError";
  }
}

/** The scheme's ledger lines on or before `asAt`, with their account types. */
export async function ledgerLinesUpTo(schemeId: string, asAt: string): Promise<Pick<BasisEntry, "date" | "lines">[]> {
  const entries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.in(LEDGER_STATUSES),
        je.transactionDate.lte(asAt as unknown as TimestampString<3>),
      ),
    )
    .include("lines", (l) => l.include("accountCode"))
    .limit(LINE_LIMIT)
    .all();
  if (entries.length >= LINE_LIMIT) throw new LedgerTooLargeError();
  let lineCount = 0;
  const out = entries.map((e) => ({
    date: String(e.transactionDate).slice(0, 10),
    lines: (e.lines ?? [])
      .filter((l) => l.accountCode)
      .map((l) => {
        lineCount++;
        return {
          accountId: l.accountCodeId,
          accountCode: String(l.accountCode!.code),
          accountName: String(l.accountCode!.name),
          accountType: String(l.accountCode!.accountType),
          accountSubType: l.accountCode!.accountSubType ?? null,
          fundId: l.fundId,
          debitCents: Math.round(Number(l.debit ?? 0) * 100),
          creditCents: Math.round(Number(l.credit ?? 0) * 100),
        };
      }),
  }));
  if (lineCount >= LINE_LIMIT) throw new LedgerTooLargeError();
  return out;
}

/** Each fund's position as at a day (default: today in the building's time zone). */
export async function getFundPositions(schemeId: string, asAtDay?: string) {
  const asAt = asAtDay ?? (await schemeToday(schemeId));
  return fundPositions(await ledgerLinesUpTo(schemeId, asAt), asAt);
}

/** Funds with `balance` replaced by the ledger balance as at today, for screens that show a fund's balance. */
export async function withLedgerBalances<F extends { id: string; schemeId: string }>(funds: F[], asAt?: string): Promise<(F & { balance: number; cash: number })[]> {
  const schemeIds = [...new Set(funds.map((f) => f.schemeId))];
  const bySchemeId = new Map<string, Map<string, FundPosition>>();
  await Promise.all(schemeIds.map(async (s) => bySchemeId.set(s, await getFundPositions(s, asAt))));
  return funds.map((f) => {
    const p = bySchemeId.get(f.schemeId)?.get(f.id) ?? { balanceCents: 0, cashCents: 0 };
    return { ...f, balance: p.balanceCents / 100, cash: p.cashCents / 100 };
  });
}
