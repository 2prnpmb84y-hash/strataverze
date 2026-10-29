/**
 * Rule-set repository (DB access).
 *
 * Reads the active jurisdiction rule set from `meeting_rule_sets`, falling back
 * to the jurisdiction's built-in rules (`@/config/statutory`) when no row
 * exists, and records an immutable snapshot of the governing rule set against
 * a meeting. A state without a rule pack is refused: it never borrows another
 * jurisdiction's rules.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { rulePackFor, UnsupportedJurisdictionError } from "@/config/statutory";
import {
  snapshotRuleSet,
  type MeetingRuleSet,
  type QuorumRule,
  type ResolutionCategory,
  type ResolutionRule,
  type MeetingType,
} from "./rules";

type RuleSetRow = {
  state: string;
  version: string;
  effectiveFrom: unknown;
  noticePeriods: unknown;
  minutesDeadlines: unknown;
  quorumRules: unknown;
  resolutionCategories: unknown;
  retention: unknown;
  preMeetingEvoting?: unknown;
  notes: string | null;
};

/**
 * A stored row as a rule set. Rows are read tolerantly: a row written before a
 * field existed takes it from the pack's seed. The labels, the category lists,
 * the committee refusal, the debtor voting rule and the poll and proxy
 * categories have no column, so they always come from the seed (stage 2,
 * step 7).
 */
function rowToRuleSet(row: RuleSetRow, seed: MeetingRuleSet): MeetingRuleSet {
  const ruleSet: MeetingRuleSet = {
    state: row.state,
    version: row.version,
    effectiveFrom: String(row.effectiveFrom).slice(0, 10),
    noticePeriods: row.noticePeriods as Partial<Record<MeetingType, number>>,
    minutesDeadlines: row.minutesDeadlines as Partial<Record<MeetingType, number>>,
    quorumRules: row.quorumRules as Partial<Record<MeetingType, QuorumRule>>,
    resolutionCategories: row.resolutionCategories as Partial<Record<
      ResolutionCategory,
      ResolutionRule
    >>,
    retention: (row.retention as MeetingRuleSet["retention"] | null) ?? seed.retention,
    // Fall back to the seed config when an older rule-set row lacks it. A pack
    // without pre-meeting e-voting (seed null) never offers it, whatever a row holds.
    preMeetingEvoting:
      seed.preMeetingEvoting == null
        ? null
        : ((row.preMeetingEvoting as MeetingRuleSet["preMeetingEvoting"]) ??
          seed.preMeetingEvoting),
    resolutionLabels: seed.resolutionLabels,
    generalMeetingCategories: seed.generalMeetingCategories,
    committeeCategories: seed.committeeCategories,
    committeeCategoryRefusal: seed.committeeCategoryRefusal,
    motionCategories: seed.motionCategories,
    notes: row.notes ?? undefined,
  };
  if (seed.debtorsMayVoteOn) ruleSet.debtorsMayVoteOn = seed.debtorsMayVoteOn;
  // No column either: polls and proxies at conduct (Queensland only).
  if (seed.pollCategories) ruleSet.pollCategories = seed.pollCategories;
  if (seed.proxiesBarredOn) ruleSet.proxiesBarredOn = seed.proxiesBarredOn;
  // No column either, and only where the seed has them (the draft packs, VIC,
  // ACT and WA stage 2, PR 8a-i): an NSW rule set never has the keys, and a
  // Queensland one has only excludeCommonPropertyRows (2026.10.20, 29 Oct 2026),
  // so a stored Queensland row takes it from the seed however old the row is.
  if (seed.excludeCommonPropertyRows) ruleSet.excludeCommonPropertyRows = seed.excludeCommonPropertyRows;
  if (seed.memberBandSelector) ruleSet.memberBandSelector = seed.memberBandSelector;
  if (seed.categoryRequiredAtGeneralMeetings) ruleSet.categoryRequiredAtGeneralMeetings = seed.categoryRequiredAtGeneralMeetings;
  // No column either, and only where the seed has them (the draft packs, VIC, ACT and WA stage 2,
  // PR 8a-ii, 29 Oct 2026): the counting refusal, the debtor condition, the chair's answers and the
  // 2-lot quorum. NSW and Queensland never have them.
  if (seed.countingRefusedWhen) ruleSet.countingRefusedWhen = seed.countingRefusedWhen;
  if (seed.debtorRuleAppliesWhen) ruleSet.debtorRuleAppliesWhen = seed.debtorRuleAppliesWhen;
  if (seed.quorumAttestation) ruleSet.quorumAttestation = seed.quorumAttestation;
  if (seed.votesPresentAttestation) ruleSet.votesPresentAttestation = seed.votesPresentAttestation;
  if (seed.quorumNeedsEveryLot) ruleSet.quorumNeedsEveryLot = seed.quorumNeedsEveryLot;
  return ruleSet;
}

/**
 * The active rule set for a state. Falls back to the state's built-in rules
 * when the table has no active row (for example before the seed migration has
 * run). Throws UnsupportedJurisdictionError for a state without a rule pack.
 */
export async function getActiveRuleSet(state: string): Promise<MeetingRuleSet> {
  const pack = rulePackFor(state);
  if (!pack) throw new UnsupportedJurisdictionError((state ?? "").trim().toUpperCase());
  const seed = pack.rules.MEETING_RULES;

  const row = await db.orm.public.MeetingRuleSet
    .where((r) => and(r.state.eq(pack.state), r.isActive.eq(true)))
    .orderBy((r) => r.effectiveFrom.desc())
    .first();

  if (!row) return seed;
  return rowToRuleSet(row as unknown as RuleSetRow, seed);
}

/** The active rule set for a building, by its id. Throws as `getActiveRuleSet` does, or when there is no such building. */
export async function getActiveRuleSetForScheme(schemeId: string): Promise<MeetingRuleSet> {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) throw new Error("Building not found.");
  return getActiveRuleSet(scheme.state);
}

/**
 * Record the immutable snapshot of the rule set that governs a meeting. Idempotent:
 * if a snapshot already exists for the meeting, it is returned unchanged.
 */
export async function applyRuleSetToMeeting(
  meetingId: string,
  ruleSet: MeetingRuleSet,
) {
  const existing = await db.orm.public.AppliedRuleSet
    .where((a) => a.meetingId.eq(meetingId))
    .first();
  if (existing) return existing;

  return db.orm.public.AppliedRuleSet.create({
    meetingId,
    ruleSetState: ruleSet.state,
    ruleSetVersion: ruleSet.version,
    snapshot: snapshotRuleSet(ruleSet) as never,
  });
}
