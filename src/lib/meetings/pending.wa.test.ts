/**
 * Western Australia's voting period (pure; VIC, ACT and WA stage 2, PR 8b-ii,
 * 29 Oct 2026), STA s 121, with Matthew Wrigley's decisions of 29 Oct 2026:
 * D1 (a written vote up to and including the 28th day after the day it was
 * made, decided as at the next day), D2 (made on the later of the meeting's
 * day and the recording day), D8 (late voters are the lots with nothing
 * entered at the item, FOR or AGAINST only, and the outcome notice recorded
 * before the close is decided whenever such a lot exists), D9 (decided only
 * at the close) and the 7 days of grace before the daily run records it. At
 * the close the votes at the meeting and the written votes are counted with
 * the s 123 test for the building's size (atClose), CARRIED or LOST, ended
 * by VOTES_AT_CLOSE.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS } from "@/config/statutory";
import {
  absentLotCount,
  closeTally,
  formatDay,
  laterLostRefusal,
  lateVoteProblem,
  madeOnDay,
  PENDING_KINDS,
  pendingDates,
  pendingDecision,
  pendingPanelItem,
  pendingRecordedNotice,
  votingPeriodClose,
  type LateVote,
  type PendingRowView,
  type VotingPeriodFacts,
} from "./pending";
import type { ResolutionTally } from "./rules";

const WA = PENDING_RULE_PACKS.WA.rules.MEETING_RULES;
const VP = WA.pendingResolutions!.VOTING_PERIOD!;
const NO_DASH = /[;–—]/;

/** A voting period made on Monday 2 November 2026: it closes Monday 30 November, decided as at Tuesday 1 December. */
const row = (extra: Partial<PendingRowView> = {}): PendingRowView => {
  const d = pendingDates(VP, extra.madeOn ?? "2026-11-02");
  return {
    kind: "VOTING_PERIOD",
    status: "PENDING",
    madeOn: d.madeOn,
    windowClosesOn: d.windowClosesOn,
    noticeDueOn: d.noticeDueOn,
    noticeGivenOn: null,
    meetingNoticeGivenOn: null,
    meetingNoticeMeetingId: null,
    meetingHeldBy: null,
    rule: VP,
    ...extra,
  };
};

/** Twelve lots of 10 unit entitlement each (120). */
const tally12 = (t: Partial<ResolutionTally>): ResolutionTally => ({ forCount: 0, againstCount: 0, abstainCount: 0, forUE: 0, againstUE: 0, totalLots: 12, totalEntitlement: 120, ...t });
const late = (lotId: string, vote: LateVote["vote"], entitlement: number | null = 10, receivedOn = "2026-11-20"): LateVote => ({ lotId, vote, receivedOn, entitlement });
const lotIds = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `lot-${from + i}`);

/** A special resolution with 12 lots: 5 entered at the meeting (lots 1 to 5), 7 with nothing entered. */
const facts = (extra: Partial<VotingPeriodFacts> = {}): VotingPeriodFacts => ({
  category: "SPECIAL",
  resolution: WA.resolutionCategories.SPECIAL!,
  meetingTally: tally12({ forCount: 4, forUE: 40, againstCount: 1, againstUE: 10 }),
  enteredLotIds: lotIds(1, 5),
  meetingLotIds: lotIds(1, 12),
  lateVotes: [],
  ...extra,
});

describe("the dates (D1, D2)", () => {
  it("records the voting period as a kind", () => {
    expect(PENDING_KINDS).toContain("VOTING_PERIOD");
  });

  it("a meeting on Monday 2 November 2026: written votes up to and including Monday 30 November, decided as at Tuesday 1 December, no notice due", () => {
    expect(pendingDates(VP, "2026-11-02")).toEqual({ madeOn: "2026-11-02", windowClosesOn: "2026-11-30", noticeDueOn: null });
    // Across a month end and a year end.
    expect(pendingDates(VP, "2026-12-15").windowClosesOn).toBe("2027-01-12");
    expect(pendingDates(VP, "2027-02-01").windowClosesOn).toBe("2027-03-01");
    // D2: recorded the day after a meeting that ran past midnight, it is made on the recording day.
    expect(madeOnDay("2026-11-02", "2026-11-03")).toBe("2026-11-03");
  });
});

