/**
 * Every pack, active or draft, describes its funds and entitlement schedules
 * in the shared shape (phase 2 foundation, 27 Oct 2026), and a draft pack is
 * never given to a building.
 */
import { describe, expect, it } from "vitest";
import {
  needRule,
  PENDING_RULE_PACKS,
  RULE_PACKS,
  RuleNotInPackError,
  rulePackFor,
  STATUTORY_INTEREST,
  statutoryRulesFor,
  UnsupportedJurisdictionError,
  type NswRules,
  type StatutoryRules,
} from "./statutory";
import { schemeStateProblem, SUPPORTED_SCHEME_STATES } from "./jurisdictions";
import type { EntitlementScheduleDefinition, FundDefinition, RuleStatus } from "./statutory/types";

const STATUSES: RuleStatus[] = ["CONFIRMED", "GUIDANCE", "STRATAVERZE", "NOT_CONFIRMED"];
const packs = [
  ...Object.values(RULE_PACKS).map((p) => [p.code, p.rules] as const),
  ...Object.values(PENDING_RULE_PACKS).map((p) => [p.code, p.rules] as const),
];

describe("pending rule packs", () => {
  it("are never given to a building, and their states cannot have buildings yet", () => {
    for (const draft of Object.values(PENDING_RULE_PACKS)) {
      expect(["DRAFT", "REVIEWED"]).toContain(draft.status);
      // Signed off exactly when reviewed.
      expect(draft.reviewedOn === null).toBe((draft.status as string) === "DRAFT");
      expect(Object.keys(RULE_PACKS)).not.toContain(draft.state);
      expect(rulePackFor(draft.state)).toBeNull();
      expect(() => statutoryRulesFor(draft.state)).toThrow(UnsupportedJurisdictionError);
      expect(SUPPORTED_SCHEME_STATES as readonly string[]).not.toContain(draft.state);
      expect(schemeStateProblem(draft.state)).not.toBeNull();
    }
  });
});

describe.each(packs)("%s funds and entitlement schedules", (_code, rules) => {
  const funds = (rules as { FUND_CATALOGUE: readonly FundDefinition[] }).FUND_CATALOGUE;
  const schedules = (rules as { ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] }).ENTITLEMENT_SCHEDULES;

  it("has one fund for each ledger fund, with unique keys and a source", () => {
    expect(new Set(funds.map((f) => f.key)).size).toBe(funds.length);
    expect(funds.map((f) => f.ledgerFund).sort()).toEqual(["ADMINISTRATIVE", "CAPITAL_WORKS"]);
    for (const f of funds) {
      expect(f.name).toBe(f.name.toLowerCase());
      expect(f.source.length).toBeGreaterThan(10);
      expect(STATUSES).toContain(f.status);
    }
  });

  it("holds exactly one entitlement schedule on each lot", () => {
    expect(schedules.filter((s) => s.onLot)).toHaveLength(1);
    expect(new Set(schedules.map((s) => s.key)).size).toBe(schedules.length);
    for (const s of schedules) {
      expect(s.usedFor.length).toBeGreaterThan(0);
      expect(STATUSES).toContain(s.status);
    }
  });
});

describe("NSW funds", () => {
  it("are the fund types the ledger and accounting basis already use", () => {
    const nsw = RULE_PACKS.NSW.rules as NswRules;
    expect(nsw.FUND_CATALOGUE.map((f) => f.key).sort()).toEqual(Object.keys(nsw.DEFAULT_ACCOUNTING_BASIS).sort());
    for (const f of nsw.FUND_CATALOGUE) expect(f.key).toBe(f.ledgerFund);
  });
});

