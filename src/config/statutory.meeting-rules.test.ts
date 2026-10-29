/**
 * The draft packs' meeting rules are wired up consistently (VIC, ACT and WA
 * stage 2, PR 8a-i, 28 Oct 2026): every category a list names has a rule and
 * a name, the interim special and unopposed resolutions are never offered on
 * an agenda, every rule and variant says where it comes from and how far it
 * is checked, and the NSW and Queensland rule sets carry none of the new keys.
 *
 * Quorum attestation, the counting refusal and the debtor condition (VIC, ACT
 * and WA stage 2, PR 8a-ii, 29 Oct 2026): every condition names a building
 * selector the pack has, with values among its options; every pack whose
 * tests need a quorum answer words the question; and a pack with any of the
 * new keys offers no pre-meeting ballot, which applies none of them.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, QLD_RULE_PACK, RULE_PACKS } from "./statutory";
import { usesDraftKeys, type MeetingRuleSet, type ResolutionCategory, type ResolutionRule } from "@/lib/meetings/rules";
import { conductVotingView, countNeedsQuorum, countNeedsReducedQuorum, countNeedsVotesPresent, countOpensVotingPeriod } from "@/lib/meetings/conduct-tally";
import type { BuildingSelector, RecordedBuildingSelector, RuleStatus, SelectorCondition } from "./statutory/types";

const STATUSES: RuleStatus[] = ["CONFIRMED", "GUIDANCE", "STRATAVERZE", "NOT_CONFIRMED"];
const DRAFTS = [
  ["VIC", PENDING_RULE_PACKS.VIC.rules.MEETING_RULES],
  ["ACT", PENDING_RULE_PACKS.ACT.rules.MEETING_RULES],
  ["WA", PENDING_RULE_PACKS.WA.rules.MEETING_RULES],
] as const;

const rulesOf = (rs: MeetingRuleSet) => Object.entries(rs.resolutionCategories) as [ResolutionCategory, ResolutionRule][];

describe.each(DRAFTS)("%s meeting rules", (state, rs) => {
  it("is the pack's own, effective from the PR's date", () => {
    expect(rs.state).toBe(state);
    expect(rs.version).toBe(`${state}-2026.1`);
    expect(rs.effectiveFrom).toBe("2026-10-28");
    expect(rs.preMeetingEvoting).toBeNull();
    expect(rs.excludeCommonPropertyRows).toBe(true);
    expect(rs.categoryRequiredAtGeneralMeetings).toBe(true);
  });

  it("names and has a rule for every category each list offers, and each list is the pack's", () => {
    const lists = [rs.generalMeetingCategories, rs.committeeCategories, rs.motionCategories, rs.pollCategories ?? [], rs.debtorsMayVoteOn ?? []];
    for (const list of lists) {
      for (const c of list) {
        expect(rs.resolutionCategories[c], `${state} ${c}`).toBeDefined();
        expect(rs.resolutionLabels[c]?.full, `${state} ${c}`).toMatch(/Resolution/);
      }
    }
    for (const c of Object.keys(rs.resolutionCategories) as ResolutionCategory[]) expect(rs.resolutionLabels[c], `${state} ${c}`).toBeDefined();
    expect(rs.committeeCategories).toEqual(["ORDINARY"]);
    expect(rs.committeeCategoryRefusal).toMatch(/^Only an ordinary resolution can go on an? [a-z ]+ meeting agenda\./);
  });

  it("never offers an interim special or unopposed resolution on an agenda or the motions list", () => {
    for (const list of [rs.generalMeetingCategories, rs.committeeCategories, rs.motionCategories]) {
      expect(list).not.toContain("INTERIM_SPECIAL");
      expect(list).not.toContain("UNOPPOSED");
    }
  });

  it("says where each rule and variant comes from and how far it is checked", () => {
    for (const [c, rule] of rulesOf(rs)) {
      expect(rule.source, `${state} ${c}`).toMatch(/\S{5,}/);
      expect(STATUSES, `${state} ${c}`).toContain(rule.status);
      for (const v of rule.variants ?? []) {
        expect(v.source.length).toBeGreaterThan(5);
        expect(STATUSES).toContain(v.status);
        expect(v.rule.variants).toBeUndefined();
      }
      if (rule.variants) expect(rule.basis).toBe("BY_VARIANT");
      if (rule.interimCategory) expect(rs.resolutionCategories[rule.interimCategory]).toBeDefined();
    }
  });

  it("gives its refusals in plain words, ready to follow with a full stop", () => {
    for (const [, rule] of rulesOf(rs)) {
      for (const r of [rule, ...(rule.variants ?? []).map((v) => v.rule)]) {
        for (const text of [r.refusedBecause, r.tieRefusedBecause, r.noVariantFitsRefusal, r.noQuorumRefusal]) {
          if (text == null) continue;
          expect(text).toMatch(/^[A-Z]/);
          expect(text).not.toMatch(/[.;–—]$|[;–—]/);
        }
      }
    }
  });
});

/** The selector conditions a condition reads, as [key, values]. */
const selectorTests = (c: SelectorCondition): [string, readonly string[]][] =>
  "all" in c ? c.all.flatMap(selectorTests) : "any" in c ? c.any.flatMap(selectorTests) : "selector" in c ? [[c.selector, c.in]] : [];

