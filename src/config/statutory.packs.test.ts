/**
 * Every pack, active or draft, describes its funds and entitlement schedules
 * in the shared shape (phase 2 foundation, 27 Oct 2026), and a draft pack is
 * never given to a building. Queensland is active from 2026.10.19 (the
 * switch-on, 28 Oct 2026).
 */
import { describe, expect, it } from "vitest";
import {
  needRule,
  PENDING_RULE_PACKS,
  QLD_RULE_PACK,
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
import { fundConditionSelectors } from "@/lib/jurisdiction/funds";
import { noticeRuleProblems, noticeTimingFor } from "@/lib/levies/notice-rule-check";
import { annualLateChargeMissing, annualLateChargeRate, annualRateProblem, effectiveLateChargeMode, interestSettingProblem, lateCharge, lateChargeApplies, lateChargeWaiverProblem } from "@/lib/finance/statutory-interest";
import type { BuildingSelector, EntitlementScheduleDefinition, FundDefinition, RuleStatus, SelectorCondition } from "./statutory/types";

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

  it("writes each fund condition against the pack's own selectors and their options (stage 2, PR 3)", () => {
    const selectors = ((rules as { BUILDING_SELECTORS?: readonly BuildingSelector[] }).BUILDING_SELECTORS ?? []).map((s) => [s.key, s.options.map((o) => o.value)] as const);
    const known = new Map<string, readonly string[]>(selectors);
    const walk = (c: SelectorCondition): void => {
      if ("all" in c) c.all.forEach(walk);
      else if ("any" in c) c.any.forEach(walk);
      else if ("selector" in c) {
        expect(known.has(c.selector), c.selector).toBe(true);
        for (const v of c.in) expect(known.get(c.selector), `${c.selector} ${v}`).toContain(v);
      }
    };
    for (const f of funds) {
      if (!f.requiredWhen) continue;
      // A condition decides, so `required` stays false (the safe default for a reader that ignores it).
      expect(f.required).toBe(false);
      expect(f.requiredWhen.rules.length).toBeGreaterThan(0);
      expect(f.requiredWhen.noRuleFits.length).toBeGreaterThan(10);
      for (const r of f.requiredWhen.rules) {
        walk(r.when);
        expect(["REQUIRED", "OPTIONAL", "NOT_ALLOWED"]).toContain(r.need);
        expect(STATUSES).toContain(r.status);
        expect(r.provision.length).toBeGreaterThan(5);
        // Plain words for the screens: a sentence, with no dashes or semicolons.
        expect(r.reason).toMatch(/^[A-Z].*\.$/);
        expect(r.reason).not.toMatch(/[;\u2013\u2014]/);
      }
    }
  });

  it("reads every answer flagged only by fund conditions in at least one fund condition", () => {
    const read = fundConditionSelectors(funds);
    const deferred = ((rules as { BUILDING_SELECTORS?: readonly BuildingSelector[] }).BUILDING_SELECTORS ?? []).filter((s) => s.held === "RECORDED" && s.flagMissing === "FUND_CONDITIONS");
    for (const s of deferred) expect(read, s.key).toContain(s.key);
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

describe("Queensland pack (active)", () => {
  const qld = QLD_RULE_PACK.rules;

  it("is active: in RULE_PACKS, given to a Queensland building, and no longer pending (switched on 28 Oct 2026)", () => {
    expect(RULE_PACKS.QLD).toBe(QLD_RULE_PACK);
    expect(Object.keys(PENDING_RULE_PACKS)).not.toContain("QLD");
    expect(rulePackFor("QLD")).toBe(QLD_RULE_PACK);
    expect(statutoryRulesFor("QLD")).toBe(qld);
    expect(SUPPORTED_SCHEME_STATES).toContain("QLD");
    expect(schemeStateProblem("QLD")).toBeNull();
    // 2026.10.20 (29 Oct 2026): common property rows are not counted at conduct.
    expect(QLD_RULE_PACK.version).toBe("2026.10.20");
  });

  it("starts a new building's funds on the NSW accounting basis, as decided on 28 Oct 2026", () => {
    const nsw = RULE_PACKS.NSW.rules as NswRules;
    for (const t of ["ADMINISTRATIVE", "CAPITAL_WORKS", "ADMIN", "SINKING", ""]) expect(qld.defaultAccountingBasis(t), t).toBe(nsw.defaultAccountingBasis(t));
    expect(qld.defaultAccountingBasis("ADMINISTRATIVE")).toBe("CASH");
    expect(qld.defaultAccountingBasis("CAPITAL_WORKS")).toBe("ACCRUAL");
    expect(qld.DECISIONS.some((d) => d.decision.startsWith("Start a new Queensland building's funds on the same default accounting basis as NSW") && d.decidedOn === "2026-10-28")).toBe(true);
  });

  it("records the go-live sign-off of 28 Oct 2026", () => {
    const signOff = qld.DECISIONS.filter((d) => d.decision.startsWith("Go-live sign-off"));
    expect(signOff).toHaveLength(1);
    expect(signOff[0]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-28" });
    expect(signOff[0].decision).toContain("FOR_REVIEW points are accepted as built");
    expect(signOff[0].decision).toContain("debtor test for voting is applied per lot");
    expect(signOff[0].decision).toContain("switch-on is approved");
  });

  it("is signed off, with its decisions recorded", () => {
    expect(QLD_RULE_PACK.reviewedOn).toBe("2026-10-27");
    expect(QLD_RULE_PACK.reviewer).toBe("Matthew Wrigley");
    // The sign-off decisions of 27 Oct 2026, then the go-live decisions of 28 Oct 2026.
    expect(qld.DECISIONS.every((d) => d.decidedBy === "Matthew Wrigley" && ["2026-10-27", "2026-10-28"].includes(d.decidedOn))).toBe(true);
    expect(qld.DECISIONS.filter((d) => d.decidedOn === "2026-10-27")).toHaveLength(7);
    expect(qld.LATE_PAYMENT_PENALTY.appliesOnlyAfterResolutionRecorded).toBe(true);
    expect(qld.CONTRIBUTION_DISCOUNT.appliesOnlyAfterResolutionRecorded).toBe(true);
  });

  it("applies the Standard Module only", () => {
    expect(qld.REGULATION_MODULE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["STANDARD"]);
  });

  it("supports building and volumetric format plans only, sharing insurance by the interest schedule (decided 27 Oct 2026)", () => {
    expect(qld.PLAN_FORMAT.options.map((o) => o.value)).toEqual(["BUILDING", "VOLUMETRIC", "STANDARD"]);
    expect(qld.PLAN_FORMAT.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["BUILDING", "VOLUMETRIC"]);
    expect(qld.CONTRIBUTION_INSURANCE.paidFrom).toBe("ADMINISTRATIVE");
    expect(qld.CONTRIBUTION_INSURANCE.uses).toEqual(["INSURANCE_COMMON_PROPERTY", "INSURANCE_BUILDINGS"]);
    expect(qld.DECISIONS.some((d) => d.decision.startsWith("Support building and volumetric format plans only"))).toBe(true);
    // The three points Matthew Wrigley asked to review with the decision.
    for (const where of ["CONTRIBUTION_INSURANCE; src/lib/levies/contribution-shares.ts", "CONTRIBUTION_INSURANCE; src/lib/levies/contribution-insurance.ts", "PLAN_FORMAT STANDARD"]) {
      expect(qld.FOR_REVIEW.some((f) => f.where === where), where).toBe(true);
    }
  });

  it("leaves NSW with no plan format and no separate insurance share", () => {
    const nsw = RULE_PACKS.NSW.rules as StatutoryRules;
    expect(nsw.PLAN_FORMAT).toBeUndefined();
    expect(nsw.CONTRIBUTION_INSURANCE).toBeUndefined();
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

  it("is a draft for review, not signed off, with only the payment order, the notice timing, the quorum answer, 1 or 2 members, reduced quorum decisions, notice by motion, proxy caps and debt recovery decided", () => {
    expect(pack.code).toBe("AU-ACT");
    expect(pack.state).toBe("ACT");
    expect(pack.version).toBe("2026.10.13");
    expect(pack.status).toBe("DRAFT");
    expect(pack.reviewedOn).toBeNull();
    expect(pack.reviewer).toBe("Matthew Wrigley");
    expect(act.DECISIONS).toHaveLength(9);
    for (const d of act.DECISIONS.slice(0, 2)) expect(d).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-28" });
    expect(act.DECISIONS[0].decision).toContain("PAYMENT_ALLOCATION_ORDER");
    expect(act.DECISIONS[1].decision).toContain("NOTICE_RULES");
    // Stage 2, PR 8a-ii: the chair's quorum answer (29 Oct 2026).
    expect(act.DECISIONS[2]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    expect(act.DECISIONS[2].decision).toContain("quorumAttestation");
    expect(act.DECISIONS[3]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    expect(act.DECISIONS[3].decision).toContain("ONE_OR_TWO");
    // Stage 2, PR 8b-i: reduced quorum decisions (29 Oct 2026), kept in FOR_REVIEW for legal confirmation.
    expect(act.DECISIONS[4]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    for (const d of ["D1", "D2", "D3", "D5", "D6", "D10", "D11", "D19"]) expect(act.DECISIONS[4].decision).toContain(`(${d})`);
    expect(act.FOR_REVIEW.some((p) => p.startsWith("Reduced quorum decisions") && p.includes("(D6)") && p.includes("(D5)"))).toBe(true);
    // The grace before the end of a period is recorded (review M1, 29 Oct 2026), in the rule and kept in FOR_REVIEW.
    expect(act.DECISIONS[5]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    expect(act.DECISIONS[5].decision).toContain("settleAfterGraceDays");
    expect(act.MEETING_RULES.pendingResolutions?.REDUCED_QUORUM?.settleAfterGraceDays).toBe(7);
    expect(act.FOR_REVIEW.some((p) => p.startsWith("Reduced quorum decisions") && p.includes("(Review M1") && p.includes("settleAfterGraceDays"))).toBe(true);
    // Stage 2, PR 8b-iii: notice by motion (29 Oct 2026, decision D13), kept in FOR_REVIEW for legal confirmation.
    expect(act.DECISIONS[6]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    expect(act.DECISIONS[6].decision).toContain("(D13)");
    expect(act.DECISIONS[6].decision).toContain("categoryNoticeDays");
    expect(act.FOR_REVIEW.some((p) => p.startsWith("Notice by motion") && p.includes("D13") && p.includes("reasonably expected to be received"))).toBe(true);
    // The point it replaces, that unanimous resolutions are not offered for want of the 21 days, is gone.
    expect(act.FOR_REVIEW.some((p) => p.includes("unopposed and unanimous resolutions are not offered on an agenda"))).toBe(false);
    // Stage 2, PR 8b-iv: proxy caps warned only (29 Oct 2026, decision D15), kept in FOR_REVIEW, and the minutes point.
    expect(act.DECISIONS[7]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    expect(act.DECISIONS[7].decision).toContain("(D15)");
    expect(act.DECISIONS[7].decision).toContain("PROXY_RULES");
    expect(act.FOR_REVIEW.some((p) => p.startsWith("Proxy caps") && p.includes("D15") && p.includes("may be over") && p.includes("which no screen has yet"))).toBe(true);
    expect(act.FOR_REVIEW.some((p) => p.includes("when a proxy is checked"))).toBe(false);
    expect(act.FOR_REVIEW.some((p) => p.startsWith("Minutes (sch 2 s 2.1(1)(c)") && p.includes("Stage C"))).toBe(true);
    // The minutes now state the later effect, so the point saying they do not is gone.
    expect(act.FOR_REVIEW.some((p) => p.includes("The minutes do not state the later effect yet"))).toBe(false);
    // Stage 2, PR 9b: debt recovery and the statutory charge (29 Oct 2026, decisions D7, D8 and D10 to D13), kept in FOR_REVIEW.
    expect(act.DECISIONS[8]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    for (const d of ["D7", "D8", "D10", "D11", "D12", "D13"]) expect(act.DECISIONS[8].decision).toContain(`(${d})`);
    const debt = act.FOR_REVIEW.filter((p) => p.startsWith("Debt recovery (stage 2, PR 9b"));
    expect(debt).toHaveLength(6);
    for (const d of ["D7", "D8", "D10", "D11", "D12", "D13"]) expect(debt.some((p) => p.includes(d)), d).toBe(true);
    expect(debt.some((p) => p.includes("withinDays") && p.includes("never blocked"))).toBe(true);
    expect(debt.some((p) => p.includes("completePlan"))).toBe(true);
    expect(act.NOT_CONFIRMED.some((p) => p.startsWith("The statutory charge (UTMA ss 96, 97): who declares it"))).toBe(true);
    expect(act.NOT_CONFIRMED.some((p) => p.startsWith("Whether a delegation to the manager"))).toBe(true);
  });

  it("holds exactly one entitlement schedule on each lot: unit entitlement", () => {
    expect(act.ENTITLEMENT_SCHEDULES.filter((s) => s.onLot).map((s) => s.key)).toEqual(["UNIT_ENTITLEMENT"]);
  });

  it("supports units plans only, not community title", () => {
    expect(act.SCHEME_TYPE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["UNITS_PLAN"]);
  });

  it("switches every NSW workflow off except the debt recovery steps (stage 2, PR 9b)", () => {
    expect(Object.keys(act.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.entries(act.FEATURES).filter(([, on]) => on).map(([k]) => k)).toEqual(["debtRecoverySteps"]);
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

  it("requires a sinking fund only from 4 units, through the sinking fund selector", () => {
    expect(act.SIZE_THRESHOLDS.sinkingFundRequiredFromUnits).toBe(4);
    expect(act.FUND_RULES.sinkingFundRequiredFromUnits).toBe(4);
    const sinking = act.FUND_CATALOGUE.find((f) => f.key === "SINKING");
    expect(sinking?.required).toBe(false);
    expect(sinking?.requiredWhen?.rules.map((r) => [r.need, r.when, r.status])).toEqual([
      ["REQUIRED", { selector: "sinkingFundRequired", in: ["REQUIRED"] }, "CONFIRMED"],
      ["OPTIONAL", { selector: "sinkingFundRequired", in: ["NOT_REQUIRED"] }, "CONFIRMED"],
    ]);
    expect(act.FUND_CATALOGUE.find((f) => f.key === "ADMINISTRATIVE")?.required).toBe(true);
  });

  it("is the rules recorded for review", () => {
    expect(act).toMatchSnapshot();
  });
});

describe("Victorian pack (pending)", () => {
  const pack = PENDING_RULE_PACKS.VIC;
  const vic = pack.rules;
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

  it("is a draft, not signed off, and never given to a building", () => {
    expect(pack.code).toBe("AU-VIC");
    expect(pack.state).toBe("VIC");
    expect(pack.version).toBe("2026.10.13");
    expect(pack.status).toBe("DRAFT");
    expect(pack.reviewedOn).toBeNull();
    expect(rulePackFor("VIC")).toBeNull();
    expect(rulePackFor(" vic ")).toBeNull();
    expect(() => statutoryRulesFor("VIC")).toThrow(UnsupportedJurisdictionError);
    expect(SUPPORTED_SCHEME_STATES as readonly string[]).not.toContain("VIC");
    expect(Object.keys(RULE_PACKS)).not.toContain("VIC");
  });

  it("is covered by the pending pack loop and the shared fund and schedule checks", () => {
    expect(Object.values(PENDING_RULE_PACKS)).toContain(pack);
    expect(packs.map(([code]) => code)).toContain("AU-VIC");
  });

  it("has proposed decisions, none decided but the payment order and the notice timing (Matthew Wrigley, 28 Oct 2026), the quorum answer, interim resolutions, the committee notice not checked, proxy caps and debt recovery (29 Oct 2026), and the amount when proceedings are started (30 Oct 2026)", () => {
    expect(vic.DECISIONS.length).toBeGreaterThan(1);
    for (const d of vic.DECISIONS) {
      if (d.decision.includes("PROCEEDINGS_CLAIM_LIMIT")) {
        expect(d).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-30", proposedOn: "2026-10-30" });
        continue;
      }
      if (d.decision.includes("PAYMENT_ALLOCATION_ORDER") || d.decision.includes("NOTICE_RULES")) {
        expect(d).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-28" });
        continue;
      }
      if (
        d.decision.includes("quorumAttestation") ||
        d.decision.includes("pendingResolutions") ||
        d.decision.includes("noticeNotCheckedFor") ||
        d.decision.includes("PROXY_RULES") ||
        d.decision.includes("DEBT_RECOVERY_STEPS")
      ) {
        expect(d).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29", proposedOn: "2026-10-29" });
        continue;
      }
      expect(d.decidedBy).toBeNull();
      expect(d.decidedOn).toBeNull();
    }
    expect(vic.DECISIONS.filter((d) => d.decidedBy != null)).toHaveLength(9);
    // Stage 2, PR 9c: debt recovery (D2 to D6, D10 to D15), each kept in FOR_REVIEW for legal confirmation.
    const debt = vic.DECISIONS.find((d) => d.decision.includes("DEBT_RECOVERY_STEPS"))!;
    const ids = ["D2", "D3", "D4", "D5", "D6", "D10", "D11", "D12", "D13", "D14", "D15"];
    for (const id of ids) expect(debt.decision).toContain(`(${id})`);
    const review = (key: string) => vic.FOR_REVIEW.find((p) => p.key === key)?.point ?? "";
    const debtKeys = [
      "S18_COMMITTEE_DELEGATION",
      "S18_BALLOT_RESOLUTION",
      "FINAL_FEE_NOTICE",
      "FINAL_NOTICE_OUTSIDE",
      "S18_ANNUAL_FEES_COMPARATOR",
      "DAY_COUNTING_RECOVERY",
      "VCAT_GATE_COURT",
      "TIER_5_RECOVERY",
      "TAKEOVER_NOTICES_FINAL_NOTICE",
      "PAYMENT_PLAN_PAUSE_GUARD",
      "RECOVERY_FEES_NOT_PASSED",
      "DEBT_RECOVERY_FORUM",
      "DEBT_RECOVERY_STEPS",
    ];
    for (const key of debtKeys) expect(review(key), key).toMatch(/decisions? D\d+/);
    const reviewed = debtKeys.map(review).join(" ");
    for (const id of ids) expect(reviewed, id).toMatch(new RegExp(`\\b${id}\\b`));
    expect(review("FINAL_FEE_NOTICE")).not.toContain("is a later PR");
    expect(review("PAYMENT_PLAN_PAUSE_GUARD")).toContain("the payment plan pause is not supported yet");
    // Review (30 Oct 2026): the tier checked again, and a ballot resolution cannot be chosen.
    expect(review("TIER_5_RECOVERY")).toContain("checked again");
    expect(review("S18_BALLOT_RESOLUTION")).toContain("cannot be chosen");
    // Matthew Wrigley's decision of 30 Oct 2026 (review M1): ceiling for ordinary only, and the claim limited to the
    // notices the final notice covered, kept in FOR_REVIEW.
    const claimLimit = review("PROCEEDINGS_CLAIM_LIMIT");
    for (const words of ["decision of 30 Oct 2026", "ceiling for ordinary only", "special resolution covers a larger amount", "checked again against s 18(2)", "the final fee notice covered"]) {
      expect(claimLimit, words).toContain(words);
    }
    expect(review("S18_ANNUAL_FEES_COMPARATOR")).toContain("PROCEEDINGS_CLAIM_LIMIT");
    expect(review("S18_ANNUAL_FEES_COMPARATOR")).not.toContain("a larger amount is refused");
    // Its review (30 Oct 2026): due before debt recovery is switched on, the claim limit is StrataVerze practice, the
    // adviser waits or opens a new case (never a new final notice on this case), and one definition at both steps.
    expect(vic.FOR_REVIEW.find((p) => p.key === "PROCEEDINGS_CLAIM_LIMIT")?.before).toBe("Victorian debt recovery is switched on");
    for (const words of ["the notes record no amount limit in s 18(1)", "The Final Notice step uses the same definition", "close the case and open a new one"]) {
      expect(claimLimit, words).toContain(words);
    }
    expect(claimLimit).not.toContain("s 18(1) states no amount limit");
    expect(claimLimit).not.toContain("or a new one is needed");
    const proceedingsGuidance = vic.DEBT_RECOVERY_GUIDANCE.PROCEEDINGS;
    expect(proceedingsGuidance).toContain("StrataVerze practice (decision of 30 Oct 2026)");
    expect(proceedingsGuidance).toContain("Wait until those fee notices are paid, or close the case and open a new one.");
    expect(proceedingsGuidance).not.toMatch(/new final (fee )?notice/);
    expect(vic.NOT_CONFIRMED.some((p) => p.startsWith("What \"the total amount of the current annual fees\" in s 18(2) is"))).toBe(true);
    // Stage 2, PR 8b-iv: proxy caps (D15 to D17) and the minutes (D18), kept in FOR_REVIEW PROXY_CAPS and MINUTES_CONTENTS.
    const proxies = vic.DECISIONS.find((d) => d.decision.includes("PROXY_RULES"))!;
    for (const id of ["D15", "D16", "D17", "D18"]) expect(proxies.decision).toContain(`(${id})`);
    for (const id of ["D15", "D16", "D17"]) expect(vic.FOR_REVIEW.find((p) => p.key === "PROXY_CAPS")?.point).toContain(`(${id})`);
    expect(vic.FOR_REVIEW.find((p) => p.key === "MINUTES_CONTENTS")?.point).toContain("D18");
    // Review (29 Oct 2026): where the warnings show, no floor below 1 proxy, joint owners and the in-force start, for Matthew Wrigley.
    const caps = vic.FOR_REVIEW.find((p) => p.key === "PROXY_CAPS")?.point ?? "";
    for (const words of ["proxy limits panel", "which no screen has yet", "no floor is applied", "larger of 1 and the share rounded down", "Joint owners", "9 Sep 2026"]) expect(caps).toContain(words);
    expect(caps).not.toContain("when a proxy is checked");
    expect(vic.FOR_REVIEW.find((p) => p.key === "MINUTES_CONTENTS")?.point).toContain("Stage C");
    expect(vic.FOR_REVIEW.find((p) => p.key === "MEETING_RULES_PENDING")?.point).not.toContain("The minutes do not state the later effect yet");
    // Stage 2, PR 8b-iii: the committee notice not checked (D12) and business days (D14), kept in FOR_REVIEW.
    const notChecked = vic.DECISIONS.find((d) => d.decision.includes("noticeNotCheckedFor"))!;
    for (const id of ["D12", "D14"]) expect(notChecked.decision).toContain(`(${id})`);
    const noticePoint = vic.FOR_REVIEW.find((p) => p.key === "MEETING_RULES_NOTICE_AND_MINUTES")?.point;
    for (const id of ["D12", "D14"]) expect(noticePoint).toContain(`(${id})`);
    expect(vic.FOR_REVIEW.find((p) => p.key === "MEETING_RULES_ARREARS")?.point).toContain("decision D14");
    // The grace before the end of a period is recorded (review M1, 29 Oct 2026), in the rules and kept in FOR_REVIEW.
    expect(vic.DECISIONS.some((d) => d.decision.includes("settleAfterGraceDays") && d.decidedOn === "2026-10-29")).toBe(true);
    expect(vic.MEETING_RULES.pendingResolutions?.INTERIM_SPECIAL?.settleAfterGraceDays).toBe(7);
    expect(vic.MEETING_RULES.pendingResolutions?.INTERIM_NO_QUORUM?.settleAfterGraceDays).toBe(7);
    expect(vic.FOR_REVIEW.find((p) => p.key === "MEETING_RULES_PENDING")?.point).toContain("(Review M1");
    // Stage 2, PR 8b-i: interim resolutions, kept in FOR_REVIEW MEETING_RULES_PENDING for legal confirmation.
    const pending = vic.DECISIONS.find((d) => d.decision.includes("pendingResolutions"))!;
    for (const id of ["D1", "D2", "D3", "D4", "D7", "D10", "D11", "D19", "D20"]) expect(pending.decision).toContain(`(${id})`);
    expect(vic.FOR_REVIEW.find((p) => p.key === "MEETING_RULES_PENDING")?.kind).toBe("LEGAL");
  });

  it("switches every NSW workflow off except the debt recovery steps (stage 2, PR 9c), with the same keys", () => {
    expect(Object.keys(vic.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.entries(vic.FEATURES).filter(([, on]) => on).map(([k]) => k)).toEqual(["debtRecoverySteps"]);
  });

  it("holds the maintenance fund in the ledger's capital works fund, and marks the administrative fund a StrataVerze choice", () => {
    const maintenance = vic.FUND_CATALOGUE.find((f) => f.key === "MAINTENANCE");
    const admin = vic.FUND_CATALOGUE.find((f) => f.key === "ADMINISTRATIVE");
    expect(maintenance?.ledgerFund).toBe("CAPITAL_WORKS");
    expect(maintenance?.status).toBe("CONFIRMED");
    expect(maintenance?.required).toBe(false);
    expect(admin?.ledgerFund).toBe("ADMINISTRATIVE");
    expect(admin?.status).toBe("STRATAVERZE");
    // Required as a ledger choice (stage 2, PR 3 review), so every building has a ledger fund.
    expect(admin?.required).toBe(true);
    expect(admin?.requiredWhen).toBeUndefined();
    expect(vic.FOR_REVIEW.map((r) => r.key)).toEqual(expect.arrayContaining(["ADMINISTRATIVE_FUND", "MAINTENANCE_FUND_REQUIRED"]));
  });

  it("requires the maintenance fund by tier and an approved maintenance plan", () => {
    const maintenance = vic.FUND_CATALOGUE.find((f) => f.key === "MAINTENANCE");
    expect(maintenance?.requiredWhen?.rules.map((r) => [r.need, r.when, r.status])).toEqual([
      ["REQUIRED", { selector: "tier", in: ["TIER_1", "TIER_2"] }, "STRATAVERZE"],
      ["OPTIONAL", { selector: "tier", in: ["TIER_5"] }, "CONFIRMED"],
      ["REQUIRED", { all: [{ selector: "tier", in: ["TIER_3", "TIER_4"] }, { selector: "maintenancePlanApproved", in: ["YES"] }] }, "CONFIRMED"],
      ["OPTIONAL", { all: [{ selector: "tier", in: ["TIER_3", "TIER_4"] }, { selector: "maintenancePlanApproved", in: ["NO"] }] }, "CONFIRMED"],
    ]);
    expect(vic.MAINTENANCE_PLAN_APPROVED).toMatchObject({ held: "RECORDED", flagMissing: "FUND_CONDITIONS" });
    expect(vic.MAINTENANCE_PLAN.mustTiers).toEqual([1, 2]);
  });

  it("holds lot liability on each lot and lot entitlement separately", () => {
    expect(vic.ENTITLEMENT_SCHEDULES.find((s) => s.onLot)?.key).toBe("LOT_LIABILITY");
    expect(vic.ENTITLEMENT_SCHEDULES.find((s) => !s.onLot)?.key).toBe("LOT_ENTITLEMENT");
  });

  it("says which schedule decides each use, and does not apply the s 23A fee yet (stage 2, PR 4)", () => {
    expect(vic.ENTITLEMENT_SCHEDULES.map((s) => [s.key, s.label, s.decides])).toEqual([
      ["LOT_LIABILITY", "Lot Liability", ["CONTRIBUTIONS"]],
      ["LOT_ENTITLEMENT", "Lot Entitlement", ["POLL_VOTE", "SPECIAL_RESOLUTION", "UNANIMOUS_RESOLUTION", "QUORUM_FALLBACK", "COMMON_PROPERTY_SHARE", "INSURANCE_PREMIUM_FEE"]],
    ]);
    expect(vic.ENTITLEMENT_SCHEDULES.find((s) => s.onLot)?.importLabel).toBe("Lot Liability");
    // No insurance split until FOR_REVIEW CONTRIBUTION_INSURANCE_S23A is decided: every fee goes by lot liability.
    expect("CONTRIBUTION_INSURANCE" in vic).toBe(false);
    expect(vic.FOR_REVIEW.find((r) => r.key === "CONTRIBUTION_INSURANCE_S23A")?.point).toMatch(/^The s 23A insurance premium fee is NOT applied yet/);
    expect(vic.FOR_REVIEW.map((r) => r.key)).toEqual(expect.arrayContaining(["ENTITLEMENT_DECIDES", "SECOND_SCHEDULE_HELD", "CONTRIBUTION_INSURANCE_S23A"]));
    // ACT and WA are unchanged: one schedule, no separate insurance share.
    for (const code of ["ACT", "WA"] as const) {
      expect(PENDING_RULE_PACKS[code].rules.ENTITLEMENT_SCHEDULES).toHaveLength(1);
      expect("CONTRIBUTION_INSURANCE" in PENDING_RULE_PACKS[code].rules).toBe(false);
    }
  });

  it("uses Victorian terms", () => {
    const t = vic.TERMINOLOGY;
    expect([t.ownersCorporation, t.committee, t.tribunal, t.levy, t.levies, t.lateCharge, t.planLabel]).toEqual([
      "owners corporation",
      "committee",
      "VCAT",
      "fee",
      "fees",
      "interest",
      "Plan of subdivision",
    ]);
    expect(t.bodyCorporateNameStatus).toBe("GUIDANCE");
  });

  it("lists supported scheme options only as a StrataVerze choice under review", () => {
    expect(vic.OWNERS_CORPORATION_TYPE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["UNLIMITED"]);
    expect(vic.FOR_REVIEW.map((r) => r.key)).toContain("OWNERS_CORPORATION_TYPE_SUPPORTED");
  });

  it("holds every pending change switched off, with its latest start date and commencement", () => {
    expect(vic.PENDING_CHANGES.length).toBeGreaterThan(0);
    for (const c of vic.PENDING_CHANGES) {
      expect(c.inForce).toBe(false);
      expect(c.commencedOn).toBeNull();
      expect(c.commencement.length).toBeGreaterThan(10);
      if (c.latestStartDate !== null) expect(isDate(c.latestStartDate)).toBe(true);
      else expect(c.legalStatus).toBe("ANNOUNCED_NO_LEGISLATION");
    }
    const byKey = Object.fromEntries(vic.PENDING_CHANGES.map((c) => [c.key, c]));
    for (const k of ["CLAA_2026_PAYMENT_PLANS", "CLAA_2026_PROXY_LIMIT", "CLAA_2026_INTEREST_PAUSE", "CLAA_2026_ARREARS_CARVE_OUTS", "CLAA_2026_PRIVACY"]) {
      expect(byKey[k].latestStartDate).toBe("2027-12-01");
      expect(byKey[k].legalStatus).toBe("ENACTED_NOT_COMMENCED");
    }
    expect(byKey.SR_53_2026_MANAGER_FEES.latestStartDate).toBe("2026-11-25");
    expect(byKey.SR_53_2026_MANAGER_FEES.fixedStartDate).toBe("2026-11-25");
    expect(vic.PENDING_CHANGES.filter((c) => c.fixedStartDate !== null).map((c) => c.key)).toEqual(["SR_53_2026_MANAGER_FEES"]);
    expect(byKey.SR_53_2026_MANAGER_FEES.legalStatus).toBe("MADE_NOT_COMMENCED");
    expect(byKey.HSRA_2025_MANAGER_EDUCATION.latestStartDate).toBe("2027-06-30");
    expect(byKey.MANAGER_LICENSING_ANNOUNCEMENT_2026.status).toBe("GUIDANCE");
  });

  it("keeps the in-force rules apart from the pending ones", () => {
    expect(vic.FEE_RECOVERY.statutoryPaymentPlansInForce).toBe(false);
    expect(vic.DUTIES_BY_TIER.paymentPlansPending.inForce).toBe(false);
    // The in-force manager fees are the OCR Version 002 ones, not SR 53/2026's.
    expect(vic.MANAGER.registrationFeeUnits).toEqual({ application: 14.26, annual: 10.01, lateLodgement: 1 });
    // The s 212 transitional deadlines are in force, held with the manager rules.
    expect(vic.MANAGER.educationTransitionalDeadlines).toMatchObject({ coursesBy: "2027-06-30", evidenceAndOfficerAppointmentForExistingBusinessesBy: "2027-08-01", status: "CONFIRMED" });
    // The in-force proxy limit is s 89D as it stands, not the one-lot-owner limit.
    expect(vic.PROXIES.limit.maxPercentOfLotOwnersWhenAboveThreshold).toBe(5);
  });

  it("gives the resolution thresholds in the Act", () => {
    expect(vic.RESOLUTIONS.SPECIAL.fractionOfTotalVotes).toBe(0.75);
    expect(vic.RESOLUTIONS.SPECIAL.fractionOfTotalLotEntitlementsOnBallotOrPoll).toBe(0.75);
    expect(vic.RESOLUTIONS.SPECIAL.countsTotalForAllLots).toBe(true);
    expect(vic.RESOLUTIONS.INTERIM_SPECIAL.route1).toEqual({ forAtLeastFractionOfTotalVotes: 0.5, againstNotMoreThanFractionOfTotalVotes: 0.25 });
    // s 97(5): more than 25% of the total votes, not of lot entitlements (CAV differs).
    expect(vic.RESOLUTIONS.INTERIM_SPECIAL.petitionStopsIfMoreThanFractionOfTotalVotes).toBe(0.25);
    expect(vic.RESOLUTIONS.INTERIM_SPECIAL.petitionCounts).toBe("total votes for all the lots");
    expect(vic.RESOLUTIONS.INTERIM_SPECIAL.becomesSpecialAfterDays).toBe(29);
    expect(vic.MEETINGS.quorum).toEqual({ percentOfTotalLots: 50, otherwisePercentOfTotalLotEntitlement: 50 });
    // s 78: stopped by notice of a special general meeting, not a petition (CAV differs).
    expect(vic.MEETINGS.interimResolutions.stoppedBy).toContain("notice of a special general meeting");
    expect(vic.SPECIAL_FEES.specialResolutionIfMoreThanTimesCurrentAnnualFees).toBe(2);
  });

  it("gives the proxy limits, current and pending", () => {
    expect(vic.PROXIES.limit.occupiableLotsThreshold).toBe(20);
    expect(vic.PROXIES.limit.maxLotOwnersWhenAtOrBelowThreshold).toBe(1);
    expect(vic.PROXIES.limit.maxPercentOfLotOwnersWhenAboveThreshold).toBe(5);
    expect(vic.PROXIES.limit.counts).toBe("occupiable lots");
    expect(vic.PROXIES.limit.roundingStatus).toBe("NOT_CONFIRMED");
    const pending = vic.PENDING_CHANGES.find((c) => c.key === "CLAA_2026_PROXY_LIMIT");
    expect(pending?.rules).toMatchObject({ maxLotOwners: 1, exceptionsUnchanged: true });
  });

  it("gives the s 18 authority to sue, with delegation not confirmed", () => {
    const s18 = vic.AUTHORITY_TO_SUE;
    expect(s18.inForceFrom).toBe("2026-09-09");
    expect(s18.defaultResolution).toBe("SPECIAL");
    expect(s18.ordinaryResolutionForMoneyUpToTimesCurrentAnnualFees).toBe(2);
    expect(s18.ordinaryResolutionForNonMonetaryOrders).toBe(true);
    expect(s18.committeeDelegation).toMatchObject({ status: "NOT_CONFIRMED", mayBeAutomated: false });
    expect(vic.FOR_REVIEW.find((r) => r.key === "S18_COMMITTEE_DELEGATION")?.before).toContain("debt workflow");
  });

  it("gives the tier lot counts, and the tests that count lots instead", () => {
    expect(vic.TIERS.tiers.map((t) => [t.tier, t.occupiableLotsMin, t.occupiableLotsMax])).toEqual([
      [1, 101, null],
      [2, 51, 100],
      [3, 10, 50],
      [4, 3, 9],
      [5, 2, 2],
    ]);
    expect(vic.TIERS.countingRules[0]).toMatchObject({ occupiableLotsFewerThan: 10, nonOccupiableLotsMoreThan: 50 });
    // s 100 counts all lots, not tiers.
    expect(vic.LOT_COUNT_TESTS.committeeRequired).toMatchObject({ lotsAtLeast: 10, counts: "all lots" });
    expect(vic.COMMITTEE.requiredFromLots).toBe(10);
    expect(vic.LOT_COUNT_TESTS.proxyLimit.counts).toBe("occupiable lots");
  });

  it("gives the audit and review duties by tier", () => {
    expect(vic.DUTIES_BY_TIER.auditOrReview.auditMandatory).toEqual([1]);
    expect(vic.DUTIES_BY_TIER.auditOrReview.reviewMandatory).toEqual([2]);
    expect(vic.DUTIES_BY_TIER.maintenancePlan.must).toEqual([1, 2]);
    expect(vic.DUTIES_BY_TIER.manager.mustAppoint).toEqual([1]);
    expect(vic.DUTIES_BY_TIER.managerRevocationNotice.contractMayNotRequireMonthsOrMore).toEqual({ 1: 3, 2: 3, 3: 1, 4: 1, 5: 1 });
    expect(vic.DUTIES_BY_TIER.insuranceValuation).toMatchObject({ everyYears: 5, must: [1, 2, 3, 4], exempt: [5] });
  });

  it("holds fees in fee units, with calculated dollars never marked official", () => {
    expect(vic.FEES_IN_FEE_UNITS.certificate.withinBusinessDays).toEqual({ 2: 17.35, 5: 14.46, 10: 9.64 });
    expect(vic.FEES_IN_FEE_UNITS.certificate.additionalWithinBusinessDays).toEqual({ 2: 9.54, 5: 7.95, 10: 5.3 });
    expect(vic.FEES_IN_FEE_UNITS.recordCopy.firstRecordFeeUnits).toBe(1.15);
    expect(vic.FEES_IN_FEE_UNITS.registerCopy.feeUnits).toBe(3.03);
    expect(vic.FEE_UNIT_VALUES["2026-27"]).toMatchObject({ centsPerFeeUnit: 1_727, status: "GUIDANCE" });
    expect(vic.FEE_DOLLARS_CALCULATED.official).toBe(false);
    expect(vic.FEE_DOLLARS_CALCULATED.status).toBe("NOT_CONFIRMED");
    // The researcher's calculated figures, as the notes give them (sections N and O).
    expect(vic.FEE_DOLLARS_CALCULATED["2026-27"]).toEqual({
      recordCopyFirstRecordCents: 1_986,
      registerCopyCents: 5_233,
      certificateWithinBusinessDaysCents: { 2: 29_963, 5: 24_972, 10: 16_648 },
      additionalCertificateWithinBusinessDaysCents: { 2: 16_476, 5: 13_730, 10: 9_153 },
    });
    const sr53 = vic.PENDING_CHANGES.find((c) => c.key === "SR_53_2026_MANAGER_FEES");
    expect(sr53?.rules).toMatchObject({ feeUnits: { application: 29.12, annual: 22.05, lateLodgement: 1.35 } });
  });

  it("marks the penalty interest rate guidance, not a default", () => {
    expect(vic.INTEREST.penaltyInterestRate).toMatchObject({ annualPercent: 10, status: "GUIDANCE", usableAsDefaultCap: false });
    expect(vic.FOR_REVIEW.map((r) => r.key)).toContain("PENALTY_INTEREST_RATE");
  });

  it("records the approved form rules and the unconfirmed points", () => {
    const forms = vic.FEE_NOTICES.approvedForms;
    expect(forms.mayBeAdded).toEqual(["reference numbers", "manager details", "web or email details"]);
    expect(forms.formTextHeldInPack).toBe(false);
    expect(forms.appliedFrom).toMatchObject({ date: null, status: "NOT_CONFIRMED" });
    expect(vic.FEE_NOTICES.disputeMeetingConflict).toMatchObject({ formTextDays: 14, modelRuleDays: 28, status: "NOT_CONFIRMED" });
    expect(vic.FEE_NOTICES.feeNotice.payWithinDaysAfterNotice).toBe(28);
    expect(vic.MANAGER.contractMustBeInApprovedForm).toBe(true);
  });

  it("is the rules recorded for review", () => {
    expect(vic).toMatchSnapshot();
  });
});

describe("Western Australia pack (pending)", () => {
  const pack = PENDING_RULE_PACKS.WA;
  const wa = pack.rules;

  it("is a draft, not yet signed off, with only the payment order, the notice timing, the 2-lot quorum, the voting period, council notice not checked and debt recovery decided", () => {
    expect(pack.version).toBe("2026.10.11");
    expect(pack.status).toBe("DRAFT");
    expect(pack.reviewedOn).toBeNull();
    expect(wa.DECISIONS).toHaveLength(6);
    for (const d of wa.DECISIONS.slice(0, 2)) expect(d).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-28" });
    expect(wa.DECISIONS[1].decision).toContain("NOTICE_RULES");
    // Stage 2, PR 8a-ii: the 2-lot quorum (29 Oct 2026).
    expect(wa.DECISIONS[2]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    expect(wa.DECISIONS[2].decision).toContain("quorumNeedsEveryLot");
    // Stage 2, PR 8b-ii: the voting period (29 Oct 2026), kept in FOR_REVIEW for legal confirmation.
    expect(wa.DECISIONS[3]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    for (const d of ["D1", "D2", "D8", "D9", "D10", "D11"]) expect(wa.DECISIONS[3].decision).toContain(`(${d})`);
    for (const w of ["VOTING_PERIOD", "settleAfterGraceDays", "VOTES_AT_CLOSE", "quorumNeedsEveryLot"]) expect(wa.DECISIONS[3].decision).toContain(w);
    expect(wa.MEETING_RULES.pendingResolutions?.VOTING_PERIOD?.settleAfterGraceDays).toBe(7);
    const point = wa.FOR_REVIEW.find((p) => p.startsWith("Voting period (stage 2, PR 8b-ii"));
    for (const d of ["D1", "D2", "D8", "D9"]) expect(point).toContain(`(${d}:`);
    expect(point).toContain("7 days of grace");
    // The point it replaces, that the meeting cannot record these resolutions, is gone.
    expect(wa.FOR_REVIEW.some((p) => p.includes("Until the voting period is tracked"))).toBe(false);
    // Stage 2, PR 8b-iv: the minutes name an open item and give its later effect, so "Not yet done" is gone.
    expect(point).toContain("Voting open");
    expect(point).not.toContain("Not yet done");
    // Stage 2, PR 8b-iii: council notice not checked (29 Oct 2026, decision D12), kept in FOR_REVIEW.
    expect(wa.DECISIONS[4]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    expect(wa.DECISIONS[4].decision).toContain("(D12)");
    expect(wa.FOR_REVIEW.some((p) => p.startsWith("Council meeting notice (stage 2, PR 8b-iii") && p.includes("D12"))).toBe(true);
    // Stage 2, PR 9a: debt recovery (29 Oct 2026, the PR 9 decisions for WA and the shared engine), kept in FOR_REVIEW.
    expect(wa.DECISIONS[5]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-29" });
    for (const d of ["D1", "D4", "D9", "D10", "D11", "D12", "D13"]) expect(wa.DECISIONS[5].decision).toContain(`(${d})`);
    expect(wa.FOR_REVIEW.some((p) => p.startsWith("Debt recovery (stage 2, PR 9a") && ["D9", "D10", "D11", "D13"].every((d) => p.includes(d)))).toBe(true);
    // Who decides is still not confirmed in law: the accepted resolutions are a StrataVerze reading.
    expect(wa.NOT_CONFIRMED.some((p) => p.startsWith("Who decides, inside the strata company, to start debt recovery proceedings"))).toBe(true);
    expect(wa.NOT_CONFIRMED.length).toBeGreaterThan(0);
    expect(wa.FOR_REVIEW.length).toBeGreaterThan(0);
  });

  it("holds unit entitlement on each lot, the only schedule", () => {
    expect(wa.ENTITLEMENT_SCHEDULES.filter((s) => s.onLot).map((s) => s.key)).toEqual(["UNIT_ENTITLEMENT"]);
  });

  it("keeps the reserve fund in the ledger's capital works fund, required only for a designated strata company", () => {
    const reserve = wa.FUND_CATALOGUE.find((f) => f.key === "RESERVE");
    expect(reserve?.ledgerFund).toBe("CAPITAL_WORKS");
    expect(reserve?.required).toBe(false);
  });

  it("requires the reserve fund exactly when the strata company is designated, via requiredWhen", () => {
    const reserve = wa.FUND_CATALOGUE.find((f) => f.key === "RESERVE");
    expect(reserve?.requiredWhen?.rules.map((r) => [r.need, r.when])).toEqual([
      ["REQUIRED", { selector: "designatedStrataCompany", in: ["DESIGNATED"] }],
      ["OPTIONAL", { selector: "designatedStrataCompany", in: ["NOT_DESIGNATED"] }],
    ]);
  });

  it("gives no fund to every building, and sets the administrative fund by size class and by-laws, as the first form did", () => {
    expect(wa.FUND_CATALOGUE.every((f) => f.required === false)).toBe(true);
    const admin = wa.FUND_CATALOGUE.find((f) => f.key === "ADMINISTRATIVE");
    // The first form (PR #107): TWO_LOT ONLY_IF_BY_LAWS_REQUIRE, THREE_TO_FIVE_LOT UNLESS_BY_LAWS_EXEMPT, SIX_OR_MORE_LOT ALWAYS.
    // Each size and by-laws answer, as the rules now decide it (first rule that holds).
    const size = (c: SelectorCondition, key: string): string[] | null => ("selector" in c && c.selector === key ? [...c.in] : "all" in c ? c.all.map((p) => size(p, key)).find(Boolean) ?? null : null);
    const decide = (s: string, b: string) => admin?.requiredWhen?.rules.find((r) => (size(r.when, "schemeSize") ?? []).includes(s) && (size(r.when, "administrativeFundByLaws") ?? [b]).includes(b))?.need;
    expect(["NEITHER", "REQUIRE", "EXEMPT", "SAT_REQUIRED"].map((b) => decide("SIX_OR_MORE_LOT", b))).toEqual(["REQUIRED", "REQUIRED", "REQUIRED", "REQUIRED"]);
    expect(["NEITHER", "REQUIRE", "EXEMPT", "SAT_REQUIRED"].map((b) => decide("THREE_TO_FIVE_LOT", b))).toEqual(["REQUIRED", "REQUIRED", "OPTIONAL", "REQUIRED"]);
    expect(["NEITHER", "REQUIRE", "EXEMPT", "SAT_REQUIRED"].map((b) => decide("TWO_LOT", b))).toEqual(["NOT_ALLOWED", "REQUIRED", "NOT_ALLOWED", "REQUIRED"]);
    expect(wa.ADMINISTRATIVE_FUND_BY_LAWS.options.map((o) => o.value)).toEqual(["NEITHER", "REQUIRE", "EXEMPT", "SAT_REQUIRED"]);
    expect(wa.ADMINISTRATIVE_FUND_BY_LAWS.flagMissing).toBe("FUND_CONDITIONS");
    // An SAT order: confirmed for 3 to 5 lots, not confirmed for 2 lots (s 140(3) against s 140(1)(b)).
    const sat = admin?.requiredWhen?.rules.filter((r) => JSON.stringify(r.when).includes("SAT_REQUIRED")).map((r) => [size(r.when, "schemeSize"), r.status]);
    expect(sat).toEqual([
      [["THREE_TO_FIVE_LOT"], "CONFIRMED"],
      [["TWO_LOT"], "NOT_CONFIRMED"],
    ]);
  });

  it("designates a strata company at 10 or more lots or a replacement cost strictly more than $5m", () => {
    expect(wa.DESIGNATED_STRATA_COMPANY.minLots).toBe(10);
    expect(wa.DESIGNATED_STRATA_COMPANY.replacementCostMoreThanCents).toBe(500_000_000);
    expect(wa.DESIGNATED_STRATA_COMPANY.replacementCostIsStrictlyMoreThan).toBe(true);
  });

  it("charges simple interest at 11% a year on unpaid contributions", () => {
    expect(wa.INTEREST_ON_UNPAID_CONTRIBUTIONS.annualRatePercent).toBe(11);
    expect(wa.INTEREST_ON_UNPAID_CONTRIBUTIONS.simple).toBe(true);
  });

  it("applies the 28-day voting period to unanimous, without dissent and special resolutions, not ordinary", () => {
    expect(wa.RESOLUTIONS.votingPeriodAppliesTo).not.toContain("ORDINARY");
    expect([...wa.RESOLUTIONS.votingPeriodAppliesTo].sort()).toEqual(["SPECIAL", "UNANIMOUS", "WITHOUT_DISSENT"]);
  });

  it("has no against test for a 3 to 5-lot special resolution", () => {
    expect(wa.SIZE_CLASSES.THREE_TO_FIVE_LOT.specialResolutionAgainstTest).toBe(false);
    expect(wa.SIZE_CLASSES.THREE_TO_FIVE_LOT.specialResolutionMinLotsFor).toEqual({ 3: 2, 4: 3, 5: 4 });
  });

  it("sends levy debts to a court, not SAT", () => {
    expect(wa.DEBT_RECOVERY.forumKind).toBe("COURT");
    expect(wa.DEBT_RECOVERY.satMayDecide).toBe(false);
    expect(wa.DISPUTES.excludesLevyDebts).toBe(true);
    // Stage 2, PR 9a: the forum the recovery gates read (D13).
    expect(wa.DEBT_RECOVERY.forum.options.map((o) => [o.key, o.status])).toEqual([["COURT", "CONFIRMED"]]);
    expect(wa.DEBT_RECOVERY.forum.excluded.map((x) => x.key)).toEqual(["SAT"]);
    expect(wa.DEBT_RECOVERY.forumWords).toBe("a court of competent jurisdiction");
  });

  it("switches every NSW workflow off except the debt recovery steps (stage 2, PR 9a)", () => {
    expect(Object.keys(wa.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.entries(wa.FEATURES).filter(([, on]) => on).map(([k]) => k)).toEqual(["debtRecoverySteps"]);
  });

  it("supports strata schemes only", () => {
    expect(wa.SCHEME_TYPE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["STRATA"]);
    expect(wa.TENURE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["FREEHOLD"]);
  });

  it("is the rules recorded for review", () => {
    expect(wa).toMatchSnapshot();
  });
});

describe("Tasmanian pack (pending, stage 1)", () => {
  const pack = PENDING_RULE_PACKS.TAS;
  const tas = pack.rules;
  const STATUSES_WITH_VALUE = ["CONFIRMED", "STRATAVERZE"];

  it("is a draft for review, not signed off, with no decisions", () => {
    expect(pack.code).toBe("AU-TAS");
    expect(pack.state).toBe("TAS");
    expect(pack.name).toBe("Tasmania");
    expect(pack.version).toBe("2026.10.1");
    expect(pack.status).toBe("DRAFT");
    expect(pack.reviewedOn).toBeNull();
    expect(pack.reviewer).toBe("Matthew Wrigley");
    expect(tas.DECISIONS).toHaveLength(0);
    expect(tas.NOT_CONFIRMED.length).toBeGreaterThan(0);
    expect(tas.FOR_REVIEW.length).toBeGreaterThan(0);
    // Every product choice is a proposal, not a decision.
    expect(tas.FOR_REVIEW.filter((p) => p.includes("proposed decision")).length).toBeGreaterThan(0);
    expect(packs.map(([code]) => code)).toContain("AU-TAS");
  });

  it("switches every workflow off, with the NSW keys", () => {
    expect(Object.keys(tas.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.values(tas.FEATURES).every((on) => on === false)).toBe(true);
  });

  it("holds no shared shape the engine would run beyond the fail-closed notice and late charge rules", () => {
    for (const key of ["MEETING_RULES", "PAYMENT_ALLOCATION_ORDER", "DEBT_RECOVERY", "DEBT_RECOVERY_STEPS", "DATED_RULES", "BUILDING_SELECTORS", "CERTIFICATE", "INSPECTIONS", "DOCUMENT_RETENTION", "WORKS_QUOTES"]) {
      expect(key in tas, key).toBe(false);
    }
    expect(tas.PAYMENT_ALLOCATION.statutoryOrder).toBe("NO_STATUTORY_RULE");
  });

  it("requires the single fund and holds its capital expenditure part as optional", () => {
    const fund = tas.FUND_CATALOGUE.find((f) => f.ledgerFund === "ADMINISTRATIVE");
    const capital = tas.FUND_CATALOGUE.find((f) => f.ledgerFund === "CAPITAL_WORKS");
    expect(fund).toMatchObject({ key: "FUND", required: true, status: "CONFIRMED" });
    expect(capital).toMatchObject({ key: "CAPITAL_EXPENDITURE", required: false, status: "CONFIRMED" });
    expect(tas.FUND_CATALOGUE.every((f) => f.requiredWhen === undefined)).toBe(true);
    expect(tas.FUND_NAMING.status).toBe("STRATAVERZE");
  });

  it("holds the general unit entitlement on each lot, the only schedule", () => {
    expect(tas.ENTITLEMENT_SCHEDULES.map((s) => [s.key, s.onLot])).toEqual([["UNIT_ENTITLEMENT", true]]);
    expect(tas.UNIT_ENTITLEMENT_RULES.specialEntitlementsSupported).toMatchObject({ value: false, status: "STRATAVERZE" });
  });

  it("gives every shared term, in the Act's words", () => {
    const shared = Object.keys(RULE_PACKS.NSW.rules.TERMINOLOGY).filter((k) => k !== "source");
    for (const k of shared) expect(tas.TERMINOLOGY, k).toHaveProperty(k);
    const t = tas.TERMINOLOGY;
    expect([t.ownersCorporation, t.committee, t.levy, t.levies, t.lateCharge, t.jurisdictionShort]).toEqual(["body corporate", "committee of management", "contribution", "contributions", "interest", "Tas"]);
    expect(t.bodyCorporateNameStatus).toBe("GUIDANCE");
  });

  it("checks every notice value: none has a value, so every notice is refused", () => {
    const rule = tas.NOTICE_RULES;
    const c = rule.checked!;
    const values = [c.minimumNoticeDays, c.issueDaysBeforeDue, c.dueDateMayMove, ...(c.maximumNoticeDays ? [c.maximumNoticeDays] : []), ...Object.values(c.noticeMode)];
    for (const v of values) {
      if (v!.value != null) expect(STATUSES_WITH_VALUE).toContain(v!.status);
      else expect(v!.note!.length).toBeGreaterThan(10);
      expect(v!.source.length).toBeGreaterThan(5);
    }
    expect(values.every((v) => v!.value == null && v!.status === "NOT_CONFIRMED")).toBe(true);
    expect(c.maximumNoticeDays).toBeNull();
    expect(c.form).toBeNull();
    expect(c.requiredContents).toEqual([]);
    expect(rule.urgentNoticeDays).toBeNull();
    expect(rule.hardship).toBeNull();
    expect(rule.issueDaysBeforeDue).toBeGreaterThanOrEqual(rule.minimumNoticeDays);
    for (const ledgerFund of ["ADMINISTRATIVE", "CAPITAL_WORKS"] as const) {
      const points = noticeRuleProblems(rule, { ledgerFund }).map((p) => p.point);
      expect(points, ledgerFund).toEqual(["minimumNoticeDays", "issueDaysBeforeDue", "dueDateMayMove", "noticeMode"]);
    }
  });

  it("checks every late charge value: no statutory rate, no interest by default, and nothing that can be charged", () => {
    const lc = tas.LATE_CHARGE;
    expect(lc.method).toBe("ANNUAL_RATE");
    expect(lc.defaultMode).toBe("NONE");
    expect([lc.annualRatePercent, lc.maxMonthlyRatePercent, lc.graceMonths]).toEqual([null, null, 0]);
    const a = lc.annual!;
    expect(a.statutoryRatePercent).toBeNull();
    expect(a.waiver).toBeNull();
    const values = [a.resolvedRate!.resolution, a.resolvedRate!.minPercent, a.resolvedRate!.maxPercent, a.accrual.from, a.accrual.graceMonths, a.accrual.simple, a.accrual.daysInYear];
    for (const v of values) {
      expect(v.value).toBeNull();
      expect(v.status).toBe("NOT_CONFIRMED");
      expect(v.note!.length).toBeGreaterThan(10);
      expect(v.source.length).toBeGreaterThan(5);
    }
    expect(tas.INTEREST_ON_OVERDUE_CONTRIBUTIONS.statutoryRatePercent).toBeNull();
  });

  it("refuses every notice through the notice rule check, so the 0-day numbers outside `checked` are never relied on", () => {
    const rule = tas.NOTICE_RULES;
    // 0 because the Act gives no number: the most permissive values, never used.
    expect([rule.minimumNoticeDays, rule.issueDaysBeforeDue]).toEqual([0, 0]);
    for (const ledgerFund of ["ADMINISTRATIVE", "CAPITAL_WORKS"] as const) {
      const problems = noticeRuleProblems(rule, { ledgerFund });
      expect(problems.length, ledgerFund).toBeGreaterThan(0);
      for (const p of problems) expect(p.code).toBe("NOTICE_RULES_NOT_CONFIRMED");
      expect(problems.some((p) => p.message.includes("No notice can be issued")), ledgerFund).toBe(true);
    }
    // Even a notice that states everything is refused.
    const all = { EVERY_LOT_CONTRIBUTION: true, FUND_TOTAL: true, PROPORTION_AND_METHOD: true, INSTALMENT_DATES: true, EARLY_PAYMENT_DISCOUNT: true, LATE_CHARGE_STATEMENT: true, PAY_WITHIN_DAYS_STATEMENT: true, DISPUTE_PROCESS: true };
    expect(noticeRuleProblems(rule, { ledgerFund: "ADMINISTRATIVE", states: all }).length).toBeGreaterThan(0);
  });

  it("charges nothing through the late charge engine, and refuses a resolved rate and a waiver", () => {
    const rule = tas.LATE_CHARGE;
    const input = { levyCents: 100_000, dueDate: "2026-07-01", payments: [], asAt: "2026-10-01" };
    const resolved = lateCharge(input, rule, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 10 });
    expect(resolved.interestCents).toBe(0);
    expect(resolved.reason).toBe("RULE_NOT_CONFIRMED");
    expect(lateCharge(input, rule, { mode: "NONE" }).interestCents).toBe(0);
    for (const mode of [...rule.modes, "STATUTORY", "NO_INTEREST", "RESOLVED_RATE"]) {
      expect(lateChargeApplies(rule, { mode, annualRatePercent: 10, monthlyRatePercent: 1 }), mode).toBe(false);
    }
    const terms = { lateCharge: tas.TERMINOLOGY.lateCharge, ownersCorporation: tas.TERMINOLOGY.ownersCorporation };
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 10, resolutionMeetingId: "m", resolutionMotionId: "x" }, rule, terms)).toMatch(/not confirmed/);
    expect(lateChargeWaiverProblem({ kind: "WHOLE", reasons: "r", resolutionMeetingId: "m", resolutionMotionId: "x" }, rule, terms)).toMatch(/give no waiver/);
  });

  it("holds the values read in the Act", () => {
    expect(tas.MEETINGS.noticeDays).toBe(7);
    expect(tas.MEETINGS.agmWithinMonthsOfLastAgm).toBe(15);
    expect(tas.MEETINGS.firstAgm).toMatchObject({ withinMonthsAfterRegistration: 3, orOnSaleOfFractionOfLots: 1 / 2, whicheverEarlier: true });
    expect(tas.MEETINGS.specialGeneralMeeting.mustOnRequisitionOfNotLessThanFractionOfMembers).toBe(1 / 3);
    expect(tas.MEETINGS.quorum).toMatchObject({ defaultByLaw: true, status: "CONFIRMED" });
    expect(tas.RESOLUTIONS.UNANIMOUS.laterWrittenVoteWithinDaysAfterMeeting).toBe(28);
    expect(tas.RESOLUTIONS.specialResolutionInAct).toBe(false);
    expect(tas.COMMITTEE).toMatchObject({ required: false, minMembers: 3, appointedBy: "ORDINARY" });
    expect(tas.INSURANCE.publicRiskMinimumCents).toBe(1_000_000_000);
    expect(tas.LEVY_RECOVERY.forum.applicationFeeCents).toBe(2_500);
    expect(tas.LEVY_RECOVERY.appeal).toMatchObject({ withinDaysAfterOrder: 30, feeCents: 25_200 });
    expect(tas.LEVY_RECOVERY.courtDebtClaim.status).toBe("NOT_CONFIRMED");
    expect(tas.LEVY_RECOVERY.authority.status).toBe("NOT_CONFIRMED");
    expect(tas.SECTION_83_CERTIFICATE.items).toHaveLength(7);
    expect(tas.AUDIT_AND_ACCOUNTS).toMatchObject({ auditRequired: false, financialYearInAct: null });
    expect(tas.POSTCODES.ranges).toBeNull();
    expect(tas.PENDING_REVIEW.enactedNotInForce).toEqual([]);
    expect(tas.BY_LAWS).toMatchObject({ exclusiveUseLapsesAfterYearsUnlessConfirmed: 5, exclusiveUsePermanentEffectExempt: true });
    expect(tas.NOT_CONFIRMED.some((p) => p.startsWith("Any deadline for giving a s 83(5) certificate"))).toBe(true);
    expect(tas.NOT_CONFIRMED.some((p) => p.startsWith("Records inspection beyond committee minutes"))).toBe(true);
  });

  it("supports a strata scheme with one body corporate only, as a proposal", () => {
    expect(tas.SCHEME_TYPE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["STRATA_SINGLE_BODY_CORPORATE"]);
  });

  it("is the rules recorded for review", () => {
    expect(tas).toMatchSnapshot();
  });
});

describe("Northern Territory pack (pending)", () => {
  const pack = PENDING_RULE_PACKS.NT;
  const nt = pack.rules;

  it("is a draft for review, not signed off, with no decisions yet", () => {
    expect(pack.code).toBe("AU-NT");
    expect(pack.state).toBe("NT");
    expect(pack.version).toBe("2026.10.1");
    expect(pack.status).toBe("DRAFT");
    expect(pack.reviewedOn).toBeNull();
    expect(pack.reviewer).toBe("Matthew Wrigley");
    expect(nt.DECISIONS).toEqual([]);
    expect(nt.NOT_CONFIRMED.length).toBeGreaterThan(0);
    expect(nt.FOR_REVIEW.length).toBeGreaterThan(0);
    // Every product choice the draft had to make is a proposal in FOR_REVIEW, not a decision.
    expect(nt.FOR_REVIEW.filter((p) => p.startsWith("Proposed decision")).length).toBeGreaterThanOrEqual(3);
  });

  it("supports unit title schemes under the 2009 Act on management modules 1 and 2 only", () => {
    expect(nt.SCHEME_ACT.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["UTSA"]);
    expect(nt.MANAGEMENT_MODULE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["MODULE_2", "MODULE_1"]);
    expect(nt.SCHEME_CLASSES.standardFromUnitOwners).toBe(4);
    expect(nt.SCHEME_CLASSES.counts).toBe("unit owners");
  });

  it("switches every NSW workflow off", () => {
    expect(Object.keys(nt.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.values(nt.FEATURES).every((on) => on === false)).toBe(true);
  });

  it("gives every shared term", () => {
    const shared = Object.keys(RULE_PACKS.NSW.rules.TERMINOLOGY).filter((k) => k !== "source");
    for (const k of shared) expect(nt.TERMINOLOGY, k).toHaveProperty(k);
    expect(nt.TERMINOLOGY.jurisdictionShort).toBe("NT");
    expect(nt.TERMINOLOGY.tribunal).toBe("NTCAT");
    expect(nt.TERMINOLOGY.bodyCorporateNameStatus).toBe("STRATAVERZE");
  });

  it("requires no fund: both ledger funds are StrataVerze choices, neither required", () => {
    for (const f of nt.FUND_CATALOGUE) {
      expect(f.required, f.key).toBe(false);
      expect(f.status, f.key).toBe("STRATAVERZE");
      expect(f.requiredWhen, f.key).toBeUndefined();
    }
  });

  it("holds contribution entitlement on each unit and interest entitlement separately", () => {
    expect(nt.ENTITLEMENT_SCHEDULES.map((s) => [s.key, s.onLot, s.decides])).toEqual([
      ["CONTRIBUTION", true, ["CONTRIBUTIONS", "SPECIAL_RESOLUTION"]],
      ["INTEREST", false, ["COMMON_PROPERTY_SHARE"]],
    ]);
  });

  it("holds the s 79 resolution tests and the debtor rule", () => {
    expect(nt.RESOLUTIONS.SPECIAL.forAtLeastFractionOfVotesCast).toBe(2 / 3);
    expect(nt.RESOLUTIONS.SPECIAL.againstNotMoreThanFractionOfAllContributionEntitlements).toBe(0.25);
    expect(nt.RESOLUTIONS.MAJORITY.moreThanFractionOfAllUnits).toBe(0.5);
    expect(nt.RESOLUTIONS.ORDINARY.modulesApplyEntitlementCount).toBe(false);
    // s 79(10): only a motion the Act requires to be passed that way, not every motion put that way.
    expect(nt.DEBT_RECOVERY.debtorMayVoteOnlyOnMotionsRequiredByActToBe).toEqual(["UNANIMOUS", "WITHOUT_DISSENT"]);
    expect(nt.DEBT_RECOVERY.debtorExceptionIncludesModulesStatus).toBe("NOT_CONFIRMED");
    expect("debtorMayVoteOnlyOn" in nt.DEBT_RECOVERY).toBe(false);
    expect(nt.NOT_CONFIRMED.some((p) => p.includes("\"required by this Act\""))).toBe(true);
  });

  it("counts meeting notice in working days: 14, or 21 for without dissent, unanimous or termination resolutions", () => {
    expect(nt.MEETINGS.noticeCountsWorkingDays).toBe(true);
    expect(nt.MEETINGS.noticeWorkingDays).toEqual({ general: 14, withoutDissentUnanimousOrTermination: 21, smallScheme: 14 });
    expect(nt.MEETINGS.quorumPercentOfInterestEntitlements).toBe(50);
    expect(nt.MEETINGS.agmWithinMonthsOfLast).toBe(15);
    expect(nt.RECORDS.accessWithinWorkingDays).toBe(10);
    expect(nt.RECORDS.accessFeeCents).toBe(3_000);
    expect(nt.RECORDS.retentionYears).toBe(7);
  });

  it("charges no interest: optional in law, and every value the engine needs is not confirmed", () => {
    const lc = nt.LATE_CHARGE;
    expect(lc.defaultMode).toBe("NONE");
    // STATUTORY is left out until the Supreme Court Act s 85 rate is confirmed, so it cannot be saved.
    expect(lc.modes).toEqual(["NONE", "RESOLVED_ANNUAL_RATE"]);
    expect(lc.resolutionRequiredFor).toEqual(["RESOLVED_ANNUAL_RATE"]);
    expect(lc.annualRatePercent).toBeNull();
    expect(lc.maxMonthlyRatePercent).toBeNull();
    const a = lc.annual!;
    const values = [a.statutoryRatePercent!, a.resolvedRate!.resolution, a.resolvedRate!.minPercent, a.resolvedRate!.maxPercent, a.accrual.from, a.accrual.graceMonths, a.accrual.simple, a.accrual.daysInYear, a.waiver!.decidedBy];
    for (const v of values) {
      expect(v.value).toBeNull();
      expect(v.status).toBe("NOT_CONFIRMED");
      expect(v.note!.length).toBeGreaterThan(10);
    }
    expect(nt.INTEREST_ON_LATE_PAYMENT.mayCharge).toBe(true);
    expect(nt.INTEREST_ON_LATE_PAYMENT.section85RatePercent).toBeNull();
    expect(nt.FOR_REVIEW.some((p) => p.includes("left out of LATE_CHARGE.modes"))).toBe(true);
  });

  it("is refused by the engine: no rate, no resolved rate, no waiver, no forum, no meeting rules, no notice", () => {
    const lc = nt.LATE_CHARGE;
    const t = { lateCharge: nt.TERMINOLOGY.lateCharge, ownersCorporation: nt.TERMINOLOGY.ownersCorporation };
    // STATUTORY is not one of the pack's modes, so a stored STATUTORY is read as the default (NONE): no rate, nothing charged.
    expect(effectiveLateChargeMode(lc, "STATUTORY")).toBe("NONE");
    expect(annualLateChargeRate(lc, { mode: "STATUTORY" })).toBeNull();
    // The resolved rate has no rate, and says what is missing.
    expect(annualLateChargeRate(lc, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 5 })).toBeNull();
    expect(annualLateChargeMissing(lc, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 5 })).toEqual(
      expect.arrayContaining(["resolvedRate.resolution", "resolvedRate.minPercent", "resolvedRate.maxPercent", "accrual.from", "accrual.graceMonths", "accrual.simple", "accrual.daysInYear"]),
    );
    expect(annualRateProblem(lc.annual, 5, t)).toMatch(/not confirmed/);
    const resolution = { resolutionMeetingId: "m", resolutionMotionId: "x" };
    expect(lateChargeWaiverProblem({ kind: "WHOLE", reasons: "Hardship", ...resolution }, lc, t)).toMatch(/not confirmed/);
    expect(nt.DEBT_RECOVERY.forum).toBeNull();
    expect("MEETING_RULES" in nt).toBe(false);
    // Every notice is refused while the timing values have no value.
    for (const ledgerFund of ["ADMINISTRATIVE", "CAPITAL_WORKS"] as const) {
      const points = noticeRuleProblems(nt.NOTICE_RULES, { ledgerFund }).map((p) => p.point);
      expect(points, ledgerFund).toEqual(["minimumNoticeDays", "issueDaysBeforeDue", "dueDateMayMove", "noticeMode"]);
    }
  });

  it("holds the notice timing with no value, the proposal kept in FOR_REVIEW only", () => {
    const c = nt.NOTICE_RULES.checked!;
    for (const v of [c.minimumNoticeDays, c.issueDaysBeforeDue, c.dueDateMayMove, ...Object.values(c.noticeMode)]) {
      expect(v!.value).toBeNull();
      expect(v!.status).toBe("NOT_CONFIRMED");
      expect(v!.note!.length).toBeGreaterThan(10);
    }
    expect(c.maximumNoticeDays).toBeNull();
    expect(nt.NOTICE_RULES.urgentNoticeDays).toBeNull();
    expect(nt.NOTICE_RULES.hardship).toBeNull();
    const proposal = nt.FOR_REVIEW.find((p) => p.startsWith("Proposed decision (notice timing)"));
    for (const words of ["14 days", "35 days", "never moved", "one notice per instalment"]) expect(proposal, words).toContain(words);
    expect(nt.FOR_REVIEW.some((p) => p.startsWith("Proposed decision (payment allocation order)"))).toBe(true);
    expect("PAYMENT_ALLOCATION_ORDER" in nt).toBe(false);
  });

  it("holds STRATAVERZE status only on names and labels, never on a rule the engine applies", () => {
    // Every STRATAVERZE value in the pack, by where it is: the ledger fund names, the name template and the time zone.
    const found: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
      else if (v === "STRATAVERZE") found.push(path);
    };
    walk(nt, "");
    expect(found.sort()).toEqual(["FUND_CATALOGUE[0].status", "FUND_CATALOGUE[1].status", "TERMINOLOGY.bodyCorporateNameStatus", "TIME_ZONE.status"]);
    expect(nt.FOR_REVIEW.some((p) => p.includes("\"may\" specify a body corporate name"))).toBe(true);
  });

  it("uses the Darwin time zone, with no daylight saving", () => {
    expect(nt.TIME_ZONE).toMatchObject({ zone: "Australia/Darwin", utcOffset: "+09:30", daylightSaving: false });
  });

  it("is the rules recorded for review", () => {
    expect(nt).toMatchSnapshot();
  });
});

describe("the checked notice rules of the pending packs (stage 2, PR 6a)", () => {
  // The Northern Territory holds no timing value yet (every notice refused), so its own block checks it.
  const pending = [PENDING_RULE_PACKS.ACT, PENDING_RULE_PACKS.VIC, PENDING_RULE_PACKS.WA] as const;
  const STATUSES_WITH_VALUE = ["CONFIRMED", "STRATAVERZE"];

  it.each(pending.map((p) => [p.code, p.rules.NOTICE_RULES] as const))("%s: every value is checked, and the checked values fit together", (_code, rule) => {
    const c = rule.checked!;
    expect(c).toBeDefined();
    const values = [c.minimumNoticeDays, c.issueDaysBeforeDue, c.dueDateMayMove, ...(c.maximumNoticeDays ? [c.maximumNoticeDays] : []), ...Object.values(c.noticeMode)];
    for (const v of values) {
      // A value is held only where it is confirmed or a StrataVerze choice; anything else has none and says why.
      if (v!.value != null) expect(STATUSES_WITH_VALUE).toContain(v!.status);
      else expect(v!.note!.length).toBeGreaterThan(10);
      expect(v!.source.length).toBeGreaterThan(5);
    }
    const min = c.minimumNoticeDays.value!;
    const lead = c.issueDaysBeforeDue.value!;
    const max = c.maximumNoticeDays?.value ?? null;
    expect(min).toBeLessThanOrEqual(lead);
    if (max != null) expect(lead).toBeLessThanOrEqual(max);
    // The numbers outside `checked` are the safest: the floor, and a lead never beyond the most notice.
    expect(rule.minimumNoticeDays).toBe(min);
    if (max != null) expect(rule.issueDaysBeforeDue).toBeLessThanOrEqual(max);
    expect(rule.issueDaysBeforeDue).toBeGreaterThanOrEqual(rule.minimumNoticeDays);
    expect(rule.urgentNoticeDays).toBeNull();
    expect(rule.hardship).toBeNull();
    for (const r of c.requiredContents) expect(STATUSES).toContain(r.status);
    // No invariant problem in any pack.
    expect(noticeRuleProblems(rule, { ledgerFund: "ADMINISTRATIVE" }).filter((p) => p.point === "invariants")).toEqual([]);
  });

  it("records each pack's timing as Matthew Wrigley decided it on 28 Oct 2026", () => {
    const timing = (code: "ACT" | "VIC" | "WA") => noticeTimingFor(PENDING_RULE_PACKS[code].rules.NOTICE_RULES);
    expect(timing("ACT")).toMatchObject({ minimumDays: 14, leadDays: 28, maximumDays: 28, dueDateMayMove: true, minimumIsStatutory: false });
    // The Victorian maximum is not confirmed, so the lead is never beyond the pack's safest 28 days (the decided 35 is kept in `checked`).
    expect(timing("VIC")).toMatchObject({ minimumDays: 28, leadDays: 28, maximumDays: null, dueDateMayMove: true, minimumIsStatutory: true });
    expect(PENDING_RULE_PACKS.VIC.rules.NOTICE_RULES.checked!.issueDaysBeforeDue.value).toBe(35);
    expect(timing("WA")).toMatchObject({ minimumDays: 14, leadDays: 35, maximumDays: null, dueDateMayMove: false, minimumIsStatutory: false });
    const act = PENDING_RULE_PACKS.ACT.rules.NOTICE_RULES.checked!;
    expect([act.minimumNoticeDays.status, act.issueDaysBeforeDue.status, act.maximumNoticeDays?.status, act.dueDateMayMove.status]).toEqual(["STRATAVERZE", "STRATAVERZE", "CONFIRMED", "STRATAVERZE"]);
    const vic = PENDING_RULE_PACKS.VIC.rules.NOTICE_RULES.checked!;
    expect([vic.minimumNoticeDays.status, vic.issueDaysBeforeDue.status, vic.maximumNoticeDays?.status]).toEqual(["CONFIRMED", "STRATAVERZE", "NOT_CONFIRMED"]);
    expect(vic.minimumNoticeDays.note).toContain("StrataVerze's reading of s 31(2)(a)");
    const wa = PENDING_RULE_PACKS.WA.rules.NOTICE_RULES.checked!;
    expect(wa.maximumNoticeDays).toBeNull();
    expect([wa.minimumNoticeDays.status, wa.issueDaysBeforeDue.status, wa.dueDateMayMove.status]).toEqual(["STRATAVERZE", "STRATAVERZE", "STRATAVERZE"]);
    for (const code of ["ACT", "VIC", "WA"] as const) {
      const decided = PENDING_RULE_PACKS[code].rules.DECISIONS.filter((d) => d.decision.includes("NOTICE_RULES"));
      expect(decided, code).toHaveLength(1);
      expect(decided[0]).toMatchObject({ decidedBy: "Matthew Wrigley", decidedOn: "2026-10-28" });
    }
    expect(PENDING_RULE_PACKS.VIC.rules.DEFERRED_SHARED_SHAPES).toEqual([]);
  });

  it("refuses every Victorian and ACT notice today, each with its reason, and gives WA no notice rule problem", () => {
    // What a notice states today: no annual-rate late charge, none of the other contents.
    const today = { states: { LATE_CHARGE_STATEMENT: false } };
    const points = (code: "ACT" | "VIC" | "WA", ledgerFund: "ADMINISTRATIVE" | "CAPITAL_WORKS") =>
      noticeRuleProblems(PENDING_RULE_PACKS[code].rules.NOTICE_RULES, { ...today, ledgerFund }).map((p) => p.point);
    expect(points("VIC", "ADMINISTRATIVE")).toEqual([
      "maximumNoticeDays",
      "requiredContents.PAY_WITHIN_DAYS_STATEMENT",
      "requiredContents.LATE_CHARGE_STATEMENT",
      "requiredContents.DISPUTE_PROCESS",
      "form",
    ]);
    expect(points("ACT", "ADMINISTRATIVE")).toEqual([
      "requiredContents.EVERY_LOT_CONTRIBUTION",
      "requiredContents.FUND_TOTAL",
      "requiredContents.PROPORTION_AND_METHOD",
      "requiredContents.INSTALMENT_DATES",
      "requiredContents.EARLY_PAYMENT_DISCOUNT",
      "requiredContents.LATE_CHARGE_STATEMENT",
    ]);
    expect(points("ACT", "CAPITAL_WORKS")).toEqual([
      "noticeMode",
      "requiredContents.EVERY_LOT_CONTRIBUTION",
      "requiredContents.FUND_TOTAL",
      "requiredContents.PROPORTION_AND_METHOD",
      "requiredContents.INSTALMENT_DATES",
      "requiredContents.EARLY_PAYMENT_DISCOUNT",
      "requiredContents.LATE_CHARGE_STATEMENT",
    ]);
    expect(points("WA", "ADMINISTRATIVE")).toEqual([]);
    expect(points("WA", "CAPITAL_WORKS")).toEqual([]);
    // Even with everything stated, the ACT sinking fund and the Victorian form still refuse.
    const all = { EVERY_LOT_CONTRIBUTION: true, FUND_TOTAL: true, PROPORTION_AND_METHOD: true, INSTALMENT_DATES: true, EARLY_PAYMENT_DISCOUNT: true, LATE_CHARGE_STATEMENT: true, PAY_WITHIN_DAYS_STATEMENT: true, DISPUTE_PROCESS: true };
    expect(noticeRuleProblems(PENDING_RULE_PACKS.ACT.rules.NOTICE_RULES, { ledgerFund: "CAPITAL_WORKS", states: all }).map((p) => p.point)).toEqual(["noticeMode"]);
    expect(noticeRuleProblems(PENDING_RULE_PACKS.ACT.rules.NOTICE_RULES, { ledgerFund: "ADMINISTRATIVE", states: all })).toEqual([]);
    expect(noticeRuleProblems(PENDING_RULE_PACKS.VIC.rules.NOTICE_RULES, { ledgerFund: "ADMINISTRATIVE", states: all }).map((p) => p.point)).toEqual(["maximumNoticeDays", "form"]);
    // The reasons name what is missing, in the pack's words.
    const vic = noticeRuleProblems(PENDING_RULE_PACKS.VIC.rules.NOTICE_RULES, { ...today, ledgerFund: "ADMINISTRATIVE" }).map((p) => p.message);
    expect(vic.at(-1)).toContain('the approved form "Owners corporation fee notice"');
    expect(vic[0]).toContain("the most notice to pay the law allows");
    expect(vic[0]).toContain("No notice can be issued until a pack version records it.");
  });
});

describe("needRule (stage 2)", () => {
  it("gives the NSW rule", () => {
    expect(needRule(RULE_PACKS.NSW.rules, "STATUTORY_INTEREST")).toBe(STATUTORY_INTEREST);
  });

  it("refuses a pack without the rule, naming its jurisdiction", () => {
    const qld = QLD_RULE_PACK.rules;
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

  it("switches every NSW workflow off for Queensland, except its own debt recovery steps, inspections and certificate", () => {
    const features = QLD_RULE_PACK.rules.FEATURES;
    // Stage 2, step 9: Queensland's own certificate has a flag of its own, which the NSW pack leaves out.
    expect(Object.keys(features).sort()).toEqual([...Object.keys(RULE_PACKS.NSW.rules.FEATURES), "bodyCorporateCertificate"].sort());
    // Stage 2, step 8: the Queensland step sequence (draft) exists. Step 9: records inspections under the pack's
    // INSPECTIONS and the body corporate certificate. Live since the switch-on (28 Oct 2026).
    expect(Object.entries(features).filter(([, on]) => on).map(([k]) => k).sort()).toEqual(["bodyCorporateCertificate", "debtRecoverySteps", "recordsInspections"]);
    expect(QLD_RULE_PACK.rules.DEBT_RECOVERY_STEPS.length).toBeGreaterThan(0);
  });
});

describe("needRule with a rule set to null", () => {
  it("treats it as missing", () => {
    const rules = { ...RULE_PACKS.NSW.rules, STATUTORY_INTEREST: null } as unknown as StatutoryRules;
    expect(() => needRule(rules, "STATUTORY_INTEREST")).toThrow(RuleNotInPackError);
  });
});
