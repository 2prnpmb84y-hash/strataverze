/**
 * Statutory rules for Australian Capital Territory units plans: Unit Titles
 * (Management) Act 2011 (ACT) ("UTMA"), Unit Titles (Management) Regulation
 * 2011 (ACT) ("UTMR") and, where it affects management, the Unit Titles Act
 * 2001 (ACT) ("UTA").
 *
 * DRAFT, FOR STRATAVERZE TO REVIEW (27 Oct 2026). Not signed off and not
 * applied to any building: `rulePackFor` returns active packs only, and the
 * ACT is not in SUPPORTED_SCHEME_STATES or the database's state check. The
 * StrataVerze decisions so far are the payment order and the notice timing
 * (DECISIONS, 28 Oct 2026).
 *
 * Every value comes from the research notes of 27 Oct 2026 prepared for
 * Matthew Wrigley ("ACT unit titles: research notes for the StrataVerze ACT
 * rule pack"), which give the provision and source of each. Statutory text was
 * read on the ACT Legislation Register (HTML republications):
 * - S1 UTMA (A2011-41), republication R25, effective 26 Jun 2026, last
 *   amended by A2026-12; read in full (body, schedules 1 to 3, dictionary,
 *   endnotes). The formulas in s 30, sch 2 s 2.9 and the dictionary
 *   "proportional share" are images and were read by screenshot;
 * - S2 UTMR (SL2011-39), republication R6, effective 26 Nov 2025, last
 *   amended by A2025-29; read in full;
 * - S3 UTA (A2001-16), republication R38, effective 5 Jan 2026; ss 5 to 16 only;
 * - S4 Unit Titles (Management) (Fees) Determination 2026 (DI2026-115),
 *   notified 24 Jun 2026, effective 1 Jul 2026, revoking DI2025-128;
 * - S5 Unit Titles (Management) Sale Certificate Determination 2026
 *   (DI2026-22), notified 10 Mar 2026, effective 11 Mar 2026, revoking DI2025-75;
 * - S6 Unit Titles (Management) (Meeting Agenda) Guidelines 2023 (NI2023-528),
 *   made 3 Sep 2023, revoking NI2020-601 (commencement date not recorded);
 * - S7 UTMA Form 2, Appointment of a proxy (AF2021-17), effective 8 Jun 2021
 *   (landing page only; content not read);
 * - S8 Housing and Consumer Affairs Legislation Amendment Bill 2026
 *   (db_75019), as presented 17 Sep 2026, "Before the Assembly" on
 *   27 Oct 2026. A Bill, NOT LAW (PENDING_REFORMS);
 * - S9 ACAT, "Unit titles disputes", and S10 ACAT, "Civil disputes" (official
 *   guidance, read 27 Oct 2026, no "last updated" date shown);
 * - S11 Access Canberra, "Owners corporation managing agent licencing"
 *   (official guidance, read 27 Oct 2026, no "last updated" date shown);
 * - S12 Community Title Act 2001 (A2001-58), R17, effective 6 Dec 2025
 *   (landing page only; community title is not covered by this pack).
 * Each rule below has a `status` (see RuleStatus in ./types): CONFIRMED (read
 * in the in-force text; "absent" means the whole UTMA and UTMR were read and
 * no such provision found), GUIDANCE (official ACT Government or ACAT web
 * guidance only) or NOT_CONFIRMED. Bill text is never recorded as law: a
 * PENDING_REFORMS entry has `legalStatus: "NOT_LAW"` and `textStatus:
 * "READ_IN_BILL_TEXT"` instead of a `status`.
 *
 * MEETING_RULES is given from MEETINGS and RESOLUTIONS (stage 2, PR 8a-i).
 * Since stage 2, PR 8a-ii (29 Oct 2026) whether the meeting had a standard
 * quorum is the chair's answer for each motion, the units present for a
 * special resolution are the chair's count, and the debtor rule (sch 3
 * s 3.20(3)) is applied with 3 or more members (see MEETING_RULES).
 * LATE_CHARGE is given from INTEREST (stage 2, PR 5).
 * PAYMENT_ALLOCATION_ORDER is a StrataVerze choice Matthew Wrigley made on
 * 28 Oct 2026 (contribution first, as NSW): the notes record no order.
 * NOTICE_RULES is given from CONTRIBUTION_NOTICES (stage 2, PR 6a), with
 * checked values; its lead time and least notice are StrataVerze choices
 * Matthew Wrigley made on 28 Oct 2026 (DECISIONS). From PR 6b notices state
 * each unit's contribution, the fund and its totals, and the unit's proportion
 * by unit entitlement; they are still refused for the instalment dates, any
 * discount and the interest (FOR_REVIEW).
 */

import type { MeetingRuleSet } from "@/lib/meetings/rules";
import type {
  BuildingSelector,
  DatedRules,
  DerivedBuildingSelector,
  EntitlementScheduleDefinition,
  FundDefinition,
  LateChargeRules,
  NoticeContentRequirement,
  NoticeRules,
  PackFeatures,
  PaymentAllocationPart,
  RecordedBuildingSelector,
  RuleStatus,
  SharedTerminology,
} from "./types";

const UTMA = "Unit Titles (Management) Act 2011 (ACT)";
const UTMR = "Unit Titles (Management) Regulation 2011 (ACT)";
const UTA = "Unit Titles Act 2001 (ACT)";
const FEES = "Unit Titles (Management) (Fees) Determination 2026 (DI2026-115)";
const SALE_DETERMINATION = "Unit Titles (Management) Sale Certificate Determination 2026 (DI2026-22)";
const AGENDA_GUIDELINES = "Unit Titles (Management) (Meeting Agenda) Guidelines 2023 (NI2023-528)";
const PROXY_FORM = "UTMA Form 2, Appointment of a proxy (AF2021-17)";
const BILL = "Housing and Consumer Affairs Legislation Amendment Bill 2026 (ACT), as presented 17 Sep 2026";
const ACAT_UNIT_TITLES = "ACAT, Unit titles disputes (web guidance, read 27 Oct 2026)";
const ACAT_CIVIL = "ACAT, Civil disputes (web guidance, read 27 Oct 2026)";
const ACCESS_CANBERRA = "Access Canberra, Owners corporation managing agent licencing (web guidance, read 27 Oct 2026)";

/** The republications and instruments the pack was written from. */
export const SOURCES = [
  { id: "S1", title: "Unit Titles (Management) Act 2011 (A2011-41)", version: "R25, effective 26 Jun 2026, last amended by A2026-12", read: "in full" },
  { id: "S2", title: "Unit Titles (Management) Regulation 2011 (SL2011-39)", version: "R6, effective 26 Nov 2025, last amended by A2025-29", read: "in full" },
  { id: "S3", title: "Unit Titles Act 2001 (A2001-16)", version: "R38, effective 5 Jan 2026", read: "ss 5 to 16 only" },
  { id: "S4", title: "Unit Titles (Management) (Fees) Determination 2026 (DI2026-115)", version: "notified 24 Jun 2026, effective 1 Jul 2026; revokes DI2025-128", read: "in full" },
  { id: "S5", title: "Unit Titles (Management) Sale Certificate Determination 2026 (DI2026-22)", version: "notified 10 Mar 2026, effective 11 Mar 2026; revokes DI2025-75", read: "in full" },
  { id: "S6", title: "Unit Titles (Management) (Meeting Agenda) Guidelines 2023 (NI2023-528)", version: "made 3 Sep 2023; revokes NI2020-601", read: "in full" },
  { id: "S7", title: "UTMA Form 2, Appointment of a proxy (AF2021-17)", version: "effective 8 Jun 2021, in force", read: "landing page only" },
  { id: "S8", title: "Housing and Consumer Affairs Legislation Amendment Bill 2026 (db_75019)", version: "as presented 17 Sep 2026; Before the Assembly (checked 27 Oct 2026)", read: "full text (explanatory statement not read)" },
  { id: "S9", title: "ACAT: Unit titles disputes", version: "read 27 Oct 2026", read: "web page" },
  { id: "S10", title: "ACAT: Civil disputes", version: "read 27 Oct 2026", read: "web page" },
  { id: "S11", title: "Access Canberra: Owners corporation managing agent licencing", version: "read 27 Oct 2026", read: "web page (linked PDF guide not opened)" },
  { id: "S12", title: "Community Title Act 2001 (A2001-58)", version: "R17, effective 6 Dec 2025", read: "landing page only" },
] as const;

/**
 * The kind of scheme. The pack covers units plans only; community title
 * schemes (Community Title Act 2001) were researched at headline level only
 * and are not supported.
 *
 * The notes find no named size classes ("small", "medium", "large") in the
 * UTMA: duties change at thresholds of members or units, which SIZE_THRESHOLDS
 * records one by one. So no size-class selector is given; the number of units
 * decides each threshold.
 */
export const SCHEME_TYPE: RecordedBuildingSelector = {
  key: "schemeType",
  // Recorded by the adviser in the Building rules section (stage 2, PR 2).
  held: "RECORDED",
  label: "Scheme type",
  help: "A units plan under the Unit Titles Act 2001. Community title schemes are governed by a different Act.",
  options: [
    { value: "UNITS_PLAN", label: "Units plan", supported: true },
    {
      value: "COMMUNITY_TITLE",
      label: "Community title scheme",
      supported: false,
      note: "Community Title Act 2001 (R17, effective 6 Dec 2025): only the register page was read; its body corporate, committee and meeting rules are not confirmed.",
    },
  ],
  source: `${UTA} ss 7 to 11; Community Title Act 2001 (ACT) (landing page only)`,
  status: "CONFIRMED",
};

/**
 * Where duties change with the number of members or units (notes section B).
 * Thresholds are "more than" or "at least" exactly as the Act words them.
 */