const NEW_KEYS = [
  "countingRefusedWhen",
  "debtorRuleAppliesWhen",
  "quorumAttestation",
  "votesPresentAttestation",
  "quorumNeedsEveryLot",
  // Stage 2, PR 8b-i (29 Oct 2026).
  "pendingResolutions",
  "reducedQuorumAttestation",
  // Stage 2, PR 8b-iii (29 Oct 2026).
  "categoryNoticeDays",
  "noticeNotCheckedFor",
] as const;
const PACK_RULES = { VIC: PENDING_RULE_PACKS.VIC.rules, ACT: PENDING_RULE_PACKS.ACT.rules, WA: PENDING_RULE_PACKS.WA.rules };
const NO_DASH_OR_SEMICOLON = /[;–—]/;

describe.each(DRAFTS)("%s quorum attestation, counting refusal and debtor condition (stage 2, PR 8a-ii)", (state, rs) => {
  const selectors = PACK_RULES[state].BUILDING_SELECTORS as readonly BuildingSelector[];

  it("reads only building selectors the pack has, with values among their options", () => {
    const conditions = [...(rs.countingRefusedWhen ?? []).map((r) => r.when), ...(rs.debtorRuleAppliesWhen ? [rs.debtorRuleAppliesWhen] : [])];
    for (const cond of conditions) {
      for (const [key, values] of selectorTests(cond)) {
        const selector = selectors.find((sel) => sel.key === key);
        expect(selector, `${state} ${key}`).toBeDefined();
        for (const v of values) expect(selector!.options.map((o) => o.value), `${state} ${key} ${v}`).toContain(v);
      }
    }
  });

  it("words the quorum question where any category's test needs it, and the units present where any needs them", () => {
    const categories = Object.keys(rs.resolutionCategories);
    if (categories.some((c) => countNeedsQuorum(rs, c))) expect(rs.quorumAttestation, state).toBeDefined();
    if (categories.some((c) => countNeedsVotesPresent(rs, c))) expect(rs.votesPresentAttestation, state).toBeDefined();
    for (const a of [rs.quorumAttestation, rs.votesPresentAttestation]) {
      if (!a) continue;
      expect(a.label).toMatch(/^[A-Z][^.]*[a-z]$/);
      expect(a.help).toMatch(/^[A-Z].*\.$/);
      expect(`${a.label} ${a.help}`).not.toMatch(NO_DASH_OR_SEMICOLON);
      expect(a.source.length).toBeGreaterThan(5);
      expect(STATUSES).toContain(a.status);
    }
  });

  it("gives its counting refusals in plain words, ready to follow with a full stop", () => {
    for (const r of rs.countingRefusedWhen ?? []) {
      for (const text of [r.refusal, r.undecided]) {
        expect(text).toMatch(/^[A-Z]/);
        expect(text).not.toMatch(/[.;–—]$|[;–—]/);
      }
      expect(STATUSES).toContain(r.status);
    }
    if (rs.quorumNeedsEveryLot) {
      expect(rs.quorumNeedsEveryLot.refusal).toMatch(/^[A-Z]/);
      expect(rs.quorumNeedsEveryLot.refusal).not.toMatch(/[.;–—]$|[;–—]/);
    }
  });

  it("offers no pre-meeting ballot where it has any of the new keys, since closing a ballot applies none of them", () => {
    if (NEW_KEYS.some((k) => rs[k] !== undefined)) expect(rs.preMeetingEvoting).toBeNull();
  });
});

