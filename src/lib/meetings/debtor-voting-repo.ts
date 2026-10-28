/**
 * Checking a vote for money owed (DB access; stage 2, step 7).
 *
 * Reads the building's pack first: where its meeting rules record no debtor
 * voting rule (NSW) nothing else is read and the vote goes ahead as before.
 * Otherwise the lot owes money when an issued levy notice is past its due
 * date and not fully paid (`lotFinancialStatus`, the roll's rule), on the
 * building's today. Checked when an owner casts a vote online, and, through
 * `lotsOwingMoney` on the meeting's day, on the votes the chair records at a
 * general meeting (resolution tallies, 27 Oct 2026). Both judge each lot on
 * its own (`debtorBarsLot`), so an owner's lots that owe nothing still vote.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { rulePackFor } from "@/config/statutory";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { lotFinancialStatus, UNFINANCIAL_NOTICE_STATUSES } from "@/lib/levies/financial-status";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { checksDebtorVotes, debtorBarsLot, debtorVoteRefusal } from "./debtor-voting";

/**
 * Which of `lotIds` owe the body corporate money on `asOf` (yyyy-mm-dd),
 * by default the building's today. Reads only the notices that can make a lot
 * owe: issued, not paid in full, due before that day, with no row limit, so
 * no overdue notice can be missed.
 */
export async function lotsOwingMoney(
  scheme: { id: string; timeZone: string | null },
  lotIds: readonly string[],
  asOf?: string,
): Promise<Set<string>> {
  const ids = [...new Set(lotIds)];
  if (ids.length === 0) return new Set();
  const day = asOf ?? todayIn(timeZoneOf(scheme));
  const notices = await db.orm.public.LevyNotice
    .where((n) =>
      and(
        n.schemeId.eq(scheme.id),
        n.lotId.in(ids),
        n.status.in([...UNFINANCIAL_NOTICE_STATUSES]),
        n.dueDate.lt(day as unknown as TimestampString<3>),
      ),
    )
    .all();
  const byLot = new Map<string, (typeof notices)[number][]>();
  for (const n of notices) {
    const list = byLot.get(n.lotId);
    if (list) list.push(n);
    else byLot.set(n.lotId, [n]);
  }
  return new Set(ids.filter((lotId) => !lotFinancialStatus(byLot.get(lotId) ?? [], day).financial));
}

/** Which lots a vote may be cast for, and why it is refused when none. */
export interface DebtorVoteCheck {
  /** The lots asked about that may vote on the item, in the order given. */
  mayVote: string[];
  /** Why the vote is refused, or null. Refused only when none of the lots may vote. */
  refusal: string | null;
}

/**
 * Checks `lotIds`, the lots a vote would be cast for, lot by lot: a lot that
 * owes money is barred where the pack says (Queensland SM s 102(2)), and the
 * same owner's lots that owe nothing may still vote. The vote is refused only
 * when none of them may vote. Under a pack with no such rule (NSW) every lot
 * may vote and nothing else is read. Nothing is written.
 */
export async function debtorVoteCheck(params: {
  schemeId: string;
  lotIds: readonly string[];
  category: string | null | undefined;
}): Promise<DebtorVoteCheck> {
  const lotIds = [...new Set(params.lotIds)];
  const everyLot: DebtorVoteCheck = { mayVote: lotIds, refusal: null };
  if (lotIds.length === 0) return everyLot;
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(params.schemeId)).first();
  // No building or no pack: the action's own checks decide.
  const pack = scheme ? rulePackFor(scheme.state) : null;
  if (!scheme || !pack) return everyLot;
  const ruleSet = pack.rules.MEETING_RULES;
  if (!checksDebtorVotes(ruleSet)) return everyLot;
  // A category the debtor may vote on needs no lookup.
  if (debtorVoteRefusal(ruleSet, params.category, true, "") == null) return everyLot;

  const owing = await lotsOwingMoney({ id: params.schemeId, timeZone: scheme.timeZone }, lotIds);
  const mayVote = lotIds.filter((lotId) => !debtorBarsLot(ruleSet, params.category, lotId, owing));
  return {
    mayVote,
    refusal:
      mayVote.length > 0
        ? null
        : debtorVoteRefusal(ruleSet, params.category, true, pack.rules.TERMINOLOGY.ownersCorporation),
  };
}

/**
 * Why the vote is refused, or null when it may be cast. `lotIds` are the
 * lots the vote is cast for. Each is judged on its own, so the vote stands
 * for those that owe nothing and is refused only when every one of them owes
 * (`debtorVoteCheck`). Nothing is written.
 */
export async function debtorVoteProblem(params: {
  schemeId: string;
  lotIds: readonly string[];
  category: string | null | undefined;
}): Promise<string | null> {
  return (await debtorVoteCheck(params)).refusal;
}