describe("the daily decision (D9 and the grace)", () => {
  const ready = row({ noticeGivenOn: "2026-11-05" });

  it("waits while voting is open, even if every lot has voted for (D9)", () => {
    const all = facts({ meetingTally: tally12({ forCount: 12, forUE: 120 }), enteredLotIds: lotIds(1, 12) });
    for (const today of ["2026-11-02", "2026-11-29", "2026-11-30"]) {
      expect(pendingDecision(ready, today, { votingPeriod: all }), today).toEqual({ settle: false, waitUntil: "2026-12-08", blocker: null });
    }
    // Read or not, open is open: nothing is counted before the close.
    expect(pendingDecision(ready, "2026-11-30")).toEqual({ settle: false, waitUntil: "2026-12-08", blocker: null });
  });

  it("waits through the 7 days of grace after the close, then decides as at the day after the close", () => {
    const carried = facts({ lateVotes: [late("lot-6", "FOR"), late("lot-7", "FOR")] });
    for (const today of ["2026-12-01", "2026-12-07"]) {
      expect(pendingDecision(ready, today, { votingPeriod: carried }), today).toEqual({ settle: false, waitUntil: "2026-12-08", blocker: null });
    }
    const decided = pendingDecision(ready, "2026-12-08", { votingPeriod: carried });
    expect(decided).toMatchObject({ settle: true, status: "CARRIED", endedBy: "VOTES_AT_CLOSE", effectiveOn: "2026-12-01" });
    expect(decided).toMatchObject({ tally: { forCount: 6, forUE: 60, againstCount: 1, againstUE: 10 }, evaluation: { passed: true } });
    // Later still, the same day.
    expect(pendingDecision(ready, "2027-03-01", { votingPeriod: carried })).toMatchObject({ settle: true, effectiveOn: "2026-12-01" });
  });

  it("decides it lost, with no day, when the votes then fail the test", () => {
    const lost = facts({ lateVotes: [late("lot-6", "AGAINST"), late("lot-7", "AGAINST")] });
    expect(pendingDecision(ready, "2026-12-08", { votingPeriod: lost })).toMatchObject({
      settle: true,
      status: "LOST",
      endedBy: "VOTES_AT_CLOSE",
      effectiveOn: null,
      evaluation: { passed: false, reason: "Votes for are less than 50% of all lots in the scheme" },
    });
  });

  it("is blocked, not decided, without the outcome notice where a lot had nothing entered (D8)", () => {
    const decision = pendingDecision(row(), "2026-12-08", { votingPeriod: facts({ lateVotes: lotIds(6, 12).map((id) => late(id, "FOR")) }) });
    expect(decision).toEqual({
      settle: false,
      waitUntil: null,
      blocker: "The written notice of the outcome to the owners with no-one present at the meeting is not recorded as given, so it cannot be decided. Record the day it was given.",
    });
    // Shown as soon as the period has closed, during the grace too.
    expect(pendingDecision(row(), "2026-12-01", { votingPeriod: facts() })).toMatchObject({ settle: false, blocker: expect.stringMatching(/^The written notice of the outcome/) });
    // Every lot entered at the meeting: no such lot, so no notice is needed.
    const all = facts({ meetingTally: tally12({ forCount: 9, forUE: 90, againstCount: 3, againstUE: 30 }), enteredLotIds: lotIds(1, 12) });
    expect(pendingDecision(row(), "2026-12-08", { votingPeriod: all })).toMatchObject({ settle: true, status: "LOST" });
    // The number of lots not kept: whether such a lot exists cannot be told, so the notice is needed (fails closed).
    const unknown = facts({ meetingTally: { forCount: 9, againstCount: 3 }, enteredLotIds: lotIds(1, 12) });
    expect(pendingDecision(row(), "2026-12-08", { votingPeriod: unknown })).toMatchObject({ settle: false, blocker: expect.stringMatching(/^The written notice of the outcome/) });
  });

  it("is blocked where the votes cannot be read or the count cannot be made", () => {
    for (const f of [undefined, null, facts({ meetingTally: null }), facts({ resolution: null })]) {
      expect(pendingDecision(ready, "2026-12-08", { votingPeriod: f })).toEqual({
        settle: false,
        waitUntil: null,
        blocker: "The votes recorded at the meeting cannot be read, so it cannot be decided. Nothing is recorded until they are checked.",
      });
    }
    // A written vote whose lot has no entitlement recorded, where the count weighs it.
    expect(pendingDecision(ready, "2026-12-08", { votingPeriod: facts({ lateVotes: [late("lot-6", "FOR", null)] }) })).toMatchObject({
      settle: false,
      blocker: "The entitlement of a lot with a written vote is not recorded, so the votes cannot be counted. Record it in the building's lots.",
    });
    // No total entitlement kept: the test cannot be applied.
    const noTotal = facts({ meetingTally: { forCount: 6, againstCount: 0, forUE: 60, againstUE: 0, totalLots: 12 } });
    expect(pendingDecision(ready, "2026-12-08", { votingPeriod: noTotal })).toMatchObject({
      settle: false,
      blocker: "The votes when its voting period closed cannot decide it. The total entitlement and the entitlement of the lots for and against are needed to count this resolution.",
    });
  });

  it("does nothing once decided", () => {
    expect(pendingDecision({ ...ready, status: "CARRIED" }, "2026-12-08", { votingPeriod: facts() })).toEqual({ settle: false, waitUntil: null, blocker: null });
  });
});

