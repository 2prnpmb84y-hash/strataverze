/**
 * Counting the votes at conduct (pure; QLD stage 2, resolution tallies,
 * 27 Oct 2026).
 *
 * Where the building's rule set has a resolution that needs the lots and
 * entitlements of the whole scheme (Queensland's special and majority
 * resolutions), the outcome the chair records at a general meeting is checked
 * against a tally of the votes: the formal online votes on the item plus the
 * votes the chair records for each lot. A committee meeting is decided by its
 * members, not the lots, and is not counted. NSW has no such resolution, so
 * its conduct takes the chair's outcome as before and none of this runs.
 * A majority resolution is decided on written votes (Act s 107), which are
 * not recorded yet, so it cannot be recorded as resolved here.
 *
 * - One vote per lot. A proxy's vote is the lot's vote, except on a category
 *   the pack bars proxies on (Queensland: a majority resolution).
 * - A lot owing money is not counted on a category outside the pack's
 *   `debtorsMayVoteOn` (Queensland SM s 102(2)), judged lot by lot: the same
 *   owner's lots that owe nothing are counted. An item with no category
 *   (a committee election) is not a resolution and counts it.
 * - The totals come from every lot of the building: the number of lots
 *   (Act s 106(3)(b)), the entitlement the pack says decides the special
 *   resolution test (s 106(3)(c)), and for a majority resolution the lots
 *   entitled to vote (s 107), which leaves out the lots owing money.
 * - A poll is taken only on a category the pack lists (s 109), counted by the
 *   entitlement the pack says decides a poll vote (s 110(3)).
 * - Anything missing fails closed: nothing is counted and the chair is told
 *   what to fix.
 *
 * The draft packs (VIC, ACT and WA stage 2, PR 8a-i, 28 Oct 2026) count the
 * same way, with what their own tests need: the totals of every lot, their
 * entitlement, the votes those present could cast, the lots recorded and the
 * building's band of members (BASIS_NEEDS). They leave common property rows
 * out of the lots. A resolution decided only when its voting period closes
 * (Western Australia) is refused before anything is read. An item with no
 * category cannot be recorded as resolved at their general meetings, since
 * nothing counts it (uncategorisedRefusal).
 */
import type { StatutoryRules } from "@/config/statutory";
import {
  EntitlementRuleError,
  MissingEntitlementError,
  lotEntitlementFor,
  scheduleFor,
  type EntitlementUse,
  type LotEntitlements,
} from "@/lib/jurisdiction/building-data";
import { debtorBarsLot } from "./debtor-voting";
import {
  isResolutionCategory,
  usesDraftKeys,
  type MeetingRuleSet,
  type ResolutionCategory,
  type ResolutionRule,
  type ResolutionTally,
} from "./rules";
import type { Outcome, OutcomeResult } from "./conduct";

/** What the count needs for a resolution, beyond the votes. */
interface CountNeeds {
  /** The building's number of lots, checked against the lots entered. */
  totals: boolean;
  /** The votes those present could cast (AGAINST_SHARE_OF_VOTES_PRESENT). */
  votesPresent: boolean;
  /** The lots with a vote recorded (EVERY_LOT_RECORDED_NONE_AGAINST). */
  lotsRecorded: boolean;
}

/**
 * What each basis needs counted. Queensland's two (special and majority
 * resolutions) need the scheme's totals; the draft packs' as their tests say.
 * The entitlement totals and the band of members a draft rule needs depend
 * on its fields and variants (draftNeeds).
 */
const BASIS_NEEDS: Readonly<Record<ResolutionRule["basis"], Partial<CountNeeds>>> = {
  COUNT_MAJORITY: {},
  UE_AGAINST_THRESHOLD: {},
  NO_AGAINST: {},
  TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: { totals: true },
  MORE_THAN_HALF_OF_LOTS: { totals: true },
  SHARE_OF_ALL_LOTS: { totals: true },
  AGAINST_SHARE_OF_VOTES_PRESENT: { votesPresent: true },
  NONE_AGAINST_AT_LEAST_ONE_FOR: {},
  EVERY_LOT_RECORDED_NONE_AGAINST: { totals: true, lotsRecorded: true },
  BY_VARIANT: {},
};

