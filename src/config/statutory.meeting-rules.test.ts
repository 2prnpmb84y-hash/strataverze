/**
 * The draft packs' meeting rules are wired up consistently (VIC, ACT and WA
 * stage 2, PR 8a-i, 28 Oct 2026): every category a list names has a rule and
 * a name, the interim special and unopposed resolutions are never offered on
 * an agenda, every rule and variant says where it comes from and how far it
 * is checked, and the NSW and Queensland rule sets carry none of the new keys.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, QLD_RULE_PACK } from "./statutory";
import { usesDraftKeys, type MeetingRuleSet, type ResolutionCategory, type ResolutionRule } from "@/lib/meetings/rules";
import type { RecordedBuildingSelector, RuleStatus } from "./statutory/types";

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
        for (const text of [r.refusedBecause, r.tieRefusedBecause, r.noVariantFitsRefusal]) {
          if (text == null) continue;
          expect(text).toMatch(/^[A-Z]/);
          expect(text).not.toMatch(/[.;–—]$|[;–—]/);
        }
      }
    }
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
});

describe("the ACT", () => {
  const act = PENDING_RULE_PACKS.ACT.rules;
  const selector = act.BUILDING_SELECTORS.find((s) => s.key === act.MEETING_RULES.memberBandSelector) as RecordedBuildingSelector;

  it("records the band of members as a building selector, with values the database store accepts", () => {
    expect(selector?.held).toBe("RECORDED");
    expect(selector.key).toMatch(/^[a-z][A-Za-z0-9]{0,63}$/);
    expect(selector.options.map((o) => o.value)).toEqual(["ONE_OR_TWO", "THREE", "FOUR_OR_MORE"]);
    for (const o of selector.options) expect(o.value).toMatch(/^[A-Z0-9_]{1,64}$/);
    expect(selector.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["FOUR_OR_MORE"]);
  });

  it("covers every band in each test chosen by it, with no band unknown to the selector", () => {
    const bands = selector.options.map((o) => o.value);
    for (const [c, rule] of rulesOf(act.MEETING_RULES)) {
      if (!rule.variants) continue;
      const covered = rule.variants.flatMap((v) => v.when.memberBands ?? []);
      expect([...covered].sort(), c).toEqual([...bands].sort());
    }
  });

  it("applies no debtor rule yet, so every count waits for quorum to be recorded", () => {
    expect(act.MEETING_RULES.debtorsMayVoteOn).toBeUndefined();
    for (const [c, rule] of rulesOf(act.MEETING_RULES)) expect(rule.withoutQuorum, c).toBe("DECIDED_LATER");
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
});

describe("NSW and Queensland", () => {
  it("carry none of the draft packs' keys, except that Queensland leaves common property rows out (2026.10.20)", () => {
    for (const rs of [NSW_RULE_SET, QLD_RULE_PACK.rules.MEETING_RULES]) {
      for (const [c, rule] of rulesOf(rs)) expect(usesDraftKeys(rule), c).toBe(false);
      expect(rs).not.toHaveProperty("memberBandSelector");
      expect(rs).not.toHaveProperty("categoryRequiredAtGeneralMeetings");
    }
    expect(NSW_RULE_SET).not.toHaveProperty("excludeCommonPropertyRows");
    expect(QLD_RULE_PACK.rules.MEETING_RULES.excludeCommonPropertyRows).toBe(true);
  });
});
