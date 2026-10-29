"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { getMeetingById, updateMeeting } from "@/lib/queries/meetings";
import { getSchemeById } from "@/lib/queries/schemes";
import { getAgendaItem, updateAgendaItem } from "@/lib/queries/agenda";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { recordMeetingEvent } from "@/lib/meetings/events";
import { canTransition } from "@/lib/meetings/lifecycle";
import { resolveOutcome, isOutcome, type Outcome } from "@/lib/meetings/conduct";
import {
  buildConductTally,
  countingRefusal,
  countNeedsMemberBand,
  countNeedsQuorum,
  countNeedsReducedQuorum,
  countNeedsVotesPresent,
  countsVotesAtMeeting,
  laterDecisionRefusal,
  notCountedNotice,
  outcomeDisagreement,
  parseAttestation,
  parseChairVotes,
  quorumAnswerProblem,
  uncategorisedRefusal,
  writtenVotesRefusal,
} from "@/lib/meetings/conduct-tally";
import { conductVotingData } from "@/lib/meetings/conduct-tally-repo";
import { debtorRuleApplies } from "@/lib/meetings/debtor-voting";
import { conditionHolds, type SelectorBuilding } from "@/lib/jurisdiction/building-selectors";
import { getRecordedSelectorValues } from "@/lib/queries/building-selectors";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { scheduleFor } from "@/lib/jurisdiction/building-data";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { dayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { categoryNoticeRefusal, type MeetingRuleSet, type ResolutionCategory } from "@/lib/meetings/rules";
import { getLatestIssuedNotice } from "@/lib/queries/notice";
import {
  DECIDED_LATER_ITEM_REFUSAL,
  PENDING_ITEM_REFUSAL,
  isPendingItem,
  laterLostRefusal,
  madeOnDay,
  pendingDates,
  pendingRecordedNotice,
} from "@/lib/meetings/pending";
import { openPendingResolution, pendingStatusForItem } from "@/lib/meetings/pending-repo";

/** `notice`: what the chair is told after a save, such as votes not counted. */
export type ConductActionState = { error?: string; ok?: boolean; notice?: string };

function revalidate(schemeId: string, meetingId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
}

export async function startMeetingAction(
  schemeId: string,
  meetingId: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!canTransition(meeting.status, "IN_PROGRESS"))
      return {
        error: `The meeting cannot be started from ${meeting.status}. Issue the notice first.`,
      };

    await updateMeeting(schemeId, meetingId, {
      status: "IN_PROGRESS",
      openedAt: new Date().toISOString(),
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "MEETING_OPENED",
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to start the meeting." };
  }
}

export async function finishMeetingAction(
  schemeId: string,
  meetingId: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!canTransition(meeting.status, "MINUTES_DRAFT"))
      return { error: `The meeting cannot be finished from ${meeting.status}.` };

    await updateMeeting(schemeId, meetingId, {
      status: "MINUTES_DRAFT",
      closedAt: new Date().toISOString(),
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "MEETING_CLOSED",
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to finish the meeting." };
  }
}

export async function recordAgendaOutcomeAction(
  schemeId: string,
  meetingId: string,
  itemId: string,
  requestedOutcome: string,
  /**
   * Where the building counts votes at conduct (Queensland): each lot's vote
   * as the chair records it ({ lotId, vote, byProxy }). Ignored elsewhere.
   */
  votes?: unknown,
  /** Whether a poll was asked for on the item. Ignored where votes are not counted. */
  poll?: unknown,
  /**
   * The chair's answers for the item (VIC, ACT and WA stage 2, PR 8a-ii,
   * 29 Oct 2026): { quorumPresent?, unitsPresent? }. Read only where the
   * item's test needs them (Victoria and the ACT), and ignored entirely
   * otherwise (NSW, Queensland, Western Australia).
   */
  attestation?: unknown,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    if (!isOutcome(requestedOutcome))
      return { error: "Invalid outcome." };

    const [meeting, item, scheme] = await Promise.all([
      getMeetingById(meetingId),
      getAgendaItem(meetingId, itemId),
      getSchemeById(schemeId),
    ]);
    if (!meeting || meeting.schemeId !== schemeId || !item || !scheme)
      return { error: "Agenda item not found." };
    if (meeting.status !== "IN_PROGRESS")
      return { error: "Outcomes can only be recorded while the meeting is running." };

    const ruleSet = await getActiveRuleSet(scheme.state);
    // A draft pack's general meeting: an item with no category cannot be
    // recorded as resolved, as nothing counts it. Never refused for NSW or Queensland.
    const uncategorised = uncategorisedRefusal(ruleSet, item.resolutionCategory, requestedOutcome, meeting.meetingType);
    if (uncategorised) return { error: uncategorised };
    // An item decided later (INTERIM, only ever under a draft pack) cannot be recorded again or deferred (decision D10).
    if (isPendingItem(item)) return { error: PENDING_ITEM_REFUSAL };
    // Nor can any item with a pending row (review M2): one already decided later, whatever it is stored as now, or
    // one opened since the item was read. Read only where the pack records resolutions decided later: NSW and
    // Queensland read nothing more.
    const pendingStatus = ruleSet.pendingResolutions ? await pendingStatusForItem(itemId) : null;
    if (pendingStatus) return { error: pendingStatus === "PENDING" ? PENDING_ITEM_REFUSAL : DECIDED_LATER_ITEM_REFUSAL };
    // A category needing a longer notice (the ACT's unanimous resolution, VIC, ACT and WA stage 2, PR 8b-iii, decision
    // D13): resolved only where the latest notice issued is recorded as giving it. Read only where the pack gives the
    // item's category a longer notice: NSW and Queensland read nothing more.
    if (requestedOutcome === "RESOLVED" && ruleSet.categoryNoticeDays?.[item.resolutionCategory as ResolutionCategory]) {
      const shortNotice = categoryNoticeRefusal(ruleSet, item.resolutionCategory, await getLatestIssuedNotice(meetingId));
      if (shortNotice) return { error: shortNotice };
    }
    // Queensland general meetings: the outcome is checked against the count
    // of the votes. A deferral needs no count, and a committee meeting is
    // decided by its members. NSW counts nothing here and goes on as before.
    if (requestedOutcome !== "DEFERRED" && countsVotesAtMeeting(ruleSet, meeting.meetingType)) {
      return await recordCountedOutcome({
        actorId: profile.id,
        schemeId,
        meetingId,
        meeting,
        item,
        scheme,
        ruleSet,
        requestedOutcome,
        votes,
        poll,
        attestation,
      });
    }
    const result = resolveOutcome(ruleSet, {
      requestedOutcome,
      resolutionCategory: item.resolutionCategory,
    });

    await updateAgendaItem(meetingId, itemId, {
      outcome: result.outcome,
      status: result.status,
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_OUTCOME_RECORDED",
      payload: { itemId, outcome: result.outcome },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record the outcome." };
  }
}

/**
 * Record an outcome where the building counts the votes (QLD stage 2,
 * resolution tallies, 27 Oct 2026): the tally is built from the formal online
 * votes and the chair's votes, with the building's totals, and passed to
 * resolveOutcome. An outcome the count does not give is refused, and nothing
 * is written. The votes, the tally and the result go in the meeting event.
 *
 * Under a draft pack (VIC, ACT and WA stage 2, PR 8a-ii, 29 Oct 2026): a
 * building the pack does not count (Victoria's tier 5, or a tier that cannot
 * be worked out) is refused before the votes are read; where the item's test
 * needs them, the chair's answers (whether there was a quorum, and for the
 * ACT's special resolution the lots present) are read, an item not answered
 * is refused, and the answers go in the meeting event with the chair's
 * actor; a "no quorum" answer the votes contradict is refused (Victoria);
 * the debtor rule applies only where the pack's condition does not fail.
 * NSW and Queensland read nothing more and record exactly as before.
 */
async function recordCountedOutcome(p: {
  actorId: string;
  schemeId: string;
  meetingId: string;
  meeting: { startTime?: unknown; scheduledAt?: unknown; meetingType?: string | null };
  item: { id: string; resolutionCategory: string | null; status?: string | null };
  scheme: {
    id: string;
    state: string;
    timeZone: string | null;
    totalLots: number | null;
    servicesOnly?: boolean | null;
    replacementCost?: unknown;
    regulationModule?: string | null;
    planFormat?: string | null;
    lots: readonly {
      id: string;
      lotNumber: string;
      entitlement: number | null;
      interestScheduleEntitlement?: number | null;
      lotEntitlement?: number | null;
      lotType?: string | null;
      occupiable?: boolean | null;
    }[];
  };
  ruleSet: MeetingRuleSet;
  requestedOutcome: Outcome;
  votes: unknown;
  poll: unknown;
  attestation?: unknown;
}): Promise<ConductActionState> {
  // Decided on written votes, which are not recorded yet: refused before anything is read.
  const written = writtenVotesRefusal(p.ruleSet, p.item.resolutionCategory, p.requestedOutcome);
  if (written) return { error: written };
  // Decided when its voting period closes (Western Australia): refused before anything is read, unless the pack records
  // the voting period (PR 8b-ii), when the votes at the meeting are counted and the item stays open.
  const later = laterDecisionRefusal(p.ruleSet, p.item.resolutionCategory, p.requestedOutcome);
  if (later) return { error: later };
  const { rules } = rulesForState(p.scheme.state);
  // The building's selectors, read once and only where the pack needs them (the draft packs: the counting refusal,
  // the debtor condition and the band of members). NSW and Queensland read nothing here.
  const needsBuilding = !!(p.ruleSet.countingRefusedWhen?.length || p.ruleSet.debtorRuleAppliesWhen || p.ruleSet.memberBandSelector);
  const building: SelectorBuilding | null = needsBuilding
    ? { scheme: p.scheme, lots: p.scheme.lots, recorded: await getRecordedSelectorValues(p.scheme.id) }
    : null;
  // A building whose votes the pack does not count (Victoria's tier 5, or a tier that cannot be worked out): refused before the votes are read.
  const buildingRefusal = building ? countingRefusal(rules, p.ruleSet, building) : null;
  if (buildingRefusal) return { error: buildingRefusal };
  // Every lot of the building, as read with it. Its type lets Queensland and the draft packs leave common property rows out.
  const lots = p.scheme.lots.map((l) => ({
    id: l.id,
    lotNumber: String(l.lotNumber),
    entitlement: l.entitlement ?? null,
    interestScheduleEntitlement: l.interestScheduleEntitlement ?? null,
    lotEntitlement: l.lotEntitlement ?? null,
    lotType: l.lotType ?? null,
  }));
  const chairVotes = parseChairVotes(p.votes, lots.length);
  if (!chairVotes || (p.poll != null && typeof p.poll !== "boolean")) {
    return { error: "The votes sent could not be read. Reload the page and record them again." };
  }
  // The chair's answers, only where the item's test needs them (Victoria and the ACT). Otherwise ignored: not read, not stored.
  const asksQuorum = countNeedsQuorum(p.ruleSet, p.item.resolutionCategory);
  const asksUnitsPresent = countNeedsVotesPresent(p.ruleSet, p.item.resolutionCategory);
  // After "no" to the quorum, whether a reduced quorum was present (the ACT, PR 8b-i). Never asked otherwise.
  const asksReducedQuorum = countNeedsReducedQuorum(p.ruleSet, p.item.resolutionCategory);
  let answers: { quorumPresent?: boolean; unitsPresent?: number; reducedQuorumPresent?: boolean } = {};
  if (asksQuorum || asksUnitsPresent) {
    const lotCount = p.ruleSet.excludeCommonPropertyRows ? lots.filter((l) => String(l.lotType ?? "").toUpperCase() !== "COMMON").length : lots.length;
    const parsed = parseAttestation(p.attestation, lotCount, asksReducedQuorum ? { reducedQuorum: true } : {});
    if (!parsed) return { error: "The quorum answer sent could not be read. Reload the page and record it again." };
    // Never assumed: an item whose test needs the answer is refused until the chair gives it.
    if (asksQuorum && parsed.quorumPresent == null) {
      const question = p.ruleSet.quorumAttestation?.label;
      return {
        error: question
          ? `Answer "${question}" before recording this item's outcome. Nothing was saved.`
          : "Record whether the meeting had a quorum for this item before recording its outcome. Nothing was saved.",
      };
    }
    answers = {
      ...(asksQuorum ? { quorumPresent: parsed.quorumPresent } : {}),
      ...(asksUnitsPresent && parsed.unitsPresent != null ? { unitsPresent: parsed.unitsPresent } : {}),
      // Kept only after "no" to the quorum, and only where it is asked.
      ...(asksReducedQuorum && parsed.quorumPresent === false && parsed.reducedQuorumPresent != null
        ? { reducedQuorumPresent: parsed.reducedQuorumPresent }
        : {}),
    };
  }
  // Debts are judged on the meeting's date in the building's time zone.
  const meetingDay = dayIn(timeZoneOf(p.scheme), String(p.meeting.startTime ?? p.meeting.scheduledAt));
  const data = await conductVotingData({
    ruleSet: p.ruleSet,
    scheme: p.scheme,
    lots,
    meetingId: p.meetingId,
    meetingDay,
    itemId: p.item.id,
    category: p.item.resolutionCategory,
  });
  // The band of members, given only where the item's test depends on it (the ACT), from the selector values read above.
  const bandKey = p.ruleSet.memberBandSelector;
  const memberBand =
    bandKey && building && countNeedsMemberBand(p.ruleSet, p.item.resolutionCategory) ? (building.recorded[bandKey] ?? "").trim() || null : undefined;
  const count = buildConductTally({
    ruleSet: p.ruleSet,
    rules,
    category: p.item.resolutionCategory,
    lots,
    recordedLotCount: p.scheme.totalLots ?? null,
    onlineVotes: data.onlineVotes,
    chairVotes,
    poll: p.poll === true,
    owingLotIds: data.owingLotIds,
    ...(memberBand !== undefined ? { memberBand } : {}),
    ...(asksQuorum ? { quorumPresent: answers.quorumPresent } : {}),
    ...(asksUnitsPresent ? { unitsPresent: answers.unitsPresent ?? null } : {}),
    ...(asksReducedQuorum && answers.quorumPresent === false ? { reducedQuorumPresent: answers.reducedQuorumPresent ?? null } : {}),
    // Where the pack's debtor rule applies only to some buildings: not applied only where it is known not to hold.
    ...(p.ruleSet.debtorRuleAppliesWhen && building
      ? { debtorRuleApplies: debtorRuleApplies(p.ruleSet, conditionHolds(rules, p.ruleSet.debtorRuleAppliesWhen, building).holds) }
      : {}),
  });
  if (!count.ok) return { error: count.error };

  const { tally, counted, notCounted } = count.value;
  // A "no quorum" answer the votes counted contradict (Victoria): refused, nothing written.
  if (asksQuorum) {
    const contradiction = quorumAnswerProblem(
      p.ruleSet,
      p.meeting.meetingType,
      answers.quorumPresent,
      counted.length,
      Math.max(tally?.totalLots ?? 0, p.scheme.totalLots ?? 0),
    );
    if (contradiction) return { error: contradiction };
  }
  const result = resolveOutcome(p.ruleSet, {
    requestedOutcome: p.requestedOutcome,
    resolutionCategory: p.item.resolutionCategory,
    tally,
    // A poll is counted by the entitlement the pack names (the chair is told it by name).
    ...(tally?.poll ? { pollEntitlement: scheduleFor(rules, "POLL_VOTE").name } : {}),
  });
  // Neither carried nor lost (an interim resolution, or one the count cannot decide): nothing is written.
  if (result.refused) return { error: result.refused };
  // Decided later, of a kind the pack records (VIC, ACT and WA stage 2, PR 8b-i): stored as pending, never as carried.
  if (result.later) return await recordPendingOutcome(p, { result, later: result.later, tally, counted, notCounted, answers, asked: asksQuorum || asksUnitsPresent, meetingDay, rulesLabel: rulesForState(p.scheme.state).label, ownersCorporation: rules.TERMINOLOGY.ownersCorporation });
  const disagreement = outcomeDisagreement(p.requestedOutcome, result);
  if (disagreement) return { error: disagreement };

  await updateAgendaItem(p.meetingId, p.item.id, {
    outcome: result.outcome,
    status: result.status,
  });
  await recordMeetingEvent({
    meetingId: p.meetingId,
    actorId: p.actorId,
    eventType: "AGENDA_OUTCOME_RECORDED",
    payload: {
      itemId: p.item.id,
      outcome: result.outcome,
      votes: counted,
      notCounted,
      tally,
      evaluation: result.evaluation ?? null,
      // The chair's own answers, only where they were asked (the draft packs).
      ...(asksQuorum || asksUnitsPresent ? { attestation: answers } : {}),
    },
  });
  revalidate(p.schemeId, p.meetingId);
  const notice = notCountedNotice(notCounted, rules.TERMINOLOGY.ownersCorporation);
  return notice ? { ok: true, notice } : { ok: true };
}

/**
 * Record a count that gives a resolution decided later (VIC, ACT and WA
 * stage 2, PR 8b-i, 29 Oct 2026): Victoria's interim special resolution and
 * interim resolution without a quorum, the ACT's reduced quorum decision,
 * and (PR 8b-ii) Western Australia's special, without dissent and unanimous
 * resolutions, whose voting period stays open after the meeting (the
 * conduct screen's "Record the votes" sends Resolved). The chair must have
 * asked for Resolved: a count that makes the motion one of these is not
 * lost. The pending row, the agenda item stored as INTERIM (OPEN for a
 * voting period) and the event (with the dates) are written in one
 * transaction, and the chair is told the dates. The votes at the meeting,
 * those counted and those not counted for money owed, are kept with the row
 * for the count at the close.
 */
async function recordPendingOutcome(
  p: Parameters<typeof recordCountedOutcome>[0],
  c: {
    result: ReturnType<typeof resolveOutcome>;
    later: NonNullable<ReturnType<typeof resolveOutcome>["later"]>;
    tally: unknown;
    counted: readonly unknown[];
    notCounted: Parameters<typeof notCountedNotice>[0];
    answers: Record<string, unknown>;
    asked: boolean;
    meetingDay: string;
    rulesLabel: string;
    ownersCorporation: string;
  },
): Promise<ConductActionState> {
  const rule = p.ruleSet.pendingResolutions?.[c.later.kind];
  const category = p.item.resolutionCategory;
  if (!rule || !category) return { error: "This resolution cannot be recorded here. Nothing was saved. The item can be deferred." };
  if (p.requestedOutcome !== "RESOLVED") return { error: laterLostRefusal(rule, c.result.evaluation?.reason ?? "") };
  const takesEffectAs = rule.takesEffectAs === "SAME" ? category : rule.takesEffectAs;
  // Victoria's interim special resolution is a special resolution item that takes effect as one (as the database checks).
  if (c.later.kind === "INTERIM_SPECIAL" && category !== takesEffectAs) {
    return { error: "This resolution cannot be recorded here. Nothing was saved. The item can be deferred." };
  }
  // D2: made on the later of the meeting's day and the day it is recorded, in the building's time zone.
  const dates = pendingDates(rule, madeOnDay(c.meetingDay, todayIn(timeZoneOf(p.scheme))));
  // Western Australia's voting period (PR 8b-ii review M, L2): the lots the count was made over, the only ones that may
  // vote in writing, and the debtor rule as the pack held it at the meeting, kept with the row. Not kept for other kinds.
  const voting = c.later.kind === "VOTING_PERIOD";
  const meetingLotIds = p.scheme.lots
    .filter((l) => !p.ruleSet.excludeCommonPropertyRows || String(l.lotType ?? "").toUpperCase() !== "COMMON")
    .map((l) => l.id);
  const entered = new Set([...c.counted, ...c.notCounted].map((v) => (v as { lotId?: unknown }).lotId));
  const someLotAbsent = meetingLotIds.some((id) => !entered.has(id));
  const opened = await openPendingResolution({
    schemeId: p.schemeId,
    meetingId: p.meetingId,
    itemId: p.item.id,
    state: p.ruleSet.state,
    kind: c.later.kind,
    category,
    takesEffectAs,
    dates,
    meetingVotes: { counted: c.counted, notCounted: c.notCounted, tally: c.tally, ...(voting ? { lotIds: meetingLotIds } : {}) },
    rule: {
      pending: rule,
      resolution: p.ruleSet.resolutionCategories[category as keyof MeetingRuleSet["resolutionCategories"]] ?? null,
      ...(voting ? { debtorsMayVoteOn: p.ruleSet.debtorsMayVoteOn ?? null } : {}),
    },
    rulePack: c.rulesLabel,
    actorId: p.actorId,
    ...(c.later.stored === "OPEN" ? { stored: "OPEN" as const } : {}),
    eventPayload: {
      itemId: p.item.id,
      outcome: c.later.stored,
      votes: c.counted,
      notCounted: c.notCounted,
      tally: c.tally,
      evaluation: c.result.evaluation ?? null,
      ...(c.asked ? { attestation: c.answers } : {}),
      later: { kind: c.later.kind, madeOn: dates.madeOn, windowClosesOn: dates.windowClosesOn, noticeDueOn: dates.noticeDueOn },
    },
  });
  if ("error" in opened) return { error: opened.error };
  revalidate(p.schemeId, p.meetingId);
  const notCounted = notCountedNotice(c.notCounted, c.ownersCorporation);
  return { ok: true, notice: [pendingRecordedNotice(rule, dates, voting ? { someLotAbsent } : {}), notCounted].filter(Boolean).join(" ") };
}

export async function addConductNoteAction(
  schemeId: string,
  meetingId: string,
  itemId: string,
  note: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const trimmed = note.trim();
    if (!trimmed) return { error: "Note is empty." };

    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (itemId && !(await getAgendaItem(meetingId, itemId)))
      return { error: "Agenda item not found." };

    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_NOTE",
      payload: { itemId, note: trimmed },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add the note." };
  }
}