/** A rule and its variants' rules. */
const withVariants = (rule: ResolutionRule): ResolutionRule[] => [rule, ...(rule.variants ?? []).map((v) => v.rule)];

/** Whether the count needs the building's totals for this rule (Queensland's special and majority resolutions, and the draft packs' as their tests say). */
function rulesNeedTotals(rule: ResolutionRule): boolean {
  return (
    withVariants(rule).some((r) => !!BASIS_NEEDS[r.basis]?.totals) ||
    !!rule.variants?.some((v) => v.when.lotsAtLeast != null || v.when.lotsAtMost != null)
  );
}

/**
 * What a draft pack's rule needs beyond Queensland's (VIC, ACT and WA stage 2,
 * PR 8a-i). All false for an NSW or Queensland rule, so their count is as before.
 */
function draftNeeds(rule: ResolutionRule, poll: boolean) {
  const rules = usesDraftKeys(rule) ? withVariants(rule) : [];
  return {
    entitlement: rules.some(
      (r) =>
        r.basis === "SHARE_OF_ALL_LOTS" &&
        (r.forAtLeastFractionOfAllEntitlement != null ||
          r.againstLessThanFractionOfAllEntitlement != null ||
          (poll && r.pollForAtLeastFractionOfAllEntitlement != null)),
    ),
    entitlementUse: rules.find((r) => r.entitlementUse)?.entitlementUse ?? ("SPECIAL_RESOLUTION" as const),
    votesPresent: rules.some((r) => !!BASIS_NEEDS[r.basis]?.votesPresent),
    lotsRecorded: rules.some((r) => !!BASIS_NEEDS[r.basis]?.lotsRecorded),
    memberBand: !!rule.variants?.some((v) => !!v.when.memberBands),
  };
}

/**
 * Whether a rule is counted at conduct: a basis needing the scheme's totals
 * (Queensland), or any rule of a draft pack, whose tests are all checked
 * against the count.
 */
function countedRule(rule: ResolutionRule): boolean {
  return rulesNeedTotals(rule) || usesDraftKeys(rule);
}

/** Whether conduct counts the votes for the building: its rule set has a resolution needing the scheme's totals, or a draft pack's resolution. */
export function countsVotesAtConduct(ruleSet: Pick<MeetingRuleSet, "resolutionCategories">): boolean {
  return Object.values(ruleSet.resolutionCategories).some((rule) => !!rule && countedRule(rule));
}

/** Whether the count of an item needs the building's band of members (the ACT). */
export function countNeedsMemberBand(ruleSet: MeetingRuleSet, category: string | null | undefined): boolean {
  if (!isResolutionCategory(ruleSet, category)) return false;
  const rule = ruleSet.resolutionCategories[category];
  return !!rule && draftNeeds(rule, false).memberBand;
}

/** Whether a lot row is a lot, not the common property (as the building facts read it). */
const isLotRow = (l: { lotType?: string | null }) => String(l.lotType ?? "").toUpperCase() !== "COMMON";

/** A committee meeting: its members vote, not the lots (Queensland SM ss 60, 68). */
export function isCommitteeMeeting(meetingType: string | null | undefined): boolean {
  return String(meetingType ?? "").trim().toUpperCase() === "COMMITTEE";
}

/**
 * Whether conduct counts the votes on this meeting: a general meeting of a
 * building that counts them. A committee meeting is decided by its voting
 * members, so the chair's outcome is taken as before. Any other meeting type,
 * even one not known, is counted (it fails closed).
 */
export function countsVotesAtMeeting(
  ruleSet: Pick<MeetingRuleSet, "resolutionCategories">,
  meetingType: string | null | undefined,
): boolean {
  return countsVotesAtConduct(ruleSet) && !isCommitteeMeeting(meetingType);
}

export const CHAIR_VOTE_VALUES = ["FOR", "AGAINST", "ABSTAIN"] as const;
export type ChairVoteValue = (typeof CHAIR_VOTE_VALUES)[number];

/** A lot's vote as the chair records it at the meeting. */
export interface ChairVote {
  lotId: string;
  vote: ChairVoteValue;
  byProxy: boolean;
}