describe("the count at the close (s 123 by size class, atClose)", () => {
  const ready = row({ noticeGivenOn: "2026-11-05" });
  const close = (f: Partial<VotingPeriodFacts>) => votingPeriodClose(ready, facts(f));

  it("6 or more lots: at least 50% of all lots and unit entitlement for, and less than 25% of each against", () => {
    // 4 for at the meeting, 2 written for: 6 of 12, exactly 50%.
    expect(close({ lateVotes: [late("lot-6", "FOR"), late("lot-7", "FOR")] })).toMatchObject({ status: "CARRIED" });
    // One fewer for: 5 of 12.
    expect(close({ lateVotes: [late("lot-6", "FOR")] })).toMatchObject({ status: "LOST" });
    // 3 against of 12 is exactly 25%: lost, the against test is strict.
    expect(close({ lateVotes: [late("lot-6", "FOR"), late("lot-7", "FOR"), late("lot-8", "AGAINST"), late("lot-9", "AGAINST")] })).toMatchObject({
      status: "LOST",
      evaluation: { reason: "Votes against are 25% or more of all lots in the scheme" },
    });
    // Weighed by each written vote's unit entitlement: 2 lots for with 5 each leave the lots for under half the entitlement.
    expect(close({ lateVotes: [late("lot-6", "FOR", 5), late("lot-7", "FOR", 5)] })).toMatchObject({
      status: "LOST",
      evaluation: { reason: "The lots for do not hold at least 50% of the total entitlement" },
    });
  });

  it("3, 4 or 5 lots: 2, 3 or 4 lots for and 50% of the unit entitlement, no against test", () => {
    const four = (forCount: number, forUE: number, lateVotes: LateVote[]) =>
      close({ meetingTally: { forCount, againstCount: 0, abstainCount: 0, forUE, againstUE: 0, totalLots: 4, totalEntitlement: 40 }, enteredLotIds: lotIds(1, forCount), lateVotes });
    expect(four(2, 20, [late("lot-3", "FOR"), late("lot-4", "AGAINST")])).toMatchObject({ status: "CARRIED" });
    expect(four(2, 20, [late("lot-3", "AGAINST"), late("lot-4", "AGAINST")])).toMatchObject({ status: "LOST", evaluation: { reason: "Fewer than 3 lots voted for" } });
  });

  it("without dissent: lost on one written vote against, carried with none; unanimous: every lot for", () => {
    const base = { meetingTally: tally12({ forCount: 5, forUE: 50 }) };
    expect(close({ ...base, category: "WITHOUT_DISSENT", resolution: WA.resolutionCategories.WITHOUT_DISSENT!, lateVotes: [late("lot-6", "FOR")] })).toMatchObject({ status: "CARRIED" });
    expect(close({ ...base, category: "WITHOUT_DISSENT", resolution: WA.resolutionCategories.WITHOUT_DISSENT!, lateVotes: [late("lot-6", "AGAINST")] })).toMatchObject({ status: "LOST" });
    const unanimous = { ...base, category: "UNANIMOUS", resolution: WA.resolutionCategories.UNANIMOUS! };
    expect(close({ ...unanimous, lateVotes: lotIds(6, 12).map((id) => late(id, "FOR")) })).toMatchObject({ status: "CARRIED", effectiveOn: "2026-12-01" });
    expect(close({ ...unanimous, lateVotes: lotIds(6, 11).map((id) => late(id, "FOR")) })).toMatchObject({ status: "LOST" });
  });

  it("2 lots: only if unanimous", () => {
    const two = (lateVotes: LateVote[]) =>
      close({ meetingTally: { forCount: 1, againstCount: 0, abstainCount: 1, forUE: 10, againstUE: 0, totalLots: 2, totalEntitlement: 20 }, enteredLotIds: ["lot-1", "lot-2"], lateVotes });
    expect(two([])).toMatchObject({ status: "LOST", evaluation: { reason: "Not every lot in the scheme voted for" } });
  });
});

