"use server";

/**
 * What an adviser records about a resolution decided later (VIC, ACT and WA
 * stage 2, PR 8b-i, 29 Oct 2026), from the meeting page's "Decided later"
 * panel: the day the owners were given notice of it, a petition with the lots
 * that signed it, Victoria's special general meeting notice (s 78), a later
 * meeting's decision on it, and (PR 8b-ii) Western Australia's written votes
 * received after the meeting (s 121(2)). Each needs governance.manage, is allowed
 * whatever the meeting's status (after it is published too), and writes an
 * append-only event on the original meeting (pending-repo.ts). Refused for a
 * building whose pack records no resolutions decided later.
 */
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { getMeetingById } from "@/lib/queries/meetings";
import { getSchemeById } from "@/lib/queries/schemes";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { conditionHolds } from "@/lib/jurisdiction/building-selectors";
import { selectorBuildingFor } from "@/lib/queries/building-selectors";
import { debtorRuleApplies, debtorVoteRefusal } from "@/lib/meetings/debtor-voting";
import { lotsOwingMoney } from "@/lib/meetings/debtor-voting-repo";
import {
  recordLateVote,
  recordPendingConfirmation,
  recordPendingNotice,
  recordPendingPetition,
  recordSpecialMeetingNotice,
  type PendingScheme,
  type RepoResult,
} from "@/lib/meetings/pending-repo";
import type { MeetingRuleSet } from "@/lib/meetings/rules";

export type PendingActionState = { error?: string; ok?: boolean; notice?: string };

const NOT_OFFERED = "This building's rules record no resolutions decided later.";

/** The building, its rule set and the actor, once the adviser and the meeting are checked. */
async function context(schemeId: string, meetingId: string) {
  const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
  const [meeting, scheme] = await Promise.all([getMeetingById(meetingId), getSchemeById(schemeId)]);
  if (!meeting || meeting.schemeId !== schemeId || !scheme) return { error: "Meeting not found." } as const;
  const ruleSet = await getActiveRuleSet(scheme.state);
  if (!ruleSet.pendingResolutions) return { error: NOT_OFFERED } as const;
  const building: PendingScheme = {
    id: scheme.id,
    timeZone: timeZoneOf(scheme),
    totalLots: scheme.totalLots ?? null,
    lots: scheme.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, lotType: l.lotType })),
  };
  return { actorId: profile.id, scheme, building, ruleSet } as const;
}

async function run(schemeId: string, meetingId: string, fn: (c: Exclude<Awaited<ReturnType<typeof context>>, { error: string }>) => Promise<RepoResult>): Promise<PendingActionState> {
  try {
    const c = await context(schemeId, meetingId);
    if ("error" in c) return { error: c.error };
    const result = await fn(c);
    if ("error" in result) return { error: result.error };
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return result.notice ? { ok: true, notice: result.notice } : { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record it. Nothing was saved." };
  }
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The day the owners were given notice of the resolution. */
export async function recordPendingNoticeAction(schemeId: string, meetingId: string, pendingId: string, givenOn: string): Promise<PendingActionState> {
  return run(schemeId, meetingId, (c) => recordPendingNotice({ scheme: c.building, meetingId, pendingId: text(pendingId), givenOn: text(givenOn), actorId: c.actorId }));
}

/**
 * The lots barred for money owed on a day from voting on a category, where
 * the pack's debtor rule applies to the building (the ACT petition, decision
 * D5; Western Australia's written votes, decision D8). Where the condition cannot be worked out the rule applies (fails
 * closed, as at conduct).
 */
function barredLots(c: { scheme: { id: string; timeZone: string | null; state: string }; building: PendingScheme; ruleSet: MeetingRuleSet }) {
  return async (day: string, category: string): Promise<ReadonlySet<string>> => {
    if (debtorVoteRefusal(c.ruleSet, category, true, "") == null) return new Set();
    if (c.ruleSet.debtorRuleAppliesWhen) {
      const building = await selectorBuildingFor(c.scheme.id);
      const holds = building ? conditionHolds(rulesForState(c.scheme.state).rules, c.ruleSet.debtorRuleAppliesWhen, building).holds : null;
      if (!debtorRuleApplies(c.ruleSet, holds)) return new Set();
    }
    return lotsOwingMoney(c.scheme, c.building.lots.map((l) => l.id), day);
  };
}

/** A petition received within the period, with the lots that signed it. */
export async function recordPendingPetitionAction(
  schemeId: string,
  meetingId: string,
  pendingId: string,
  receivedOn: string,
  lotIds: unknown,
): Promise<PendingActionState> {
  if (!Array.isArray(lotIds) || lotIds.some((id) => typeof id !== "string") || lotIds.length > 10000) {
    return { error: "The lots sent could not be read. Reload the page and record them again." };
  }
  return run(schemeId, meetingId, (c) =>
    recordPendingPetition({
      scheme: c.building,
      meetingId,
      pendingId: text(pendingId),
      receivedOn: text(receivedOn),
      lotIds: lotIds as string[],
      barredLotIds: barredLots(c),
      actorId: c.actorId,
    }),
  );
}

/** Victoria s 78: notice of a special general meeting, with the meeting it called. */
export async function recordSpecialMeetingNoticeAction(
  schemeId: string,
  meetingId: string,
  pendingId: string,
  givenOn: string,
  calledMeetingId: string,
): Promise<PendingActionState> {
  return run(schemeId, meetingId, (c) =>
    recordSpecialMeetingNotice({ scheme: c.building, meetingId, pendingId: text(pendingId), givenOn: text(givenOn), calledMeetingId: text(calledMeetingId), actorId: c.actorId }),
  );
}

/** A later meeting's decision on the resolution, from its motion as recorded. */
export async function recordPendingConfirmationAction(
  schemeId: string,
  meetingId: string,
  pendingId: string,
  confirmingMeetingId: string,
  confirmingItemId: string,
): Promise<PendingActionState> {
  return run(schemeId, meetingId, (c) =>
    recordPendingConfirmation({
      scheme: c.building,
      meetingId,
      pendingId: text(pendingId),
      confirmingMeetingId: text(confirmingMeetingId),
      confirmingItemId: text(confirmingItemId),
      actorId: c.actorId,
    }),
  );
}

/**
 * Western Australia s 121(2) (PR 8b-ii): a written vote received after the
 * meeting from a lot with nothing entered at the item, FOR or AGAINST, its
 * debt judged on the day it was received (decision D8).
 */
export async function recordLateVoteAction(
  schemeId: string,
  meetingId: string,
  pendingId: string,
  lotId: string,
  vote: string,
  receivedOn: string,
): Promise<PendingActionState> {
  return run(schemeId, meetingId, (c) =>
    recordLateVote({
      scheme: c.building,
      meetingId,
      pendingId: text(pendingId),
      lotId: text(lotId),
      vote: text(vote),
      receivedOn: text(receivedOn),
      barredLotIds: barredLots(c),
      actorId: c.actorId,
    }),
  );
}