/**
 * The chair's votes as sent from the browser, or null when they are not well
 * formed. One vote per lot, so there can be no more than `lotCount` of them.
 */
export function parseChairVotes(input: unknown, lotCount: number): ChairVote[] | null {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > lotCount) return null;
  const votes: ChairVote[] = [];
  for (const v of input) {
    if (!v || typeof v !== "object") return null;
    const { lotId, vote, byProxy } = v as Record<string, unknown>;
    if (typeof lotId !== "string" || !lotId) return null;
    if (typeof vote !== "string" || !(CHAIR_VOTE_VALUES as readonly string[]).includes(vote)) return null;
    if (byProxy != null && typeof byProxy !== "boolean") return null;
    votes.push({ lotId, vote: vote as ChairVoteValue, byProxy: byProxy === true });
  }
  return votes;
}

/** A vote cast online (the pre-meeting ballot), as stored. */
export interface OnlineVote {
  lotId: string | null;
  voteValue: string;
  isInformal: boolean;
}

/** A lot of the building, with the entitlements it holds. */
export interface TallyLot extends LotEntitlements {
  id: string;
  lotNumber: string;
  /** The lot's type, where read: a common property row ("COMMON") is left out where the pack says so. */
  lotType?: string | null;
}

export interface CountedVote {
  lotId: string;
  lotNumber: string;
  vote: ChairVoteValue;
  byProxy: boolean;
  source: "ONLINE" | "CHAIR";
}

export interface ConductTally {
  /** Null for an item with no category: not a resolution, so the chair's outcome stands. */
  tally: ResolutionTally | null;
  counted: CountedVote[];
  /** Votes from lots owing money on a category they may not vote on. */
  notCounted: CountedVote[];
}

export type ConductTallyResult = { ok: true; value: ConductTally } | { ok: false; error: string };

const lotList = (numbers: readonly string[]) =>
  numbers.length > 1 ? `lots ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}` : `lot ${numbers[0]}`;

const orList = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];

/** "a" or "an" before a name, by its first letter. */
const article = (text: string) => (/^[aeiou]/i.test(text) ? `an ${text}` : `a ${text}`);

/** "A" or "An" before a name at the start of a sentence, by its first sound: "A unanimous resolution" (the draft packs' words). */
const sentenceArticle = (text: string) => (/^[aeiou]/i.test(text) && !/^(?:unan|uni|use|usu)/i.test(text) ? `An ${text}` : `A ${text}`);

/**
 * The tally for one agenda item, from the building's lots and the votes. A
 * category the rule set does not have, a vote for a lot outside the
 * building, a lot with two votes, a proxy where the pack bars one, a poll the
 * pack does not allow, a lot count that differs from the building's, or a
 * missing entitlement the count needs: each refuses, and nothing is counted.
 */