describe("closeTally and absentLotCount", () => {
  it("adds each written vote, weighed where the meeting's votes were, and the lots recorded", () => {
    expect(closeTally({ forCount: 1, againstCount: 1, forUE: 10, againstUE: 5 }, [late("a", "FOR", 7), late("b", "AGAINST", 3)])).toEqual({
      tally: { forCount: 2, againstCount: 2, forUE: 17, againstUE: 8 },
    });
    // Not weighed: the entitlement is not needed.
    expect(closeTally({ forCount: 1, againstCount: 0 }, [late("a", "FOR", null)])).toEqual({ tally: { forCount: 2, againstCount: 0 } });
    expect(closeTally({ forCount: 1, againstCount: 0, lotsRecorded: 1 }, [late("a", "AGAINST", null)])).toEqual({ tally: { forCount: 1, againstCount: 1, lotsRecorded: 2 } });
    // The meeting's tally is not changed.
    const meeting = { forCount: 1, againstCount: 0 };
    closeTally(meeting, [late("a", "FOR")]);
    expect(meeting).toEqual({ forCount: 1, againstCount: 0 });
  });

  it("refuses a count the written votes cannot be added to", () => {
    for (const t of [{ poll: true }, { votesPresentCount: 3 }, { votesPresentEntitlement: 30 }, { eligibleLots: 8 }]) {
      expect(closeTally({ forCount: 1, againstCount: 0, ...t }, []), JSON.stringify(t)).toEqual({
        error: "The votes at the meeting were counted in a way the written votes cannot be added to, so it cannot be decided here.",
      });
    }
  });

  it("refuses written votes from outside the meeting's lots, entered at it, twice for a lot, or more than its lots (review M)", () => {
    const lots = { meetingLotIds: lotIds(1, 4), enteredLotIds: lotIds(1, 3) };
    const meeting = { forCount: 3, againstCount: 0, totalLots: 4 };
    const refused = { error: "A written vote is recorded for a lot that was not one of the lots at the meeting with nothing entered, so the votes cannot be counted. Check the written votes." };
    expect(closeTally(meeting, [late("lot-4", "FOR")], lots)).toEqual({ tally: { forCount: 4, againstCount: 0, totalLots: 4 } });
    expect(closeTally(meeting, [late("lot-5", "FOR")], lots)).toEqual(refused);
    expect(closeTally(meeting, [late("lot-3", "FOR")], lots)).toEqual(refused);
    expect(closeTally(meeting, [late("lot-4", "FOR"), late("lot-4", "FOR")], lots)).toEqual(refused);
    expect(closeTally(meeting, [late("lot-4", "FOR")], { ...lots, meetingLotIds: null })).toEqual(refused);
    expect(closeTally({ ...meeting, totalLots: 3 }, [late("lot-4", "FOR")], lots)).toEqual(refused);
    // No written vote: nothing to check.
    expect(closeTally(meeting, [], { ...lots, meetingLotIds: null })).toEqual({ tally: meeting });
  });

  it("the probe: a 4-lot unanimous resolution, 3 for and lot 4 with nothing entered; a lot added later voting for never carries it", () => {
    const four = facts({
      category: "UNANIMOUS",
      resolution: WA.resolutionCategories.UNANIMOUS!,
      meetingTally: { forCount: 3, againstCount: 0, abstainCount: 0, totalLots: 4 },
      enteredLotIds: lotIds(1, 3),
      meetingLotIds: lotIds(1, 4),
      lateVotes: [late("lot-5", "FOR")],
    });
    const ready = row({ noticeGivenOn: "2026-11-05" });
    expect(pendingDecision(ready, "2026-12-08", { votingPeriod: four })).toEqual({
      settle: false,
      waitUntil: null,
      blocker: "A written vote is recorded for a lot that was not one of the lots at the meeting with nothing entered, so the votes cannot be counted. Check the written votes.",
    });
    // Lot 4 itself voting for carries it, and lot 4 not voting leaves it lost.
    expect(pendingDecision(ready, "2026-12-08", { votingPeriod: { ...four, lateVotes: [late("lot-4", "FOR")] } })).toMatchObject({ settle: true, status: "CARRIED" });
    expect(pendingDecision(ready, "2026-12-08", { votingPeriod: { ...four, lateVotes: [] } })).toMatchObject({ settle: true, status: "LOST" });
  });

  it("counts the lots with nothing entered, once each", () => {
    expect(absentLotCount(facts())).toBe(7);
    expect(absentLotCount(facts({ enteredLotIds: ["lot-1", "lot-1"] }))).toBe(11);
    expect(absentLotCount(facts({ enteredLotIds: lotIds(1, 12) }))).toBe(0);
    expect(absentLotCount(facts({ meetingTally: { forCount: 0, againstCount: 0 } }))).toBeNull();
  });
});