export const SIZE_THRESHOLDS = {
  /** 1 or 2 members: ordinary, special and unanimous resolutions pass if no vote is against and at least 1 is for (sch 3 ss 3.15(2), 3.16(3), 3.18(2)). */
  oneOrTwoMembersResolutions: "pass if no vote is cast against and at least 1 vote is cast in favour",
  /**
   * 2 members: quorum is everyone entitled to vote; without one after 1/2 hour
   * the meeting is adjourned a week; the chair has no casting vote; a 2-member
   * executive committee decides unanimously (sch 3 ss 3.12, 3.30; sch 2 ss 2.10(2), 2.11(3)).
   */
  twoMembers: { quorumIsAllEntitledToVote: true, noQuorumAdjournDays: 7, chairCastingVote: false, executiveCommitteeDecidesUnanimously: true },
  /** 3 members: for a special resolution, votes against must be less than 1/3 (sch 3 s 3.16(2)); what the 1/3 is measured against is not stated in the notes (see RESOLUTIONS.SPECIAL.threeMembers). */
  threeMembersSpecialResolutionAgainstLessThanFraction: 1 / 3,
  /** 3 or more members: the standard and reduced quorum rules apply, and unfinancial owners cannot vote on ordinary or special resolutions (sch 3 ss 3.9, 3.20(3)). */
  standardQuorumRulesFromMembers: 3,
  /** 1 to 3 members: every member is an executive member (s 39(2)(a)). */
  everyMemberExecutiveUpToMembers: 3,
  /** Only 2 or 3 units: may exempt itself from the bank account requirement by unopposed resolution (s 68(2)). */
  bankAccountExemptionUnits: [2, 3],
  /** 4 or more units: a sinking fund and sinking fund plan are mandatory (ss 81(1), 82(1)). */
  sinkingFundRequiredFromUnits: 4,
  /** 7 or more units: may appoint a communications officer by ordinary resolution (s 66). */
  communicationsOfficerFromUnits: 7,
  /** More than 20 units: proxies for no more than 5% of the total number of units; 20 or fewer: 1 (sch 3 s 3.26(3)). */
  proxyPercentAboveUnits: 20,
  /** More than 100 units, or an annual budget over $250,000: audit before the AGM (sch 2 ss 2.1(1)(g), 2.1A). See AUDIT. */
  auditAboveUnits: 100,
  auditAboveAnnualBudgetCents: 25_000_000,
  source: `${UTMA} ss 39(2), 66, 68(2), 81(1), 82(1); sch 2 ss 2.1(1)(g), 2.1A, 2.10, 2.11; sch 3 ss 3.9, 3.12, 3.15, 3.16, 3.18, 3.20(3), 3.26(3), 3.30`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Units plans with their own variations (notes section B). Recorded for
 * review; a building would need these marked before the pack could apply.
 */
export const SCHEME_VARIANTS = {
  /**
   * Retirement village units plans: standard quorum is 1/3 of units instead
   * of 1/2; budget and AGM notice timing follow the Retirement Villages Act
   * 2012 (sch 3 ss 3.6(3), 3.9(1)(a)(i); s 75(5)). That Act was not read.
   */
  retirementVillage: { standardQuorumFractionOfUnits: 1 / 3, budgetAndAgmNoticeTimingUnder: "Retirement Villages Act 2012" },
  /** Mixed-use units plans: the executive committee must include, if feasible, at least 1 residential and 1 non-residential unit owner (s 39A). */
  mixedUse: { executiveCommitteeIncludesIfFeasible: ["at least 1 residential-unit owner", "at least 1 non-residential-unit owner"] },
  /** Class B units only: may exempt itself from building insurance for buildings on class B units by unanimous resolution (s 101(2)). */
  classBOnly: { buildingInsuranceExemptionBy: "UNANIMOUS" },
  source: `${UTMA} ss 39A, 75(5), 101(2); sch 3 ss 3.6(3), 3.9(1)(a)(i)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/*
 * Building selectors (stage 2, PR 2, 28 Oct 2026). The plan variants in
 * SCHEME_VARIANTS are recorded by the adviser, one yes or no each. Which
 * answers are `supported` is a StrataVerze proposal, not law (FOR_REVIEW):
 * StrataVerze applies none of the variants' rules yet. The unit thresholds in
 * SIZE_THRESHOLDS are worked out from the number of units (the building's
 * lots other than common property rows). Thresholds counted by members are
 * not: members are not the same as units (each part-owner is a member).
 */

const variant = (key: string, label: string, help: string, no: string, yesNote: string, provision: string): RecordedBuildingSelector => ({
  key,
  held: "RECORDED",
  label,
  help,
  options: [
    { value: "NO", label: no, supported: true },
    { value: "YES", label, supported: false, note: yesNote },
  ],
  source: `${UTMA} ${provision}`,
  status: SCHEME_VARIANTS.status,
});

export const RETIREMENT_VILLAGE_PLAN = variant(
  "retirementVillagePlan",
  "Retirement village units plan",
  `Whether the units plan is a retirement village units plan. Its standard quorum is 1/3 of units instead of 1/2, and its budget and AGM notice timing follow the ${SCHEME_VARIANTS.retirementVillage.budgetAndAgmNoticeTimingUnder}.`,
  "Not a retirement village units plan",
  `The ${SCHEME_VARIANTS.retirementVillage.budgetAndAgmNoticeTimingUnder} was not read, so StrataVerze does not apply these rules yet.`,
  "s 75(5); sch 3 ss 3.6(3), 3.9(1)(a)(i)",
);

export const MIXED_USE_PLAN = variant(
  "mixedUsePlan",
  "Mixed use units plan",
  "Whether the units plan is mixed use. Its executive committee must then include, if feasible, at least 1 owner of a residential unit and 1 owner of a unit that is not residential.",
  "Not a mixed use units plan",
  "StrataVerze does not check the executive committee for this yet.",
  "s 39A",
);

export const CLASS_B_ONLY_PLAN = variant(
  "classBOnlyPlan",
  "Class B units only",
  "Whether every unit in the units plan is a class B unit. The owners corporation may then exempt itself from building insurance for buildings on class B units by unanimous resolution.",
  "Not class B units only",
  "StrataVerze does not apply the building insurance exemption yet.",
  "s 101(2)",
);

const T = SIZE_THRESHOLDS;
const [BANK_FROM, BANK_TO] = [Math.min(...T.bankAccountExemptionUnits), Math.max(...T.bankAccountExemptionUnits)];
const unitRule = (value: string, when: DerivedBuildingSelector["rules"][number]["when"], provision: string) => ({ value, when, provision: `${UTMA} ${provision}`, status: T.status });

export const BANK_ACCOUNT_EXEMPTION: DerivedBuildingSelector = {
  key: "bankAccountExemption",
  held: "DERIVED",
  label: "Bank account exemption",
  help: `Worked out from the number of units. Only a units plan of ${BANK_FROM} or ${BANK_TO} units may exempt itself from the bank account requirement, by unopposed resolution.`,
  options: [
    { value: "MAY_EXEMPT", label: "May exempt itself", supported: true },
    { value: "MAY_NOT_EXEMPT", label: "May not exempt itself", supported: true },
  ],
  rules: [
    unitRule("MAY_EXEMPT", { number: "LOT_COUNT", atLeast: BANK_FROM, atMost: BANK_TO }, "s 68(2)"),
    unitRule("MAY_NOT_EXEMPT", { any: [{ number: "LOT_COUNT", lessThan: BANK_FROM }, { number: "LOT_COUNT", moreThan: BANK_TO }] }, "s 68(2)"),
  ],
  noRuleFits: "The bank account exemption could not be worked out from the units recorded.",
  source: `${UTMA} s 68(2)`,
  status: T.status,
};

export const SINKING_FUND_REQUIRED: DerivedBuildingSelector = {
  key: "sinkingFundRequired",
  held: "DERIVED",
  label: "Sinking fund",
  help: `Worked out from the number of units. With ${T.sinkingFundRequiredFromUnits} or more units a sinking fund and a sinking fund plan are required.`,
  options: [
    { value: "REQUIRED", label: "Sinking fund and plan required", supported: true },
    { value: "NOT_REQUIRED", label: "Not required", supported: true },
  ],
  rules: [
    unitRule("REQUIRED", { number: "LOT_COUNT", atLeast: T.sinkingFundRequiredFromUnits }, "ss 81(1), 82(1)"),
    unitRule("NOT_REQUIRED", { number: "LOT_COUNT", lessThan: T.sinkingFundRequiredFromUnits }, "ss 81(1), 82(1)"),
  ],
  noRuleFits: "Whether a sinking fund is required could not be worked out from the units recorded.",
  source: `${UTMA} ss 81(1), 82(1)`,
  status: T.status,
};

export const COMMUNICATIONS_OFFICER: DerivedBuildingSelector = {
  key: "communicationsOfficer",
  held: "DERIVED",
  label: "Communications officer",
  help: `Worked out from the number of units. With ${T.communicationsOfficerFromUnits} or more units a communications officer may be appointed by ordinary resolution.`,
  options: [
    { value: "MAY_APPOINT", label: "May be appointed", supported: true },
    { value: "MAY_NOT_APPOINT", label: "May not be appointed", supported: true },
  ],
  rules: [
    unitRule("MAY_APPOINT", { number: "LOT_COUNT", atLeast: T.communicationsOfficerFromUnits }, "s 66"),
    unitRule("MAY_NOT_APPOINT", { number: "LOT_COUNT", lessThan: T.communicationsOfficerFromUnits }, "s 66"),
  ],
  noRuleFits: "Whether a communications officer may be appointed could not be worked out from the units recorded.",
  source: `${UTMA} s 66`,
  status: T.status,
};

export const PROXY_LIMIT_BAND: DerivedBuildingSelector = {
  key: "proxyLimit",
  held: "DERIVED",
  label: "Proxy limit",
  help: `Worked out from the number of units. With more than ${T.proxyPercentAboveUnits} units a proxy holder may exercise proxies for no more than 5% of the total number of units. With ${T.proxyPercentAboveUnits} units or fewer the limit is 1 proxy.`,
  options: [
    { value: "ONE_PROXY", label: "1 proxy", supported: true },
    { value: "FIVE_PERCENT_OF_UNITS", label: "No more than 5% of the units", supported: true },
  ],
  rules: [
    unitRule("FIVE_PERCENT_OF_UNITS", { number: "LOT_COUNT", moreThan: T.proxyPercentAboveUnits }, "sch 3 s 3.26(3)"),
    unitRule("ONE_PROXY", { number: "LOT_COUNT", atMost: T.proxyPercentAboveUnits }, "sch 3 s 3.26(3)"),
  ],
  noRuleFits: "The proxy limit could not be worked out from the units recorded.",
  source: `${UTMA} sch 3 s 3.26(3)`,
  status: T.status,
};

/**
 * The unit leg of the audit test only (sch 2 ss 2.1(1)(g), 2.1A): more than
 * 100 units requires an audit. At 100 or fewer the annual budget decides,
 * which StrataVerze does not hold as a fact, so the value says so.
 */
export const AUDIT_BY_UNITS: DerivedBuildingSelector = {
  key: "auditByUnits",
  held: "DERIVED",
  label: "Audit",
  help: `Worked out from the number of units. With more than ${T.auditAboveUnits} units the financial records must be audited before the AGM. Otherwise an audit is required only if the annual budget is over $${(T.auditAboveAnnualBudgetCents / 100).toLocaleString("en-AU")}.`,
  options: [
    { value: "REQUIRED", label: "Audit required", supported: true },
    { value: "BUDGET_DECIDES", label: `Required only if the annual budget is over $${(T.auditAboveAnnualBudgetCents / 100).toLocaleString("en-AU")}`, supported: true },
  ],
  rules: [
    unitRule("REQUIRED", { number: "LOT_COUNT", moreThan: T.auditAboveUnits }, "sch 2 ss 2.1(1)(g), 2.1A"),
    unitRule("BUDGET_DECIDES", { number: "LOT_COUNT", atMost: T.auditAboveUnits }, "sch 2 ss 2.1(1)(g), 2.1A"),
  ],
  noRuleFits: "Whether an audit is required could not be worked out from the units recorded.",
  source: `${UTMA} sch 2 ss 2.1(1)(g), 2.1A`,
  status: T.status,
};

/**
 * The owners corporation's number of members, recorded by the adviser
 * (stage 2, PR 8a-i, 28 Oct 2026): the resolution tests depend on it (sch 3
 * ss 3.15, 3.16, 3.18), and members are not units, since each part-owner is
 * a member (s 10), so it cannot be worked out from the units. Which bands are
 * `supported` is a StrataVerze proposal: 1 or 2 members (since stage 2,
 * PR 8a-ii, 29 Oct 2026, Matthew Wrigley's decision) and 4 or more members
 * are counted at a meeting; 3 members is not marked supported, as its
 * special resolution test is not confirmed (FOR_REVIEW). Since stage 2, PR 8a-ii (29 Oct 2026) it also
 * decides the member threshold of sch 3 s 3.20(3) (3 or more members: no
 * vote on an ordinary or special resolution while an amount is unpaid,
 * MEETING_RULES.debtorRuleAppliesWhen).
 */
export const MEMBER_BAND: RecordedBuildingSelector = {
  key: "memberBand",
  held: "RECORDED",
  label: "Number of members",
  help: "How many members the owners corporation has. It decides the resolution tests at its meetings. Members are not the same as units: each owner of a unit, including each part-owner, is a member. Update it when the owners change.",
  options: [
    {
      value: "ONE_OR_TWO",
      label: "1 or 2 members",
      supported: true,
      note: "A resolution passes with no vote against and at least 1 vote for, and everyone entitled to vote must be present for a quorum. A unit owing money is not barred from voting.",
    },
    {
      value: "THREE",
      label: "3 members",
      supported: false,
      note: "The special resolution test for 3 members is not confirmed, so a special resolution at its meetings is not counted.",
    },
    { value: "FOUR_OR_MORE", label: "4 or more members", supported: true },
  ],
  source: `${UTMA} s 10; sch 3 ss 3.15, 3.16, 3.18`,
  status: "CONFIRMED",
};

/**
 * The building selectors (stage 2, PR 2): the scheme type and the plan
 * variants, recorded by the adviser, and the unit thresholds, worked out from
 * the number of units. The number of members (stage 2, PR 8a-i) is recorded
 * by the adviser.
 */
export const BUILDING_SELECTORS: readonly BuildingSelector[] = [
  SCHEME_TYPE,
  RETIREMENT_VILLAGE_PLAN,
  MIXED_USE_PLAN,
  CLASS_B_ONLY_PLAN,
  BANK_ACCOUNT_EXEMPTION,
  SINKING_FUND_REQUIRED,
  COMMUNICATIONS_OFFICER,
  PROXY_LIMIT_BAND,
  AUDIT_BY_UNITS,
  MEMBER_BAND,
];

/** The owners corporation itself (notes section A). */
export const IDENTITY = {
  /** "The Owners—Units Plan No X", X being the number the registrar-general gives the units plan (s 8(1), (3)). */
  nameFormat: "The Owners—Units Plan No {plan}",
  /** Established when the units plan is registered (s 8(1)). */
  establishedOn: "registration of the units plan",
  /** A corporation with perpetual succession; may have a common seal; may sue and be sued in its corporate name (s 9). */
  corporation: true,
  /**
   * Execution (s 9A): the seal, attached as authorised by resolution and
   * witnessed by 2 executive members; without a seal, signed by 2 executive
   * members as authorised by resolution, or by the manager if delegated and
   * authorised by resolution.
   */
  execution: { sealWitnessedByExecutiveMembers: 2, withoutSealSignedByExecutiveMembers: 2, managerMaySignIfDelegatedAndAuthorised: true },
  /** The members are the unit owners; each part-owner is a member (s 10). */
  members: "the unit owners (each part-owner is a member)",
  /** Part-owners nominate one of themselves, and a company an officer or employee, by written notice within 14 days after lodgment for registration (ss 11, 13). */
  representativeNominationWithinDays: 14,
  /** Responsible for managing the units plan (s 7). */
  responsibleFor: "managing the units plan",
  /** The developer control period ends when people other than the developer hold 1/3 or more of the unit entitlements (dictionary). */
  developerControlPeriodEndsAtNonDeveloperEntitlementFraction: 1 / 3,
  source: `${UTMA} ss 7 to 11, 13, 9A; dictionary "developer control period"`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The funds the platform's ledger holds (UTMA ss 73, 81). The ACT also allows
 * special purpose funds (s 74, by special resolution). They are not in this
 * catalogue because the ledger has one fund type each for the administrative
 * and capital funds only; FUND_RULES records them.
 */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "ADMINISTRATIVE",
    name: "administrative fund",
    label: "Administrative Fund",
    shortLabel: "Admin",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Part of the general fund: the budgeted day-to-day payments, including maintenance, insurance premiums and recurrent expenses.",
    required: true,
    source: `${UTMA} ss 72, 73, 75`,
    status: "CONFIRMED",
  },
  {
    key: "SINKING",
    name: "sinking fund",
    label: "Sinking Fund",
    // "Sinking" alone does not read as a fund, so the short form keeps "Fund" (as in the Queensland pack).
    shortLabel: "Sinking Fund",
    // Kept in the ledger's capital works fund type, shown as the sinking fund.
    ledgerFund: "CAPITAL_WORKS",
    purpose: "Expenditure under the sinking fund plan: painting, acquiring or replacing property, fixtures and fittings, and other capital expenses.",
    // The Act requires a sinking fund only with 4 or more units (s 81(1)), so
    // `required` is false and `requiredWhen` reads the sinking fund selector
    // (SINKING_FUND_REQUIRED, worked out from the number of units against
    // SIZE_THRESHOLDS.sinkingFundRequiredFromUnits; stage 2, PR 3). Where the
    // number of units is not known the fund is not worked out, and the
    // building is flagged.
    required: false,
    requiredWhen: {
      rules: [
        {
          need: "REQUIRED",
          when: { selector: SINKING_FUND_REQUIRED.key, in: ["REQUIRED"] },
          reason: `Required with ${T.sinkingFundRequiredFromUnits} or more units, with a sinking fund plan.`,
          provision: `${UTMA} ss 81(1), 82(1)`,
          status: T.status,
        },
        {
          // Not required below the threshold (s 81(1)). Whether a units plan
          // of fewer units may still keep one is not in the notes (FOR_REVIEW).
          need: "OPTIONAL",
          when: { selector: SINKING_FUND_REQUIRED.key, in: ["NOT_REQUIRED"] },
          reason: `Not required with fewer than ${T.sinkingFundRequiredFromUnits} units.`,
          provision: `${UTMA} s 81(1)`,
          status: T.status,
        },
      ],
      noRuleFits: "Whether a sinking fund is required could not be worked out from the units recorded.",
    },
    source: `${UTMA} ss 81, 83, 88`,
    status: "CONFIRMED",
  },
];

/** Rules about the funds (notes section J). */
export const FUND_RULES = {
  /** "General fund" means the administrative fund or a special purpose fund (s 72). */
  generalFundMeans: ["administrative fund", "special purpose fund"],
  /** Special purpose funds: optional, by special resolution; their purpose can only be changed by special resolution (s 74). Not in FUND_CATALOGUE. */
  specialPurposeFunds: { optional: true, establishedBy: "SPECIAL", purposeChangedBy: "SPECIAL" },
  /** General fund receipts: contributions, common property sublet income, disposal proceeds, record and certificate fees (s 76). */
  generalFundReceipts: ["contributions", "common property sublet income", "disposal proceeds", "record and certificate fees"],
  /**
   * A sinking fund and a sinking fund plan are mandatory with 4 or more units
   * (ss 81(1), 82(1)). FUND_CATALOGUE requires the sinking fund through its
   * `requiredWhen`, which reads the SINKING_FUND_REQUIRED selector built on
   * this threshold (stage 2, PR 3).
   */
  sinkingFundRequiredFromUnits: SIZE_THRESHOLDS.sinkingFundRequiredFromUnits,
  sinkingFundPlanRequiredFromUnits: SIZE_THRESHOLDS.sinkingFundRequiredFromUnits,
  /**
   * Sinking fund plan (s 82(2), (3)): 10 years from the first day of the
   * financial year after approval, stating expected expenditure for at least
   * that period, the yearly total contribution and any special resolution
   * per-unit amounts.
   */
  sinkingFundPlan: {
    horizonYears: 10,
    horizonStarts: "the first day of the financial year after approval",
    states: ["expected expenditure for at least the 10-year period", "the yearly total sinking fund contribution", "any per-unit amounts under a special resolution method"],
    /** What expected expenditure covers (s 83). */
    expectedExpenditure: ["painting", "acquisition or replacement of property, fixtures and fittings", "defined parts of class A buildings", "authorised class B maintenance", "other capital expenses, including sustainability and utility infrastructure"],
    /** Approved within 12 months after the first AGM; a new plan at least 12 months before the current plan ends (s 84). */
    firstApprovalWithinMonthsAfterFirstAgm: 12,
    replacementApprovedAtLeastMonthsBeforeEnd: 12,
    /** First review within 4 years of first approval, then by the end of each 5-year period after that (s 85). */
    firstReviewWithinYears: 4,
    laterReviewEveryYears: 5,
    /** Amended at any time by ordinary resolution (s 86). */
    amendedBy: "ORDINARY",
  },
  /** Only payments consistent with the plan (s 88). */
  sinkingFundPaymentsConsistentWithPlanOnly: true,
  /** Transfers into the sinking fund: from the administrative fund by ordinary resolution; from a special purpose fund per its purpose or by special resolution (s 87). */
  transfersIntoSinkingFund: { fromAdministrativeFund: "ORDINARY", fromSpecialPurposeFund: "as its purpose allows, or SPECIAL" },
  /**
   * "Sinking fund forecast" is not a UTMA term. DI2026-22 cl 4(4)(f) asks for
   * a copy of the "sinking fund forecast (if available)" on sale certificates.
   */
  sinkingFundForecastIsUtmaTerm: false,
  /** An account with an authorised deposit-taking institution, all money through it (s 68); 2 or 3 units may be exempted (SIZE_THRESHOLDS). */
  bankAccountRequired: true,
  /** Invest as it considers appropriate, subject to directions by special resolution; not in a mortgage of land (s 69). */
  investment: { directionsBy: "SPECIAL", notInMortgageOfLand: true },
  /** Borrowing by special resolution (s 70). */
  borrowingBy: "SPECIAL",
  /** Must not carry on business except in exercising its functions; an offence for executive members (s 71). */
  mayCarryOnBusiness: false,
  source: `${UTMA} ss 68 to 74, 76, 81 to 88; ${SALE_DETERMINATION} cl 4(4)(f)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** One schedule: unit entitlement, in the units plan, held on each unit. */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "UNIT_ENTITLEMENT",
    name: "unit entitlement",
    onLot: true,
    usedFor: [
      "each unit's proportional share of general fund and sinking fund contributions, unless a special resolution sets another fair method",
      "the value of a unit's vote on a poll (voting value)",
      "a meeting request: voters for units holding at least 1/4 of the total unit entitlement",
      "each owner's share, as tenant in common, of the common property",
      "each unit's share of the cost of shared s 29 work, unless agreed otherwise in writing",
      "when the developer control period ends (others hold 1/3 or more of the unit entitlements)",
    ],
    source: `${UTA} s 8; ${UTMA} ss 19(1)(b), 30(3), (4), 78(2), 89(2); sch 3 ss 3.5(2), 3.22, 3.28; dictionary "proportional share", "developer control period"`,
    status: "CONFIRMED",
  },
];

/**
 * Unit entitlement (UTA s 8): a number for each unit indicating its "improved
 * value" relative to each other unit. The total must be one of these.
 */
