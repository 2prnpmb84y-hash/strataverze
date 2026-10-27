/**
 * The Queensland meeting rules in the shared shape (stage 2, step 7,
 * 27 Oct 2026): the special and majority resolution tests, the categories,
 * quorum as data, no pre-meeting e-voting and no retention limit.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS } from "@/config/statutory";
import { evaluateResolution, isResolutionCategory, type ResolutionTally } from "./rules";
import { allowedCategoriesForMeetingType, canAddCategoryToMeetingType, validateAgendaItem } from "./agenda";
import { resolveOutcome } from "./conduct";

const QLD = PENDING_RULE_PACKS.QLD.rules.MEETING_RULES;

/** 12 lots, total contribution entitlement 1,200. */
const scheme = { totalLots: 12, totalEntitlement: 1200 };
const special = (t: Partial<ResolutionTally>) =>
  evaluateResolution(QLD, "SPECIAL", { forCount: 0, againstCount: 0, forUE: 0, againstUE: 0, ...scheme, ...t });

describe("Queensland special resolution (Act s 106(3))", () => {
  it("passes at exactly two thirds of the votes cast (3 x for = 2 x cast)", () => {
    const out = special({ forCount: 6, againstCount: 3, againstUE: 300 });
    expect(out.passed).toBe(true);
  });

  it("fails just under two thirds", () => {
    // 3 x 5 = 15 < 2 x 8 = 16
    const out = special({ forCount: 5, againstCount: 3, againstUE: 300 });
    expect(out.passed).toBe(false);
    expect(out.reason).toContain("66.7%");
  });

  it("passes with votes against at exactly 25% of the lots, and fails above", () => {
    // 3 of 12 lots against is 25%; 9 for of 12 cast is three quarters.
    expect(special({ forCount: 9, againstCount: 3, againstUE: 300 }).passed).toBe(true);
    // 4 of 12 lots against is more than 25% (12 for of 16 cast still three quarters).
    const over = special({ forCount: 12, againstCount: 4, againstUE: 200, totalLots: 12 });
    expect(over.passed).toBe(false);
    expect(over.reason).toContain("lots in the scheme");
  });

  it("passes with the lots against holding exactly 25% of the entitlement, and fails above", () => {
    expect(special({ forCount: 9, againstCount: 2, againstUE: 300 }).passed).toBe(true);
    const over = special({ forCount: 9, againstCount: 2, againstUE: 301 });
    expect(over.passed).toBe(false);
    expect(over.reason).toContain("total entitlement");
  });

  it("fails, never passes, when a total it needs is missing", () => {
    const base: ResolutionTally = { forCount: 10, againstCount: 0, forUE: 1000, againstUE: 0 };
    for (const tally of [
      { ...base, totalEntitlement: 1200 },
      { ...base, totalLots: 12 },
      { forCount: 10, againstCount: 0, ...scheme },
    ]) {
      const out = evaluateResolution(QLD, "SPECIAL", tally);
      expect(out.passed).toBe(false);
      expect(out.reason).toMatch(/needed/);
    }
  });

  it("fails when no votes are cast", () => {
    expect(special({}).passed).toBe(false);
  });
});

describe("Queensland majority resolution (Act s 107)", () => {
  it("fails at exactly half of the lots entitled to vote, and passes above", () => {
    expect(evaluateResolution(QLD, "MAJORITY", { forCount: 6, againstCount: 0, eligibleLots: 12 }).passed).toBe(false);
    expect(evaluateResolution(QLD, "MAJORITY", { forCount: 7, againstCount: 5, eligibleLots: 12 }).passed).toBe(true);
  });

  it("fails when the number of lots entitled to vote is missing", () => {
    const out = evaluateResolution(QLD, "MAJORITY", { forCount: 12, againstCount: 0 });
    expect(out.passed).toBe(false);
    expect(out.reason).toMatch(/needed/);
  });
});

describe("Queensland ordinary resolution and resolution without dissent", () => {
  it("is a majority of votes cast, or by entitlement on a poll", () => {
    expect(evaluateResolution(QLD, "ORDINARY", { forCount: 6, againstCount: 5 }).passed).toBe(true);
    expect(evaluateResolution(QLD, "ORDINARY", { forCount: 7, againstCount: 3, forUE: 300, againstUE: 700, poll: true }).passed).toBe(false);
  });

  it("fails a resolution without dissent on any vote against", () => {
    expect(evaluateResolution(QLD, "WITHOUT_DISSENT", { forCount: 20, againstCount: 0 }).passed).toBe(true);
    expect(evaluateResolution(QLD, "WITHOUT_DISSENT", { forCount: 20, againstCount: 1 }).passed).toBe(false);
  });

  it("does not know the NSW categories, and NSW does not know Queensland's", () => {
    expect(evaluateResolution(QLD, "UNANIMOUS", { forCount: 5, againstCount: 0 }).passed).toBe(false);
    expect(evaluateResolution(NSW_RULE_SET, "WITHOUT_DISSENT", { forCount: 5, againstCount: 0 }).passed).toBe(false);
    expect(isResolutionCategory(QLD, "SUSTAINABILITY_INFRASTRUCTURE")).toBe(false);
    expect(isResolutionCategory(NSW_RULE_SET, "MAJORITY")).toBe(false);
  });
});