describe("written votes after the meeting (D8)", () => {
  const ok = {
    lotId: "lot-6",
    lotNumber: "6",
    vote: "FOR",
    receivedOn: "2026-11-20",
    today: "2026-11-25",
    enteredLotIds: lotIds(1, 5),
    lateLotIds: [] as string[],
    meetingLotIds: lotIds(1, 12) as readonly string[] | null,
  };

  it("takes FOR or AGAINST from a lot with nothing entered, received from the day it was made to the close", () => {
    expect(lateVoteProblem(row(), ok)).toBeNull();
    expect(lateVoteProblem(row(), { ...ok, vote: "AGAINST", receivedOn: "2026-11-02" })).toBeNull();
    // The last day: Monday 30 November, recorded during the grace.
    expect(lateVoteProblem(row(), { ...ok, receivedOn: "2026-11-30", today: "2026-12-05" })).toBeNull();
  });

  it("refuses everything else, saying why", () => {
    expect(lateVoteProblem(row(), { ...ok, vote: "ABSTAIN" })).toBe("Choose For or Against. Nothing was saved.");
    expect(lateVoteProblem(row(), { ...ok, lotNumber: null })).toBe("Choose a lot of this building. Nothing was saved.");
    // Review M: a lot added (or entered again) after the meeting was not one of its lots, and a row without them takes none.
    expect(lateVoteProblem(row(), { ...ok, lotId: "lot-13", lotNumber: "13" })).toBe(
      "Lot 13 was not one of the building's lots at the meeting, so it cannot vote in writing on this resolution. Nothing was saved.",
    );
    expect(lateVoteProblem(row(), { ...ok, meetingLotIds: null })).toBe(
      "The lots of the meeting were not kept with this resolution, so a written vote cannot be recorded. Nothing was saved.",
    );
    expect(lateVoteProblem(row(), { ...ok, lotId: "lot-3", lotNumber: "3" })).toBe(
      "Lot 3 had a vote or an abstention entered at the meeting, so it cannot vote again in writing. Nothing was saved.",
    );
    expect(lateVoteProblem(row(), { ...ok, lateLotIds: ["lot-6"] })).toBe("A written vote for lot 6 is already recorded. Each lot votes once. Nothing was saved.");
    expect(lateVoteProblem(row(), { ...ok, receivedOn: "2026-12-01", today: "2026-12-02" })).toBe(
      "The day the written vote was received must be on or before 30 November 2026, the last day of its period.",
    );
    expect(lateVoteProblem(row(), { ...ok, receivedOn: "2026-11-01" })).toBe("The day the written vote was received cannot be before 2 November 2026, the day the resolution was made.");
    expect(lateVoteProblem(row(), { ...ok, receivedOn: "2026-11-26" })).toBe("The day the written vote was received cannot be after today.");
    expect(lateVoteProblem(row(), { ...ok, receivedOn: "20/11/2026" })).toBe("Enter the day the written vote was received as a date.");
    expect(lateVoteProblem(row({ status: "CARRIED" }), ok)).toBe("This resolution is already decided. Nothing was saved.");
    const { lateVotes: _l, ...noLate } = VP;
    expect(lateVoteProblem(row({ rule: noLate }), ok)).toBe("Written votes after the meeting are not taken on this resolution. Nothing was saved.");
  });
});

