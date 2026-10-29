/**
 * Resolutions decided later (pure; VIC, ACT and WA stage 2, PR 8b-i,
 * 29 Oct 2026): the dates of each kind across month ends and daylight saving,
 * every transition and blocker of the daily decision, the petition
 * thresholds at their boundary, confirmations and the days an adviser
 * records. Matthew Wrigley's decisions D1 to D7 of 29 Oct 2026.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS } from "@/config/statutory";
import { dayIn } from "@/lib/jurisdiction/time-zone";
import {
  confirmationResult,
  dayProblem,
  formatDay,
  isPendingItem,
  laterLostRefusal,
  madeOnDay,
  pendingDates,
  pendingDecision,
  pendingPanelItem,
  pendingRecordedNotice,
  petitionStops,
  type PendingRowView,
} from "./pending";

const VIC = PENDING_RULE_PACKS.VIC.rules.MEETING_RULES.pendingResolutions!;
const ACT = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES.pendingResolutions!;
const S97 = VIC.INTERIM_SPECIAL!;
const S78 = VIC.INTERIM_NO_QUORUM!;
const RQ = ACT.REDUCED_QUORUM!;

const row = (kind: string, rule: typeof S97, madeOn: string, extra: Partial<PendingRowView> = {}): PendingRowView => {
  const d = pendingDates(rule, madeOn);
  return {
    kind,
    status: "PENDING",
    madeOn,
    windowClosesOn: d.windowClosesOn,
    noticeDueOn: d.noticeDueOn,
    noticeGivenOn: null,
    meetingNoticeGivenOn: null,
    meetingNoticeMeetingId: null,
    meetingHeldBy: null,
    rule,
    ...extra,
  };
};

describe("the dates (D1, D2)", () => {
  it("a meeting on Monday 2 November 2026: Victoria closes Tuesday 1 December, the ACT Monday 30 November, notice due 16 November", () => {
    expect(pendingDates(S97, "2026-11-02")).toEqual({ madeOn: "2026-11-02", windowClosesOn: "2026-12-01", noticeDueOn: "2026-11-16" });
    expect(pendingDates(S78, "2026-11-02")).toEqual({ madeOn: "2026-11-02", windowClosesOn: "2026-12-01", noticeDueOn: "2026-11-16" });
    expect(pendingDates(RQ, "2026-11-02")).toEqual({ madeOn: "2026-11-02", windowClosesOn: "2026-11-30", noticeDueOn: "2026-11-16" });
  });

  it("counts calendar days across month and year ends and a leap day", () => {
    expect(pendingDates(S97, "2027-01-31").windowClosesOn).toBe("2027-03-01");
    expect(pendingDates(RQ, "2027-01-31").windowClosesOn).toBe("2027-02-28");
    expect(pendingDates(RQ, "2028-02-01").windowClosesOn).toBe("2028-02-29");
    expect(pendingDates(S97, "2026-12-20")).toMatchObject({ windowClosesOn: "2027-01-18", noticeDueOn: "2027-01-03" });
  });

  it("counts whole days across the daylight saving change (Melbourne and Canberra, 4 Oct 2026)", () => {
    expect(pendingDates(S97, "2026-09-20").windowClosesOn).toBe("2026-10-19");
    expect(pendingDates(RQ, "2026-09-20").windowClosesOn).toBe("2026-10-18");
    // A meeting at 1.30 am on the change day, in the building's zone, is made on that day.
    expect(dayIn("Australia/Melbourne", "2026-10-03T14:30:00.000Z")).toBe("2026-10-04");
    expect(madeOnDay(dayIn("Australia/Canberra", "2026-10-03T14:30:00.000Z"), "2026-10-04")).toBe("2026-10-04");
  });

  it("is made on the later of the meeting's day and the recording day", () => {
    expect(madeOnDay("2026-11-02", "2026-11-02")).toBe("2026-11-02");
    expect(madeOnDay("2026-11-02", "2026-11-03")).toBe("2026-11-03");
    expect(madeOnDay("2026-11-05", "2026-11-03")).toBe("2026-11-05");
  });

  it("has no notice due where the rule asks none", () => {
    expect(pendingDates({ windowDays: 28, noticeWithinDays: null }, "2026-11-02").noticeDueOn).toBeNull();
  });
});

describe("the daily decision", () => {
  it("waits until the day after the window, then carries it once the notice is recorded (D1, D3)", () => {
    const r = row("INTERIM_SPECIAL", S97, "2026-11-02", { noticeGivenOn: "2026-11-10" });
    expect(pendingDecision(r, "2026-11-02")).toEqual({ settle: false, waitUntil: "2026-12-02", blocker: null });
    expect(pendingDecision(r, "2026-12-01")).toEqual({ settle: false, waitUntil: "2026-12-02", blocker: null });
    expect(pendingDecision(r, "2026-12-02")).toEqual({ settle: true, status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-02" });
    expect(pendingDecision(r, "2027-03-01")).toMatchObject({ settle: true, effectiveOn: "2026-12-02" });
    const act = row("REDUCED_QUORUM", RQ, "2026-11-02", { noticeGivenOn: "2026-11-02" });
    expect(pendingDecision(act, "2026-11-30")).toMatchObject({ settle: false });
    expect(pendingDecision(act, "2026-12-01")).toEqual({ settle: true, status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-01" });
  });

  it("never takes effect without its notice recorded (D3), and a late notice does not move the date", () => {
    const r = row("INTERIM_SPECIAL", S97, "2026-11-02");
    expect(pendingDecision(r, "2026-12-02")).toEqual({
      settle: false,
      waitUntil: null,
      blocker: "Its notice to the owners is not recorded as given, so it cannot take effect. Record the day the notice was given.",
    });
    // Given late (after 16 Nov) but within the window: still 2 Dec.
    expect(pendingDecision({ ...r, noticeGivenOn: "2026-11-25" }, "2026-12-05")).toMatchObject({ settle: true, effectiveOn: "2026-12-02" });
    // Given after the window: takes effect on that day, never before it.
    expect(pendingDecision({ ...r, noticeGivenOn: "2026-12-10" }, "2026-12-10")).toMatchObject({ settle: true, effectiveOn: "2026-12-10" });
  });

  it("leaves a decided row alone", () => {
    expect(pendingDecision({ ...row("INTERIM_SPECIAL", S97, "2026-11-02"), status: "LOST" }, "2027-01-01")).toEqual({ settle: false, waitUntil: null, blocker: null });
  });

  describe("Victoria s 78 with a special general meeting called (D7)", () => {
    const called = row("INTERIM_NO_QUORUM", S78, "2026-11-02", {
      noticeGivenOn: "2026-11-05",
      meetingNoticeGivenOn: "2026-11-20",
      meetingHeldBy: "2026-12-18",
      meetingNoticeMeetingId: "sgm",
    });

    it("waits for the meeting's last day, not the 29 days", () => {
      expect(pendingDecision(called, "2026-12-02", { linkedMeeting: { openedOn: null } })).toEqual({ settle: false, waitUntil: "2026-12-19", blocker: null });
      expect(pendingDecision(called, "2026-12-18", { linkedMeeting: { openedOn: null } })).toMatchObject({ settle: false, waitUntil: "2026-12-19" });
    });

    it("takes effect the day after when the meeting was not opened in time", () => {
      expect(pendingDecision(called, "2026-12-19", { linkedMeeting: { openedOn: null } })).toEqual({ settle: true, status: "CARRIED", endedBy: "MEETING_NOT_HELD", effectiveOn: "2026-12-19" });
      expect(pendingDecision(called, "2026-12-19", { linkedMeeting: { openedOn: "2026-12-20" } })).toMatchObject({ settle: true, endedBy: "MEETING_NOT_HELD" });
      expect(pendingDecision(called, "2026-12-19", { linkedMeeting: null })).toMatchObject({ settle: true, endedBy: "MEETING_NOT_HELD" });
    });

    it("never takes effect on its own when the meeting was held but its decision is not recorded", () => {
      for (const opened of ["2026-12-01", "2026-12-18"]) {
        expect(pendingDecision(called, "2027-06-01", { linkedMeeting: { openedOn: opened } })).toEqual({
          settle: false,
          waitUntil: null,
          blocker: "The special general meeting called for it was held. Record whether it confirmed the resolution.",
        });
      }
    });

    it("fails closed when the meeting is not linked or not read, or the notice is missing", () => {
      expect(pendingDecision({ ...called, meetingNoticeMeetingId: null }, "2026-12-19", { linkedMeeting: null }).settle).toBe(false);
      expect(pendingDecision(called, "2026-12-19").settle).toBe(false);
      expect(pendingDecision({ ...called, noticeGivenOn: null }, "2026-12-19", { linkedMeeting: { openedOn: null } })).toMatchObject({ settle: false, blocker: expect.stringMatching(/^Its notice to the owners/) });
      expect(pendingDecision({ ...called, meetingHeldBy: null }, "2026-12-19", { linkedMeeting: { openedOn: null } }).settle).toBe(false);
    });

    it("without a meeting called, takes effect as s 97 does", () => {
      const plain = row("INTERIM_NO_QUORUM", S78, "2026-11-02", { noticeGivenOn: "2026-11-05" });
      expect(pendingDecision(plain, "2026-12-02")).toEqual({ settle: true, status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-02" });
    });
  });
});

describe("petitions (D4, D5)", () => {
  it("Victoria: strictly more than 25% of all lots; exactly 25% does not stop it", () => {
    expect(petitionStops(S97, 2, 8)).toBe(false);
    expect(petitionStops(S97, 3, 8)).toBe(true);
    expect(petitionStops(S97, 25, 100)).toBe(false);
    expect(petitionStops(S97, 26, 100)).toBe(true);
  });

  it("the ACT: strictly more than half of the units entitled to vote; exactly half does not", () => {
    expect(petitionStops(RQ, 3, 6)).toBe(false);
    expect(petitionStops(RQ, 4, 6)).toBe(true);
    expect(petitionStops(RQ, 3, 5)).toBe(true);
  });

  it("never stops a kind with no petition, or with nobody to count", () => {
    expect(petitionStops(S78, 8, 8)).toBe(false);
    expect(petitionStops(S97, 1, 0)).toBe(false);
  });
});

describe("confirmation by a later meeting", () => {
  const s78 = row("INTERIM_NO_QUORUM", S78, "2026-11-02", {
    noticeGivenOn: "2026-11-05",
    meetingNoticeGivenOn: "2026-11-20",
    meetingHeldBy: "2026-12-18",
    meetingNoticeMeetingId: "sgm",
  });
  const at = (meetingDay: string, itemStatus: string, more = {}) => ({ meetingDay, itemStatus, isLinkedMeeting: true, standardQuorum: null, ...more });

  it("Victoria: the meeting called confirms it (carried) or not (lost)", () => {
    expect(confirmationResult(s78, at("2026-12-10", "CARRIED"))).toEqual({ status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: "2026-12-10" });
    expect(confirmationResult(s78, at("2026-12-10", "LOST"))).toEqual({ status: "LOST", endedBy: "NOT_CONFIRMED", effectiveOn: null });
    expect(confirmationResult(s78, at("2026-12-18", "CARRIED"))).toMatchObject({ status: "CARRIED" });
  });

  it("Victoria: refuses another meeting, one held too late, one before it was made, an item not decided, or no meeting called", () => {
    expect(confirmationResult(s78, at("2026-12-10", "CARRIED", { isLinkedMeeting: false }))).toEqual({ error: "Choose the special general meeting the notice called." });
    expect(confirmationResult(s78, at("2026-12-19", "CARRIED"))).toEqual({ error: "That meeting was not held by 18 December 2026, so it cannot confirm the resolution." });
    expect(confirmationResult(s78, at("2026-11-02", "CARRIED"))).toMatchObject({ error: expect.stringMatching(/must be held after 2 November 2026/) });
    expect(confirmationResult(s78, at("2026-12-10", "DEFERRED"))).toEqual({ error: "Choose a motion recorded as carried or lost at that meeting." });
    expect(confirmationResult({ ...s78, meetingNoticeGivenOn: null, meetingHeldBy: null }, at("2026-12-10", "CARRIED"))).toEqual({ error: "Record the notice of the special general meeting first." });
    // D3: confirmed but its own notice is not recorded.
    expect(confirmationResult({ ...s78, noticeGivenOn: null }, at("2026-12-10", "CARRIED"))).toMatchObject({ error: expect.stringMatching(/^Its notice to the owners/) });
    expect(confirmationResult({ ...s78, noticeGivenOn: null }, at("2026-12-10", "LOST"))).toMatchObject({ status: "LOST" });
  });

  it("the ACT: a carried motion with a standard quorum, held within the 28 days, confirms it sooner", () => {
    const act = row("REDUCED_QUORUM", RQ, "2026-11-02", { noticeGivenOn: "2026-11-03" });
    const c = (meetingDay: string, itemStatus: string, standardQuorum: boolean | null) => ({ meetingDay, itemStatus, standardQuorum, isLinkedMeeting: false });
    expect(confirmationResult(act, c("2026-11-20", "CARRIED", true))).toEqual({ status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: "2026-11-20" });
    expect(confirmationResult(act, c("2026-11-20", "CARRIED", false))).toEqual({ error: "Choose a motion recorded with a standard quorum present." });
    expect(confirmationResult(act, c("2026-11-20", "CARRIED", null))).toEqual({ error: "Choose a motion recorded with a standard quorum present." });
    expect(confirmationResult(act, c("2026-11-20", "LOST", true))).toEqual({ error: "Only a motion recorded as carried can confirm it." });
    expect(confirmationResult(act, c("2026-12-01", "CARRIED", true))).toMatchObject({ error: expect.stringMatching(/held by 30 November 2026/) });
  });

  it("refuses for an interim special resolution, which no meeting confirms", () => {
    expect(confirmationResult(row("INTERIM_SPECIAL", S97, "2026-11-02"), at("2026-11-20", "CARRIED"))).toEqual({ error: "This resolution is not confirmed by a later meeting." });
  });
});

describe("the days an adviser records", () => {
  it("must be a date from the day it was made, to the window's end where given, and never after today", () => {
    expect(dayProblem("2026-11-10", "2026-11-02", "2026-12-01", "2026-11-15", "the petition was received")).toBeNull();
    expect(dayProblem("2026-12-01", "2026-11-02", "2026-12-01", "2026-12-05", "the petition was received")).toBeNull();
    expect(dayProblem("2026-12-02", "2026-11-02", "2026-12-01", "2026-12-05", "the petition was received")).toBe(
      "The day the petition was received must be on or before 1 December 2026, the last day of its period.",
    );
    expect(dayProblem("2026-11-01", "2026-11-02", null, "2026-12-05", "the notice was given")).toBe(
      "The day the notice was given cannot be before 2 November 2026, the day the resolution was made.",
    );
    expect(dayProblem("2026-11-20", "2026-11-02", null, "2026-11-15", "the notice was given")).toBe("The day the notice was given cannot be after today.");
    expect(dayProblem("20/11/2026", "2026-11-02", null, "2026-11-25", "the notice was given")).toBe("Enter the day the notice was given as a date.");
    expect(dayProblem("2026-02-30", "2026-01-02", null, "2026-11-25", "the notice was given")).toBe("Enter the day the notice was given as a date.");
  });
});

describe("the words", () => {
  it("tells the chair the dates, with no dashes or semicolons", () => {
    const text = pendingRecordedNotice(S97, pendingDates(S97, "2026-11-02"));
    expect(text).toBe(
      "Recorded as an interim special resolution, decided later. It was made on 2 November 2026. Give the owners notice of it by 16 November 2026 and record the day it was given. Unless it is stopped sooner, it takes effect on 2 December 2026 at the earliest. See Decided later on this page.",
    );
    expect(pendingRecordedNotice(RQ, pendingDates(RQ, "2026-11-02"))).toMatch(/^Recorded as a reduced quorum decision, decided later\..*1 December 2026/);
    for (const t of [text, laterLostRefusal(S78, "Majority of votes cast")]) expect(t).not.toMatch(/[;–—]/);
    expect(laterLostRefusal(S78, "Majority of votes cast")).toBe(
      "The votes recorded make this motion an interim resolution, decided later, not lost. Majority of votes cast. Nothing was saved. Record it as resolved to start its period, or check the votes entered.",
    );
  });

  it("formats a day as people read it", () => {
    expect(formatDay("2026-01-05")).toBe("5 January 2026");
    expect(formatDay("not a day")).toBe("not a day");
  });

  it("knows a pending item by its stored status", () => {
    expect(isPendingItem({ status: "INTERIM" })).toBe(true);
    expect(isPendingItem({ status: "OPEN" })).toBe(true);
    for (const s of ["PENDING", "CARRIED", "LOST", "DEFERRED", null, undefined]) expect(isPendingItem({ status: s })).toBe(false);
    expect(isPendingItem({})).toBe(false);
  });
});

describe("the meeting page's panel (pendingPanelItem)", () => {
  const panelRow = (r: PendingRowView, more: Partial<{ petitionReceivedOn: string; effectiveOn: string; endedBy: string }> = {}) => ({
    ...r,
    id: "p1",
    agendaItemId: "i1",
    petitionReceivedOn: null,
    effectiveOn: null,
    endedBy: null,
    ...more,
  });

  it("a pending interim special resolution: its dates, the notice due, and what can be recorded", () => {
    const view = pendingPanelItem(panelRow(row("INTERIM_SPECIAL", S97, "2026-11-02")), { itemLabel: "3. Repaint the foyer", today: "2026-11-10" });
    expect(view).toMatchObject({
      id: "p1",
      itemId: "i1",
      itemLabel: "3. Repaint the foyer",
      kindLabel: "Interim special resolution",
      status: "PENDING",
      standing: "Pending. Unless it is stopped sooner, it takes effect on 2 December 2026 at the earliest.",
      facts: ["Made on 2 November 2026.", "Its period ends on 1 December 2026.", "Notice to the owners due by 16 November 2026, not recorded yet."],
      blocker: null,
      canRecordNotice: true,
      petitionWords: S97.petition!.words,
      meetingNoticeWords: null,
      canConfirm: false,
      madeOn: "2026-11-02",
      windowClosesOn: "2026-12-01",
      today: "2026-11-10",
    });
  });

  it("says what blocks it once its period has ended without the notice", () => {
    const view = pendingPanelItem(panelRow(row("REDUCED_QUORUM", RQ, "2026-11-02")), { itemLabel: "1. A", today: "2026-12-05" });
    expect(view.standing).toBe("Waiting for something to be recorded before it can take effect.");
    expect(view.blocker).toMatch(/^Its notice to the owners is not recorded as given/);
    expect(view.canConfirm).toBe(true);
  });

  it("Victoria s 78: offers the meeting notice, then the decision of that meeting once it is called", () => {
    const before = pendingPanelItem(panelRow(row("INTERIM_NO_QUORUM", S78, "2026-11-02")), { itemLabel: "1. A", today: "2026-11-10" });
    expect(before).toMatchObject({ meetingNoticeWords: S78.meetingNotice!.words, canConfirm: false, petitionWords: null });
    const called = row("INTERIM_NO_QUORUM", S78, "2026-11-02", { noticeGivenOn: "2026-11-20", meetingNoticeGivenOn: "2026-11-20", meetingHeldBy: "2026-12-18", meetingNoticeMeetingId: "sgm" });
    const after = pendingPanelItem(panelRow(called), { itemLabel: "1. A", today: "2026-11-25", facts: { linkedMeeting: { openedOn: null } }, calledMeeting: "Special meeting (10 Dec 2026)" });
    expect(after).toMatchObject({ meetingNoticeWords: null, canConfirm: true, standing: "Waiting for the special general meeting, which must be held by 18 December 2026." });
    expect(after.facts).toContain("Special general meeting called on 20 November 2026 (Special meeting (10 Dec 2026)), to be held by 18 December 2026.");
    expect(after.facts).toContain("Notice to the owners given on 20 November 2026, after it was due on 16 November 2026.");
  });

  it("a decided row: how it ended, and nothing more to record", () => {
    const carried = pendingPanelItem(panelRow({ ...row("INTERIM_SPECIAL", S97, "2026-11-02", { noticeGivenOn: "2026-11-05" }), status: "CARRIED" }, { effectiveOn: "2026-12-02", endedBy: "PERIOD_ENDED" }), {
      itemLabel: "1. A",
      today: "2026-12-05",
    });
    expect(carried).toMatchObject({
      status: "CARRIED",
      standing: "Took effect as a special resolution on 2 December 2026, after its period ended.",
      canRecordNotice: false,
      petitionWords: null,
      meetingNoticeWords: null,
      canConfirm: false,
      blocker: null,
    });
    const lost = pendingPanelItem(panelRow({ ...row("INTERIM_SPECIAL", S97, "2026-11-02"), status: "LOST" }, { petitionReceivedOn: "2026-11-20", endedBy: "PETITION" }), {
      itemLabel: "1. A",
      today: "2026-12-05",
      petitionLots: ["1", "2", "3"],
    });
    expect(lost.standing).toBe("Stopped by a petition, so it is recorded as lost.");
    expect(lost.facts).toContain("Petition received on 20 November 2026, signed for lots 1, 2 and 3.");
    const confirmed = pendingPanelItem(panelRow({ ...row("REDUCED_QUORUM", RQ, "2026-11-02"), status: "CARRIED" }, { effectiveOn: "2026-11-20", endedBy: "CONFIRMED" }), {
      itemLabel: "1. A",
      today: "2026-12-05",
      confirmedBy: "EGM (20 Nov 2026), motion 2",
    });
    expect(confirmed.standing).toBe("Took effect on 20 November 2026, when a later meeting confirmed it.");
    expect(confirmed.facts).toContain("Confirmed at EGM (20 Nov 2026), motion 2.");
    const notConfirmed = pendingPanelItem(panelRow({ ...row("INTERIM_NO_QUORUM", S78, "2026-11-02"), status: "LOST" }, { endedBy: "NOT_CONFIRMED" }), { itemLabel: "1. A", today: "2026-12-05" });
    expect(notConfirmed.standing).toBe("Not confirmed at the special general meeting, so it is recorded as lost.");
  });

  it("uses plain words with no dashes or semicolons", () => {
    const views = [
      pendingPanelItem(panelRow(row("INTERIM_SPECIAL", S97, "2026-11-02")), { itemLabel: "1. A", today: "2026-12-05" }),
      pendingPanelItem(panelRow(row("INTERIM_NO_QUORUM", S78, "2026-11-02")), { itemLabel: "1. A", today: "2026-11-05" }),
      pendingPanelItem(panelRow(row("REDUCED_QUORUM", RQ, "2026-11-02")), { itemLabel: "1. A", today: "2026-11-05" }),
    ];
    for (const v of views) expect([v.standing, ...v.facts, v.blocker ?? "", v.help, v.petitionWords ?? "", v.meetingNoticeWords ?? ""].join(" ")).not.toMatch(/[;–—]/);
  });
});