describe("Queensland pack (pending)", () => {
  const qld = PENDING_RULE_PACKS.QLD.rules;

  it("is signed off, with its decisions recorded", () => {
    expect(PENDING_RULE_PACKS.QLD.status).toBe("REVIEWED");
    expect(PENDING_RULE_PACKS.QLD.reviewedOn).toBe("2026-10-27");
    expect(qld.DECISIONS.every((d) => d.decidedBy === "Matthew Wrigley" && d.decidedOn === "2026-10-27")).toBe(true);
    expect(qld.LATE_PAYMENT_PENALTY.appliesOnlyAfterResolutionRecorded).toBe(true);
    expect(qld.CONTRIBUTION_DISCOUNT.appliesOnlyAfterResolutionRecorded).toBe(true);
  });

  it("applies the Standard Module only", () => {
    expect(qld.REGULATION_MODULE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["STANDARD"]);
  });

  it("keeps the sinking fund in the ledger's capital works fund", () => {
    expect(qld.FUND_CATALOGUE.find((f) => f.key === "SINKING")?.ledgerFund).toBe("CAPITAL_WORKS");
    expect(qld.FUND_RULES.transfersBetweenFundsAllowed).toBe(false);
  });

  it("holds the contribution schedule on each lot and the interest schedule separately", () => {
    expect(qld.ENTITLEMENT_SCHEDULES.find((s) => s.onLot)?.key).toBe("CONTRIBUTION");
    expect(qld.ENTITLEMENT_SCHEDULES.find((s) => !s.onLot)?.key).toBe("INTEREST");
  });

  it("is the rules recorded for review", () => {
    expect(qld).toMatchSnapshot();
  });
});

describe("needRule (stage 2)", () => {
  it("gives the NSW rule", () => {
    expect(needRule(RULE_PACKS.NSW.rules, "STATUTORY_INTEREST")).toBe(STATUTORY_INTEREST);
  });

  it("refuses a pack without the rule, naming its jurisdiction", () => {
    const qld = PENDING_RULE_PACKS.QLD.rules;
    // A pack with only the shared rules.
    const sharedOnly: StatutoryRules = {
      TERMINOLOGY: qld.TERMINOLOGY,
      FUND_CATALOGUE: qld.FUND_CATALOGUE,
      ENTITLEMENT_SCHEDULES: qld.ENTITLEMENT_SCHEDULES,
      PAYMENT_ALLOCATION_ORDER: qld.PAYMENT_ALLOCATION_ORDER,
      FEATURES: qld.FEATURES,
      NOTICE_RULES: qld.NOTICE_RULES,
      LATE_CHARGE: qld.LATE_CHARGE,
      MEETING_RULES: qld.MEETING_RULES,
    };
    expect(() => needRule(sharedOnly, "STATUTORY_INTEREST")).toThrow(RuleNotInPackError);
    let error: unknown;
    try {
      needRule(sharedOnly, "PAYMENT_PLANS");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(RuleNotInPackError);
    expect((error as RuleNotInPackError).rule).toBe("PAYMENT_PLANS");
    expect((error as RuleNotInPackError).jurisdiction).toBe("Qld");
    expect((error as RuleNotInPackError).message).toContain("Qld");
  });
});

describe("pack features (stage 2)", () => {
  it("switches every NSW workflow on for NSW", () => {
    const features = RULE_PACKS.NSW.rules.FEATURES;
    expect(Object.keys(features).length).toBeGreaterThan(0);
    expect(Object.values(features).every((on) => on === true)).toBe(true);
  });

  it("switches every NSW workflow off for Queensland, except its own debt recovery steps", () => {
    const features = PENDING_RULE_PACKS.QLD.rules.FEATURES;
    expect(Object.keys(features).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    // Stage 2, step 8: the Queensland step sequence (draft) exists. The pack is still pending, so nothing is live.
    expect(Object.entries(features).filter(([, on]) => on).map(([k]) => k)).toEqual(["debtRecoverySteps"]);
    expect(PENDING_RULE_PACKS.QLD.rules.DEBT_RECOVERY_STEPS.length).toBeGreaterThan(0);
  });
});

describe("needRule with a rule set to null", () => {
  it("treats it as missing", () => {
    const rules = { ...RULE_PACKS.NSW.rules, STATUTORY_INTEREST: null } as unknown as StatutoryRules;
    expect(() => needRule(rules, "STATUTORY_INTEREST")).toThrow(RuleNotInPackError);
  });
});
