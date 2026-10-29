/**
 * The Victorian resolution tests (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026), from the draft pack's MEETING_RULES: a special resolution by
 * 75% of all lots (OCA s 96), a unanimous resolution by every lot (s 95), the
 * interim special resolution a failed special resolution may pass as
 * (s 97(1), (1A)), and an ordinary resolution refused on equal votes (s 89A)
 * and until quorum is recorded (s 78). Anything the count cannot decide is
 * UNDETERMINED, never carried or lost.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS } from "@/config/statutory";
import { evaluateResolution, type ResolutionTally } from "./rules";
import { resolveOutcome } from "./conduct";

const VIC = PENDING_RULE_PACKS.VIC.rules.MEETING_RULES;

/** Eight lots, 100 lot entitlement in all. */
const tally = (t: Partial<ResolutionTally>): ResolutionTally => ({ forCount: 0, againstCount: 0, totalLots: 8, ...t });

describe("a Victorian special resolution: 75% of all lots (s 96)", () => {
  it("passes with 6 of 8 lots for, whatever the votes against", () => {
    expect(evaluateResolution(VIC, "SPECIAL", tally({ forCount: 6, againstCount: 2 }))).toEqual({
      passed: true,
      reason: "Votes for are at least 75% of all lots in the scheme",
    });
  });

  it("is measured against all lots, not the votes cast: 5 of 8 is not enough even with none against", () => {
    const out = evaluateResolution(VIC, "SPECIAL", tally({ forCount: 5, againstCount: 3 }));
    expect(out.passed).toBe(false);
    expect(out.result).toBeUndefined();
    expect(out.reason).toBe("Votes for are less than 75% of all lots in the scheme");
  });

  it("refuses without the number of lots", () => {
    expect(evaluateResolution(VIC, "SPECIAL", { forCount: 6, againstCount: 0 }).result).toBe("UNDETERMINED");
  });

  it("on a poll is counted by lot entitlement (75% of the total)", () => {
    const poll = { poll: true, totalEntitlement: 100 };
    expect(evaluateResolution(VIC, "SPECIAL", tally({ forCount: 2, againstCount: 6, forUE: 75, againstUE: 25, ...poll })).passed).toBe(true);
    // 74 of 100 fails the special test and the interim route cannot be counted on a poll (NOT_CONFIRMED).
    const under = evaluateResolution(VIC, "SPECIAL", tally({ forCount: 6, againstCount: 2, forUE: 74, againstUE: 26, ...poll }));
    expect(under.result).toBe("UNDETERMINED");
    expect(under.reason).toMatch(/^The lots for do not hold at least 75% of the total entitlement on a poll\. How a poll is counted/);
  });
});