export const ENTITLEMENT_RULES = {
  indicates: "the unit's improved value relative to each other unit",
  allowedTotals: [10, 100, 1_000, 10_000, 100_000],
  /** Proportional share = total contributions × (unit entitlement of the unit or group ÷ total unit entitlement) (dictionary, formula image). */
  proportionalShare: "total contributions × unit entitlement of the unit (or group of units) ÷ total unit entitlement",
  source: `${UTA} s 8(1), (2); ${UTMA} dictionary "proportional share"`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Budgets and contributions (notes section C). */
export const CONTRIBUTIONS = {
  /**
   * At each AGM, by ordinary resolution, a general fund budget for the
   * administrative fund and each special purpose fund, for the financial year
   * in which the meeting is held (s 75(1)).
   */
  budget: {
    approvedAt: "each AGM",
    approvedBy: "ORDINARY",
    covers: ["administrative fund", "each special purpose fund"],
    forFinancialYear: "the financial year in which the meeting is held",
    /** Estimates in the budget (s 75(2), (4)); transfers to the sinking fund are excluded. */
    estimates: [
      "total general fund contribution",
      "per-unit contribution, if a special resolution method applies",
      "other income",
      "payments, including day-to-day maintenance, insurance premiums, the cost of getting rental certificate information, and recurrent expenses",
    ],
    excludesSinkingFundTransfers: true,
  },
  /** Spending from the general fund only if approved in the budget or authorised by ordinary resolution (s 77). */
  generalFundSpendingOnlyIf: ["approved in the budget", "authorised by ordinary resolution"],
  /** Default share: proportional to unit entitlement (ss 78(2)(a), 89(2)(a)). */
  defaultMethod: "proportional share by unit entitlement",
  /**
   * Another method by special resolution; it must be fair, taking into
   * account the listed factors, and is taken to be an alternative rule
   * (ss 78(2)(b), (3), 89(2)(b), (3), 108(5); UTMR s 7B).
   */
  alternativeMethod: { by: "SPECIAL", mustBeFair: true, takenToBeAlternativeRule: true, source: `${UTMA} ss 78(2)(b), (3), 89(2)(b), (3), 108(5); ${UTMR} s 7B` },
  /** Payable on the date stated in the notice, or on the stated instalment dates (ss 80, 91). */
  payableOn: "the date stated in the notice, or the stated instalment dates",
  /** Instalments are optional; if offered, the notice states their dates (ss 79(2)(f), 90(2)(f)). */
  instalmentsOptional: true,
  /** No contribution is payable for a unit in an uncompleted stage of a staged development (s 92(2)). */
  noneForUncompletedStage: true,
  source: `${UTMA} ss 75, 77, 78, 80, 89, 91, 92(2)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Contribution notices (ss 79, 90), as the notes give them. The shared
 * NOTICE_RULES below is built from them (stage 2, PR 6a).
 */
export const CONTRIBUTION_NOTICES = {
  /** General fund: no fixed lead time; contributions may be determined "from time to time" (s 78(1)). */
  generalFundTiming: "no fixed lead time (contributions determined from time to time)",
  /** Sinking fund: within 1 month after an AGM, for the financial year in which it takes place (s 90(1)). */
  sinkingFundNoticeWithinMonthsAfterAgm: 1,
  /** The full-payment date must be "not later than 28 days after the date of the notice", for both funds (ss 79(2)(e), 90(2)(e)). */
  dueNotLaterThanDaysAfterNotice: 28,
  /** Each notice shows the contribution for every other unit, not only the recipient's (ss 79(2)(b), 90(2)(b)). */
  showsEveryUnitsContribution: true,
  /** General fund notice contents (s 79(2)(a) to (i)). */
  generalFundContents: [
    "the unit's contribution",
    "the contributions payable for each other unit",
    "the fund or funds, the split between them and the totals",
    "the unit's proportion and how it is worked out",
    "the due date if paid in full (not later than 28 days after the date of the notice)",
    "instalment dates, if any",
    "how to pay",
    "any discount for early payment",
    "interest for late payment",
  ],
  /** Sinking fund notice contents (s 90(2)). */
  sinkingFundContents: [
    "the unit's contribution",
    "the contributions payable for each other unit",
    "the total sinking fund contribution for the year",
    "the unit's proportion and how it is worked out",
    "the due date if paid in full (not later than 28 days after the date of the notice)",
    "instalment dates, if any",
    "how to pay",
    "any discount",
    "interest for late payment",
  ],
  /** No hardship, payment plan or assistance statement is among the contents (see HARDSHIP). */
  hardshipStatementRequired: false,
  source: `${UTMA} ss 78(1), 79(2), 90`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Who decided the ACT's notice timing, as DECISIONS records it. */
const NOTICE_DECISION = "Matthew Wrigley's StrataVerze decision of 28 Oct 2026 (DECISIONS)";

/** What every ACT contribution notice must state that StrataVerze notices do not carry already (ss 79(2), 90(2)). */
const NOTICE_CONTENTS: readonly NoticeContentRequirement[] = [
  { key: "EVERY_LOT_CONTRIBUTION", words: "the contribution payable for each other unit", status: "CONFIRMED", source: `${UTMA} ss 79(2)(b), 90(2)(b)` },
  { key: "FUND_TOTAL", words: "the fund or funds the contribution is for, the split between them and the totals", ledgerFunds: ["ADMINISTRATIVE"], status: "CONFIRMED", source: `${UTMA} s 79(2)(c)` },
  { key: "FUND_TOTAL", words: "the total sinking fund contribution for the year", ledgerFunds: ["CAPITAL_WORKS"], status: "CONFIRMED", source: `${UTMA} s 90(2)(c)` },
  { key: "PROPORTION_AND_METHOD", words: "the unit's proportion and how it is worked out", status: "CONFIRMED", source: `${UTMA} ss 79(2)(d), 90(2)(d)` },
  { key: "INSTALMENT_DATES", words: "the instalment dates, if the contribution may be paid by instalments", status: "CONFIRMED", source: `${UTMA} ss 79(2)(f), 90(2)(f)` },
  { key: "EARLY_PAYMENT_DISCOUNT", words: "any discount for paying early", status: "CONFIRMED", source: `${UTMA} ss 79(2)(h), 90(2)(h), 93` },
  { key: "LATE_CHARGE_STATEMENT", words: "the interest payable for late payment", status: "CONFIRMED", source: `${UTMA} ss 79(2)(i), 90(2)(i), 94` },
];

/**
 * The contribution notice rules in the shared shape (stage 2, PR 6a,
 * 28 Oct 2026), from CONTRIBUTION_NOTICES and the notes only.
 *
 * The full-payment date must be not later than 28 days after the date of the
 * notice (ss 79(2)(e), 90(2)(e)): the most notice, CONFIRMED. The ACT sets no
 * least notice (contributions are determined from time to time, s 78(1)), so
 * the 14-day floor and the 28-day lead are StrataVerze choices Matthew
 * Wrigley made on 28 Oct 2026 (DECISIONS). A contribution is payable on the
 * date the notice states (ss 80, 91), so a late notice may fall due 14 days
 * after it goes out, within the 28 (a StrataVerze reading, FOR_REVIEW). The general fund is given one notice for
 * each instalment (a StrataVerze reading, FOR LEGAL REVIEW against
 * s 79(2)(f)); the sinking fund notice is given once a year, within 1 month
 * after the AGM (s 90(1)), which StrataVerze cannot give yet, so sinking fund
 * notices are refused. Since PR 6b (28 Oct 2026) a notice states the
 * contribution for each unit (unit numbers and amounts only), the fund with
 * its totals, and the unit's proportion by unit entitlement. No notice can be
 * issued yet: StrataVerze notices do not state the instalment dates, any
 * discount or the interest (FOR_REVIEW). No hardship statement is required
 * (HARDSHIP), and no approved form is recorded (Form 1, AF2012-112, was not
 * read: FOR_REVIEW).
 *
 * The fields outside `checked` hold the safest values for a reader that knows
 * only them: the 14-day floor and the 28-day lead, the most the law allows.
 */
export const NOTICE_RULES: NoticeRules = {
  minimumNoticeDays: 14,
  issueDaysBeforeDue: 28,
  urgentNoticeDays: null,
  hardship: null,
  contents: CONTRIBUTION_NOTICES.generalFundContents,
  source: CONTRIBUTION_NOTICES.source,
  checked: {
    minimumNoticeDays: {
      value: 14,
      status: "STRATAVERZE",
      source: NOTICE_DECISION,
      note: "The ACT sets no least notice (UTMA s 78(1): contributions are determined from time to time). 14 days is StrataVerze's floor, not a rule of law.",
    },
    maximumNoticeDays: {
      value: CONTRIBUTION_NOTICES.dueNotLaterThanDaysAfterNotice,
      status: "CONFIRMED",
      source: `${UTMA} ss 79(2)(e), 90(2)(e)`,
      note: "The full-payment date must be not later than 28 days after the date of the notice.",
    },
    issueDaysBeforeDue: {
      value: 28,
      status: "STRATAVERZE",
      source: NOTICE_DECISION,
      note: "Each notice goes out 28 days before it falls due, the most notice the law allows.",
    },
    dueDateMayMove: {
      value: true,
      status: "STRATAVERZE",
      source: `${UTMA} ss 80, 91`,
      note: "StrataVerze's reading: the notes say only that a contribution is payable on the date stated in the notice, so a notice that goes out late states a later date, within the 28 days. FOR_REVIEW.",
    },
    noticeMode: {
      ADMINISTRATIVE: {
        value: "PER_INSTALMENT",
        status: "STRATAVERZE",
        source: `${UTMA} ss 78(1), 79(2)(f)`,
        note: "One notice for each instalment as it falls due is StrataVerze's reading. FOR LEGAL REVIEW: s 79(2)(f) has one notice state the instalment dates, which may mean one notice for the whole contribution.",
      },
      CAPITAL_WORKS: {
        value: { annualWithinMonthsAfterAgm: CONTRIBUTION_NOTICES.sinkingFundNoticeWithinMonthsAfterAgm },
        status: "CONFIRMED",
        source: `${UTMA} s 90(1)`,
        note: "The sinking fund notice is given within 1 month after an AGM, for the financial year in which the meeting is held.",
      },
    },
    requiredContents: NOTICE_CONTENTS,
    form: null,
    source: `${UTMA} ss 78(1), 79, 80, 90, 91, 93, 94`,
  },
};

/** A discount by ordinary resolution, for paying before the due date, or for paying in full by the full-payment date when instalments are offered (s 93). The notes record no maximum. */
export const DISCOUNTS = {
  by: "ORDINARY",
  for: ["payment before the due date", "payment in full by the full-payment date when instalments are offered"],
  source: `${UTMA} s 93`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Interest on overdue contributions (s 94), as the notes give it. The shared
 * LATE_CHARGE below is built from it (stage 2, PR 5).
 */
export const INTEREST = {
  /** 10% a year simple interest until paid (s 94(1)(a)). */
  defaultAnnualRatePercent: 10,
  simple: true,
  untilPaid: true,
  /** Below 10% by special resolution, or above 10% and up to 20% by special resolution (s 94(1)); the notes give the range as 0 to 20%. */
  lowerRateBy: "SPECIAL",
  higherRateBy: "SPECIAL",
  minAnnualRatePercent: 0,
  maxAnnualRatePercent: 20,
  /**
   * FOR LEGAL REVIEW: s 94(1) opens "unless otherwise decided by ordinary
   * resolution". How that interacts with paras (b) and (c) needs legal
   * interpretation (it may let an ordinary resolution switch interest off).
   * The text and the rates are CONFIRMED; the interpretation is not.
   */
  openingWords: { text: "unless otherwise decided by ordinary resolution", interpretationStatus: "NOT_CONFIRMED" as RuleStatus },
  /** Paid into the fund the amount owing belongs to (s 94(2)). */
  paidIntoFundOwed: true,
  source: `${UTMA} s 94`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The late charge in the shared shape (VIC, ACT and WA stage 2, PR 5,
 * 28 Oct 2026), from INTEREST and the notes only. 10% a year simple interest
 * by default (s 94(1)(a)); a special resolution may set a rate from 0 to 20%
 * (s 94(1); the notes give the range as 0 to 20%). The notes say interest
 * runs "until paid" but not from which day, with what grace period, or how a
 * day's share of the yearly rate is worked out, so those are NOT_CONFIRMED
 * and the engine charges nothing until a pack version records them
 * (FOR_REVIEW). No setting for "no interest by ordinary resolution" is
 * offered: what the opening words of s 94(1) allow is for legal review. The
 * notes record no waiver in a particular case.
 */
export const LATE_CHARGE: LateChargeRules = {
  method: "ANNUAL_RATE",
  modes: ["STATUTORY", "RESOLVED_ANNUAL_RATE"],
  defaultMode: "STATUTORY",
  resolutionRequiredFor: ["RESOLVED_ANNUAL_RATE"],
  // The annual-rate rule is in `annual`; these older fields hold nothing for it.
  annualRatePercent: null,
  maxMonthlyRatePercent: null,
  graceMonths: 0,
  source: INTEREST.source,
  annual: {
    statutoryRatePercent: { value: INTEREST.defaultAnnualRatePercent, status: "CONFIRMED", source: `${UTMA} s 94(1)(a)` },
    resolvedRate: {
      // The setting checks the motion is recorded as SPECIAL and CARRIED. Since stage 2, PR 8a-i the meeting engine
      // holds the sch 3 s 3.16(1) test (MEETING_RULES.SPECIAL: votes against not more than 1/4 of the votes that could
      // be cast by those present) and an ACT general meeting records CARRIED only from the count. Since stage 2,
      // PR 8a-ii (29 Oct 2026) a special resolution with 4 or more members is recorded as CARRIED where the chair
      // answers that the meeting had a standard quorum for the motion and gives the units present, which must match
      // the units entered; debtors are barred (s 3.20(3)). With 1 or 2 members a special resolution is recorded as
      // CARRIED with no vote against and at least 1 vote for (s 3.16(3)), with the chair's quorum answer (s 3.12) and
      // no debtor bar. So a carried ACT special resolution can now set this rate.
      // The 3-member test (s 3.16(2), NOT_CONFIRMED) and a reduced quorum decision (stage 2, PR 8b) are still
      // refused (FOR_REVIEW).
      resolution: {
        value: { kind: "SPECIAL", words: "special resolution" },
        status: "CONFIRMED",
        source: `${UTMA} s 94(1)`,
        note: "Below 10%, or above 10% and up to 20%, by special resolution. The opening words of s 94(1) are not read as letting an ordinary resolution set a rate (FOR LEGAL REVIEW, INTEREST.openingWords).",
      },
      minPercent: { value: INTEREST.minAnnualRatePercent, status: "CONFIRMED", source: `${UTMA} s 94(1)`, note: "The notes give the range as 0 to 20%." },
      maxPercent: { value: INTEREST.maxAnnualRatePercent, status: "CONFIRMED", source: `${UTMA} s 94(1)` },
      maxInclusive: true,
    },
    accrual: {
      from: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${UTMA} ss 80, 91, 94(1)(a)`,
        note: "The notes say 10% a year simple interest \"until paid\", and that a contribution is payable on the date stated in the notice or on the instalment dates. They do not say from which day interest runs.",
      },
      graceMonths: { value: null, status: "NOT_CONFIRMED", source: `${UTMA} s 94`, note: "The notes record no grace period, and do not say there is none." },
      simple: { value: true, status: "CONFIRMED", source: `${UTMA} s 94(1)(a)` },
      daysInYear: { value: null, status: "NOT_CONFIRMED", source: `${UTMA} s 94(1)(a)`, note: "The notes give a rate a year and do not say how a day's share of it is worked out." },
    },
    waiver: null,
    source: INTEREST.source,
  },
};

/**
 * The order a payment is applied to what an owner owes: contributions, then
 * interest, then recovery costs, as NSW. The notes record no order, so this
 * is a StrataVerze choice Matthew Wrigley made on 28 Oct 2026 (DECISIONS),
 * not a rule of law.
 */
export const PAYMENT_ALLOCATION_ORDER: readonly PaymentAllocationPart[] = ["LEVY", "INTEREST", "RECOVERY_COSTS"];