describe("the words", () => {
  const dates = pendingDates(VP, "2026-11-02");

  it("tells the chair when voting closes and what to record, with no dashes or semicolons", () => {
    const notice = pendingRecordedNotice(VP, dates);
    expect(notice).toBe(
      "Recorded. Its voting period is open until 30 November 2026. It is decided as at 1 December 2026 on the votes at the meeting and the written votes received by then. Give the written notice of the outcome to the owners with no-one present at the meeting and record the day it was given. Record each written vote under Decided later on this page.",
    );
    expect(notice).not.toMatch(NO_DASH);
    // Review L4: every lot entered at the meeting, so no outcome notice and no written vote are asked for.
    expect(pendingRecordedNotice(VP, dates, { someLotAbsent: false })).toBe(
      "Recorded. Its voting period is open until 30 November 2026. It is decided as at 1 December 2026 on the votes at the meeting and the written votes received by then.",
    );
    expect(pendingRecordedNotice(VP, dates, { someLotAbsent: true })).toBe(notice);
  });

  it("refuses Motion lost on an open vote in plain words", () => {
    const words = laterLostRefusal(VP, "Its 28-day voting period is open, so it is decided when the period closes");
    expect(words).toBe(
      "The votes at the meeting cannot decide this motion. Its 28-day voting period is open, so it is decided when the period closes. Nothing was saved. Record the votes to start its voting period, or check the votes entered.",
    );
    expect(words).not.toMatch(NO_DASH);
  });
});

