/**
 * Voting by an owner whose lot owes the body corporate money (pure; stage 2,
 * step 7, 27 Oct 2026).
 *
 * A pack that records the rule lists the only categories such an owner may
 * vote on (`MEETING_RULES.debtorsMayVoteOn`; Queensland SM s 102(2): a
 * resolution without dissent). A pack that records none (NSW) is not checked,
 * so its votes are taken as before.
 *
 * The rule is applied lot by lot: a lot that owes is barred, and the same
 * owner's lots that owe nothing still vote (`debtorBarsLot`, used both for an
 * owner's own vote online and for the votes the chair records).
 */
import type { MeetingRuleSet } from "./rules";

/** Whether the building's rule set checks votes for money owed. */
export function checksDebtorVotes(ruleSet: Pick<MeetingRuleSet, "debtorsMayVoteOn">): boolean {
  return ruleSet.debtorsMayVoteOn != null;
}

/**
 * Whether the pack's debtor rule applies to the building (VIC, ACT and WA
 * stage 2, PR 8a-ii, 29 Oct 2026). A pack with no `debtorRuleAppliesWhen`
 * applies it to every building. Otherwise `holds` is whether the building
 * meets the condition, as `conditionHolds` gives it: the rule does not apply
 * only where it is known not to hold (the ACT with 1 or 2 members, a tier 5
 * Victorian owners corporation). Where it cannot be worked out (null), the
 * rule applies: it fails closed.
 */
export function debtorRuleApplies(ruleSet: Pick<MeetingRuleSet, "debtorRuleAppliesWhen">, holds: boolean | null): boolean {
  return !ruleSet.debtorRuleAppliesWhen || holds !== false;
}

/**
 * Whether one lot's vote on an item of `category` is barred because the lot
 * owes money (it is in `owingLotIds`). Judged for that lot alone, whoever owns
 * it and whatever else they own. Never barred under a pack with no such rule,
 * or where the rule does not apply to the building (`ruleApplies` false, from
 * debtorRuleApplies; true where not given).
 */
export function debtorBarsLot(
  ruleSet: Pick<MeetingRuleSet, "debtorsMayVoteOn" | "resolutionLabels">,
  category: string | null | undefined,
  lotId: string,
  owingLotIds: ReadonlySet<string>,
  ruleApplies: boolean = true,
): boolean {
  return ruleApplies && owingLotIds.has(lotId) && debtorVoteRefusal(ruleSet, category, true, "") != null;
}

/**
 * Why the vote is refused, or null when it may be cast. `category` is the
 * motion's resolution category, `owesMoney` whether the lot has an overdue
 * amount unpaid, and `ownersCorporation` the building's word for the body
 * that is owed ("body corporate").
 *
 * An item with no category is not a resolution (the committee election in
 * the Queensland AGM template), and SM s 102(2) lets a lot owing money vote in
 * a committee election, so it is never refused here.
 */
export function debtorVoteRefusal(
  ruleSet: Pick<MeetingRuleSet, "debtorsMayVoteOn" | "resolutionLabels">,
  category: string | null | undefined,
  owesMoney: boolean,
  ownersCorporation: string,
): string | null {
  const allowed = ruleSet.debtorsMayVoteOn;
  if (!allowed || !owesMoney) return null;
  if (!category || !category.trim()) return null;
  if ((allowed as readonly string[]).includes(category)) return null;
  const names = allowed.map((c) => (ruleSet.resolutionLabels[c]?.full ?? c).toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
  return list
    ? `Your lot has an overdue amount owing to the ${ownersCorporation}, so it cannot vote on this motion. Until it is paid, the lot can vote only on a ${list}.`
    : `Your lot has an overdue amount owing to the ${ownersCorporation}, so it cannot vote on this motion until it is paid.`;
}
