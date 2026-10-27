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

describe("Australian Capital Territory pack (pending)", () => {
  const pack = PENDING_RULE_PACKS.ACT;
  const act = pack.rules;

  it("is a draft for review, not signed off, with no decisions yet", () => {
    expect(pack.code).toBe("AU-ACT");
    expect(pack.state).toBe("ACT");
    expect(pack.status).toBe("DRAFT");
    expect(pack.reviewedOn).toBeNull();
    expect(pack.reviewer).toBe("Matthew Wrigley");
    expect(act.DECISIONS).toEqual([]);
  });

  it("holds exactly one entitlement schedule on each lot: unit entitlement", () => {
    expect(act.ENTITLEMENT_SCHEDULES.filter((s) => s.onLot).map((s) => s.key)).toEqual(["UNIT_ENTITLEMENT"]);
  });

  it("supports units plans only, not community title", () => {
    expect(act.SCHEME_TYPE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["UNITS_PLAN"]);
  });

  it("switches every NSW workflow off", () => {
    expect(Object.keys(act.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.values(act.FEATURES).every((on) => on === false)).toBe(true);
  });

  it("gives every shared term", () => {
    const shared = Object.keys(RULE_PACKS.NSW.rules.TERMINOLOGY).filter((k) => k !== "source");
    for (const k of shared) expect(act.TERMINOLOGY, k).toHaveProperty(k);
    expect(act.TERMINOLOGY.jurisdictionShort).toBe("ACT");
  });

  it("records the 2026 Bill as not law and not in force", () => {
    expect(act.PENDING_REFORMS).toHaveLength(1);
    for (const reform of act.PENDING_REFORMS) {
      expect(reform.legalStatus).toBe("NOT_LAW");
      expect(reform.textStatus).toBe("READ_IN_BILL_TEXT");
      expect(reform).not.toHaveProperty("status");
      expect(reform.inForce).toBe(false);
      expect(reform.notifiedOn).toBeNull();
      expect(reform.appliesFrom).toBeNull();
    }
    // The in-force quorum is unchanged until the Bill commences.
    expect(act.MEETINGS.quorum.fractionOfUnits).toBe(1 / 2);
    expect(act.MEETINGS.absenteeVotesCountTowardsQuorum).toBe(false);
  });

  it("treats the UTMR s 9 amount as the threshold for acting without approval, not a costs cap", () => {
    expect(act.DEBT_RECOVERY.otherLegalActionWithoutResolution.isCapOnRecoverableCosts).toBe(false);
    expect(act.DEBT_RECOVERY.contributionRecoveryNeedsResolution).toBe(false);
  });

  it("holds the special resolution tests: against not more than 1/4, or less than 1/3 with 3 members", () => {
    expect(act.RESOLUTIONS.SPECIAL.appliesAboveMembers).toBe(3);
    expect(act.RESOLUTIONS.SPECIAL.againstNotMoreThanFractionOfVotesThatCanBeCastByPeoplePresent).toBe(1 / 4);
    expect(act.RESOLUTIONS.SPECIAL.threeMembers.againstLessThanFraction).toBe(1 / 3);
    expect(act.RESOLUTIONS.SPECIAL.threeMembers.againstFractionDenominatorStatus).toBe("NOT_CONFIRMED");
    expect(act.SIZE_THRESHOLDS.threeMembersSpecialResolutionAgainstLessThanFraction).toBe(1 / 3);
    expect(act.RESOLUTIONS.ORDINARY.appliesAboveMembers).toBe(2);
    expect(act.RESOLUTIONS.UNANIMOUS.appliesAboveMembers).toBe(2);
  });

  it("charges 10% simple interest by default, 0 to 20% by special resolution", () => {
    expect(act.INTEREST.defaultAnnualRatePercent).toBe(10);
    expect(act.INTEREST.simple).toBe(true);
    expect(act.INTEREST.minAnnualRatePercent).toBe(0);
    expect(act.INTEREST.maxAnnualRatePercent).toBe(20);
    expect(act.INTEREST.openingWords.interpretationStatus).toBe("NOT_CONFIRMED");
  });

  it("requires an audit above 100 units or an annual budget above $250,000", () => {
    expect(act.AUDIT.requiredAboveUnits).toBe(100);
    expect(act.AUDIT.requiredAboveAnnualBudgetCents).toBe(25_000_000);
    expect(act.SIZE_THRESHOLDS.auditAboveUnits).toBe(100);
    expect(act.SIZE_THRESHOLDS.auditAboveAnnualBudgetCents).toBe(25_000_000);
  });

  it("holds the maximum certificate and records fees from 1 July 2026", () => {
    expect(act.SALE_CERTIFICATE.feesFrom).toBe("2026-07-01");
    expect(act.SALE_CERTIFICATE.maxFeeCentsIncGst).toEqual({ SALE: 35_300, SALE_UPDATE: 17_500, RENTAL: 35_300 });
    expect(act.SALE_CERTIFICATE.feeHistory.find((f) => f.effectiveFrom === "2026-07-01")?.maxFeeCentsIncGst).toEqual(act.SALE_CERTIFICATE.maxFeeCentsIncGst);
    expect(act.RECORDS.inspection.generalRecordsFeeMaxCentsIncGst).toBe(13_400);
    expect(act.RECORDS.inspection.generalRecordsFeeFrom).toBe("2026-07-01");
  });

  it("requires a sinking fund only from 4 units", () => {
    expect(act.SIZE_THRESHOLDS.sinkingFundRequiredFromUnits).toBe(4);
    expect(act.FUND_RULES.sinkingFundRequiredFromUnits).toBe(4);
    expect(act.FUND_CATALOGUE.find((f) => f.key === "SINKING")?.required).toBe(false);
  });

  it("is the rules recorded for review", () => {
    expect(act).toMatchSnapshot();
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

  it("switches every NSW workflow off for Queensland", () => {
    const features = PENDING_RULE_PACKS.QLD.rules.FEATURES;
    expect(Object.keys(features).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.values(features).every((on) => on === false)).toBe(true);
  });
});

describe("needRule with a rule set to null", () => {
  it("treats it as missing", () => {
    const rules = { ...RULE_PACKS.NSW.rules, STATUTORY_INTEREST: null } as unknown as StatutoryRules;
    expect(() => needRule(rules, "STATUTORY_INTEREST")).toThrow(RuleNotInPackError);
  });
});
