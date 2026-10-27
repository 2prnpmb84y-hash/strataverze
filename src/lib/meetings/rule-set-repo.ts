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
import { rulePackFor, UnsupportedJurisdictionError, needRule } from "@/config/statutory";
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

function rowToRuleSet(row: RuleSetRow, seed: MeetingRuleSet): MeetingRuleSet {
  return {
    state: row.state,
    version: row.version,
    effectiveFrom: String(row.effectiveFrom).slice(0, 10),
    noticePeriods: row.noticePeriods as Partial<Record<MeetingType, number>>,
    minutesDeadlines: row.minutesDeadlines as Partial<Record<MeetingType, number>>,
    quorumRules: row.quorumRules as Partial<Record<MeetingType, QuorumRule>>,
    resolutionCategories: row.resolutionCategories as Record<
      ResolutionCategory,
      ResolutionRule
    >,
    retention: row.retention as MeetingRuleSet["retention"],
    // Fall back to the seed config when an older rule-set row lacks it.
    preMeetingEvoting:
      (row.preMeetingEvoting as MeetingRuleSet["preMeetingEvoting"]) ??
      seed.preMeetingEvoting,
    notes: row.notes ?? undefined,
  };
}

/**
 * The active rule set for a state. Falls back to the state's built-in rules
 * when the table has no active row (for example before the seed migration has
 * run). Throws UnsupportedJurisdictionError for a state without a rule pack.
 */
export async function getActiveRuleSet(state: string): Promise<MeetingRuleSet> {
  const pack = rulePackFor(state);
  if (!pack) throw new UnsupportedJurisdictionError((state ?? "").trim().toUpperCase());
  const seed = needRule(pack.rules, "MEETING_RULES");

  const row = await db.orm.public.MeetingRuleSet
    .where((r) => and(r.state.eq(pack.state), r.isActive.eq(true)))
    .orderBy((r) => r.effectiveFrom.desc())
    .first();

  if (!row) return seed;
  return rowToRuleSet(row as unknown as RuleSetRow, seed);
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