export function buildConductTally(input: {
  ruleSet: MeetingRuleSet;
  rules: Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES">;
  category: string | null | undefined;
  /** Every lot of the building. */
  lots: readonly TallyLot[];
  /** The number of lots the building records, checked against `lots` where the count needs the totals. */
  recordedLotCount: number | null;
  onlineVotes: readonly OnlineVote[];
  chairVotes: readonly ChairVote[];
  poll: boolean;
  /** The lots owing money on the building's today. */
  owingLotIds: ReadonlySet<string>;
  /** The building's band of members, as its building rules record it, where a rule needs it (the ACT). */
  memberBand?: string | null;
}): ConductTallyResult {
  // A draft pack leaves common property rows out of the lots; NSW and Queensland count every row, as before.
  const params = input.ruleSet.excludeCommonPropertyRows ? { ...input, lots: input.lots.filter(isLotRow) } : input;
  const { ruleSet } = params;
  const raw = params.category && params.category.trim() ? params.category : null;
  if (raw && !isResolutionCategory(ruleSet, raw)) {
    return { ok: false, error: "This item's resolution type is not one this building uses, so its votes cannot be counted." };
  }
  const category: ResolutionCategory | null = raw && isResolutionCategory(ruleSet, raw) ? raw : null;
  const name = (c: ResolutionCategory) => (ruleSet.resolutionLabels[c]?.full ?? c).toLowerCase();

  if (params.poll && !(category && ruleSet.pollCategories?.includes(category))) {
    const allowed = (ruleSet.pollCategories ?? []).map(name);
    return { ok: false, error: allowed.length ? `A poll can be taken only on ${article(orList(allowed))}.` : "A poll cannot be taken on this item." };
  }

  const lotsById = new Map(params.lots.map((l) => [l.id, l]));
  // Whether a lot owing money is left out of the count for this item, lot by
  // lot, as for an owner's own vote online (debtorVoteCheck).
  const debtorBarred = (lotId: string) => debtorBarsLot(ruleSet, category, lotId, params.owingLotIds);

  const seen = new Map<string, "ONLINE" | "CHAIR">();
  const counted: CountedVote[] = [];
  const notCounted: CountedVote[] = [];
  const take = (v: CountedVote) => (debtorBarred(v.lotId) ? notCounted : counted).push(v);

  for (const v of params.onlineVotes) {
    if (v.isInformal || !v.lotId) continue;
    if (!(CHAIR_VOTE_VALUES as readonly string[]).includes(v.voteValue)) continue;
    const lot = lotsById.get(v.lotId);
    if (!lot) return { ok: false, error: "A vote cast online is for a lot that is not in this building, so the votes cannot be counted." };
    if (seen.has(lot.id)) return { ok: false, error: `Lot ${lot.lotNumber} has more than one vote recorded. Each lot has one vote.` };
    seen.set(lot.id, "ONLINE");
    take({ lotId: lot.id, lotNumber: lot.lotNumber, vote: v.voteValue as ChairVoteValue, byProxy: false, source: "ONLINE" });
  }

  for (const v of params.chairVotes) {
    const lot = lotsById.get(v.lotId);
    if (!lot) return { ok: false, error: "A vote is for a lot that is not in this building." };
    const earlier = seen.get(lot.id);
    if (earlier === "ONLINE") return { ok: false, error: `Lot ${lot.lotNumber} has already voted online, so its vote cannot be recorded again.` };
    if (earlier) return { ok: false, error: `Lot ${lot.lotNumber} has more than one vote recorded. Each lot has one vote.` };
    if (v.byProxy && category && ruleSet.proxiesBarredOn?.includes(category)) {
      return {
        ok: false,
        error: `Lot ${lot.lotNumber} voted by proxy, but a proxy cannot vote on ${article(name(category))}. Remove that vote, or record it without the proxy if the owner voted themselves.`,
      };
    }
    seen.set(lot.id, "CHAIR");
    take({ lotId: lot.id, lotNumber: lot.lotNumber, vote: v.vote, byProxy: v.byProxy, source: "CHAIR" });
  }

  if (!category) return { ok: true, value: { tally: null, counted, notCounted } };

  const rule = ruleSet.resolutionCategories[category]!;
  const needsTotals = rulesNeedTotals(rule);
  const draft = draftNeeds(rule, params.poll);
  if (needsTotals && params.recordedLotCount == null) {
    return {
      ok: false,
      error: "The building's number of lots is not recorded, so this resolution cannot be counted. Record it in the building's details first.",
    };
  }
  if (needsTotals && params.recordedLotCount !== params.lots.length) {
    return {
      ok: false,
      error: `The building records ${params.recordedLotCount} lots but ${params.lots.length} are entered, so this resolution cannot be counted. Enter every lot, or correct the number of lots, first.`,
    };
  }

  const tally: ResolutionTally = { forCount: 0, againstCount: 0, abstainCount: 0, totalLots: params.lots.length };
  for (const v of counted) {
    if (v.vote === "FOR") tally.forCount += 1;
    else if (v.vote === "AGAINST") tally.againstCount += 1;
    else tally.abstainCount = (tally.abstainCount ?? 0) + 1;
  }

  try {
    const weigh = (use: EntitlementUse) => {
      const of = (lotId: string) => lotEntitlementFor(params.rules, lotsById.get(lotId)!, use);
      tally.forUE = counted.filter((v) => v.vote === "FOR").reduce((sum, v) => sum + of(v.lotId), 0);
      tally.againstUE = counted.filter((v) => v.vote === "AGAINST").reduce((sum, v) => sum + of(v.lotId), 0);
    };
    if (rule.basis === "TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS") {
      // Every lot's entitlement, so a lot without one fails closed even if it did not vote.
      tally.totalEntitlement = params.lots.reduce((sum, l) => sum + lotEntitlementFor(params.rules, l, "SPECIAL_RESOLUTION"), 0);
      weigh("SPECIAL_RESOLUTION");
    }
    // A draft pack's test against the total entitlement (Victoria, Western Australia), by the schedule the pack says decides it.
    if (draft.entitlement) {
      tally.totalEntitlement = params.lots.reduce((sum, l) => sum + lotEntitlementFor(params.rules, l, draft.entitlementUse), 0);
      weigh(draft.entitlementUse);
    }
    if (params.poll) {
      tally.poll = true;
      weigh("POLL_VOTE");
    }
    // The ACT's special resolution on a poll: the entitlement of every lot recorded at the item.
    if (draft.votesPresent && params.poll) {
      tally.votesPresentEntitlement = counted.reduce((sum, v) => sum + lotEntitlementFor(params.rules, lotsById.get(v.lotId)!, "POLL_VOTE"), 0);
    }
  } catch (err) {
    if (err instanceof MissingEntitlementError || err instanceof EntitlementRuleError) {
      return { ok: false, error: `The votes cannot be counted. ${err.message}` };
    }
    throw err;
  }

  if (rule.basis === "MORE_THAN_HALF_OF_LOTS") {
    tally.eligibleLots = params.lots.filter((l) => !debtorBarred(l.id)).length;
  }

  // The draft packs' counts, each only where the rule needs it (never on an NSW or Queensland tally).
  // Each lot counted has a vote or an abstention recorded; a lot barred for money owed is not counted.
  if (draft.votesPresent) tally.votesPresentCount = counted.length;
  if (draft.lotsRecorded) tally.lotsRecorded = counted.length;
  if (draft.memberBand && params.memberBand) tally.memberBand = params.memberBand;

  return { ok: true, value: { tally, counted, notCounted } };
}

