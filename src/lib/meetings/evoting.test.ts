import { describe, it, expect } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS } from "@/config/statutory";
import {
  computeBallotWindow,
  EvotingNotOfferedError,
  evotingNotOfferedReason,
  isBallotOpen,
  isInformalVote,
  tallyElectronicVotes,
  validateCanOpenBallot,
} from "./evoting";

const meetingStart = new Date("2026-03-15T09:00:00Z");

describe("computeBallotWindow", () => {
  it("opens 7 days before and closes 24 hours before for an AGM", () => {
    const w = computeBallotWindow(NSW_RULE_SET, "AGM", meetingStart);
    expect(w.opensAt.toISOString()).toBe("2026-03-08T09:00:00.000Z");
    expect(w.closesAt.toISOString()).toBe("2026-03-14T09:00:00.000Z");
  });

  it("closes at the meeting start for a committee meeting", () => {
    const w = computeBallotWindow(NSW_RULE_SET, "COMMITTEE", meetingStart);
    expect(w.closesAt.toISOString()).toBe(meetingStart.toISOString());
  });
});

describe("isBallotOpen", () => {
  const w = computeBallotWindow(NSW_RULE_SET, "AGM", meetingStart);
  it("is open inside the window when status OPEN", () => {
    expect(isBallotOpen(w, "OPEN", new Date("2026-03-10T00:00:00Z"))).toBe(true);
  });
  it("is closed before the open date", () => {
    expect(isBallotOpen(w, "OPEN", new Date("2026-03-01T00:00:00Z"))).toBe(false);
  });
  it("is closed after the close date", () => {
    expect(isBallotOpen(w, "OPEN", new Date("2026-03-14T12:00:00Z"))).toBe(false);
  });
  it("is closed when status is not OPEN", () => {
    expect(isBallotOpen(w, "CLOSED", new Date("2026-03-10T00:00:00Z"))).toBe(false);
  });
});

describe("isInformalVote", () => {
  it("flags values not recorded per instructions", () => {
    expect(isInformalVote("FOR")).toBe(false);
    expect(isInformalVote("MAYBE")).toBe(true);
    expect(isInformalVote("")).toBe(true);
  });
});

describe("tallyElectronicVotes", () => {
  it("sums counts and unit entitlement, excluding informal votes", () => {
    const tally = tallyElectronicVotes([
      { voteValue: "FOR", unitEntitlement: 10, isInformal: false },
      { voteValue: "FOR", unitEntitlement: 15, isInformal: false },
      { voteValue: "AGAINST", unitEntitlement: 5, isInformal: false },
      { voteValue: "ABSTAIN", unitEntitlement: 3, isInformal: false },
      { voteValue: "BAD", unitEntitlement: 99, isInformal: true },
    ]);
    expect(tally.forCount).toBe(2);
    expect(tally.againstCount).toBe(1);
    expect(tally.forUE).toBe(25);
    expect(tally.againstUE).toBe(5);
    expect(tally.abstainCount).toBe(1);
  });
});

describe("validateCanOpenBallot", () => {
  it("blocks when the body has not adopted e-voting", () => {
    expect(
      validateCanOpenBallot({ adopted: false, meetingStatus: "NOTICE_ISSUED", ownersCorporation: "owners corporation" }),
    ).toBe("The owners corporation (or committee) has not resolved to adopt pre-meeting electronic voting.");
  });
  it("allows when adopted and before the meeting", () => {
    expect(
      validateCanOpenBallot({ adopted: true, meetingStatus: "NOTICE_ISSUED", ownersCorporation: "owners corporation" }),
    ).toBeNull();
  });
  it("blocks once the meeting is running", () => {
    expect(
      validateCanOpenBallot({ adopted: true, meetingStatus: "IN_PROGRESS", ownersCorporation: "owners corporation" }),
    ).toBeTruthy();
  });
});

describe("pre-meeting e-voting not in the rule set (Queensland)", () => {
  const QLD = PENDING_RULE_PACKS.QLD.rules.MEETING_RULES;

  it("is offered for NSW", () => {
    expect(evotingNotOfferedReason(NSW_RULE_SET, "NSW")).toBeNull();
  });

  it("is refused with a plain message", () => {
    const reason = evotingNotOfferedReason(QLD, "Qld");
    expect(reason).toBe("Pre-meeting electronic voting is not offered for buildings in Qld yet.");
    expect(reason).not.toMatch(/[;\u2013\u2014]/);
  });

  it("has no ballot window", () => {
    expect(() => computeBallotWindow(QLD, "AGM", meetingStart)).toThrow(EvotingNotOfferedError);
  });
});