/** Recovering unpaid contributions (notes section D). */
export const DEBT_RECOVERY = {
  /** An unpaid amount may be recovered as a debt from the unit owner, with s 94 interest (s 95(1)). */
  recoverableAsDebtWithInterest: true,
  /** The owner when it became payable and every later owner are liable separately and together (s 95(2)); part-owners likewise, adjusting between themselves (s 98). */
  laterOwnersJointlyAndSeverallyLiable: true,
  partOwnersJointlyAndSeverallyLiable: true,
  /**
   * Statutory charge over the unit lease (ss 96, 97): declared, a copy
   * certified by the executive committee lodged with the registrar-general,
   * copies to the owner and interest holders. Secures the amount plus
   * interest; gives no power of sale; revoked once paid, with the revocation
   * lodged.
   */
  statutoryCharge: { available: true, securesInterest: true, powerOfSale: false, revokeAndLodgeWhenPaid: true },
  /** No statutory pre-action notice or demand (whole UTMA and UTMR read: absent). */
  noticeRequiredBeforeAction: false,
  /** The executive committee may take legal action about payment of a contribution without an ordinary resolution (sch 2 s 2.5(2)(a)). */
  contributionRecoveryNeedsResolution: false,
  /**
   * Other legal action needs an ordinary resolution unless it is urgent or
   * its estimated costs are within the prescribed amount: the lesser of $750
   * for each unit and $10,000 (sch 2 ss 2.5(2)(b), 2.6; UTMR s 9). This is
   * the threshold for the committee acting WITHOUT owners corporation
   * approval. It is NOT a cap on recoverable costs.
   */
  otherLegalActionWithoutResolution: {
    estimatedCostsWithinPerUnitCents: 75_000,
    estimatedCostsWithinCapCents: 1_000_000,
    orIfUrgent: true,
    isCapOnRecoverableCosts: false,
    source: `${UTMA} sch 2 ss 2.5(2)(b), 2.6; ${UTMR} s 9`,
  },
  /**
   * Forum: ACAT guidance says levies "may be recovered as a debt in ACAT's
   * civil jurisdiction" (GUIDANCE). The UTMA dictionary says "court includes
   * the ACAT" (CONFIRMED).
   */
  forum: { tribunal: "ACAT", jurisdiction: "civil", status: "GUIDANCE" as RuleStatus, courtIncludesAcat: true, courtIncludesAcatStatus: "CONFIRMED" as RuleStatus, source: `${ACAT_UNIT_TITLES}; ${UTMA} dictionary "court"` },
  /**
   * ACAT civil limit: up to $25,000; more needs the parties' written agreement,
   * or the excess can be abandoned; above that, the Magistrates Court. From
   * ACAT guidance only: the ACAT Act provision was not read.
   */
  tribunalLimit: { cents: 2_500_000, higherWithWrittenAgreementOfParties: true, excessMayBeAbandoned: true, aboveLimit: "Magistrates Court", status: "GUIDANCE" as RuleStatus, source: ACAT_CIVIL },
  /**
   * Recovery costs: ACAT guidance says "some of the costs and expenses" (for
   * example letters of demand, coming to ACAT) "may be recoverable as a debt"
   * (GUIDANCE; no UTMA provision for levy debts found). Separately, s 31(4)
   * lets reasonable legal expenses, including ACAT expenses, be recovered when
   * incurred because of a member's fault or rule breach (CONFIRMED).
   */
  recoveryCosts: {
    levyRecoveryCosts: "some may be recoverable as a debt",
    levyRecoveryCostsStatus: "GUIDANCE" as RuleStatus,
    faultOrRuleBreachLegalExpensesRecoverable: true,
    faultOrRuleBreachStatus: "CONFIRMED" as RuleStatus,
    source: `${ACAT_UNIT_TITLES}; ${UTMA} s 31(4)`,
  },
  /** No statutory payment plan or hardship scheme (absent); instalments exist only as a notice option (ss 79(2)(f), 90(2)(f)). */
  statutoryPaymentPlans: false,
  /** With 3 or more members, a vote for a unit on an ordinary or special resolution only if all amounts payable for the unit are paid (sch 3 s 3.20(3)). */
  unfinancialMayVoteOnOrdinaryOrSpecial: false,
  source: `${UTMA} ss 31(4), 94 to 98; sch 2 ss 2.5, 2.6; sch 3 s 3.20(3); ${UTMR} s 9`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * General meetings and executive committee meetings (notes section E), as
 * plain data; MEETING_RULES (after RECORDS) applies them in the shared
 * shape (stage 2, PR 8a-i). In force today; PENDING_REFORMS would change the
 * quorum, reduced quorum decisions and absentee votes.
 */
export const MEETINGS = {
  /** First AGM within 3 months after registration of the units plan, called by the executive committee or a member (sch 3 s 3.3). */
  firstAgm: { withinMonthsAfterRegistration: 3, mayBeCalledBy: ["the executive committee", "a member"] },
  /**
   * The developer hands over at the first AGM: statutory books and records,
   * insurance policies, plans and approvals, the developer's maintenance
   * schedule, contracts, warranties, the seal and other documents (sch 3 s 3.4).
   */
  firstAgmHandover: ["statutory books and records", "insurance policies", "plans and approvals", "developer's maintenance schedule", "contracts", "warranties", "seal", "other documents"],
  /** One AGM each financial year; after the first, each within 15 months of the last (sch 3 s 3.2). */
  agmEachFinancialYear: true,
  agmWithinMonthsOfLast: 15,
  /** The executive committee may call a general meeting at any time; on a meeting request (1/4 of unit entitlement) it must hold one within 28 days (sch 3 s 3.5). */
  requestedMeeting: { unitEntitlementFraction: 1 / 4, holdWithinDays: 28 },
  /** Notice goes to each member and each mortgagee's representative (sch 3 s 3.6(1)). */
  noticeTo: ["each member", "each mortgagee's representative"],
  /**
   * Notice reasonably expected to be received at least 14 days before, or 21
   * days if an unopposed or unanimous resolution is to be moved (sch 3
   * s 3.6(2)); retirement village AGMs follow the Retirement Villages Act (s 3.6(3)).
   */
  noticeDays: 14,
  noticeDaysForUnopposedOrUnanimous: 21,
  noticeMeasuredBy: "reasonably expected to be received",
  /** Notice content (sch 3 s 3.7(1), (2)). */
  noticeContents: [
    "time, date and place",
    "whether the person can vote and, if not, why",
    "mortgagee voting notice details",
    "the full text and kind of any unopposed or unanimous motion",
    "a proxy form (to each person entitled to vote)",
    "an absentee voting paper in a form approved by the executive committee",
  ],
  /** AGM notice attachments: the annual financial statements and the general fund budget; for retirement villages, also the proposed annual budget (sch 3 s 3.7(3)). */
  agmNoticeAttachments: ["annual financial statements", "general fund budget"],
  agmNoticeAttachmentsRetirementVillageAlso: ["proposed annual budget"],
  /** Mandatory agenda items (s 41(1)(b), (2); NI2023-528). */
  agenda: {
    everyGeneralMeeting: ["matters in a meeting request", "motions", "maintenance issues and contract renewals", "insurance claims", "general business"],
    agmAlso: ["executive committee election", "structural defects", "maintenance plan review", "fire safety review", "financial statements", "budgets for each fund", "insurance details", "audit", "delegations"],
    firstAgmAlso: ["developer records", "rules", "fire safety systems", "initial maintenance schedule", "defects", "auditor appointment", "executive committee size and election", "insurance", "common seal"],
    source: `${UTMA} s 41(1)(b), (2); ${AGENDA_GUIDELINES}`,
  },
  /** Proceedings are not invalid only because notice was not received; a person not properly notified may ask for an adjournment, which the chair may grant if proceeding would be unfair (sch 3 s 3.8). */
  defectiveNotice: { proceedingsInvalidOnlyForNonReceipt: false, adjournmentOnRequestIfUnfair: true },
  /**
   * Quorum with 3 or more members: people entitled to vote for at least 1/2
   * of the total number of units (1/3 for retirement villages), counted per
   * motion (sch 3 s 3.9(1)(a)). With 2 members, all entitled to vote (s 3.12).
   */
  quorum: { fractionOfUnits: 1 / 2, retirementVillageFractionOfUnits: 1 / 3, countedPerMotion: true },
  /**
   * No standard quorum within 1/2 hour after the motion arises: 2 or more
   * present and entitled to vote form a reduced quorum. No reduced quorum
   * within 1/2 hour: the meeting is adjourned to the same day next week, at
   * the same place and time. At the adjourned meeting, whoever is present and
   * entitled to vote forms the reduced quorum (sch 3 s 3.9(2) to (6)).
   */
  noQuorum: { waitMinutes: 30, reducedQuorumMinPeople: 2, adjournDays: 7, adjournedMeetingReducedQuorum: "whoever is present and entitled to vote" },
  /**
   * Reduced quorum decisions (sch 3 ss 3.10, 3.11): notice to members within
   * 14 days; the decision takes effect 28 days after it is made unless a
   * petition signed by a majority of people entitled to vote disallows it
   * within 28 days, or a standard-quorum meeting confirms it sooner. Notice
   * of an adjourned meeting within 4 days.
   */
  reducedQuorumDecisions: { noticeWithinDays: 14, takesEffectAfterDays: 28, petitionByMajorityWithinDays: 28, confirmedSoonerByStandardQuorumMeeting: true, adjournedMeetingNoticeWithinDays: 4 },
  /** An absentee voter is taken to be present except for making up a quorum (sch 3 s 3.31(4)). */
  absenteeVotesCountTowardsQuorum: false,
  /** Absentee votes: on the executive committee-approved paper, given to the owners corporation before the meeting begins; a valid vote (sch 3 s 3.31). */
  absenteeVotingPaper: { approvedBy: "executive committee", givenBefore: "the meeting begins", validVote: true },
  /** The chair: the executive committee chair, or a person elected by those present and entitled to vote (sch 3 s 3.13). */
  chair: ["the executive committee chairperson", "a person elected by those present and entitled to vote"],
  /** Minutes contents (sch 2 s 2.1(1)(c)). */
  minutesContents: ["date, time and place", "members present, including remote attendees", "proxy and absentee vote details", "resolutions passed and, for special, unopposed and unanimous resolutions, their kind"],
  /** A copy of the minutes to each member within 14 days after the meeting, general and executive committee meetings (sch 2 s 2.1(2)). */
  minutesWithinDays: 14,
  /** Any method that lets participants hear or otherwise know what each other says; participants are taken to be present (sch 3 s 3.1(2), (3); sch 2 s 2.8(3), (4)). */
  electronicAttendance: true,
  /**
   * Electronic voting (sch 3 s 3.31A; UTMR s 10): the owners corporation may
   * adopt voting at the meeting by teleconference, videoconference, email or
   * other electronic means, or pre-meeting electronic voting (not for
   * elections). Members must have reasonable access, and access information
   * goes with the notice. A motion decided wholly by pre-meeting vote cannot
   * be amended at the meeting; if partly decided that way, it cannot be
   * amended in a way that changes its subject matter, and any amendment needs
   * a notice of change with the minutes.
   */
  electronicVoting: {
    mayBeAdopted: true,
    atMeetingMeans: ["teleconference", "videoconference", "email", "other electronic means"],
    preMeetingVoting: true,
    preMeetingVotingForElections: false,
    membersMustHaveReasonableAccess: true,
    accessInformationWithNotice: true,
    wholePreMeetingMotionAmendable: false,
    partPreMeetingMotionAmendableIfSubjectUnchanged: true,
    amendmentNeedsNoticeOfChangeWithMinutes: true,
    source: `${UTMA} sch 3 s 3.31A; ${UTMR} s 10`,
  },
  /** Executive committee meetings: any executive member may call one with at least 7 days' written notice of the business, time and place (sch 2 s 2.8(2)). */
  executiveCommitteeNoticeDays: 7,
  source: `${UTMA} s 41; sch 2 ss 2.1, 2.8; sch 3 ss 3.1 to 3.13, 3.31, 3.31A; ${UTMR} s 10; ${AGENDA_GUIDELINES}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Resolutions (notes section F). One vote per unit; on a poll, voting value by unit entitlement. */
export const RESOLUTIONS = {
  /** General meeting decisions are by ordinary resolution unless the Act says otherwise; amending or revoking needs a resolution of the same kind (sch 3 s 3.14). */
  defaultKind: "ORDINARY",
  amendedOrRevokedBySameKind: true,
  /*
   * Each kind's main test applies above a number of members
   * (`appliesAboveMembers`); the tests for smaller owners corporations sit
   * next to it, each for a range of members (`appliesFromMembers` to
   * `appliesUpToMembers`, inclusive). A platform picks the test by the number
   * of members.
   */
  /**
   * More than 2 members: more votes for than against; on a poll, more voting
   * value for than against (sch 3 s 3.15(1)). With 1 or 2 members: no vote
   * cast against and at least 1 vote cast in favour (s 3.15(2)).
   */
  ORDINARY: {
    appliesAboveMembers: 2,
    basis: "more votes for than against; on a poll, more voting value (unit entitlement) for than against",
    pollAvailable: true,
    oneOrTwoMembers: { appliesFromMembers: 1, appliesUpToMembers: 2, basis: "no vote cast against and at least 1 vote cast in favour", source: `${UTMA} sch 3 s 3.15(2)` },
    source: `${UTMA} sch 3 s 3.15`,
  },
  /**
   * More than 3 members: more votes for than against, AND votes against not
   * more than 1/4 of the total votes that can be cast by people present,
   * including proxy votes. Counted by number of votes unless a poll is taken,
   * then by voting value. It is not 75% of all owners (sch 3 s 3.16(1)).
   * With 3 members, votes against must be less than 1/3 (s 3.16(2)); the
   * notes do not say what the 1/3 is measured against, so that is
   * NOT_CONFIRMED. With 1 or 2 members, no vote cast against and at least 1
   * vote cast in favour (s 3.16(3)).
   */
  SPECIAL: {
    appliesAboveMembers: 3,
    basis: "more votes for than against, and votes against not more than 1/4 of the total votes that can be cast by people present (including proxy votes); by number of votes unless a poll is taken, then by voting value",
    againstNotMoreThanFractionOfVotesThatCanBeCastByPeoplePresent: 1 / 4,
    votesPresentIncludeProxies: true,
    pollAvailable: true,
    threeMembers: {
      appliesFromMembers: 3,
      appliesUpToMembers: 3,
      againstLessThanFraction: 1 / 3,
      /** The notes say "less than 1/3" without saying of what (for example, of the votes that can be cast by people present). */
      againstFractionDenominator: null,
      againstFractionDenominatorStatus: "NOT_CONFIRMED" as RuleStatus,
      source: `${UTMA} sch 3 s 3.16(2)`,
    },
    oneOrTwoMembers: { appliesFromMembers: 1, appliesUpToMembers: 2, basis: "no vote cast against and at least 1 vote cast in favour", source: `${UTMA} sch 3 s 3.16(3)` },
    source: `${UTMA} sch 3 s 3.16`,
  },
  /**
   * No votes against and at least 1 vote for; abstentions do not block it
   * (sch 3 s 3.17). The notes give this test with no member-count limit and
   * no separate test for small owners corporations, so its scope is recorded
   * as not stated (NOT_CONFIRMED) rather than as every member count.
   */
  UNOPPOSED: {
    appliesAboveMembers: null,
    memberScopeStatus: "NOT_CONFIRMED" as RuleStatus,
    basis: "no votes against and at least 1 vote for; abstentions do not block it",
    pollAvailable: false,
    source: `${UTMA} sch 3 s 3.17`,
  },
  /**
   * More than 2 members: every person entitled to vote is present, represented
   * by proxy, or has cast an absentee vote; no votes against; at least 1 for
   * (sch 3 s 3.18(1)). With 1 or 2 members: no vote cast against and at least
   * 1 vote cast in favour (s 3.18(2)).
   */
  UNANIMOUS: {
    appliesAboveMembers: 2,
    basis: "every person entitled to vote is present, represented by proxy or has cast an absentee vote; no votes against; at least 1 vote for",
    pollAvailable: false,
    oneOrTwoMembers: { appliesFromMembers: 1, appliesUpToMembers: 2, basis: "no vote cast against and at least 1 vote cast in favour", source: `${UTMA} sch 3 s 3.18(2)` },
    source: `${UTMA} sch 3 s 3.18`,
  },
  /** Any person present and entitled to vote may demand a poll, on an ordinary or special resolution only (sch 3 s 3.29). */
  pollOnlyFor: ["ORDINARY", "SPECIAL"],
  /** One vote for each unit (sch 3 s 3.22); on a poll, value proportional to unit entitlement (s 3.28). */
  votesPerUnit: 1,
  /** A first-ranking mortgagee may give a notice and vote instead of the owner (sch 3 ss 3.20(2), 3.23, 3.24). */
  firstMortgageeMayVote: true,
  /** The developer cannot vote, or exercise a proxy, on defective building work motions unless the other members pass a special resolution or ACAT allows it (sch 3 s 3.21A). */
  developerExcludedOnDefectsMotions: true,
  /** Examples of what each kind is needed for, as the notes list them. */
  requiredFor: {
    ORDINARY: [
      "budget (s 75)",
      "executive committee of 3 to 7 (s 39)",
      "executive committee election (s 39(4))",
      "manager contract (s 50)",
      "service contract up to 3 years (s 60)",
      "sinking fund plan and amendments (ss 82, 86)",
      "discounts (s 93)",
      "sustainability infrastructure (s 23)",
      "s 29 agreements",
      "structural defects legal action (s 27)",
      "communications officer (s 66)",
      "approving legal action (sch 2 s 2.5)",
    ],
    SPECIAL: [
      "easements (s 20(1))",
      "subletting common property up to 5 years (s 20(3))",
      "special privileges (ss 22, 112A)",
      "alternative rules (s 108)",
      "pet friendly rule (s 112C)",
      "special purpose fund (s 74)",
      "levy method other than unit entitlement (ss 78, 89)",
      "interest rate change (s 94)",
      "borrowing (s 70)",
      "investment directions (s 69)",
      "executive committee of 8 or more (s 39)",
      "service contract over 3 years after the developer control period (s 60(3))",
      "maintenance of class B buildings (s 24(1)(g))",
      "structures on common property (default rule 1.4)",
    ],
    UNOPPOSED: ["bank account exemption for 2 or 3 units (s 68(2))"],
    UNANIMOUS: ["building insurance exemption (s 101(1), (2))"],
  },
  /** Before the first AGM the executive committee is all members, and may act only if authorised by special resolution (s 38). */
  executiveCommitteeBeforeFirstAgmActsOnlyIfAuthorisedBy: "SPECIAL",
  /** Alternative rules take effect on registration; the resolution is void if not lodged within 3 months (s 108A). */
  alternativeRulesLodgeWithinMonths: 3,
  source: `${UTMA} ss 38, 108A; sch 3 ss 3.14 to 3.18, 3.20 to 3.24, 3.28, 3.29; ${UTMR} sch 1`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Proxies (notes section G). */
export const PROXIES = {
  /** Votes may be cast by proxy, whether or not a poll is demanded (sch 3 s 3.26(1)). */
  allowed: true,
  /** Not for more than 1 year after the day of appointment (sch 3 s 3.26(2)(a)). */
  maxDurationYears: 1,
  /** The manager or a service contractor cannot be appointed (sch 3 s 3.26(2)(b)). */
  cannotBeAppointed: ["the manager", "a service contractor"],
  /**
   * More than 20 units: proxies for no more than 5% of the total number of
   * units; otherwise 1. The chair is exempt and must exercise any excess
   * proxies (sch 3 s 3.26(3), (4)). How 5% is rounded is not stated
   * (NOT_CONFIRMED).
   */
  maxPercentOfUnitsAbove20Units: 5,
  maxWhen20UnitsOrFewer: 1,
  roundingStatus: "NOT_CONFIRMED" as RuleStatus,
  chairExemptAndMustExerciseExcess: true,
  /**
   * A developer appointed as proxy under a sale contract cannot exercise 3 or
   * more proxy votes unless each sale contract has a proxy disclosure
   * statement, the use is consistent with it, and the matter is a development
   * matter; otherwise the votes are void (sch 3 s 3.27).
   */
  developerSaleContractProxies: { restrictedFrom: 3, unlessDisclosedConsistentAndDevelopmentMatter: true, otherwiseVoid: true },
  /** A proxy form goes with the notice to each person entitled to vote (sch 3 s 3.7(2)(a)). */
  formWithNotice: true,
  /** Approved Form 2 exists and is in force; an approved form must be used for its purpose (s 146(2)). Its content was not read. */
  approvedForm: { form: PROXY_FORM, inForce: true, contentStatus: "NOT_CONFIRMED" as RuleStatus },
  source: `${UTMA} s 146(2); sch 3 ss 3.7(2)(a), 3.26, 3.27; ${PROXY_FORM}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The executive committee (notes section H). */
export const EXECUTIVE_COMMITTEE = {
  /** Established with the owners corporation: always exists (s 34). */
  alwaysExists: true,
  /** Exercises the owners corporation's functions, as directed by general meeting resolution (s 35). */
  functions: "the owners corporation's functions, as directed by general meeting resolution",
  /**
   * Size (ss 38, 39(2)): before the first AGM, all members; from then, all
   * members if 1 to 3 members; with 4 or more, set at a general meeting,
   * 3 to 7 by ordinary resolution or 8 or more by special resolution.
   */
  size: {
    beforeFirstAgm: "all members",
    everyMemberUpToMembers: 3,
    fromMembers: 4,
    byOrdinaryResolution: { min: 3, max: 7 },
    bySpecialResolutionAtLeast: 8,
  },
  /**
   * Eligibility: a "qualified person", an owner or the representative of a
   * company or part-owners, but not the manager or a manager's associate
   * (business partner, close friend or family member) (s 39(4), (7)).
   */
  eligibleUnlessManagerOrAssociate: true,
  /** Elected at each AGM to hold office to the next; removed by an ordinary resolution electing a replacement; the committee may fill casual vacancies (s 39(4) to (6)). */
  term: "from one AGM to the next",
  removalBy: "ordinary resolution electing a replacement",
  casualVacanciesFilledByCommittee: true,
  /** Chairperson, secretary and treasurer; one person may hold 2 or more (s 40). */
  officeBearers: ["chairperson", "secretary", "treasurer"],
  onePersonMayHoldSeveral: true,
  /** Office bearer functions (ss 41 to 43). */
  officeBearerFunctions: {
    chairperson: ["chairs meetings", "sets agendas under the guidelines"],
    secretary: ["notices", "minutes", "non-financial records", "certificates"],
    treasurer: ["levy notices", "banking", "financial records", "arranging the audit", "financial statements"],
  },
  /**
   * Quorum (sch 2 s 2.9, formula images): odd number of members, (total + 1)
   * ÷ 2; even, (total ÷ 2) + 1.
   */
  quorum: { oddMembers: "(total + 1) ÷ 2", evenMembers: "(total ÷ 2) + 1" },
  /**
   * The same quorum as a rule: more than half the members, that is
   * floor(total ÷ 2) + 1. For an odd total this equals (total + 1) ÷ 2, and
   * for an even total (total ÷ 2) + 1, so it matches both formulas.
   */
  quorumRule: "MORE_THAN_HALF",
  /** Decided by a majority of members present and voting; the chair has a casting vote unless there are only 2 members, who decide unanimously (sch 2 ss 2.10, 2.11). */
  decidedBy: "majority of members present and voting",
  chairCastingVoteUnlessTwoMembers: true,
  /**
   * Delegation (ss 44, 58): to a subcommittee or executive members, which the
   * owners corporation may restrict by ordinary resolution; the owners
   * corporation or the executive committee may delegate to the manager in writing.
   */
  delegation: { to: ["a subcommittee", "executive members"], restrictedBy: "ORDINARY", toManagerInWriting: true },
  /** Engaging people: short-term only, or for functions a manager or service contractor would not usually do; may be limited by ordinary resolution (s 45). */
  engagingPeople: "short-term only, or for functions a manager or service contractor would not usually do",
  /**
   * No general dollar spending limit in the UTMA or UTMR (CONFIRMED absent).
   * Spending is controlled by the budget or an ordinary resolution (s 77) and
   * the legal action threshold (sch 2 s 2.5; UTMR s 9; DEBT_RECOVERY).
   */
  spendingLimitCents: null,
  /** May approve minor common property use that does not unreasonably interfere with others (for example an air conditioner or awning) (sch 2 s 2.4). */
  mayApproveMinorCommonPropertyUse: true,
  /** Code of conduct (sch 1 pt 1.1); not civilly liable for honest conduct without recklessness, liability attaching to the owners corporation (ss 46, 47). */
  codeOfConduct: "sch 1 pt 1.1",
  protectedForHonestConductWithoutRecklessness: true,
  source: `${UTMA} ss 34, 35, 38 to 47, 58, 77; sch 1 pt 1.1; sch 2 ss 2.4, 2.5, 2.9 to 2.11; ${UTMR} s 9`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The manager (notes section I). */
export const MANAGER = {
  /**
   * Who may be engaged (s 50(1)): (a) a real estate agent licence holder under
   * the Agents Act 2003 (the s 50 note says a conditional licence may be
   * issued to someone acting only as an owners corporation manager); (b) a
   * member; (c) someone who manages no other owners corporation and whose
   * income from the role is not their primary source of income.
   */
  whoMayBeEngaged: [
    "a holder of a real estate agent licence under the Agents Act 2003 (the s 50 note says a conditional licence may be issued to someone acting only as an owners corporation manager)",
    "a member",
    "a person who manages no other owners corporation and whose income from the role is not their primary source of income",
  ],
  /**
   * GUIDANCE (Access Canberra): a conditional real estate agent licence is
   * needed if the person has no full or conditional licence, is not a member,
   * and gets their primary income from the role; CPD is a condition of
   * renewal; fees: 3 years with yearly payments $298.00, 3 years in full
   * $900.00. The Agents Act s 34 text was not read.
   */
  licensing: {
    conditionalLicenceNeededIf: ["no full or conditional licence", "not a member", "primary income from the role"],
    cpdConditionOfRenewal: true,
    feeThreeYearsYearlyPaymentsCents: 29_800,
    feeThreeYearsInFullCents: 90_000,
    status: "GUIDANCE" as RuleStatus,
    source: `${ACCESS_CANBERRA}; ${UTMA} s 50 note`,
  },
  /** The contract states the manager's remuneration and the functions to be exercised (s 50(2)); approved by ordinary resolution (s 50(1)). */
  contractStates: ["the manager's remuneration", "the functions to be exercised"],
  approvedBy: "ORDINARY",
  /** At most 3 years, including renewals and extensions; a longer contract is taken to be for 3 years (s 51). */
  maxTermYears: 3,
  /** In the developer control period: limited to 2 years and disclosed in sale contracts, unless ACAT authorises (ss 33(a), 33A). */
  developerControlPeriodMaxTermYears: 2,
  developerControlPeriodDisclosedInSaleContracts: true,
  developerControlPeriodLimitsApplyUnlessAcatAuthorises: true,
  /** Transfer by ordinary resolution, decided within 30 days of a written request or approval is deemed; approval must not be unreasonably withheld, and no fee may be charged beyond expenses (s 53). */
  transfer: { by: "ORDINARY", decideWithinDays: 30, deemedApprovedIfNotDecided: true, approvalNotUnreasonablyWithheld: true, noFeeBeyondExpenses: true },
  /**
   * Ending (ss 54, 55): for a remedial breach after a 14-day notice;
   * misbehaviour; bankruptcy or insolvency; certain convictions. Must end for
   * absence without approved leave for 14 consecutive days or 28 days in 12
   * months, or for incapacity.
   */
  ending: { remedialBreachNoticeDays: 14, mandatoryAbsenceConsecutiveDays: 14, mandatoryAbsenceDaysIn12Months: 28 },
  /** Public liability insurance of at least $10,000,000 (s 57(2); UTMR s 5). */
  publicLiabilityMinCents: 1_000_000_000,
  /** Code of conduct (s 56; sch 1 pt 1.2), including informing the owners corporation of significant developments, competitive prices and showing records kept on request. No periodic reporting interval is prescribed. */
  reportingIntervalPrescribed: false,
  /** Cannot be a proxy (sch 3 s 3.26(2)(b)) and is not a qualified person for the executive committee (s 39(7)). */
  mayBeProxy: false,
  mayBeOnExecutiveCommittee: false,
  source: `${UTMA} ss 33, 33A, 39(7), 49 to 58; sch 1 pt 1.2; sch 3 s 3.26(2)(b); ${UTMR} s 5`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Financial statements, audit and the financial year (notes section K). */
export const AUDIT = {
  /**
   * Audited before the AGM if there are more than 100 units, or the annual
   * budget is more than $250,000 (sch 2 s 2.1(1)(g)); no other figures are
   * prescribed in UTMR R6.
   */
  requiredAboveUnits: 100,
  requiredAboveAnnualBudgetCents: 25_000_000,
  before: "the AGM",
  /**
   * The "annual budget" for the test (sch 2 s 2.1A): total general fund
   * contribution + total sinking fund contribution + other general fund income
   * for the year + other amounts held at the start of the financial year (for
   * example sinking fund and special purpose fund balances).
   */
  annualBudgetIncludes: [
    "total general fund contribution",
    "total sinking fund contribution",
    "other general fund income for the year",
    "other amounts held at the start of the financial year, for example sinking fund and special purpose fund balances",
  ],
  includesFundBalancesAtStartOfYear: true,
  /** The auditor is not a member or manager and did not prepare the accounts (dictionary "audit"). */
  auditorIndependence: ["not a member", "not the manager", "did not prepare the accounts"],
  /**
   * The auditor is one of: a CA ANZ chartered accountant with a Certificate of
   * Public Practice; a CPA with a Public Practice Certificate; a member or
   * fellow of the IPA; or an ASIC-registered company auditor with current
   * professional indemnity insurance (UTMR s 12).
   */
  auditorQualifications: [
    "CA ANZ chartered accountant with a Certificate of Public Practice",
    "CPA with a Public Practice Certificate",
    "member or fellow of the IPA",
    "ASIC-registered company auditor with current professional indemnity insurance",
  ],
  /** ACAT may order stated accounts to be audited (s 129(1)(h)). */
  acatMayOrderAudit: true,
  /** 12 months from 1 July, or another 12-month period the owners corporation decides (dictionary "financial year"). */
  financialYear: { defaultStarts: "1 July", mayChooseOther12MonthPeriod: true },
  /**
   * Books of account record assets and liabilities, including amounts owed to
   * and by the owners corporation, and all receipts and payments (sch 2
   * s 2.1(1)(f)). Annual statements, prepared and certified by the treasurer,
   * cover the period since the last statements to a stated day, are presented
   * within 3 months of that day, and go to each AGM with any audit opinion
   * (sch 2 s 2.2; s 43(g)).
   */
  statementsPresentedWithinMonthsOfStatedDay: 3,
  statementsCertifiedBy: "treasurer",
  source: `${UTMA} ss 43(g), 129(1)(h); sch 2 ss 2.1(1)(f), (g), 2.1A, 2.2; dictionary "audit", "financial year"; ${UTMR} s 12`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Insurance (notes section L). */
export const INSURANCE = {
  /**
   * All buildings on the land, for their replacement value from time to time,
   * against the listed risks, plus reinstatement costs (s 100(1), (2)).
   */
  buildingBasis: "replacement value from time to time",
  /** Among the listed risks ("and so on": the notes give examples, not the full list). */
  listedRisksInclude: ["fire", "storm", "earthquake", "explosion", "riot", "malicious damage", "bursting pipes", "impact"],
  includesReinstatementCosts: ["debris removal", "professional fees"],
  /** The owners corporation, or the building management committee if a building management statement applies (s 100(5)); it lodges claims and pays any excess (s 100A). */
  responsible: "the owners corporation, or the building management committee where a building management statement applies",
  responsibleEntityLodgesClaims: true,
  responsibleEntityPaysExcess: true,
  /**
   * Exemptions (s 101; UTMR s 6): replacement value of all common property
   * buildings under $10,000, by unanimous resolution, until the next AGM (not
   * registered); class B, by unanimous resolution, effective on registration
   * and void if not lodged within 3 months.
   */
  exemptions: {
    smallCommonProperty: { replacementValueBelowCents: 1_000_000, by: "UNANIMOUS", lastsUntil: "the next AGM", registered: false },
    classB: { by: "UNANIMOUS", effectiveOnRegistration: true, lodgeWithinMonths: 3 },
  },
  /** Public liability for the common property of at least $10,000,000 (s 102(2); UTMR s 7). */
  publicLiabilityMinCents: 1_000_000_000,
  /**
   * No valuation frequency is prescribed (CONFIRMED absent): the Act allows
   * regulations on valuation (s 100(3)(d)) but UTMR R6 makes none. The AGM is
   * told "details of any recent valuation" (sch 2 s 2.3(1)(c)).
   */
  valuationEveryYears: null,
  /** AGM insurance disclosure (sch 2 s 2.3). */
  agmDisclosure: ["insurer", "cover", "recent valuation", "type", "premium", "excess", "expiry", "commissions and other benefits"],
  /** Insurance money applied without delay to rebuilding or reinstating (s 103). */
  moneyAppliedWithoutDelayToReinstatement: true,
  source: `${UTMA} ss 100, 100A, 101 to 103; sch 2 s 2.3; ${UTMR} ss 6, 7`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Records, the register and inspection (notes section M). */
export const RECORDS = {
  /** The corporate register (ss 113, 114); may be electronic. */
  register: ["owners", "representatives", "mortgagee representatives", "notified interest holders", "occupiers", "executive members", "easements", "sublessees"],
  /** Owners notify within 14 days after a change of ownership, address or occupancy, or a vacancy expected to last more than 30 days (s 115(1)). */
  ownerNotificationWithinDays: 14,
  vacancyNotifiableIfExpectedOverDays: 30,
  /** Other records kept (sch 2 s 2.1(1)). */
  kept: ["minutes of executive committee and general meetings", "court orders", "planning authority authorisations", "books of account", "an up-to-date compilation of alternative rules"],
  /** At least 7 years for documents, records and books of account; copies to any member on request (sch 2 s 2.1(3)). */
  retentionYears: 7,
  copiesToAnyMemberOnRequest: true,
  /** Minutes, records and books may be kept and distributed electronically (sch 2 s 2.1(4)). */
  electronic: true,
  /**
   * Inspection and copies, each within 14 days (ss 116 to 118, 120A; UTMR s 8;
   * DI2026-115): the register for a fee fixed by the owners corporation of no
   * more than $10 plus GST; executive member names and addresses, and
   * insurance documents, free; the register and any other records under
   * s 120A (including a buyer under contract; privileged documents may be
   * withheld in a dispute) for no more than the determined fee: from 1 Jul
   * 2026, $134.00 including GST, nil if the person also requested a sale
   * certificate.
   */
  inspection: {
    withinDays: 14,
    writtenRequest: true,
    registerFeeMaxCentsExGst: 1_000,
    executiveMemberNamesFree: true,
    insuranceDocumentsFree: true,
    generalRecordsFeeMaxCentsIncGst: 13_400,
    generalRecordsFeeFrom: "2026-07-01",
    generalRecordsFeeNilWithSaleCertificate: true,
    buyerUnderContractMayInspect: true,
    privilegedMayBeWithheldInDispute: true,
    source: `${UTMA} ss 116 to 118, 120A; ${UTMR} s 8; ${FEES}`,
  },
  /** Each executive member commits an offence (50 penalty units) if a request is not complied with, subject to defences (s 121). */
  nonComplianceOffencePenaltyUnits: 50,
  /** Eligible person: owner or interest holder; company representative; anyone authorised in writing by them; the territory planning authority (dictionary). */
  eligiblePerson: ["owner or interest holder", "company representative", "a person authorised in writing by one of them", "the territory planning authority"],
  source: `${UTMA} ss 113 to 118, 120A, 121; sch 2 s 2.1; dictionary "eligible person"; ${UTMR} s 8; ${FEES}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/*
 * The meeting rules in the shared shape (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026), from MEETINGS, RESOLUTIONS and RECORDS. Each resolution rule
 * carries its source and status; MEETING_RULES_STATUS gives those of the
 * other parts. What the count at a meeting records and refuses:
 * - whether the meeting had a standard quorum for the motion (sch 3 s 3.9:
 *   quorum is counted for each motion) is the chair's answer
 *   (quorumAttestation, since stage 2, PR 8a-ii, 29 Oct 2026), never worked
 *   out or assumed: not answered, the count is refused; "no" (a reduced
 *   quorum, whose decision takes effect later, ss 3.10, 3.11) is refused
 *   until those decisions are tracked (stage 2, PR 8b);
 * - the test is chosen by the building's number of members, recorded in its
 *   building rules (MEMBER_BAND); none recorded refuses the count;
 * - an ordinary resolution: more votes for than against, by unit entitlement
 *   on a poll (s 3.15(1)); equal votes refused;
 * - a special resolution with 4 or more members: more votes for than against
 *   and the votes against not more than 1/4 of the votes those present could
 *   cast (s 3.16(1)). Since stage 2, PR 8a-ii the chair gives the units
 *   present or represented (votesPresentAttestation), which must match the
 *   units entered at the item, so a unit present that did not vote is entered
 *   as abstaining; a unit barred for money owed is present but cannot cast a
 *   vote. Equal votes refused; with 3 members refused (s 3.16(2),
 *   NOT_CONFIRMED);
 * - a unanimous resolution with 3 or more members: a vote or an abstention
 *   recorded for every unit, none against and at least 1 for (s 3.18(1));
 * - with 1 or 2 members (ss 3.15(2), 3.16(3), 3.18(2)): no vote against and
 *   at least 1 vote for, counted since stage 2, PR 8a-ii (29 Oct 2026,
 *   Matthew Wrigley's decision); the debtor rule does not apply (s 3.20(3))
 *   and the chair's quorum answer covers s 3.12 (everyone entitled to vote
 *   present). There is no casting vote (s 3.30), and none is needed: any
 *   vote against fails the test;
 * - an unopposed resolution (s 3.17, its member scope NOT_CONFIRMED) is
 *   refused;
 * - a poll on an ordinary or special resolution only (s 3.29);
 * - common property rows are not counted as units;
 * - an item with no resolution category cannot be recorded as resolved at a
 *   general meeting, since nothing counts it (a StrataVerze choice).
 * The debtor rule (s 3.20(3): with 3 or more members, no vote on an ordinary
 * or special resolution while an amount is unpaid) is applied since stage 2,
 * PR 8a-ii (29 Oct 2026), in the same change as the chair's quorum answer:
 * debtorsMayVoteOn lists the categories a debtor may still vote on, and
 * debtorRuleAppliesWhen limits the rule to 3 or more members. With no band
 * recorded the rule applies (it fails closed). An unpaid amount is read as an
 * overdue contribution notice (FOR_REVIEW).
 */

const ACT_TIE =
  `The votes are equal. Whether the chair has a casting vote is not confirmed (with 2 members there is none, ${UTMA} sch 3 s 3.30), and StrataVerze does not record one, so the count cannot decide it`;
const ACT_ONE_OR_TWO_NO_QUORUM =
  `With 1 or 2 members the meeting has a quorum only when everyone entitled to vote is present, and without it the meeting is adjourned (${UTMA} sch 3 s 3.12), so the votes cannot decide this motion`;
const ACT_THREE_SPECIAL =
  `The special resolution test for an owners corporation with 3 members (votes against less than 1/3, ${UTMA} sch 3 s 3.16(2)) does not say what the 1/3 is measured against, so StrataVerze cannot count it until that is confirmed`;
const ACT_UNOPPOSED =
  `Which owners corporations an unopposed resolution applies to is not confirmed (${UTMA} sch 3 s 3.17), so StrataVerze cannot count it yet`;
const ACT_UNKNOWN_BAND =
  "The building's number of members recorded is not one StrataVerze knows, so this resolution's test cannot be chosen. Record it again in the building rules";

const ACT_GENERAL_QUORUM = {
  basis: "FRACTION_OF_UNITS_PER_MOTION",
  fractionOfUnits: MEETINGS.quorum.fractionOfUnits,
  reducedQuorumMinPeople: MEETINGS.noQuorum.reducedQuorumMinPeople,
  waitMinutes: MEETINGS.noQuorum.waitMinutes,
  source: `${UTMA} sch 3 s 3.9`,
  status: "CONFIRMED",
} as const;

export const MEETING_RULES: MeetingRuleSet = {
  state: "ACT",
  version: "ACT-2026.1",
  effectiveFrom: "2026-10-28",
  noticePeriods: {
    AGM: MEETINGS.noticeDays,
    EGM: MEETINGS.noticeDays,
    FIRST_AGM: MEETINGS.noticeDays,
    COMMITTEE: MEETINGS.executiveCommitteeNoticeDays,
  },
  minutesDeadlines: {
    AGM: MEETINGS.minutesWithinDays,
    EGM: MEETINGS.minutesWithinDays,
    FIRST_AGM: MEETINGS.minutesWithinDays,
    COMMITTEE: MEETINGS.minutesWithinDays,
  },
  quorumRules: { AGM: ACT_GENERAL_QUORUM, EGM: ACT_GENERAL_QUORUM, FIRST_AGM: ACT_GENERAL_QUORUM },
  resolutionCategories: {
    ORDINARY: {
      basis: "BY_VARIANT",
      withoutQuorum: "DECIDED_LATER",
      variants: [
        {
          when: { memberBands: ["ONE_OR_TWO"] },
          rule: { basis: "NONE_AGAINST_AT_LEAST_ONE_FOR", noQuorumRefusal: ACT_ONE_OR_TWO_NO_QUORUM },
          source: RESOLUTIONS.ORDINARY.oneOrTwoMembers.source,
          status: "CONFIRMED",
        },
        {
          when: { memberBands: ["THREE", "FOUR_OR_MORE"] },
          rule: { basis: "COUNT_MAJORITY", tieRefusedBecause: ACT_TIE },
          source: `${UTMA} sch 3 s 3.15(1)`,
          status: "CONFIRMED",
        },
      ],
      noVariantFitsRefusal: ACT_UNKNOWN_BAND,
      source: RESOLUTIONS.ORDINARY.source,
      status: "CONFIRMED",
    },
    SPECIAL: {
      basis: "BY_VARIANT",
      withoutQuorum: "DECIDED_LATER",
      variants: [
        {
          when: { memberBands: ["ONE_OR_TWO"] },
          rule: { basis: "NONE_AGAINST_AT_LEAST_ONE_FOR", noQuorumRefusal: ACT_ONE_OR_TWO_NO_QUORUM },
          source: RESOLUTIONS.SPECIAL.oneOrTwoMembers.source,
          status: "CONFIRMED",
        },
        {
          when: { memberBands: ["THREE"] },
          rule: { basis: "AGAINST_SHARE_OF_VOTES_PRESENT", refusedBecause: ACT_THREE_SPECIAL },
          source: RESOLUTIONS.SPECIAL.threeMembers.source,
          status: RESOLUTIONS.SPECIAL.threeMembers.againstFractionDenominatorStatus,
        },
        {
          when: { memberBands: ["FOUR_OR_MORE"] },
          rule: {
            basis: "AGAINST_SHARE_OF_VOTES_PRESENT",
            againstNotMoreThanFractionOfVotesPresent: RESOLUTIONS.SPECIAL.againstNotMoreThanFractionOfVotesThatCanBeCastByPeoplePresent,
            tieRefusedBecause: ACT_TIE,
          },
          source: `${UTMA} sch 3 s 3.16(1)`,
          status: "CONFIRMED",
        },
      ],
      noVariantFitsRefusal: ACT_UNKNOWN_BAND,
      source: RESOLUTIONS.SPECIAL.source,
      status: "CONFIRMED",
    },
    // Never on an agenda: its member scope is NOT_CONFIRMED (and its 21 days' notice is not checked).
    UNOPPOSED: {
      basis: "NONE_AGAINST_AT_LEAST_ONE_FOR",
      refusedBecause: ACT_UNOPPOSED,
      withoutQuorum: "DECIDED_LATER",
      source: RESOLUTIONS.UNOPPOSED.source,
      status: RESOLUTIONS.UNOPPOSED.memberScopeStatus,
    },
    // Not on an agenda either: its 21 days' notice (sch 3 s 3.6(2)) is not checked.
    UNANIMOUS: {
      basis: "BY_VARIANT",
      withoutQuorum: "DECIDED_LATER",
      variants: [
        {
          when: { memberBands: ["ONE_OR_TWO"] },
          rule: { basis: "NONE_AGAINST_AT_LEAST_ONE_FOR", noQuorumRefusal: ACT_ONE_OR_TWO_NO_QUORUM },
          source: RESOLUTIONS.UNANIMOUS.oneOrTwoMembers.source,
          status: "CONFIRMED",
        },
        {
          when: { memberBands: ["THREE", "FOUR_OR_MORE"] },
          rule: { basis: "EVERY_LOT_RECORDED_NONE_AGAINST" },
          source: `${UTMA} sch 3 s 3.18(1)`,
          status: "CONFIRMED",
        },
      ],
      noVariantFitsRefusal: ACT_UNKNOWN_BAND,
      source: RESOLUTIONS.UNANIMOUS.source,
      status: "CONFIRMED",
    },
  },
  retention: { generalYears: RECORDS.retentionYears, secretBallotMonths: null },
  preMeetingEvoting: null,
  resolutionLabels: {
    ORDINARY: { short: "Ordinary", full: "Ordinary Resolution" },
    SPECIAL: { short: "Special", full: "Special Resolution" },
    UNOPPOSED: { short: "Unopposed", full: "Unopposed Resolution" },
    UNANIMOUS: { short: "Unanimous", full: "Unanimous Resolution" },
  },
  generalMeetingCategories: ["ORDINARY", "SPECIAL"],
  committeeCategories: ["ORDINARY"],
  committeeCategoryRefusal:
    "Only an ordinary resolution can go on an executive committee meeting agenda. Put this motion on a general meeting agenda instead.",
  motionCategories: ["ORDINARY", "SPECIAL"],
  // With 3 or more members, a unit owing an amount votes on neither an ordinary nor a special resolution (s 3.20(3)).
  debtorsMayVoteOn: ["UNANIMOUS", "UNOPPOSED"],
  debtorRuleAppliesWhen: { selector: MEMBER_BAND.key, in: ["THREE", "FOUR_OR_MORE"] },
  pollCategories: RESOLUTIONS.pollOnlyFor,
  excludeCommonPropertyRows: true,
  // Every outcome at a general meeting comes from the count, so an item with no category cannot be recorded as resolved there.
  categoryRequiredAtGeneralMeetings: true,
  memberBandSelector: MEMBER_BAND.key,
  // The chair's answers for each motion (Matthew Wrigley's decision of 29 Oct 2026, DECISIONS): never worked out or assumed.
  quorumAttestation: {
    label: "Standard quorum present for this motion",
    help: `Yes if people entitled to vote for at least ${MEETINGS.quorum.fractionOfUnits === 1 / 2 ? "half" : `${Math.round(MEETINGS.quorum.fractionOfUnits * 100)}%`} of the units were present in person or by proxy when this motion was decided. Absentee votes do not count toward it, and neither does a unit that cannot vote because an amount is unpaid. With 1 or 2 members everyone entitled to vote must be present. Answer No if only a reduced quorum was present: StrataVerze does not record those decisions yet.`,
    source: `${UTMA} sch 3 ss 3.9, 3.12, 3.31(4)`,
    status: "STRATAVERZE",
  },
  votesPresentAttestation: {
    label: "Units present or represented for this motion",
    help: "Count every unit whose voter was present in person, by proxy or by an absentee vote when this motion was decided, including those that did not vote and those that cannot vote because an amount is unpaid. Enter each of them in the votes for this motion, as Abstain if it did not vote.",
    source: `${UTMA} sch 3 ss 3.16(1), 3.31(4)`,
    status: "STRATAVERZE",
  },
  notes:
    "Draft, from the ACT pack (not signed off), VIC, ACT and WA stage 2, PR 8a-i and 8a-ii. Standard quorum is the chair's answer for each motion and the units present for a special resolution are the chair's count; a reduced quorum is refused until its decisions are tracked.",
};

/** How far each part of MEETING_RULES not carrying its own status is checked. */
export const MEETING_RULES_STATUS = {
  noticePeriods: {
    status: "CONFIRMED" as RuleStatus,
    source: `${UTMA} sch 2 s 2.8(2); sch 3 s 3.6(2)`,
    note: "14 days for a general meeting and 7 days for an executive committee meeting. A general meeting's notice must reasonably be expected to be received 14 days before, which the whole-day check does not test, and 21 days where an unopposed or unanimous resolution is moved, neither of which is offered on an agenda.",
  },
  minutesDeadlines: { status: "CONFIRMED" as RuleStatus, source: `${UTMA} sch 2 s 2.1(2)`, note: "A copy to each member within 14 days, general and executive committee meetings." },
  quorumRules: {
    status: "CONFIRMED" as RuleStatus,
    source: `${UTMA} sch 3 ss 3.9 to 3.12`,
    note: "Held as data; not evaluated. Since stage 2, PR 8a-ii whether there was a standard quorum is the chair's answer for each motion (quorumAttestation). The executive committee's quorum (more than half) has no shared basis, so it is not held.",
  },
  retention: { status: "CONFIRMED" as RuleStatus, source: RECORDS.source, note: "At least 7 years; no separate period for ballot papers was found." },
  debtorsMayVoteOn: {
    status: "CONFIRMED" as RuleStatus,
    source: `${UTMA} sch 3 s 3.20(3)`,
    note: "With 3 or more members a unit cannot vote on an ordinary or special resolution while an amount is unpaid (since stage 2, PR 8a-ii: debtorsMayVoteOn with debtorRuleAppliesWhen on the number of members). With no number of members recorded the rule applies (a StrataVerze choice, it fails closed). An unpaid amount is read as an overdue contribution notice (a StrataVerze reading, FOR_REVIEW).",
  },
  quorumAttestation: {
    status: "STRATAVERZE" as RuleStatus,
    source: `${UTMA} sch 3 ss 3.9, 3.16(1), 3.31(4)`,
    note: "Whether there was a standard quorum is the chair's answer for each motion, and the units present for a special resolution the chair's count, checked against the units entered. Neither is worked out or assumed, until attendance is recorded (Matthew Wrigley's decision of 29 Oct 2026, DECISIONS).",
  },
  labelsAndLists: { status: "STRATAVERZE" as RuleStatus, source: "StrataVerze", note: "The names, the categories each meeting and the motions list offer, pre-meeting voting not offered and common property rows not counted are StrataVerze choices (FOR_REVIEW)." },
} as const;

/** Owners corporation certificates for sale and rental (notes section N). */
export const SALE_CERTIFICATE = {
  /** Unit title sale certificate, sale update certificate, rental certificate (s 119(1)). */
  kinds: ["unit title sale certificate", "unit title sale update certificate", "unit title rental certificate"],
  /** An eligible person for the unit or common property, including a person who has contracted to buy the unit (s 119(1), (8)). */
  applicants: "an eligible person, including a person who has entered a contract to buy the unit",
  /** In writing, with the fee fixed by the owners corporation up to the determined maximum (s 119(6)). */
  requestInWriting: true,
  /** Sale and sale update: 14 days. Rental: 14 days if the owners corporation has the determined information, otherwise 6 weeks (s 119(3), (8)). */
  saleWithinDays: 14,
  rentalWithinDaysIfInformationHeld: 14,
  rentalOtherwiseWithinWeeks: 6,
  /** A sale update certificate only within 4 months after the sale certificate was given (s 119(2)). */
  updateWithinMonthsOfSaleCertificate: 4,
  /** A rental certificate expires 5 years after it is given; changes are notified in that period (ss 119(4), 119B). */
  rentalCertificateLifeYears: 5,
  /** Contents of sale and sale update certificates (DI2026-22 cl 4(1) to (17)). */
  contents: {
    items: [
      "executive committee contacts",
      "manager contacts",
      "for each insurance policy: type, insurer, cover, certificate of currency and valuation report (if available)",
      "for the general, sinking and special purpose funds: current unit contribution, due date, period, paid or unpaid status and fund balances",
      "sinking fund plan and forecast (if available)",
      "whether the developer control period has expired",
      "borrowings",
      "sustainability infrastructure and who owns it",
      "service contract summary",
      "Crown lease extension application",
      "where records can be inspected",
      "minutes for the past 2 years (update certificate: since the sale certificate)",
      "swimming pool documents",
      "embedded network retailer details",
      "other no-choice utility services",
    ],
    source: `${SALE_DETERMINATION} cl 4(1) to (17)`,
  },
  /** Maximum fees from 1 Jul 2026, including 10% GST (DI2026-115). */
  feesFrom: "2026-07-01",
  maxFeeCentsIncGst: { SALE: 35_300, SALE_UPDATE: 17_500, RENTAL: 35_300 },
  /**
   * The maximum fees by period, so a request can be checked against the fee
   * in force on its date. The notes give the 2025-26 amounts alongside the
   * DI2026-115 fees, which replace them from 1 Jul 2026. The date the 2025-26
   * fees started is not recorded in the notes (NOT_CONFIRMED).
   */
  feeHistory: [
    {
      period: "2025-26",
      effectiveFrom: null,
      effectiveFromStatus: "NOT_CONFIRMED" as RuleStatus,
      replacedOn: "2026-07-01",
      maxFeeCentsIncGst: { SALE: 34_200, SALE_UPDATE: 17_000, RENTAL: 34_200 },
      source: FEES,
    },
    {
      period: "2026-27",
      effectiveFrom: "2026-07-01",
      effectiveFromStatus: "CONFIRMED" as RuleStatus,
      replacedOn: null,
      maxFeeCentsIncGst: { SALE: 35_300, SALE_UPDATE: 17_500, RENTAL: 35_300 },
      source: FEES,
    },
  ],
  /** The owners corporation is estopped against a person who acts honestly on the certificate (s 120). */
  estoppel: true,
  /** Rental certificate contents are set by DI2026-21, which was not opened (NOT_CONFIRMED). */
  rentalContentsStatus: "NOT_CONFIRMED" as RuleStatus,
  source: `${UTMA} ss 119, 119B, 120; ${SALE_DETERMINATION}; ${FEES}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Disputes (notes section O). */
export const DISPUTES = {
  /**
   * No mandatory internal dispute process in the UTMA (CONFIRMED). ACAT
   * advises trying to resolve it first (GUIDANCE). Tools in the Act: a rule
   * infringement notice (s 109, authorised by ordinary resolution of the
   * executive committee; non-compliance an offence of up to 5 penalty units),
   * an owner's or occupier's request for one (s 111, notified within 14 days),
   * and the communications officer (s 67, who cannot mediate).
   */
  internalProcessMandatory: false,
  acatAdvisesTryingFirst: { value: true, status: "GUIDANCE" as RuleStatus, source: ACAT_UNIT_TITLES },
  ruleInfringementNotice: { authorisedBy: "ordinary resolution of the executive committee", nonComplianceMaxPenaltyUnits: 5, ownerRequestNotifiedWithinDays: 14 },
  communicationsOfficerMayMediate: false,
  tribunal: "ACAT",
  /** Any 2 or more of: the owners corporation, executive committee, owner or occupier, manager, service contractor, executive member (s 125). */
  parties: ["owners corporation", "executive committee", "owner or occupier", "manager", "service contractor", "executive member"],
  /** Animal disputes only by the owners corporation against the owner or occupier; return of property by a former manager (s 126). */
  restricted: ["animal disputes (only the owners corporation against the owner or occupier)", "return of property by a former manager"],
  /** Invalid alternative rule declaration; for irregularity or an unfair levy method, apply within 3 months (ACAT may extend to no more than 12 months) (s 127). */
  ruleChallengeWithinMonths: 3,
  ruleChallengeExtendableToMonths: 12,
  /** ACAT orders include payment of up to $1,000 (s 129). */
  orders: [
    "do or refrain from doing something",
    "exercise a function",
    "ancillary acts",
    "pay up to $1,000",
    "declare meetings, resolutions or rules void or invalid",
    "merits review of resolutions",
    "give effect to an unreasonably opposed motion",
    "audit",
    "records access",
    "make or repeal rules",
    "appoint an administrator",
    "animal removal",
    "any other necessary order",
  ],
  paymentOrderMaxCents: 100_000,
  /** ACAT may appoint an administrator on application by the owners corporation, a creditor, an owner or interest holder, or the director-general (ss 136 to 141). */
  administratorApplicants: ["owners corporation", "a creditor", "an owner or interest holder", "the director-general"],
  /**
   * GUIDANCE (ACAT): usually a directions hearing, then a conference or
   * mediation, then a hearing; appeal within 28 days; ACAT "generally" cannot
   * order legal costs. The levy debt forum and the $25,000 civil limit are in
   * DEBT_RECOVERY (GUIDANCE).
   */
  process: { steps: ["directions hearing", "conference or mediation", "hearing"], appealWithinDays: 28, legalCostsGenerallyNotOrdered: true, status: "GUIDANCE" as RuleStatus, source: ACAT_UNIT_TITLES },
  source: `${UTMA} ss 67, 109 to 111, 125 to 127, 129, 136 to 141; ${ACAT_UNIT_TITLES}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Hardship or payment plan information on notices: absent. The required
 * contents of s 79(2) and s 90(2) have no hardship, payment plan or
 * assistance item, and no "hardship" or "payment plan" text appears anywhere
 * in UTMA R25 or UTMR R6.
 */
export const HARDSHIP = {
  statementRequiredOnNotices: false,
  statutoryPaymentPlans: false,
  source: `${UTMA} ss 79(2), 90(2); ${UTMR} (read in full)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The ACT's words for the things the platform names (notes section P). The
 * shared keys are those SharedTerminology lists; the rest are the ACT's own.
 */
export const TERMINOLOGY = {
  ownersCorporation: "owners corporation",
  committee: "executive committee",
  act: "Unit Titles (Management) Act 2011",
  /** The research notes' abbreviation; no official short title was recorded. */
  actShort: "UTMA",
  jurisdictionShort: "ACT",
  /** ACT Civil and Administrative Tribunal. Its civil jurisdiction hears levy debts (GUIDANCE, DEBT_RECOVERY). */
  tribunal: "ACAT",
  /** The UTMA's word ("general fund contribution", "sinking fund contribution"); ACAT guidance says "levies". */
  levy: "contribution",
  levies: "contributions",
  /** What s 94 charges on an overdue contribution. */
  lateCharge: "interest",
  /** "units plan" (UTA s 7), in title case as it appears in the owners corporation's name. */
  planLabel: "Units Plan",
  /** "The Owners—Units Plan No X" (UTMA s 8(1), (3)), CONFIRMED. The dash is an em dash as the notes give it. */
  bodyCorporateName: "The Owners—Units Plan No {plan}",
  /** No short form was found in the notes, so the full name (NOT_CONFIRMED that a short form is used in practice). */
  bodyCorporateShortName: "The Owners—Units Plan No {plan}",
  executiveMember: "executive member",
  officeBearers: ["chairperson", "secretary", "treasurer"],
  manager: "manager",
  managementContract: "management contract",
  /** Access Canberra's term for a manager (GUIDANCE). */
  managerGuidanceTerm: "owners corporation managing agent",
  owner: "unit owner",
  /** What the platform calls a lot (stage 2, PR 2): the UTMA's word, as the notes use it. */
  lot: "unit",
  lots: "units",
  scheme: "units plan",
  unitClasses: ["class A (in a building)", "class B (land)"],
  entitlement: "unit entitlement",
  pollValue: "voting value",
  funds: ["administrative fund", "special purpose fund", "general fund", "sinking fund", "sinking fund plan"],
  /** The equivalent of by-laws. */
  rules: ["default rules", "alternative rules", "special privilege rule", "pet friendly rule"],
  certificates: ["unit title sale certificate", "unit title sale update certificate", "unit title rental certificate"],
  developerPeriod: "developer control period",
  source: `${UTMA} ss 8, 34, 40, 49, 72 to 74, 78, 81, 82, 89, 106, 108, 112A, 112C, 119; dictionary; ${UTA} ss 7, 8, 10, 11; ${UTMR} s 7A; ${ACAT_UNIT_TITLES}; ${ACCESS_CANBERRA}`,
} as const satisfies SharedTerminology & Record<string, unknown>;

/**
 * Changes not yet law. Each is a dated switch: `appliesFrom` stays null until
 * the change is notified and its commencement date is known, and the change
 * is to apply only on and after that date. Until then the in-force
 * rules above apply. Two of the changes, the quorum fraction and absentee
 * votes counting towards the quorum, are also restated as dated rules
 * (DATED_RULES); the reduced quorum and proxy changes are held here only.
 */
export const PENDING_REFORMS = [
  {
    key: "HCALA_BILL_2026",
    title: "Housing and Consumer Affairs Legislation Amendment Bill 2026",
    /** A Bill before the Legislative Assembly: NOT LAW. */
    legalStatus: "NOT_LAW",
    inForce: false,
    presentedOn: "2026-09-17",
    registerStatus: "Before the Assembly",
    registerStatusCheckedOn: "2026-10-27",
    /** If passed, pt 6 (unit titles) commences 3 months after notification (cl 2(2)). */
    commencementMonthsAfterNotification: 3,
    notifiedOn: null,
    appliesFrom: null,
    /** What pt 6 would change, as presented (read in the Bill text only). */
    changes: {
      /** Standard quorum 1/4 of the total number of units, including retirement villages, replacing 1/2 (1/3 for retirement villages) (cl 54, sch 3 s 3.9(1)(a)). */
      quorumFractionOfUnits: { from: 1 / 2, to: 1 / 4, retirementVillageFrom: 1 / 3, retirementVillageTo: 1 / 4 },
      /** Reduced quorum decisions take effect the day after the decision; the 28-day petition and confirmation mechanism (s 3.11(3), (4)) is omitted (cls 56, 57). */
      reducedQuorumDecisionsTakeEffect: "the day after the decision",
      reducedQuorumPetitionRemoved: true,
      /** Absentee voters would count towards the quorum (cl 64, sch 3 s 3.31(4)). */
      absenteeVotesCountTowardsQuorum: true,
      /**
       * Proxies may be general or for a stated motion; a person whose proxy
       * attends is taken to be present, and to have voted if the proxy votes
       * on a motion they were appointed for; "matter" becomes "motion" in
       * ss 3.26 and 3.27 (cls 58 to 63).
       */
      proxies: ["general or for a stated motion", "a person whose proxy attends is taken to be present", "taken to have voted if the proxy votes on a motion they were appointed for", "\"matter\" becomes \"motion\" in sch 3 ss 3.26 and 3.27"],
      /** The Bill does not change ACAT access (the planning pass's "ACAT access without a petition" was not found in pt 6). */
      changesAcatAccess: false,
    },
    source: `${BILL}, cls 2, 54, 56 to 64 (pt 6 read in full; explanatory statement not read)`,
    /**
     * The Bill's text and register status were read; it is not law. This is
     * not a RuleStatus: CONFIRMED means read in the in-force text, which a
     * Bill is not.
     */
    textStatus: "READ_IN_BILL_TEXT",
  },
] as const;

const BILL_2026 = PENDING_REFORMS[0];

/** The Bill's values as dated values: NOT LAW, never applied, with its text status and source unchanged. */
const billValue = <T>(value: T) =>
  ({
    legalStatus: BILL_2026.legalStatus,
    value,
    presentedOn: BILL_2026.presentedOn,
    commencement: `If passed, pt 6 (unit titles) commences ${BILL_2026.commencementMonthsAfterNotification} months after notification (cl 2(2)); ${BILL_2026.notifiedOn === null ? "not notified" : `notified ${String(BILL_2026.notifiedOn)}`}`,
    source: BILL_2026.source,
    textStatus: BILL_2026.textStatus,
    pendingChange: BILL_2026.key,
  }) as const;

/**
 * The rules that change on a date (VIC, ACT and WA stage 2, PR 1), read with
 * `ruleInForceOn` (src/lib/jurisdiction/dated-rules.ts). The in-force values
 * are those in MEETINGS, from the day R25 took effect (26 Jun 2026; earlier
 * republications were not read, so a day before has no value). The Bill's
 * values are NOT LAW and are never applied: when it passes, a pack version
 * restates them as enacted, with the day pt 6 commences. No value or status
 * is changed, and no consumer reads these yet.
 */
export const DATED_RULES = {
  /** The standard quorum (sch 3 s 3.9(1)(a)), as fractions of the total number of units. */
  QUORUM_FRACTION_OF_UNITS: {
    title: "Standard quorum (fraction of units)",
    versions: [
      {
        legalStatus: "IN_FORCE",
        from: "2026-06-26",
        value: { fractionOfUnits: MEETINGS.quorum.fractionOfUnits, retirementVillageFractionOfUnits: MEETINGS.quorum.retirementVillageFractionOfUnits },
        source: `${UTMA} sch 3 s 3.9(1)(a) (R25, effective 26 Jun 2026)`,
        status: MEETINGS.status,
      },
      billValue({ fractionOfUnits: BILL_2026.changes.quorumFractionOfUnits.to, retirementVillageFractionOfUnits: BILL_2026.changes.quorumFractionOfUnits.retirementVillageTo }),
    ],
  },
  /** Whether absentee voters count towards the quorum (sch 3 s 3.31(4)). */
  ABSENTEE_VOTES_COUNT_TOWARDS_QUORUM: {
    title: "Absentee votes count towards the quorum",
    versions: [
      { legalStatus: "IN_FORCE", from: "2026-06-26", value: MEETINGS.absenteeVotesCountTowardsQuorum, source: `${UTMA} sch 3 s 3.31(4) (R25, effective 26 Jun 2026)`, status: MEETINGS.status },
      billValue(BILL_2026.changes.absenteeVotesCountTowardsQuorum),
    ],
  },
} as const satisfies DatedRules;

/** What was not confirmed on 27 Oct 2026, for the review. */
export const NOT_CONFIRMED = [
  // From the research notes' "Not confirmed" list.
  "Community title governance details (body corporate name, committee, meetings): only the Community Title Act 2001 register page was read.",
  "Rental certificate contents (DI2026-21): the instrument was not opened.",
  "The ACAT civil jurisdiction limit in statute: the $25,000 figure is from ACAT guidance; the ACAT Act provision was not read.",
  "Recoverability of levy recovery costs: only ACAT guidance (\"some of the costs ... may be recoverable\") supports it; no UTMA provision for levy debts was found (s 31 covers fault and rule breach expenses only).",
  "The statutory basis of the conditional licence: the Agents Act 2003 s 34, the Agents Regulation conduct rules and the CPD guideline were not read; the licensing position is Access Canberra guidance plus the s 50 note.",
  "How the 5% proxy limit is rounded (UTMA sch 3 s 3.26(3)): the text does not say.",
  "\"Last updated\" dates for the ACAT and Access Canberra pages (S9, S10, S11): none appeared in the page text.",
  "The opening words of UTMA s 94(1): what \"unless otherwise decided by ordinary resolution\" lets an ordinary resolution do (for example, switch interest off) needs legal interpretation; the rates themselves are confirmed.",
  "The content of Form 2 (AF2021-17): only its existence and in-force status were checked.",
  "The Unit Titles Act 2001 beyond ss 5 to 16, including what A2025-29 changed.",
  // Found while writing the pack: the notes record nothing on these.
  "The order a payment is applied to contributions, interest and recovery costs: the notes record none. PAYMENT_ALLOCATION_ORDER is a StrataVerze choice (DECISIONS, 28 Oct 2026).",
  "From which day interest under UTMA s 94 runs, whether there is any grace period, and how a day's share of the yearly rate is worked out (365 days or another basis): the notes do not say.",
  "A short form of the owners corporation's name for meeting notices and minutes: the notes record none, so the full name is used.",
  "What the 1/3 in the 3-member special resolution test (UTMA sch 3 s 3.16(2)) is measured against: the notes say only \"less than 1/3\".",
  "The member-count scope of an unopposed resolution (UTMA sch 3 s 3.17): the notes give the test with no member-count limit.",
  "When the 2025-26 maximum certificate fees started: the notes give the amounts but not the start date.",
] as const;

/** Points for Matthew Wrigley's review of this draft. */
export const FOR_REVIEW = [
  "The sinking fund is required through its `requiredWhen` (stage 2, PR 3): with 4 or more units (UTMA ss 81(1), 82(1)), read from the SINKING_FUND_REQUIRED selector, a new building of 4 or more units is given a sinking fund, and an existing one without it is flagged in Building data missing. Where the number of units is not known the fund is not worked out and the building is flagged. Below 4 units the fund is shown as not required: whether a units plan of fewer units may still keep one is not in the notes, so the screens do not say it may. Confirm.",
  "FEATURES switches off the certificate (strataInformationCertificate) and records inspection (recordsInspections) workflows for this draft. Those switches run the NSW workflows; the ACT has its own certificates (SALE_CERTIFICATE) and records inspection rules (RECORDS), which need ACT workflows before they can be switched on.",
  "FOR LEGAL REVIEW: what the opening words of UTMA s 94(1), \"unless otherwise decided by ordinary resolution\", let an ordinary resolution do (INTEREST.openingWords).",
  "BUILDING_SELECTORS: the scheme type and the three plan variants (retirement village, mixed use, class B units only) are recorded by the adviser or StrataVerze in the Building rules section, outside the locked building record. Each variant's \"yes\" is marked not supported because StrataVerze applies none of their rules yet (a StrataVerze proposal). The unit thresholds (bank account exemption, sinking fund, communications officer, proxy limit, the unit leg of the audit test) are worked out from the number of units: the building's lots other than common property rows, read only where it matches the building's total lots. The member thresholds (1 to 3 members, 4 or more members) are not worked out, because members are not units. The annual budget leg of the audit test is not a recorded fact, so at 100 units or fewer the value says the budget decides.",
  "DATED_RULES restates the Bill's quorum and absentee vote changes as NOT LAW values that are never applied, beside the in-force values from R25 (26 Jun 2026; earlier days have no value). When the Bill passes and pt 6 is notified, a new pack version restates them as enacted with the day they commence. Confirm both choices.",
  "LATE_CHARGE (stage 2, PR 5): 10% a year by default and 0 to 20% by special resolution are from the notes (s 94(1)). Three accrual values are NOT_CONFIRMED, so no interest is charged until a pack version records them: the day interest starts (the due date, or the day after), any grace period, and the days a year's rate is shared over (365, or another basis). The special resolution is checked against the motion's recorded category (SPECIAL) and outcome (CARRIED). Since stage 2, PR 8a-ii (29 Oct 2026) an ACT special resolution with 4 or more members can be recorded as CARRIED at a meeting from the count (sch 3 s 3.16(1)), with the chair's standard quorum answer and units present, and one with 1 or 2 members with no vote against and at least 1 vote for (s 3.16(3)), with the chair's quorum answer (s 3.12), so either can now set this rate; the 3-member test and a reduced quorum decision are still refused. Rounding (once, half up, to the cent, on the sum of the days, as NSW interest) and applying each payment to the contribution first are StrataVerze choices. Confirm each.",
  "PAYMENT_ALLOCATION_ORDER: contributions, then interest, then recovery costs, as NSW. Decided by Matthew Wrigley on 28 Oct 2026 as a StrataVerze choice (DECISIONS), since the notes record no order. Recorded here so the decision is visible at sign-off.",
  "NOTICE_RULES (stage 2, PR 6a): each notice goes out 28 days before it falls due and never with less than 14 days' notice, as Matthew Wrigley decided on 28 Oct 2026 (DECISIONS); the 28 days is the most the law allows (UTMA ss 79(2)(e), 90(2)(e)). A due date more than 28 days after the notice is refused, and a special contribution due further away is planned 28 days before it falls due. Recorded here so the decision is visible at sign-off.",
  "FOR LEGAL REVIEW: whether a general fund contribution payable by instalments is given one notice for each instalment as it falls due (StrataVerze's reading, NOTICE_RULES.checked.noticeMode) or one notice that states every instalment date (UTMA s 79(2)(f)).",
  "Sinking fund notices are refused until StrataVerze can give the yearly notice within 1 month after an AGM (UTMA s 90(1)); notices are given one instalment at a time only.",
  "Every ACT contribution notice is still refused until StrataVerze notices state the instalment dates, any discount for early payment and the interest for late payment (UTMA ss 79(2)(f), (h), (i), 90(2)(f), (h), (i)). A discount needs a record of the s 93 ordinary resolution, which StrataVerze does not hold yet. The interest is refused while it cannot be stated: its accrual values are NOT_CONFIRMED (LATE_CHARGE), and notices cannot state an annual-rate interest yet. Since stage 2 PR 6b (28 Oct 2026) the PDF and the email state the contribution for each unit, the fund with its totals and the unit's proportion (ss 79(2)(b) to (d), 90(2)(b) to (d)).",
  "The instalment dates (UTMA ss 79(2)(f), 90(2)(f)) are not stated: StrataVerze gives one notice for each instalment, and the later instalments' due dates are not fixed when a notice goes out (a notice that goes out late states a later date), so a notice cannot truthfully list the year's instalment dates. Whether each per-instalment notice must list them depends on the FOR LEGAL REVIEW point on the notice mode above.",
  "The contribution for each unit (UTMA ss 79(2)(b), 90(2)(b)) is shown by unit number and amount only, never with the owner's name, for every unit of the building other than common property, from the notices of the same schedule and period (their amounts are fixed when they are created). The notice's own unit is marked and included in the list and its total. A unit with no notice for the period is shown as nil. Notices brought across at takeover never list other units (they hold balances owed, not contributions). Confirm these choices.",
  "The fund and totals (UTMA ss 79(2)(c), 90(2)(c)): each StrataVerze notice is for one fund, stated as taking all of the contribution, with the total for all units for the period and the schedule's total (the year's total for a budget schedule, the special contribution's total otherwise). StrataVerze holds one fund for each schedule, so a contribution split between the administrative fund and a special purpose fund would be separate schedules; a special purpose fund has no notice mode, so its notices are refused (NOTICE_RULES.checked.noticeMode). A sinking fund notice for a special contribution does not state the year's total, so it is refused for it. Where the budget schedule for the fund and year was revised (an earlier schedule superseded), no schedule's total is the year's, so the total is withheld and the notice refused until StrataVerze can state the year's total across both. Confirm.",
  "The unit's proportion is stated as its unit entitlement over the schedule's total unit entitlement, with the percentage, and how it is worked out as by unit entitlement only (UTMA ss 78(2)(a), 89(2)(a)). A method set by special resolution (s 78(2)(b)) is not recorded, so StrataVerze cannot tell whether a building has one: such a building's notices would state the proportion wrongly as unit entitlement. A record of the method, or a check that none was set, is needed before go-live. The proportion is stated only while the building's unit entitlements add up to the schedule's total and every amount on the period's notices is exactly each unit's share by its current unit entitlement (worked out as the notices were planned), so a notice is refused once the entitlements change after planning. Confirm.",
  "Each unit's contribution, the fund total and the proportion are read from the data as it is when a notice is checked, emailed or its PDF downloaded, and checked again each time: an issued notice that can no longer state them all is not emailed (the building's activity records LEVY_NOTICES_NOT_EMAILED with the reason) and its PDF is refused with the reason, rather than given without them. A PDF is rebuilt from the data on each download; keeping the content as it was on the day of issue needs a database change and is not done yet. Confirm.",
  "Form 1 (AF2012-112) was not read, so whether ACT contribution notices must be in an approved form is not recorded (NOTICE_RULES.checked.form is null). Check it before any ACT notice is issued.",
  "A notice that goes out late states a later due date, 14 days after it goes out and within the 28 days: StrataVerze's reading of UTMA ss 80, 91 (the notes say only that a contribution is payable on the date stated in the notice), recorded as STRATAVERZE, not CONFIRMED. Confirm.",
  "MEETING_RULES (stage 2, PR 8a-i) is StrataVerze's mapping of MEETINGS and RESOLUTIONS to the shared shape. StrataVerze choices: the names (Ordinary, Special, Unopposed and Unanimous Resolution); a general meeting and the motions list offer ordinary and special resolutions, and an executive committee ordinary resolutions only; unopposed and unanimous resolutions are not offered on an agenda (their 21 days' notice, sch 3 s 3.6(2), is not checked); pre-meeting electronic voting (sch 3 s 3.31A) is not offered; common property rows are not counted as units; an item with no resolution category (such as an election) cannot be recorded as resolved at a general meeting, because every outcome there comes from the count and such an item has no test to count it by (it can be recorded as lost, or deferred). Confirm each.",
  "The number of members (MEMBER_BAND: 1 or 2, 3, or 4 or more) is recorded by the adviser or StrataVerze in the Building rules section, because members are not units (s 10: each part-owner is a member). It can go out of date when the owners change, and nothing checks it against the roll. 1 or 2 members and 4 or more members are marked supported (1 or 2 since stage 2, PR 8a-ii); 3 members is not, as its special resolution test is not confirmed. With none recorded, or a value not known, every count is refused. Since stage 2, PR 8a-ii (29 Oct 2026) it also decides whether the debtor rule applies (s 3.20(3): 3 or more members), so a stale band changes both the test chosen and whether a unit owing money votes; with none recorded the debtor rule applies. A 3-member building's ordinary resolution is counted from this PR too, as 3 and 4 or more members share the ordinary resolution test (s 3.15(1)); only its special resolution stays refused. Confirm who records it and when it is checked.",
  "Votes present (sch 3 s 3.16(1), \"the total votes that can be cast by people present, including proxy votes\"): since stage 2, PR 8a-ii (29 Oct 2026) the chair gives, for each special resolution, the units present or represented (in person, by proxy or by an absentee vote, s 3.31(4), including those that do not vote). The count is refused unless that number equals the units with a vote or an abstention entered, so a unit present that did not vote must be entered as abstaining and is never left out of the votes present. The votes present are then the units entered, less a unit barred for money owed, which is present but cannot cast a vote. The chair's count and the check are StrataVerze's, until attendance is recorded. With 1 or 2 members the number is asked too, though their test does not use it. Confirm.",
  "Refused at a meeting until confirmed: the 3-member special resolution test (s 3.16(2): against less than 1/3, of what is NOT_CONFIRMED); an unopposed resolution (s 3.17: its member scope is NOT_CONFIRMED; confirming it would let it be counted). With 1 or 2 members a resolution is counted since stage 2, PR 8a-ii (29 Oct 2026, Matthew Wrigley's decision, DECISIONS): no vote against and at least 1 vote for (ss 3.15(2), 3.16(3), 3.18(2)), the quorum of s 3.12 (everyone entitled to vote present) being the chair's answer, no debtor bar (s 3.20(3) applies from 3 members) and no casting vote (s 3.30). The units present are asked on a special resolution with 1 or 2 members too, though their test does not use them. Equal votes on an ordinary or special resolution are refused, because whether the chair has a casting vote with more than 2 members is not in the notes (with 2 members there is none, s 3.30) and StrataVerze does not record one. A 3-member ordinary resolution is counted since stage 2, PR 8a-ii (29 Oct 2026), by the same test as 4 or more members (s 3.15(1)).",
  "A unanimous resolution (s 3.18(1)) needs a vote or an abstention recorded for every unit: a unit with nothing recorded refuses the count, since StrataVerze cannot tell whether its voter was present. Confirm.",
  "FOR LEGAL REVIEW: the debtor rule (sch 3 s 3.20(3): with 3 or more members a unit cannot vote on an ordinary or special resolution while an amount is unpaid) is applied since stage 2, PR 8a-ii (29 Oct 2026), in the same change as the chair's quorum answer: a unit owing an amount is not counted at the meeting and cannot vote online on such a motion, and with 1 or 2 members it is not barred. An unpaid amount is read as a contribution notice issued, past its due date and not paid in full on the meeting's date, as for Queensland (a StrataVerze reading: s 3.20(3) says \"all amounts payable\", which may be wider). With no number of members recorded the rule applies. Confirm.",
  "Quorum (sch 3 ss 3.9 to 3.11) is counted for each motion, and a decision with a reduced quorum takes effect 28 days later unless disallowed. Since stage 2, PR 8a-ii (29 Oct 2026) whether there was a standard quorum (people entitled to vote for at least half of the units) is the chair's answer for each motion, kept with the outcome in the meeting record with who recorded it (Matthew Wrigley's decision of 29 Oct 2026, DECISIONS). It is never filled in for the chair, and a motion not answered is refused. StrataVerze does not record attendance yet, so it does not work the quorum out, and nothing checks the answer against the votes: absentee votes are entered like any other vote but do not count toward the quorum (s 3.31(4)), and a unit barred for money owed does not either. With 1 or 2 members everyone entitled to vote must be present (s 3.12): the chair's answer covers that too. \"No\" (a reduced quorum) is refused until those decisions and their later effect are tracked (stage 2, PR 8b). When attendance is recorded (meeting management, Stage C) the quorum will be worked out from it instead. A resolution recorded as carried from the count can also be relied on wherever a carried general meeting motion is asked for: budget adoption, capital works plan approval and statutory pack adoption, as for any carried motion. Confirm.",
  "Pre-meeting electronic voting is not offered for this draft (preMeetingEvoting is null). Before it is, closing a ballot must apply what the count at the meeting applies: the debtor condition (debtorRuleAppliesWhen), judged lot by lot as an owner's own vote is (debtorVoteCheck), the quorum answer, and any refusal of the whole count (Victoria's tier 5, Western Australia's 2-lot quorum). closeBallotAction applies none of these yet (stage 2, PR 8a-ii review). Confirm before any ACT ballot is offered.",
] as const;

/**
 * StrataVerze's decisions. Matthew Wrigley has not reviewed this draft as a
 * whole; the decisions so far are the payment order and the notice timing
 * (28 Oct 2026), and the quorum answer and 1 or 2 members (29 Oct 2026). Points for the review are in FOR_REVIEW and marked "FOR
 * REVIEW" and "FOR LEGAL REVIEW" above.
 */
export const DECISIONS: readonly { decision: string; decidedBy: string; decidedOn: string }[] = [
  {
    decision: "Apply a payment to contributions first, then interest, then recovery costs, as NSW (PAYMENT_ALLOCATION_ORDER). A StrataVerze choice: the notes record no order.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-28",
  },
  {
    decision:
      "Notice timing (NOTICE_RULES): each contribution notice goes out 28 days before it falls due, the most the law allows (UTMA ss 79(2)(e), 90(2)(e)), and is never given less than 14 days' notice. Matthew Wrigley's StrataVerze decision of 28 Oct 2026: the ACT sets no least notice, so the 14 days and the 28-day lead are StrataVerze choices, not rules of law.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-28",
  },
  {
    decision:
      "Quorum (MEETING_RULES.quorumAttestation): the chair's answer for each motion, \"standard quorum present: yes or no\", is accepted until attendance is recorded. It is never filled in for the chair, a motion not answered is refused, and the answer is kept in the meeting record with who recorded it. When attendance is recorded the quorum is to be worked out from it instead. Matthew Wrigley's StrataVerze decision of 29 Oct 2026.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
  {
    decision:
      "1 or 2 members (MEMBER_BAND ONE_OR_TWO): counted at a meeting by the tests of sch 3 ss 3.15(2), 3.16(3) and 3.18(2), no vote against and at least 1 vote for, with no debtor bar and no casting vote. Matthew Wrigley's StrataVerze decision of 29 Oct 2026.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
];

/**
 * None of the NSW workflows applies in the ACT: there is no statutory payment
 * plan or hardship statement, committee training, Strata Hub report, NSW
 * capital works fund plan (the ACT's sinking fund plan is its own) or key
 * financial information form. Certificates, records inspection and debt
 * recovery follow the ACT's own rules above, which have no workflow yet, so
 * those switches are off too (see FOR_REVIEW).
 */
export const FEATURES: PackFeatures = {
  statutoryPaymentPlans: false,
  committeeTraining: false,
  strataHubAnnualReport: false,
  capitalWorksFundPlan: false,
  keyFinancialInformation: false,
  strataInformationCertificate: false,
  recordsInspections: false,
  debtRecoverySteps: false,
};