describe("every rule set, live and draft: the conduct screen asks whatever the action requires (PR 8a-ii review)", () => {
  const ALL = [
    ...Object.values(RULE_PACKS).map((p) => [p.state, p.rules.MEETING_RULES] as const),
    ...Object.values(PENDING_RULE_PACKS).map((p) => [p.state, p.rules.MEETING_RULES] as const),
  ];

  it.each(ALL)("%s words the quorum question for every category that can need it, and the units present for every one that measures them", (state, rs) => {
    const items = Object.keys(rs.resolutionCategories).map((c) => ({ id: c, resolutionCategory: c }));
    const view = conductVotingView(rs, PACK_RULES[state as keyof typeof PACK_RULES] ?? RULE_PACKS[state as keyof typeof RULE_PACKS].rules, [], items, "AGM");
    for (const c of Object.keys(rs.resolutionCategories)) {
      if (countNeedsQuorum(rs, c)) {
        expect(rs.quorumAttestation, `${state} ${c}`).toBeDefined();
        expect(view?.items[c]?.quorumAsked, `${state} ${c}`).toEqual({ label: rs.quorumAttestation?.label, help: rs.quorumAttestation?.help });
      } else if (view) expect(view.items[c], `${state} ${c}`).not.toHaveProperty("quorumAsked");
      if (countNeedsVotesPresent(rs, c)) {
        expect(rs.votesPresentAttestation, `${state} ${c}`).toBeDefined();
        expect(view?.items[c]?.unitsPresentAsked, `${state} ${c}`).toEqual({ label: rs.votesPresentAttestation?.label, help: rs.votesPresentAttestation?.help });
      } else if (view) expect(view.items[c], `${state} ${c}`).not.toHaveProperty("unitsPresentAsked");
    }
  });

  it("asks the ACT's special resolution for the units present", () => {
    const act = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES;
    expect(countNeedsVotesPresent(act, "SPECIAL")).toBe(true);
    expect(act.votesPresentAttestation?.label).toBe("Units present or represented for this motion");
  });
});

describe("Victoria", () => {
  const vic = PENDING_RULE_PACKS.VIC.rules;
  it("defers no shared shape any more", () => {
    expect(vic.DEFERRED_SHARED_SHAPES).toEqual([]);
  });

  it("lets an owner in arrears vote on special and unanimous resolutions only, and polls an ordinary resolution only", () => {
    expect(vic.MEETING_RULES.debtorsMayVoteOn).toEqual(["SPECIAL", "UNANIMOUS"]);
    expect(vic.MEETING_RULES.pollCategories).toEqual(["ORDINARY"]);
    expect(vic.MEETING_RULES.resolutionCategories.SPECIAL?.interimCategory).toBe("INTERIM_SPECIAL");
    expect(vic.MEETING_RULES.resolutionCategories.ORDINARY?.withoutQuorum).toBe("INTERIM");
    expect(vic.MEETING_RULES.retention).toEqual({ generalYears: 7, secretBallotMonths: 12 });
  });

  it("does not count a tier 5 owners corporation, and applies the arrears rule to tiers 1 to 4 only (stage 2, PR 8a-ii)", () => {
    expect(vic.MEETING_RULES.countingRefusedWhen?.map((r) => r.when)).toEqual([{ selector: "tier", in: ["TIER_5"] }]);
    expect(vic.MEETING_RULES.debtorRuleAppliesWhen).toEqual({ selector: "tier", in: ["TIER_1", "TIER_2", "TIER_3", "TIER_4"] });
    expect(vic.MEETING_RULES.votesPresentAttestation).toBeUndefined();
    expect(vic.MEETING_RULES.quorumNeedsEveryLot).toBeUndefined();
    // The ordinary and special resolutions ask for the quorum; the unanimous one does not.
    expect(["ORDINARY", "SPECIAL", "UNANIMOUS"].map((c) => countNeedsQuorum(vic.MEETING_RULES, c))).toEqual([true, true, false]);
    expect(vic.MEETING_RULES.quorumAttestation?.help).toContain("50% of the lots");
  });
});