/**
 * Why the chair cannot record a majority resolution as resolved, or null. It
 * is decided on written votes (Act s 107), which StrataVerze does not record
 * yet, so the count of the votes entered at the meeting cannot carry it.
 * Recording it as lost, or deferring it, is still allowed.
 */
export function writtenVotesRefusal(ruleSet: MeetingRuleSet, category: string | null | undefined, requested: Outcome): string | null {
  if (requested !== "RESOLVED" || !isResolutionCategory(ruleSet, category)) return null;
  if (ruleSet.resolutionCategories[category]?.basis !== "MORE_THAN_HALF_OF_LOTS") return null;
  const name = (ruleSet.resolutionLabels[category]?.full ?? category).toLowerCase();
  return `${article(name).replace(/^a/, "A")} is decided on each lot's written vote, which StrataVerze does not record yet. It cannot be recorded as resolved here. It can be recorded as lost, or deferred.`;
}

/**
 * Why the chair cannot record the outcome at the meeting, or null (VIC, ACT
 * and WA stage 2, PR 8a-i). A resolution whose vote stays open after the
 * meeting (Western Australia's special, without dissent and unanimous
 * resolutions) is decided when its voting period closes, which StrataVerze
 * does not track yet, so neither resolved nor lost can be recorded at the
 * meeting. Deferring it is still allowed.
 */
export function laterDecisionRefusal(ruleSet: MeetingRuleSet, category: string | null | undefined, requested: Outcome): string | null {
  if (requested === "DEFERRED" || !isResolutionCategory(ruleSet, category)) return null;
  const days = ruleSet.resolutionCategories[category]?.votingPeriodDays;
  if (days == null) return null;
  const name = (ruleSet.resolutionLabels[category]?.full ?? category).toLowerCase();
  return `${sentenceArticle(name)} is decided when its ${days}-day voting period closes, which StrataVerze does not track yet. It cannot be recorded as resolved or lost at the meeting. It can be deferred.`;
}