describe("the interim special resolution a failed special resolution passes as (s 97)", () => {
  it("route 1: at exactly 50% of all lots for and exactly 25% against is interim, not carried", () => {
    const out = evaluateResolution(VIC, "SPECIAL", tally({ forCount: 4, againstCount: 2 }));
    expect(out).toEqual({
      passed: false,
      result: "INTERIM",
      interimCategory: "INTERIM_SPECIAL",
      laterKind: "INTERIM_SPECIAL",
      reason:
        "Votes for are less than 75% of all lots in the scheme. Votes for are at least 50% of all lots in the scheme, and votes against are not more than 25% of all lots in the scheme",
    });
  });

  it("route 1 fails just under 50% for or just over 25% against", () => {
    // 3 of 8 for, 1 against: route 1 fails on the votes for; route 2 needs no vote against.
    expect(evaluateResolution(VIC, "SPECIAL", tally({ forCount: 3, againstCount: 1 }))).toEqual({
      passed: false,
      reason: "Votes for are less than 75% of all lots in the scheme",
    });
    // 5 for, 3 against: 3 of 8 is more than 25%.
    expect(evaluateResolution(VIC, "SPECIAL", tally({ forCount: 5, againstCount: 3 })).result).toBeUndefined();
  });

  it("route 2: no vote against at a meeting with a quorum, recorded", () => {
    const base = { forCount: 3, againstCount: 0 };
    const unknown = evaluateResolution(VIC, "SPECIAL", tally(base));
    expect(unknown.result).toBe("UNDETERMINED");
    expect(unknown.reason).toContain("whether there was one for this item is not recorded");
    const quorate = evaluateResolution(VIC, "SPECIAL", tally({ ...base, quorumPresent: true }));
    expect(quorate).toMatchObject({ passed: false, result: "INTERIM", interimCategory: "INTERIM_SPECIAL" });
    expect(evaluateResolution(VIC, "SPECIAL", tally({ ...base, quorumPresent: false }))).toEqual({
      passed: false,
      reason: "Votes for are less than 75% of all lots in the scheme",
    });
  });

  it("route 2 needs at least 1 vote for: no vote at all at a quorate meeting is lost, not interim", () => {
    const none = { forCount: 0, againstCount: 0, abstainCount: 3 };
    expect(evaluateResolution(VIC, "SPECIAL", tally({ ...none, quorumPresent: true }))).toEqual({
      passed: false,
      reason: "Votes for are less than 75% of all lots in the scheme",
    });
    // Quorum unknown changes nothing: with no vote for, neither route can pass.
    expect(evaluateResolution(VIC, "SPECIAL", tally(none))).toEqual({ passed: false, reason: "Votes for are less than 75% of all lots in the scheme" });
    expect(evaluateResolution(VIC, "INTERIM_SPECIAL", tally({ ...none, quorumPresent: true }))).toEqual({
      passed: false,
      reason: "Votes for are less than 50% of all lots in the scheme",
    });
    // 1 vote for is enough for route 2.
    expect(evaluateResolution(VIC, "SPECIAL", tally({ forCount: 1, againstCount: 0, quorumPresent: true }))).toEqual({
      passed: false,
      result: "INTERIM",
      interimCategory: "INTERIM_SPECIAL",
      laterKind: "INTERIM_SPECIAL",
      reason: "Votes for are less than 75% of all lots in the scheme. No vote against and at least 1 vote for, at a meeting with a quorum",
    });
    const r = resolveOutcome(VIC, { requestedOutcome: "MOTION_LOST", resolutionCategory: "SPECIAL", tally: tally({ ...none, quorumPresent: true }) });
    expect(r).toMatchObject({ outcome: "MOTION_LOST", status: "LOST" });
    expect(r).not.toHaveProperty("refused");
  });

  it("is never tested with 2 lots: s 97 does not apply to a 2-lot owners corporation (s 7A), so the count is refused, not reported as interim", () => {
    const two = (t: Partial<ResolutionTally>) => ({ forCount: 0, againstCount: 0, totalLots: 2, ...t });
    for (const t of [two({ forCount: 1 }), two({ forCount: 1, quorumPresent: true }), two({ forCount: 1, againstCount: 1 }), two({ againstCount: 2 })]) {
      const out = evaluateResolution(VIC, "SPECIAL", t);
      expect(out.result).toBe("UNDETERMINED");
      expect(out).not.toHaveProperty("interimCategory");
      expect(out.reason).toMatch(/^Votes for are less than 75% of all lots in the scheme\. An owners corporation of 2 lots cannot pass an interim special resolution/);
    }
    const r = resolveOutcome(VIC, { requestedOutcome: "RESOLVED", resolutionCategory: "SPECIAL", tally: two({ forCount: 1 }) });
    expect(r.refused).toMatch(/^The votes recorded cannot decide this motion\. /);
    expect(r.refused).not.toMatch(/make this motion an interim/);
    expect(r.refused).toMatch(/StrataVerze does not apply the rules for 2-lot owners corporations yet, so the count cannot decide it\. Nothing was saved\. The item can be deferred\.$/);
    // Both lots for still passes the general test, as unanimity does.
    expect(evaluateResolution(VIC, "SPECIAL", two({ forCount: 2 }))).toEqual({ passed: true, reason: "Votes for are at least 75% of all lots in the scheme" });
    // From 3 lots the interim special resolution is tested as before.
    expect(evaluateResolution(VIC, "SPECIAL", tally({ forCount: 2, againstCount: 0, totalLots: 3, quorumPresent: true })).result).toBe("INTERIM");
  });

  it("is only ever interim, even evaluated on its own", () => {
    expect(evaluateResolution(VIC, "INTERIM_SPECIAL", tally({ forCount: 4, againstCount: 1 }))).toMatchObject({
      passed: false,
      result: "INTERIM",
      interimCategory: "INTERIM_SPECIAL",
    });
  });

  it("is recorded as pending through resolveOutcome, never as carried (stage 2, PR 8b-i)", () => {
    const r = resolveOutcome(VIC, { requestedOutcome: "RESOLVED", resolutionCategory: "SPECIAL", tally: tally({ forCount: 4, againstCount: 2 }) });
    expect(r.later).toEqual({ kind: "INTERIM_SPECIAL", stored: "INTERIM" });
    expect(r).not.toHaveProperty("refused");
    expect(r.evaluation?.laterKind).toBe("INTERIM_SPECIAL");
  });

  it("is refused through resolveOutcome, recording nothing, under a rule set that records no interim resolutions", () => {
    const { pendingResolutions: _omit, ...withoutPending } = VIC;
    void _omit;
    const r = resolveOutcome(withoutPending, { requestedOutcome: "RESOLVED", resolutionCategory: "SPECIAL", tally: tally({ forCount: 4, againstCount: 2 }) });
    expect(r).not.toHaveProperty("later");
    expect(r.refused).toBe(
      "The votes recorded make this motion an interim special resolution. Votes for are less than 75% of all lots in the scheme. Votes for are at least 50% of all lots in the scheme, and votes against are not more than 25% of all lots in the scheme. StrataVerze does not record interim resolutions yet, so this outcome cannot be recorded here. Nothing was saved. The item can be deferred.",
    );
    expect(r.refused).not.toMatch(/[;–—]|\(s \d/);
  });
});

describe("a Victorian unanimous resolution: every lot (s 95)", () => {
  it("passes only with every lot for", () => {
    expect(evaluateResolution(VIC, "UNANIMOUS", tally({ forCount: 8 })).passed).toBe(true);
    expect(evaluateResolution(VIC, "UNANIMOUS", tally({ forCount: 7 }))).toEqual({ passed: false, reason: "Not every lot in the scheme voted for" });
  });
});

describe("a Victorian ordinary resolution", () => {
  it("is refused until whether the meeting had a quorum is recorded (s 78)", () => {
    const out = evaluateResolution(VIC, "ORDINARY", { forCount: 5, againstCount: 2 });
    expect(out.result).toBe("UNDETERMINED");
    expect(out.reason).toBe("Whether the meeting had a quorum for this item is not recorded, so the votes cannot decide it");
  });

  it("with a quorum recorded is a majority of the votes cast, and by lot entitlement on a poll", () => {
    expect(evaluateResolution(VIC, "ORDINARY", { forCount: 5, againstCount: 2, quorumPresent: true })).toEqual({ passed: true, reason: "Majority of votes cast" });
    expect(evaluateResolution(VIC, "ORDINARY", { forCount: 2, againstCount: 5, quorumPresent: true })).toEqual({ passed: false, reason: "Not a majority of votes cast" });
    expect(
      evaluateResolution(VIC, "ORDINARY", { forCount: 2, againstCount: 5, forUE: 60, againstUE: 40, poll: true, quorumPresent: true }, "lot entitlement"),
    ).toEqual({ passed: true, reason: "Majority by lot entitlement on a poll" });
  });

  it("without a quorum is an interim resolution when carried", () => {
    expect(evaluateResolution(VIC, "ORDINARY", { forCount: 5, againstCount: 2, quorumPresent: false })).toEqual({
      passed: false,
      result: "INTERIM",
      laterKind: "INTERIM_NO_QUORUM",
      reason: "Majority of votes cast, at a meeting without a quorum, so it is an interim resolution",
    });
  });

  it("refuses equal votes: the chair's casting vote is not recorded (s 89A)", () => {
    const out = evaluateResolution(VIC, "ORDINARY", { forCount: 3, againstCount: 3, quorumPresent: true });
    expect(out.result).toBe("UNDETERMINED");
    expect(out.reason).toMatch(/^The votes are equal\. A chair who is a lot owner or a proxy has a casting vote/);
    expect(evaluateResolution(VIC, "ORDINARY", { forCount: 3, againstCount: 3, forUE: 30, againstUE: 30, poll: true, quorumPresent: true }).result).toBe("UNDETERMINED");
  });
});