describe("the ACT", () => {
  const act = PENDING_RULE_PACKS.ACT.rules;
  const selector = act.BUILDING_SELECTORS.find((s) => s.key === act.MEETING_RULES.memberBandSelector) as RecordedBuildingSelector;

  it("records the band of members as a building selector, with values the database store accepts", () => {
    expect(selector?.held).toBe("RECORDED");
    expect(selector.key).toMatch(/^[a-z][A-Za-z0-9]{0,63}$/);
    expect(selector.options.map((o) => o.value)).toEqual(["ONE_OR_TWO", "THREE", "FOUR_OR_MORE"]);
    for (const o of selector.options) expect(o.value).toMatch(/^[A-Z0-9_]{1,64}$/);
    // 1 or 2 members are counted since stage 2, PR 8a-ii (Matthew Wrigley's decision of 29 Oct 2026); 3 members is not supported.
    expect(selector.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["ONE_OR_TWO", "FOUR_OR_MORE"]);
  });

  it("counts 1 or 2 members by no vote against and at least 1 for, refusing none of their tests", () => {
    for (const [c, rule] of rulesOf(act.MEETING_RULES)) {
      const small = rule.variants?.find((v) => v.when.memberBands?.includes("ONE_OR_TWO"));
      if (!small) continue;
      expect(small.rule, c).toEqual({ basis: "NONE_AGAINST_AT_LEAST_ONE_FOR", noQuorumRefusal: expect.stringMatching(/s 3\.12\)/) });
      expect(small.status, c).toBe("CONFIRMED");
    }
  });

  it("covers every band in each test chosen by it, with no band unknown to the selector", () => {
    const bands = selector.options.map((o) => o.value);
    for (const [c, rule] of rulesOf(act.MEETING_RULES)) {
      if (!rule.variants) continue;
      const covered = rule.variants.flatMap((v) => v.when.memberBands ?? []);
      expect([...covered].sort(), c).toEqual([...bands].sort());
    }
  });

  it("applies the debtor rule with 3 or more members, and asks the quorum for every motion and the units present for a special resolution (stage 2, PR 8a-ii)", () => {
    expect(act.MEETING_RULES.debtorsMayVoteOn).toEqual(["UNANIMOUS", "UNOPPOSED"]);
    expect(act.MEETING_RULES.debtorRuleAppliesWhen).toEqual({ selector: "memberBand", in: ["THREE", "FOUR_OR_MORE"] });
    expect(act.MEETING_RULES.countingRefusedWhen).toBeUndefined();
    expect(act.MEETING_RULES.quorumNeedsEveryLot).toBeUndefined();
    for (const [c, rule] of rulesOf(act.MEETING_RULES)) {
      expect(rule.withoutQuorum, c).toBe("DECIDED_LATER");
      expect(countNeedsQuorum(act.MEETING_RULES, c), c).toBe(true);
      expect(countNeedsVotesPresent(act.MEETING_RULES, c), c).toBe(c === "SPECIAL");
    }
    expect(act.MEETING_RULES.pollCategories).toEqual(["ORDINARY", "SPECIAL"]);
    expect(act.MEETING_RULES.minutesDeadlines).toEqual({ AGM: 14, EGM: 14, FIRST_AGM: 14, COMMITTEE: 14 });
  });
});

