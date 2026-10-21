/**
 * Rule-set repository (DB access).
 *
 * Reads the active jurisdiction rule set from `meeting_rule_sets`, falling back
 * to the NSW seed when no row exists, and records an immutable snapshot of the
 * governing rule set against a meeting.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import {
  NSW_RULE_SET,
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
  notes: string | null;
};

function rowToRuleSet(row: RuleSetRow): MeetingRuleSet {
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
    notes: row.notes ?? undefined,
  };
}

/**
 * The active rule set for a state. Falls back to the built-in NSW seed when the
 * table has no active row (for example before the seed migration has run).
 */
export async function getActiveRuleSet(state: string): Promise<MeetingRuleSet> {
  const row = await db.orm.public.MeetingRuleSet
    .where((r) => and(r.state.eq(state), r.isActive.eq(true)))
    .orderBy((r) => r.effectiveFrom.desc())
    .first();

  if (!row) {
    return state === "NSW" ? NSW_RULE_SET : { ...NSW_RULE_SET, state };
  }
  return rowToRuleSet(row as unknown as RuleSetRow);
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