describe("the meeting page's panel", () => {
  const LOTS = lotIds(1, 12).map((id, i) => ({ id, lotNumber: String(i + 1) }));
  const panelRow = (extra: Partial<PendingRowView> & { status?: string; endedBy?: string | null; effectiveOn?: string | null } = {}) => ({
    ...row(extra),
    id: "p1",
    agendaItemId: "i1",
    petitionReceivedOn: null,
    effectiveOn: extra.effectiveOn ?? null,
    endedBy: extra.endedBy ?? null,
  });
  const panel = (r: ReturnType<typeof panelRow>, today: string, f: VotingPeriodFacts | null = facts({ lateVotes: [late("lot-6", "FOR", 10, "2026-11-10")] })) =>
    pendingPanelItem(r, { itemLabel: "3. New by-law", today, facts: { votingPeriod: f }, lots: LOTS });

  it("while open: when it closes and is decided, the votes so far, the notice wanted, and the lots that may still vote in writing", () => {
    const p = panel(panelRow(), "2026-11-20");
    expect(p).toMatchObject({ status: "PENDING", kindLabel: "Voting period", blocker: null, canRecordNotice: true, noticeLabel: VP.lateVotes!.noticeLabel, canConfirm: false, petitionWords: null, meetingNoticeWords: null });
    expect(p.standing).toBe(
      "Voting is open until 30 November 2026. It is decided as at 1 December 2026 on the votes at the meeting and the written votes received by then. StrataVerze records the decision on 8 December 2026, so a written vote received in time can still be recorded.",
    );
    expect(p.facts).toEqual([
      "Made on 2 November 2026.",
      "Its period ends on 30 November 2026.",
      "Votes at the meeting: 4 for, 1 against.",
      "The written notice of the outcome to the owners with no-one present at the meeting is not recorded yet.",
      "Lot 6 voted for in writing, received on 10 November 2026.",
    ]);
    // Lots 1 to 5 were entered at the meeting and lot 6 has voted in writing.
    expect(p.lateVote).toEqual({ words: VP.lateVotes!.words, lots: LOTS.slice(6) });
    // Review M: only the lots of the meeting are offered (lot 13 added since is not), and none where they were not kept.
    const added = pendingPanelItem(panelRow(), { itemLabel: "3. New by-law", today: "2026-11-20", facts: { votingPeriod: facts() }, lots: [...LOTS, { id: "lot-13", lotNumber: "13" }] });
    expect(added.lateVote?.lots.map((l) => l.lotNumber)).toEqual(["6", "7", "8", "9", "10", "11", "12"]);
    expect(pendingPanelItem(panelRow(), { itemLabel: "3. New by-law", today: "2026-11-20", facts: { votingPeriod: facts({ meetingLotIds: null }) }, lots: LOTS })).not.toHaveProperty("lateVote");
    for (const w of [p.standing, ...p.facts]) expect(w).not.toMatch(NO_DASH);
  });

  it("with the notice given: no notice to record, and a notice after the close is flagged", () => {
    const given = panel(panelRow({ noticeGivenOn: "2026-11-04" }), "2026-11-20");
    expect(given.canRecordNotice).toBe(false);
    expect(given.facts).toContain("The written notice of the outcome to the owners with no-one present at the meeting was given on 4 November 2026.");
    const lateNotice = panel(panelRow({ noticeGivenOn: "2026-12-02" }), "2026-12-03");
    expect(lateNotice.facts).toContain("The written notice of the outcome to the owners with no-one present at the meeting was given on 2 December 2026, after its voting period closed.");
  });

  it("after the close without the notice: what stops it, and written votes still recordable", () => {
    const p = panel(panelRow(), "2026-12-02");
    expect(p.standing).toBe("Waiting for something to be recorded before it can be decided.");
    expect(p.blocker).toMatch(/^The written notice of the outcome to the owners with no-one present at the meeting is not recorded as given/);
    expect(p.lateVote?.lots).toHaveLength(6);
  });

  it("every lot entered at the meeting: no notice wanted and no written vote offered", () => {
    const p = panel(panelRow(), "2026-11-20", facts({ enteredLotIds: lotIds(1, 12) }));
    expect(p.canRecordNotice).toBe(false);
    expect(p).not.toHaveProperty("lateVote");
    expect(p.facts.some((f) => f.includes("notice of the outcome"))).toBe(false);
  });

  it("decided: carried or lost on the votes at the close, nothing more to record", () => {
    const carried = panel(panelRow({ status: "CARRIED", endedBy: "VOTES_AT_CLOSE", effectiveOn: "2026-12-01", noticeGivenOn: "2026-11-04" }), "2026-12-08");
    expect(carried).toMatchObject({ status: "CARRIED", standing: "Took effect on 1 December 2026, on the votes when its voting period closed.", canRecordNotice: false });
    expect(carried).not.toHaveProperty("lateVote");
    const lost = panel(panelRow({ status: "LOST", endedBy: "VOTES_AT_CLOSE", noticeGivenOn: "2026-11-04" }), "2026-12-08");
    expect(lost).toMatchObject({ status: "LOST", standing: "Lost on the votes when its voting period closed." });
    expect(formatDay("2026-12-01")).toBe("1 December 2026");
  });

  it("leaves the Victorian and ACT panel as it was: no notice label and no written votes", () => {
    const vic = PENDING_RULE_PACKS.VIC.rules.MEETING_RULES.pendingResolutions!.INTERIM_SPECIAL!;
    const d = pendingDates(vic, "2026-11-02");
    const p = pendingPanelItem(
      { ...row({ rule: vic, windowClosesOn: d.windowClosesOn, noticeDueOn: d.noticeDueOn }), kind: "INTERIM_SPECIAL", id: "v", agendaItemId: "i", petitionReceivedOn: null, effectiveOn: null, endedBy: null },
      { itemLabel: "1. X", today: "2026-11-05", lots: LOTS },
    );
    expect(p).not.toHaveProperty("noticeLabel");
    expect(p).not.toHaveProperty("lateVote");
    expect(p.canRecordNotice).toBe(true);
  });
});