describe("Western Australia", () => {
  const wa = PENDING_RULE_PACKS.WA.rules.MEETING_RULES;
  it("holds the 28-day voting period on special, without dissent and unanimous resolutions only", () => {
    for (const c of ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"] as const) expect(wa.resolutionCategories[c]?.votingPeriodDays).toBe(28);
    expect(wa.resolutionCategories.ORDINARY?.votingPeriodDays).toBeUndefined();
    expect(wa.debtorsMayVoteOn).toEqual(["UNANIMOUS", "WITHOUT_DISSENT"]);
  });

  it("asks no quorum answer, and needs both lots of a 2-lot scheme counted (stage 2, PR 8a-ii)", () => {
    for (const c of Object.keys(wa.resolutionCategories)) expect(countNeedsQuorum(wa, c), c).toBe(false);
    for (const k of ["countingRefusedWhen", "debtorRuleAppliesWhen", "quorumAttestation", "votesPresentAttestation"] as const) expect(wa[k], k).toBeUndefined();
    expect(wa.quorumNeedsEveryLot).toMatchObject({ lotsAtMost: 2, status: "CONFIRMED" });
    expect(wa.quorumNeedsEveryLot?.source).toMatch(/s 130\(2\), \(4\)/);
  });
});

describe("NSW and Queensland", () => {
  it("carry none of the draft packs' keys, except that Queensland leaves common property rows out (2026.10.20)", () => {
    for (const rs of [NSW_RULE_SET, QLD_RULE_PACK.rules.MEETING_RULES]) {
      for (const [c, rule] of rulesOf(rs)) expect(usesDraftKeys(rule), c).toBe(false);
      expect(rs).not.toHaveProperty("memberBandSelector");
      expect(rs).not.toHaveProperty("categoryRequiredAtGeneralMeetings");
      // Stage 2, PR 8a-ii (29 Oct 2026): none of the new keys either, and no item asks the chair anything.
      for (const k of NEW_KEYS) expect(rs, k).not.toHaveProperty(k);
      for (const c of Object.keys(rs.resolutionCategories)) {
        expect(countNeedsQuorum(rs, c), c).toBe(false);
        expect(countNeedsVotesPresent(rs, c), c).toBe(false);
        expect(countNeedsReducedQuorum(rs, c), c).toBe(false);
        expect(countOpensVotingPeriod(rs, c), c).toBe(false);
      }
    }
    expect(NSW_RULE_SET).not.toHaveProperty("excludeCommonPropertyRows");
    expect(QLD_RULE_PACK.rules.MEETING_RULES.excludeCommonPropertyRows).toBe(true);
  });
});

describe("pending resolutions are wired to the categories that give them (stage 2, PR 8b-i)", () => {
  const vic = PENDING_RULE_PACKS.VIC.rules.MEETING_RULES;
  const act = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES;
  const wa = PENDING_RULE_PACKS.WA.rules.MEETING_RULES;

  it("Victoria: INTERIM_SPECIAL from the special resolution's interim category, INTERIM_NO_QUORUM from an interim result without a quorum", () => {
    expect(Object.keys(vic.pendingResolutions ?? {}).sort()).toEqual(["INTERIM_NO_QUORUM", "INTERIM_SPECIAL"]);
    expect(vic.resolutionCategories.SPECIAL?.interimCategory).toBe("INTERIM_SPECIAL");
    expect(vic.pendingResolutions?.INTERIM_SPECIAL).toMatchObject({ windowDays: 29, takesEffectAs: "SPECIAL", noticeWithinDays: 14, noticeRequiredBeforeEffect: true });
    expect(vic.pendingResolutions?.INTERIM_SPECIAL?.petition).toMatchObject({ moreThanFractionOf: 0.25, of: "ALL_LOTS" });
    expect(Object.values(vic.resolutionCategories).some((r) => r?.withoutQuorum === "INTERIM")).toBe(true);
    expect(vic.pendingResolutions?.INTERIM_NO_QUORUM).toMatchObject({ windowDays: 29, takesEffectAs: "SAME", meetingNotice: { meetingHeldWithinDays: 28 } });
    expect(vic.pendingResolutions?.INTERIM_NO_QUORUM?.petition).toBeUndefined();
    expect(vic.reducedQuorumAttestation).toBeUndefined();
  });

  it("the ACT: REDUCED_QUORUM from every category decided later, with the reduced quorum question", () => {
    expect(Object.keys(act.pendingResolutions ?? {})).toEqual(["REDUCED_QUORUM"]);
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS", "UNOPPOSED"]) {
      expect(act.resolutionCategories[c as ResolutionCategory]?.withoutQuorum, c).toBe("DECIDED_LATER");
      expect(countNeedsReducedQuorum(act, c), c).toBe(true);
    }
    expect(act.reducedQuorumAttestation).toBeDefined();
    expect(act.pendingResolutions?.REDUCED_QUORUM).toMatchObject({
      windowDays: 28,
      takesEffectAs: "SAME",
      noticeWithinDays: 14,
      noticeRequiredBeforeEffect: true,
      confirmedSoonerBy: "STANDARD_QUORUM_MEETING",
      petition: { moreThanFractionOf: 0.5, of: "LOTS_ENTITLED_TO_VOTE" },
    });
  });

  it("Western Australia: VOTING_PERIOD from every category with a voting period (stage 2, PR 8b-ii)", () => {
    expect(Object.keys(wa.pendingResolutions ?? {})).toEqual(["VOTING_PERIOD"]);
    const withPeriod = Object.entries(wa.resolutionCategories)
      .filter(([, r]) => r?.votingPeriodDays != null)
      .map(([c]) => c)
      .sort();
    expect(withPeriod).toEqual(["SPECIAL", "UNANIMOUS", "WITHOUT_DISSENT"]);
    for (const c of withPeriod) expect(wa.resolutionCategories[c as ResolutionCategory]?.votingPeriodDays, c).toBe(wa.pendingResolutions?.VOTING_PERIOD?.windowDays);
    expect(wa.pendingResolutions?.VOTING_PERIOD).toMatchObject({
      windowDays: 28,
      takesEffectAs: "SAME",
      noticeWithinDays: null,
      noticeRequiredBeforeEffect: false,
      settleAfterGraceDays: 7,
      lateVotes: { by: "LOTS_WITH_NOTHING_ENTERED", outcomeNoticeRequired: true },
    });
    expect(wa.pendingResolutions?.VOTING_PERIOD?.petition).toBeUndefined();
    expect(wa.pendingResolutions?.VOTING_PERIOD?.meetingNotice).toBeUndefined();
    expect(wa.pendingResolutions?.VOTING_PERIOD?.confirmedSoonerBy).toBeUndefined();
    expect(wa.reducedQuorumAttestation).toBeUndefined();
    // The 2-lot quorum still applies at the meeting.
    expect(wa.quorumNeedsEveryLot?.lotsAtMost).toBe(2);
    // Only Western Australia has a voting period or written votes after the meeting.
    for (const rs of [vic, act]) for (const r of Object.values(rs.pendingResolutions ?? {})) expect(r).not.toHaveProperty("lateVotes");
  });

  it.each(DRAFTS)("%s words each pending rule plainly, with its source and status", (_state, rs) => {
    for (const rule of Object.values(rs.pendingResolutions ?? {})) {
      expect(rule!.label).toMatch(/^[A-Z][a-z ]+[a-z]$/);
      expect(rule!.help).toMatch(/^[A-Z].*\.$/);
      expect(`${rule!.label} ${rule!.help} ${rule!.petition?.words ?? ""} ${rule!.meetingNotice?.words ?? ""}`).not.toMatch(NO_DASH_OR_SEMICOLON);
      // Western Australia's words (PR 8b-ii): sentences, a phrase to follow "the", and a question.
      if (rule!.conductHelp) expect(rule!.conductHelp).toMatch(/^[A-Z].*\.$/);
      if (rule!.lateVotes) {
        expect(rule!.lateVotes.words).toMatch(/^[A-Z].*\.$/);
        expect(rule!.lateVotes.noticeWords).toMatch(/^[a-z][a-z -]+[a-z]$/);
        expect(rule!.lateVotes.noticeLabel).toMatch(/^[A-Z][^.]*[a-z]$/);
      }
      expect(`${rule!.conductHelp ?? ""} ${rule!.lateVotes?.words ?? ""} ${rule!.lateVotes?.noticeWords ?? ""} ${rule!.lateVotes?.noticeLabel ?? ""}`).not.toMatch(NO_DASH_OR_SEMICOLON);
      expect(rule!.source.length).toBeGreaterThan(5);
      expect(STATUSES).toContain(rule!.status);
      expect(rule!.windowDays).toBeGreaterThan(0);
    }
    if (rs.reducedQuorumAttestation) {
      expect(rs.reducedQuorumAttestation.label).toMatch(/^[A-Z][^.]*[a-z]$/);
      expect(rs.reducedQuorumAttestation.help).toMatch(/^[A-Z].*\.$/);
      expect(`${rs.reducedQuorumAttestation.label} ${rs.reducedQuorumAttestation.help}`).not.toMatch(NO_DASH_OR_SEMICOLON);
    }
  });

  it("offers Record the votes on the conduct screen for an item with a voting period, and nowhere else (PR 8b-ii)", () => {
    const all = [
      ...Object.values(RULE_PACKS).map((p) => [p.state, p.rules.MEETING_RULES] as const),
      ...Object.values(PENDING_RULE_PACKS).map((p) => [p.state, p.rules.MEETING_RULES] as const),
    ];
    for (const [state, rs] of all) {
      const items = Object.keys(rs.resolutionCategories).map((c) => ({ id: c, resolutionCategory: c }));
      const view = conductVotingView(rs, PACK_RULES[state as keyof typeof PACK_RULES] ?? RULE_PACKS[state as keyof typeof RULE_PACKS].rules, [], items, "AGM");
      for (const c of Object.keys(rs.resolutionCategories)) {
        if (countOpensVotingPeriod(rs, c)) expect(view?.items[c]?.votingPeriod, `${state} ${c}`).toEqual({ help: rs.pendingResolutions?.VOTING_PERIOD?.conductHelp });
        else if (view) expect(view.items[c], `${state} ${c}`).not.toHaveProperty("votingPeriod");
      }
    }
    expect(["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"].every((c) => countOpensVotingPeriod(wa, c))).toBe(true);
    expect(countOpensVotingPeriod(wa, "ORDINARY")).toBe(false);
  });

  it("asks the reduced quorum on the conduct screen wherever the action reads it, and nowhere else", () => {
    const all = [
      ...Object.values(RULE_PACKS).map((p) => [p.state, p.rules.MEETING_RULES] as const),
      ...Object.values(PENDING_RULE_PACKS).map((p) => [p.state, p.rules.MEETING_RULES] as const),
    ];
    for (const [state, rs] of all) {
      const items = Object.keys(rs.resolutionCategories).map((c) => ({ id: c, resolutionCategory: c }));
      const view = conductVotingView(rs, PACK_RULES[state as keyof typeof PACK_RULES] ?? RULE_PACKS[state as keyof typeof RULE_PACKS].rules, [], items, "AGM");
      for (const c of Object.keys(rs.resolutionCategories)) {
        if (countNeedsReducedQuorum(rs, c)) expect(view?.items[c]?.reducedQuorumAsked, `${state} ${c}`).toEqual({ label: rs.reducedQuorumAttestation?.label, help: rs.reducedQuorumAttestation?.help });
        else if (view) expect(view.items[c], `${state} ${c}`).not.toHaveProperty("reducedQuorumAsked");
      }
    }
  });
});