describe("categories from the rule set", () => {
  it("lists exactly each pack's categories", () => {
    expect(Object.keys(NSW_RULE_SET.resolutionCategories)).toEqual(["ORDINARY", "SPECIAL", "UNANIMOUS", "SUSTAINABILITY_INFRASTRUCTURE"]);
    expect(Object.keys(QLD.resolutionCategories).sort()).toEqual(["MAJORITY", "ORDINARY", "SPECIAL", "WITHOUT_DISSENT"]);
    for (const rs of [NSW_RULE_SET, QLD]) {
      expect([...rs.generalMeetingCategories].sort()).toEqual(Object.keys(rs.resolutionCategories).sort());
      expect(Object.keys(rs.resolutionLabels).sort()).toEqual(Object.keys(rs.resolutionCategories).sort());
      for (const c of [...rs.committeeCategories, ...rs.motionCategories]) expect(isResolutionCategory(rs, c)).toBe(true);
    }
  });

  it("gives a Queensland meeting its own categories", () => {
    expect(allowedCategoriesForMeetingType(QLD, "AGM")).toEqual(["ORDINARY", "SPECIAL", "WITHOUT_DISSENT", "MAJORITY"]);
    expect(allowedCategoriesForMeetingType(QLD, "COMMITTEE")).toEqual(["ORDINARY"]);
    expect(canAddCategoryToMeetingType(QLD, "EGM", "WITHOUT_DISSENT")).toBe(true);
    expect(canAddCategoryToMeetingType(QLD, "AGM", "UNANIMOUS")).toBe(false);
  });

  it("refuses a Queensland committee a special resolution with the pack's words", () => {
    const errors = validateAgendaItem({ title: "By-law", resolutionCategory: "SPECIAL" }, "COMMITTEE", QLD);
    expect(errors.resolutionCategory).toBe(QLD.committeeCategoryRefusal);
    expect(validateAgendaItem({ title: "x", resolutionCategory: "UNANIMOUS" }, "AGM", QLD).resolutionCategory).toBe("Select a valid resolution category.");
  });

  it("keeps the NSW committee refusal word for word", () => {
    expect(validateAgendaItem({ title: "x", resolutionCategory: "SPECIAL" }, "COMMITTEE", NSW_RULE_SET).resolutionCategory).toBe(
      "A strata committee cannot decide a matter that requires a special or unanimous resolution, or one reserved to a general meeting.",
    );
  });

  it("evaluates a Queensland tally in conduct only for its own categories", () => {
    const tally = { forCount: 5, againstCount: 0 };
    expect(resolveOutcome(QLD, { requestedOutcome: "RESOLVED", resolutionCategory: "WITHOUT_DISSENT", tally }).evaluation?.passed).toBe(true);
    expect(resolveOutcome(QLD, { requestedOutcome: "RESOLVED", resolutionCategory: "UNANIMOUS", tally }).evaluation).toBeUndefined();
  });

  it("names the categories as the NSW screens always did", () => {
    const short = Object.fromEntries(Object.entries(NSW_RULE_SET.resolutionLabels).map(([c, l]) => [c, l.short]));
    expect(short).toEqual({ ORDINARY: "Ordinary", SPECIAL: "Special", UNANIMOUS: "Unanimous", SUSTAINABILITY_INFRASTRUCTURE: "Sustainability infrastructure" });
    expect(NSW_RULE_SET.motionCategories.map((c) => NSW_RULE_SET.resolutionLabels[c]?.choice ?? NSW_RULE_SET.resolutionLabels[c]?.full)).toEqual([
      "Ordinary Resolution",
      "Special Resolution (75%)",
      "Unanimous Resolution",
    ]);
  });
});

describe("Queensland meeting rules as data", () => {
  it("has the signed-off notice and minutes periods", () => {
    expect(QLD.noticePeriods).toEqual({ AGM: 21, EGM: 21, FIRST_AGM: 21, COMMITTEE: 7 });
    expect(QLD.minutesDeadlines).toEqual({ AGM: 21, EGM: 21, FIRST_AGM: 21, COMMITTEE: 21 });
  });

  it("holds the quorum as 25% of voters with 2 present personally where there are 3 or more voters", () => {
    expect(QLD.quorumRules.AGM).toEqual({ basis: "PERCENT_VOTERS_WITH_MIN_PRESENT", percent: 0.25, minPersons: 2, minPersonsFromVoters: 3, minPersonsBelow: 1 });
    expect(QLD.quorumRules.COMMITTEE).toEqual({ basis: "HALF_MEMBERS" });
  });

  it("offers no pre-meeting e-voting, keeps records without a limit, and lets a debtor vote only without dissent", () => {
    expect(QLD.preMeetingEvoting).toBeNull();
    expect(QLD.retention).toEqual({ generalYears: null, secretBallotMonths: null });
    expect(QLD.debtorsMayVoteOn).toEqual(["WITHOUT_DISSENT"]);
    expect(NSW_RULE_SET.debtorsMayVoteOn).toBeUndefined();
  });
});
