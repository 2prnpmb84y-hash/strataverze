/**
 * Voting by an owner whose lot owes the body corporate money (pure; stage 2,
 * step 7, 27 Oct 2026).
 *
 * A pack that records the rule lists the only categories such an owner may
 * vote on (`MEETING_RULES.debtorsMayVoteOn`; Queensland SM s 102(2): a
 * resolution without dissent). A pack that records none (NSW) is not checked,
 * so its votes are taken as before.
 */
import type { MeetingRuleSet } from "./rules";

/** Whether the building's rule set checks votes for money owed. */
export function checksDebtorVotes(ruleSet: Pick<MeetingRuleSet, "debtorsMayVoteOn">): boolean {
  return ruleSet.debtorsMayVoteOn != null;
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