describe("notice by motion is wired consistently (stage 2, PR 8b-iii)", () => {
  const vic = PENDING_RULE_PACKS.VIC.rules;
  const act = PENDING_RULE_PACKS.ACT.rules;
  const wa = PENDING_RULE_PACKS.WA.rules;

  it.each(DRAFTS)("%s: a longer notice is for a category the pack has and is longer than every general meeting's, and a type not checked has no period", (state, rs) => {
    for (const [c, rule] of Object.entries(rs.categoryNoticeDays ?? {}) as [ResolutionCategory, { days: number; source: string; status: RuleStatus }][]) {
      expect(rs.resolutionCategories[c], `${state} ${c}`).toBeDefined();
      for (const t of ["AGM", "EGM", "FIRST_AGM"] as const) expect(rule.days, `${state} ${c} ${t}`).toBeGreaterThan(rs.noticePeriods[t] ?? 0);
      expect(rule.source).toMatch(/\S{5,}/);
      expect(STATUSES).toContain(rule.status);
    }
    for (const [t, reason] of Object.entries(rs.noticeNotCheckedFor ?? {})) {
      expect(rs.noticePeriods[t as keyof typeof rs.noticePeriods], `${state} ${t}`).toBeUndefined();
      expect(reason).toMatch(/^[A-Z]/);
      expect(reason).not.toMatch(/[.;–—]$|[;–—]/);
    }
  });

  it("the ACT: 21 days for an unopposed or unanimous resolution, a unanimous one on a general meeting agenda but not the motions list, an unopposed one on neither (decision D13)", () => {
    const rs = act.MEETING_RULES;
    expect(rs.categoryNoticeDays).toEqual({
      UNOPPOSED: { days: 21, source: expect.stringMatching(/sch 3 s 3\.6\(2\)$/), status: "CONFIRMED" },
      UNANIMOUS: { days: 21, source: expect.stringMatching(/sch 3 s 3\.6\(2\)$/), status: "CONFIRMED" },
    });
    expect(rs.categoryNoticeDays?.UNANIMOUS?.days).toBe(act.MEETINGS.noticeDaysForUnopposedOrUnanimous);
    expect(rs.generalMeetingCategories).toEqual(["ORDINARY", "SPECIAL", "UNANIMOUS"]);
    expect(rs.motionCategories).toEqual(["ORDINARY", "SPECIAL"]);
    expect(rs.committeeCategories).toEqual(["ORDINARY"]);
    expect(rs.resolutionCategories.UNOPPOSED?.refusedBecause).toBeDefined();
    expect(rs.noticeNotCheckedFor).toBeUndefined();
    expect(act.MEETING_RULES_STATUS.categoryNoticeDays.status).toBe("STRATAVERZE");
  });

  it("Victoria and Western Australia: the committee's or council's notice is not checked, and nothing needs a longer notice (decisions D12 and D14)", () => {
    expect(Object.keys(vic.MEETING_RULES.noticeNotCheckedFor ?? {})).toEqual(["COMMITTEE"]);
    expect(vic.MEETING_RULES.noticeNotCheckedFor?.COMMITTEE).toMatch(/3 business days.*s 109\).*business days/);
    expect(Object.keys(wa.MEETING_RULES.noticeNotCheckedFor ?? {})).toEqual(["COMMITTEE"]);
    expect(wa.MEETING_RULES.noticeNotCheckedFor?.COMMITTEE).toMatch(/7 days by default.*by-law 8\(2\)\(a\)/);
    for (const rs of [vic.MEETING_RULES, wa.MEETING_RULES]) expect(rs.categoryNoticeDays).toBeUndefined();
    expect(vic.MEETING_RULES_STATUS.noticeNotCheckedFor.status).toBe("STRATAVERZE");
    expect(wa.MEETING_RULES_STATUS.noticeNotCheckedFor.status).toBe("STRATAVERZE");
  });
});