/**
 * Why the chair cannot record an item with no resolution category as
 * resolved at a general meeting, or null (VIC, ACT and WA stage 2, PR 8a-i).
 * Under a pack that says so (`categoryRequiredAtGeneralMeetings`), every
 * outcome at a general meeting comes from the count, and an item with no
 * category has no test to count it by, so the chair's word cannot carry it.
 * Recording it as lost, or deferring it, is still allowed. NSW and
 * Queensland leave the flag out, so this is always null for them.
 */
export function uncategorisedRefusal(
  ruleSet: Pick<MeetingRuleSet, "categoryRequiredAtGeneralMeetings">,
  category: string | null | undefined,
  requested: Outcome,
  meetingType: string | null | undefined,
): string | null {
  if (requested !== "RESOLVED" || !ruleSet.categoryRequiredAtGeneralMeetings || isCommitteeMeeting(meetingType)) return null;
  if (category && category.trim()) return null;
  return "This item has no resolution type, so its votes cannot be counted and it cannot be recorded as resolved at a general meeting. Give the item its resolution type on the agenda first. It can be recorded as lost, or deferred.";
}

/**
 * Why the chair's outcome is refused, or null when it agrees with the count
 * (or nothing was counted). The count decides: the chair corrects the votes
 * entered or records the outcome the count gives.
 */
export function outcomeDisagreement(requested: Outcome, result: OutcomeResult): string | null {
  if (!result.evaluation || result.outcome === requested) return null;
  const counted = result.outcome === "RESOLVED" ? "carried" : "lost";
  const asked = requested === "RESOLVED" ? "resolved" : "lost";
  return `The votes recorded show the motion is ${counted}, not ${asked}. ${result.evaluation.reason}. Nothing was saved. Check the votes entered, or record the outcome the count gives.`;
}

/** What the chair is told about votes not counted for money owed, or null when every vote counted. */
export function notCountedNotice(notCounted: readonly CountedVote[], ownersCorporation: string): string | null {
  if (notCounted.length === 0) return null;
  const numbers = notCounted.map((v) => v.lotNumber);
  const owe = numbers.length > 1 ? "owe" : "owes";
  return `Not counted: ${lotList(numbers)} ${owe} the ${ownersCorporation} an overdue amount, so ${numbers.length > 1 ? "their votes" : "its vote"} on this motion cannot count.`;
}

/** What the conduct screen needs to record votes, as plain data a server page passes to the browser. */
export interface ConductVotingView {
  /** Every lot, in lot number order. */
  lots: { id: string; lotNumber: string }[];
  /** For each agenda item: whether a poll may be asked for, and whether a proxy may vote. */
  items: Record<string, { pollAllowed: boolean; proxiesAllowed: boolean }>;
  /** The poll choice, naming the entitlement a poll counts by. */
  pollLabel: string;
}

/** The conduct screen's voting view, or null where the meeting's votes are not counted at conduct (NSW, or a committee meeting). */
export function conductVotingView(
  ruleSet: MeetingRuleSet,
  rules: Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES">,
  lots: readonly { id: string; lotNumber: string | number; lotType?: string | null }[],
  items: readonly { id: string; resolutionCategory: string | null }[],
  meetingType: string | null | undefined,
): ConductVotingView | null {
  if (!countsVotesAtMeeting(ruleSet, meetingType)) return null;
  // A draft pack leaves common property rows out, as the count does.
  const rows = ruleSet.excludeCommonPropertyRows ? lots.filter(isLotRow) : lots;
  let pollLabel = "Poll asked for";
  try {
    pollLabel = `Poll asked for, counted by ${scheduleFor(rules, "POLL_VOTE").name}`;
  } catch (err) {
    if (!(err instanceof EntitlementRuleError)) throw err;
  }
  const allowed = (list: readonly string[] | undefined, c: string | null) => !!c && !!list?.includes(c);
  return {
    lots: rows
      .map((l) => ({ id: l.id, lotNumber: String(l.lotNumber) }))
      .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true })),
    items: Object.fromEntries(
      items.map((i) => [
        i.id,
        {
          pollAllowed: allowed(ruleSet.pollCategories, i.resolutionCategory),
          proxiesAllowed: !allowed(ruleSet.proxiesBarredOn, i.resolutionCategory),
        },
      ]),
    ),
    pollLabel,
  };
}
