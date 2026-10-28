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
import { fundConditionSelectors } from "@/lib/jurisdiction/funds";
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

  it("is a draft for review, not signed off, with no decisions yet", () => {
    expect(pack.code).toBe("AU-ACT");
    expect(pack.state).toBe("ACT");
    expect(pack.version).toBe("2026.10.4");
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
    expect(pack.version).toBe("2026.10.5");
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

  it("has proposed decisions only, none decided", () => {
    expect(vic.DECISIONS.length).toBeGreaterThan(0);
    for (const d of vic.DECISIONS) {
      expect(d.decidedBy).toBeNull();
      expect(d.decidedOn).toBeNull();
    }
  });

  it("switches every NSW workflow off, with the same keys", () => {
    expect(Object.keys(vic.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.values(vic.FEATURES).every((on) => on === false)).toBe(true);
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

  it("is a draft, not yet signed off, with no decisions", () => {
    expect(pack.version).toBe("2026.10.3");
    expect(pack.status).toBe("DRAFT");
    expect(pack.reviewedOn).toBeNull();
    expect(wa.DECISIONS).toHaveLength(0);
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
  });

  it("switches every NSW workflow off", () => {
    expect(Object.keys(wa.FEATURES).sort()).toEqual(Object.keys(RULE_PACKS.NSW.rules.FEATURES).sort());
    expect(Object.values(wa.FEATURES).every((on) => on === false)).toBe(true);
  });

  it("supports strata schemes only", () => {
    expect(wa.SCHEME_TYPE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["STRATA"]);
    expect(wa.TENURE.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["FREEHOLD"]);
  });

  it("is the rules recorded for review", () => {
    expect(wa).toMatchSnapshot();
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

  it("switches every NSW workflow off for Queensland, except its own debt recovery steps, inspections and certificate", () => {
    const features = PENDING_RULE_PACKS.QLD.rules.FEATURES;
    // Stage 2, step 9: Queensland's own certificate has a flag of its own, which the NSW pack leaves out.
    expect(Object.keys(features).sort()).toEqual([...Object.keys(RULE_PACKS.NSW.rules.FEATURES), "bodyCorporateCertificate"].sort());
    // Stage 2, step 8: the Queensland step sequence (draft) exists. Step 9: records inspections under the pack's
    // INSPECTIONS and the body corporate certificate. The pack is still pending, so nothing is live.
    expect(Object.entries(features).filter(([, on]) => on).map(([k]) => k).sort()).toEqual(["bodyCorporateCertificate", "debtRecoverySteps", "recordsInspections"]);
    expect(PENDING_RULE_PACKS.QLD.rules.DEBT_RECOVERY_STEPS.length).toBeGreaterThan(0);
  });
});

describe("needRule with a rule set to null", () => {
  it("treats it as missing", () => {
    const rules = { ...RULE_PACKS.NSW.rules, STATUTORY_INTEREST: null } as unknown as StatutoryRules;
    expect(() => needRule(rules, "STATUTORY_INTEREST")).toThrow(RuleNotInPackError);
  });
});
