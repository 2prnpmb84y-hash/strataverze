/**
 * Statutory rules for Northern Territory unit title schemes under the Unit
 * Title Schemes Act 2009 (NT) ("UTSA") and the Unit Title Schemes
 * (Management Modules) Regulations 2009 (NT) ("UTSMMR").
 *
 * DRAFT, FOR STRATAVERZE TO REVIEW (31 Oct 2026). Not signed off and not
 * applied to any building: `rulePackFor` returns active packs only, and the
 * Northern Territory is not in SUPPORTED_SCHEME_STATES or the database's state
 * check. Every value below comes from the research notes of 31 Oct 2026
 * (scratchpad nt-research.md) and keeps their status (see RuleStatus in
 * ./types); nothing has been decided yet (DECISIONS is empty), and the points
 * to decide, including the product choices this draft had to propose, are in
 * FOR_REVIEW.
 *
 * Sources, read on 31 Oct 2026 on legislation.nt.gov.au:
 * - the UTSA, reprint REPU012, as in force at 27 Nov 2023 (ss 1 to 12, 18 to
 *   61, 73 to 98, 109 to 116 and the list of legislation read);
 * - the UTSMMR, reprint REPU012R1, as in force at 12 May 2023 (regs 1 to 7,
 *   Schedule 1 in full, Schedule 2 compared with Schedule 1 clause by clause,
 *   Schedule 3 in full);
 * - the Unit Titles Act 1975 (NT) ("UTA"), reprint REPU002, as in force at
 *   27 Nov 2023 (contents, ss 33 to 37, 58, 80A, 80 in part, 113 to 116 only).
 *
 * The text was read from the official Word versions, whose automatic
 * subsection numbering did not come through. Subsection and subclause numbers
 * are taken from the order of the text and checked against the provisions'
 * own cross-references; where none fixes a number, the citation is to the
 * section or clause (NOT_CONFIRMED, FOR_REVIEW).
 *
 * Which Act: the UTSA applies to land with a development or exceptional
 * development permit issued on an application covered by Planning Act 1999
 * s 202, to converted units plans and building development plans, and to
 * s 112 land (UTSA s 110); the UTA does not apply to that land (UTA s 113).
 * Older units plans stay under the UTA, with its own management modules. Only
 * the UTSA is researched for this pack: UTA schemes are not supported
 * (SCHEME_ACT).
 *
 * Which module: a standard scheme (a basic scheme with at least 4 unit
 * owners, or a higher scheme) has management module 2 unless its scheme
 * statement specifies module 1; a small scheme (fewer than 4 unit owners) has
 * module 3 (UTSMMR regs 3 to 5). Modules 1 and 2 have the same clauses and
 * read the same, except module 1 cl 68 (forms). "MM cl" below cites both;
 * "MM3 cl" cites module 3.
 *
 * Not read: see NOT_CONFIRMED.
 */

import type {
  EntitlementScheduleDefinition,
  FundDefinition,
  LateChargeRules,
  NoticeRules,
  PackFeatures,
  RuleStatus,
  SchemeSelector,
} from "./types";

const UTSA = "Unit Title Schemes Act 2009 (NT)";
const UTSMMR = "Unit Title Schemes (Management Modules) Regulations 2009 (NT)";
const UTA = "Unit Titles Act 1975 (NT)";
/** Modules 1 and 2 (UTSMMR Schs 1, 2), whose clause numbers are the same. */
const MM = `${UTSMMR} Schs 1 and 2`;
/** Module 3, small schemes (UTSMMR Sch 3). */
const MM3 = `${UTSMMR} Sch 3`;
const PROPOSED = "StrataVerze proposal of 31 Oct 2026, not decided (FOR_REVIEW)";

/** The versions read, for the review. */
export const SOURCES = [
  { code: "S1", title: UTSA, version: "REPU012, as in force at 27 Nov 2023", read: "2026-10-31", url: "https://legislation.nt.gov.au/Legislation/UNIT-TITLE-SCHEMES-ACT-2009" },
  { code: "S2", title: UTSMMR, version: "REPU012R1, as in force at 12 May 2023", read: "2026-10-31", url: "https://legislation.nt.gov.au/en/Legislation/UNIT-TITLE-SCHEMES-MANAGEMENT-MODULES-REGULATIONS-2009" },
  { code: "S3", title: UTA, version: "REPU002, as in force at 27 Nov 2023 (headline only)", read: "2026-10-31", url: "https://legislation.nt.gov.au/Legislation/UNIT-TITLES-ACT-1975" },
] as const;

/**
 * Which Act governs the scheme (UTSA ss 110 to 113; UTA s 113). Which options
 * are `supported` is a StrataVerze proposal, not law (FOR_REVIEW).
 */
export const SCHEME_ACT: SchemeSelector = {
  key: "schemeAct",
  label: "Governing Act",
  help: "Whether the scheme is a unit title scheme under the Unit Title Schemes Act 2009, or a units plan or building development plan still under the Unit Titles Act 1975.",
  options: [
    { value: "UTSA", label: "Unit title scheme (Unit Title Schemes Act 2009)", supported: true },
    {
      value: "UTA",
      label: "Units plan (Unit Titles Act 1975)",
      supported: false,
      note: "Units plans and building development plans not converted under UTSA s 111. A separate rule set (corporation, articles, s 36 contributions, s 37 certificate, s 80 insurance, the UTA management modules), researched at headline level only.",
    },
  ],
  source: `${UTSA} ss 110 to 113; ${UTA} s 113`,
  status: "CONFIRMED",
};

/**
 * The management module that applies (UTSMMR regs 3 to 6). A standard scheme
 * has module 2 unless its scheme statement specifies module 1; a small
 * scheme has module 3. The schemes supervisor may approve changes to a
 * scheme's module (UTSA s 94(4)(b)), which this pack cannot know. Which
 * options are `supported` is a StrataVerze proposal (FOR_REVIEW).
 */
export const MANAGEMENT_MODULE: SchemeSelector = {
  key: "managementModule",
  label: "Management module",
  help: "The management module in the Unit Title Schemes (Management Modules) Regulations 2009 that applies to the scheme. Module 2 applies to a standard scheme unless its scheme statement specifies module 1. Module 3 applies to a small scheme.",
  options: [
    { value: "MODULE_2", label: "Management module 2 (standard scheme)", supported: true, note: "The default for a standard scheme (reg 5(1)(b))." },
    { value: "MODULE_1", label: "Management module 1 (standard scheme)", supported: true, note: "Where the scheme statement specifies it (regs 4, 5(1)(a)). Reads the same as module 2 except cl 68 (forms)." },
    {
      value: "MODULE_3",
      label: "Management module 3 (small scheme)",
      supported: false,
      note: "A basic scheme with fewer than 4 unit owners (regs 3, 5(2)). Different meeting rules: show of hands only, no absentee votes or polls, interim resolutions confirmed at the next meeting with a quorum, no financial statement or audit clause.",
    },
    {
      value: "VARIED",
      label: "A module with changes approved by the schemes supervisor",
      supported: false,
      note: "UTSA s 94(4)(b). The changes would need to be read for each scheme.",
    },
  ],
  source: `${UTSA} s 94(4); ${UTSMMR} regs 3 to 6`,
  status: "CONFIRMED",
};

/** Standard and small schemes (UTSMMR reg 3), counted by unit owners, not units. */
export const SCHEME_CLASSES = {
  /** A basic scheme with at least 4 unit owners, or a higher scheme. */
  standardFromUnitOwners: 4,
  standardIncludesHigherSchemes: true,
  /** A basic scheme with less than 4 unit owners. */
  smallBelowUnitOwners: 4,
  counts: "unit owners",
  /** When the module changes, the old one applies until the next 1 July (reg 6). */
  moduleChangeTakesEffect: "the 1 July immediately following the event",
  source: `${UTSMMR} regs 3, 5, 6`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The two ledger funds. The UTSA and the three modules require and name NO
 * fund (s 94(3)(e) lets a module provide for funds; modules 1 to 3 do not), so
 * both entries are StrataVerze ledger choices, neither required (FOR_REVIEW).
 */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "ADMINISTRATIVE",
    name: "administrative fund",
    label: "Administrative Fund",
    shortLabel: "Admin",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Annual contributions: the administration of the body corporate, maintenance and repairs of the common property, the required insurance and other costs reasonably incurred in performing its functions (MM cl 49).",
    required: false,
    source: `${PROPOSED}; ${MM} cl 49; ${UTSA} s 94(3)(e)`,
    status: "STRATAVERZE",
  },
  {
    key: "SINKING",
    name: "sinking fund",
    label: "Sinking Fund",
    shortLabel: "Sinking",
    // Kept in the ledger's capital works fund type. Not a statutory fund in the NT.
    ledgerFund: "CAPITAL_WORKS",
    purpose: "Money a body corporate chooses to set aside for future work, for example from a special levy for a recurring class of expenditure (MM cl 51). No statutory fund.",
    required: false,
    source: `${PROPOSED}; ${MM} cll 50, 51; ${UTSA} s 94(3)(e)`,
    status: "STRATAVERZE",
  },
];

/** Contributions and levies (MM cll 48 to 53; MM3 cll 39 to 44; UTSA s 39(3)). */
export const CONTRIBUTIONS = {
  /** The body corporate decides the amount and how they are paid, from time to time (MM cl 48). */
  decidedBy: "the body corporate",
  /** Each unit's share: its contribution entitlement over the total (s 39(3)). */
  shareBy: "contribution entitlement",
  purposes: [
    "the administration of the body corporate",
    "maintenance and repairs of the common property",
    "the insurance policies the body corporate must maintain under the Act",
    "other costs reasonably incurred in performing its functions under the Act",
  ],
  /** A levy for a single item of expenditure, its amount and how it is paid: special resolution; shared by contribution entitlement (cl 50). */
  singleItemLevy: { resolution: "SPECIAL", shareBy: "contribution entitlement" },
  /** A levy for a recurring class of expenditure, its amount, payment and shares: unanimous resolution (cl 51). */
  recurringLevy: { resolution: "UNANIMOUS", shareBy: "as the unanimous resolution decides" },
  /** An amount owing under the Division is a debt due and payable to the body corporate (cl 53). */
  amountOwingIsDebt: true,
  /** No levy notice content, lead time or form in the UTSA or the modules. */
  statutoryNoticeRules: false,
  /** No early payment discount clause (s 94(3)(c) allows one; the modules have none). */
  discountClause: false,
  /** The AGM approves a budget for the next financial year, and its notice includes the proposed budget (MM cll 30(d), 32). No such item in module 3. */
  budgetApprovedAtAgm: true,
  /** The body corporate may cap committee spending on common property repairs or improvements; a motion to authorise more needs 2 quotations with the notice (MM cll 24, 32). Not in module 3. */
  committeeSpendingCapMayBeSet: true,
  quotationsForSpendingAboveCap: 2,
  source: `${UTSA} s 39(3); ${MM} cll 24, 30, 32, 48 to 53; ${MM3} cll 39 to 44`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Two entitlement schedules (UTSA s 39). Contribution entitlements decide each
 * owner's share of annual contributions (s 39(3)) and the "against" test of a
 * special resolution (s 79(8)(b)); interest entitlements decide the share of
 * interest in the scheme land and body corporate assets (s 39(4)), and the
 * quorum and some voter thresholds (MM cll 21, 31, 33). Each is a whole number
 * other than 0 (s 39(2)).
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "CONTRIBUTION",
    name: "contribution entitlement",
    label: "Contribution Entitlement",
    onLot: true,
    usedFor: [
      "each unit owner's share of annual contributions and of a levy for a single item of expenditure",
      "the special resolution test: units voting against must not hold more than 25% of all contribution entitlements",
      "an ordinary resolution counted by entitlement, only where the management module applies s 79(7)(a) (modules 1 to 3 do not)",
    ],
    decides: ["CONTRIBUTIONS", "SPECIAL_RESOLUTION"],
    source: `${UTSA} ss 39(1)(a), (3), 79(7), (8); ${MM} cl 50`,
    status: "CONFIRMED",
  },
  {
    key: "INTEREST",
    name: "interest entitlement",
    label: "Interest Entitlement",
    onLot: false,
    usedFor: [
      "each unit owner's share of interest in the scheme land and body corporate assets",
      "the quorum at a general meeting: voters holding at least 50% of total interest entitlements present",
      "a notice of opposition to a committee decision (50% of interest entitlements) and nominating a person to call a general meeting (25%)",
    ],
    decides: ["COMMON_PROPERTY_SHARE"],
    source: `${UTSA} ss 39(1)(b), (4); ${MM} cll 21, 31, 33; ${MM3} cl 25`,
    status: "CONFIRMED",
  },
];

/** How entitlements are set and changed (UTSA ss 39 to 42). */
export const UNIT_ENTITLEMENT_RULES = {
  wholeNumberNotZero: true,
  /** As far as just and equitable: contribution entitlements equal; interest entitlements reflect market value differences when lodged (s 39(5)). */
  contributionEntitlementsEqualIfJust: true,
  interestEntitlementsReflectMarketValue: true,
  /** Not used for metered utility charges or a purpose the scheme statement specifies (s 39(7)). */
  notUsedFor: ["a separately measured utility service", "a purpose specified in the scheme statement"],
  changedBy: ["NTCAT order on a unit owner's application (s 40)", "agreement of 2 or more owners with mortgagee consent and the same total (s 41)", "land acquisition (s 42)"],
  source: `${UTSA} ss 39 to 42`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Interest on late payment (MM cl 52; MM3 cl 43). */
export const INTEREST_ON_LATE_PAYMENT = {
  /** "may charge": not automatic. */
  mayCharge: true,
  appliesTo: ["contributions", "special levies"],
  /** A rate the body corporate decides, not more than the Supreme Court Act 1979 s 85 rate; that rate if none is decided. */
  rateCap: "the rate fixed from time to time for section 85 of the Supreme Court Act 1979",
  rateIfNoneDecided: "the rate fixed from time to time for section 85 of the Supreme Court Act 1979",
  /** The s 85 rate itself: not read. */
  section85RatePercent: null,
  section85RateStatus: "NOT_CONFIRMED" as RuleStatus,
  /** The body corporate may decide to waive the interest in a particular case. */
  waiverInParticularCase: true,
  /** Simple or compound, from when and any grace: not stated. */
  accrualStatus: "NOT_CONFIRMED" as RuleStatus,
  source: `${MM} cl 52; ${MM3} cl 43`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The late charge in the shared shape (method ANNUAL_RATE). Every detail the
 * engine would rely on has no value until confirmed, so no interest can be
 * charged (fails closed): the s 85 rate was not read, who decides is not
 * confirmed, and how interest accrues is not stated in the module.
 */
export const LATE_CHARGE: LateChargeRules = {
  method: "ANNUAL_RATE",
  // Interest is charged only if the body corporate decides to ("may charge"), so a new building starts with none.
  modes: ["NONE", "STATUTORY", "RESOLVED_ANNUAL_RATE"],
  defaultMode: "NONE",
  resolutionRequiredFor: ["STATUTORY", "RESOLVED_ANNUAL_RATE"],
  annualRatePercent: null,
  maxMonthlyRatePercent: null,
  graceMonths: 0,
  source: INTEREST_ON_LATE_PAYMENT.source,
  annual: {
    statutoryRatePercent: {
      value: null,
      status: "NOT_CONFIRMED",
      source: `${MM} cl 52(2)(b); Supreme Court Act 1979 (NT) s 85`,
      note: "If the body corporate decides no rate, the rate is the one fixed from time to time for Supreme Court Act s 85. That Act and the rate fixed under it were not read, and the rate changes from time to time.",
    },
    resolvedRate: {
      resolution: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${MM} cll 2, 23, 52(2)(a)`,
        note: "\"decided by the body corporate\": a general meeting decides by ordinary resolution unless stated (cl 2), but a committee decision is taken to be the body corporate's unless a restricted matter (cl 23). Whether the committee may set the rate is not confirmed.",
      },
      minPercent: { value: null, status: "NOT_CONFIRMED", source: `${MM} cl 52(2)(a)`, note: "The clause sets only a ceiling (\"not more than\"). Whether 0% counts as a decided rate, rather than not charging, is not confirmed." },
      maxPercent: { value: null, status: "NOT_CONFIRMED", source: `${MM} cl 52(2)(a); Supreme Court Act 1979 (NT) s 85`, note: "The Supreme Court Act s 85 rate, not read." },
      maxInclusive: true,
    },
    accrual: {
      from: { value: null, status: "NOT_CONFIRMED", source: `${MM} cl 52`, note: "The clause gives interest \"for the late payment\" and does not say from which day it runs." },
      graceMonths: { value: null, status: "NOT_CONFIRMED", source: `${MM} cl 52`, note: "No grace period is stated." },
      simple: { value: null, status: "NOT_CONFIRMED", source: `${MM} cl 52`, note: "The clause does not say simple or compound." },
      daysInYear: { value: null, status: "NOT_CONFIRMED", source: `${MM} cl 52`, note: "The clause does not say how a day's share of a yearly rate is worked out." },
    },
    waiver: {
      kinds: ["WHOLE"],
      decidedBy: { value: null, status: "NOT_CONFIRMED", source: `${MM} cll 23, 52(3)`, note: "The body corporate may decide to waive interest in a particular case. Whether the committee may decide it is not confirmed." },
      reportedToAgm: false,
      formWords: { meeting: "General meeting", motion: "Motion carried" },
      source: `${MM} cl 52(3); ${MM3} cl 43(3)`,
      status: "CONFIRMED",
    },
    source: INTEREST_ON_LATE_PAYMENT.source,
  },
};

/**
 * The contribution notice rules. The UTSA and modules set no notice content,
 * least or most notice, or form: the body corporate decides how contributions
 * are paid (MM cl 48(b)). The timing values are StrataVerze proposals, the
 * same as the decided WA values, so the shape holds safe numbers; none is
 * decided (FOR_REVIEW).
 */
export const NOTICE_RULES: NoticeRules = {
  minimumNoticeDays: 14,
  issueDaysBeforeDue: 35,
  urgentNoticeDays: null,
  hardship: null,
  contents: [],
  source: `${MM} cl 48; ${MM3} cl 39`,
  checked: {
    minimumNoticeDays: {
      value: 14,
      status: "STRATAVERZE",
      source: PROPOSED,
      note: "The UTSA and modules set no least notice for a contribution (MM cl 48(b)). 14 days is a proposed StrataVerze floor, as decided for WA, not a rule of law.",
    },
    // No most notice in the UTSA or modules (CONFIRMED absent; supervisor-approved module changes not checked).
    maximumNoticeDays: null,
    issueDaysBeforeDue: {
      value: 35,
      status: "STRATAVERZE",
      source: PROPOSED,
      note: "Each notice would go out 35 days before it falls due, as NSW, Queensland and WA notices do. A proposal, not a rule of law.",
    },
    dueDateMayMove: {
      value: false,
      status: "STRATAVERZE",
      source: `${PROPOSED}; ${MM} cl 48(b)`,
      note: "The body corporate's decision says how contributions are paid (cl 48(b)), so StrataVerze would never move a due date. A proposed reading.",
    },
    noticeMode: {
      ADMINISTRATIVE: {
        value: "PER_INSTALMENT",
        status: "STRATAVERZE",
        source: `${PROPOSED}; ${MM} cl 48`,
        note: "One notice for each instalment as it falls due, as NSW. A proposal, since the module sets no notice rule.",
      },
      CAPITAL_WORKS: {
        value: "PER_INSTALMENT",
        status: "STRATAVERZE",
        source: `${PROPOSED}; ${MM} cll 50, 51`,
        note: "One notice for each instalment of a special levy as it falls due. A proposal, since the module sets no notice rule.",
      },
    },
    requiredContents: [],
    form: null,
    source: `${MM} cll 48, 50, 51; ${MM3} cll 39, 41, 42`,
  },
};

/** Debt recovery (MM cl 53; UTSA ss 28, 30, 84 to 86). */
export const DEBT_RECOVERY = {
  /** An amount owing under the contributions Division is a debt due and payable to the body corporate (cl 53). */
  isDebtDue: true,
  /** The body corporate may take legal action (s 28(2)(g)). */
  mayTakeLegalAction: true,
  /** Where: not stated. NTCAT hears disputes (s 85) and may order payment (s 86); whether a levy debt goes there or to a court is NOT_CONFIRMED. */
  forum: null,
  forumStatus: "NOT_CONFIRMED" as RuleStatus,
  /** Who decides to sue: not stated (delegation is possible, s 30). */
  authorityToSueStatus: "NOT_CONFIRMED" as RuleStatus,
  /** No statutory charge over the unit, no pre-action notice and no costs rule in the UTSA or modules. */
  statutoryCharge: false,
  statutoryPreActionNotice: false,
  costsRecoverableStatus: "NOT_CONFIRMED" as RuleStatus,
  /** An owner who has not paid contributions or levies by the due date may not vote while it is outstanding, except on unanimous and without dissent motions (s 79(9), (10)). */
  debtorMayVoteOnlyOn: ["UNANIMOUS", "WITHOUT_DISSENT"],
  source: `${UTSA} ss 28(2)(g), 30, 79(9), (10), 84 to 86; ${MM} cl 53; ${MM3} cl 44`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Meetings of the body corporate and the committee (MM Parts 2, 3; MM3 Parts 2, 3). */
export const MEETINGS = {
  /** The original owner calls the first AGM within 3 months after registration of a scheme statement (cl 26). */
  firstAgmWithinMonthsOfRegistration: 3,
  /** At least once every calendar year, and within 15 months after the last AGM (cl 29; MM3 cl 22). */
  agmEveryCalendarYear: true,
  agmWithinMonthsOfLast: 15,
  agmAgenda: ["election of committee members", "consideration of the engagement of a body corporate manager", "consideration of the annual financial statement", "approval of a budget for the next financial year", "review of existing delegations and consideration of proposed delegations"],
  /** Notice in working days (UTSA s 5): 14, or 21 where a resolution without dissent, unanimous resolution or termination resolution is to be moved (cl 32(1)). Module 3: 14 only (MM3 cl 24). */
  noticeWorkingDays: { general: 14, withoutDissentUnanimousOrTermination: 21, smallScheme: 14 },
  noticeCountsWorkingDays: true,
  /** A voter given late notice may require an adjournment (cl 32; MM3 cl 24). */
  lateNoticeAdjournmentOnRequest: true,
  /** Who may call (cl 31): chair, secretary, body corporate manager, or a voter nominated by voters with 25% of total interest entitlements. Module 3: any voter (cl 23). */
  callers: ["chairperson", "secretary", "body corporate manager", "a voter nominated by voters holding at least 25% of total interest entitlements"],
  /** Quorum: voters holding at least 50% of total interest entitlements present (cl 33; MM3 cl 25). */
  quorumPercentOfInterestEntitlements: 50,
  /** Without a quorum, resolutions are interim (ordinary resolution motions only), MM cl 34: details within 14 working days; a further meeting may be called within 29 working days; takes effect on confirmation at a further meeting held within 28 working days of its notice, at the end of those 28 working days if not held, or otherwise 29 working days after. Module 3: confirmed at the next general meeting with a quorum (MM3 cl 26). */
  interimResolutions: { detailsWithinWorkingDays: 14, furtherMeetingCalledWithinWorkingDays: 29, furtherMeetingHeldWithinWorkingDaysOfNotice: 28, effectiveAfterWorkingDays: 29, onlyOrdinary: true },
  teleconferencingCountsAsPresent: true,
  /** No deadline for distributing general meeting minutes was found. */
  generalMeetingMinutesDeadline: null,
  committee: {
    /** 5 working days' written notice with the agenda (MM cl 13); 3 working days (MM3 cl 12). */
    noticeWorkingDays: 5,
    smallSchemeNoticeWorkingDays: 3,
    quorumPercentOfMembers: 50,
    /** Minutes to every member and voter within 21 working days (MM cl 20). No deadline in module 3. */
    minutesWithinWorkingDays: 21,
    /** Voters with 50% of total interest entitlements may oppose a decision within 7 working days after the minutes (MM cl 21). */
    oppositionPercentOfInterestEntitlements: 50,
    oppositionWithinWorkingDays: 7,
  },
  source: `${UTSA} s 5 "working day"; ${MM} cll 11 to 37; ${MM3} cll 10 to 30`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Resolutions (UTSA s 79; MM cll 2, 38 to 46). One vote for each unit. */
export const RESOLUTIONS = {
  votesPerUnit: 1,
  UNANIMOUS: { test: "votes counted in favour equal the total number of units", source: `${UTSA} s 79(4)` },
  WITHOUT_DISSENT: { test: "no vote counted against", source: `${UTSA} s 79(5)` },
  MAJORITY: { test: "votes counted in favour exceed 50% of the total number of units", moreThanFractionOfAllUnits: 0.5, source: `${UTSA} s 79(6)` },
  /** More for than against; counted by contribution entitlement only where the module applies s 79(7)(a), and modules 1 to 3 do not. */
  ORDINARY: { test: "votes counted in favour are more than votes counted against", byEntitlementWhereModuleApplies: true, modulesApplyEntitlementCount: false, source: `${UTSA} s 79(7)` },
  /** At least two-thirds of the votes cast in favour, and units voting against hold no more than 25% of all contribution entitlements. */
  SPECIAL: { forAtLeastFractionOfVotesCast: 2 / 3, againstNotMoreThanFractionOfAllContributionEntitlements: 0.25, source: `${UTSA} s 79(8)` },
  /** A motion at a general meeting passes by ordinary resolution unless the module says otherwise (cl 2(2)). */
  defaultAtGeneralMeeting: "ORDINARY",
  /** The chair may cast a deciding vote on an equal ordinary resolution vote (cl 38). */
  chairCastingVoteOnOrdinary: true,
  /** Written vote for a poll, an absentee vote or a termination motion; otherwise show of hands (cl 39). Module 3: show of hands only (cl 32). */
  pollMayBeCalledBy: "any voter present, or the chair",
  /** Absentee voting papers for resolutions without dissent and unanimous resolutions (cl 43); none in module 3. */
  absenteeVotesFor: ["WITHOUT_DISSENT", "UNANIMOUS"],
  absenteeVoteLetterboxHoursBefore: 24,
  source: `${UTSA} s 79; ${MM} cll 2, 38 to 46; ${MM3} cll 2, 31 to 37`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Proxies (MM cl 42; MM3 cl 34). No cap on proxies was found. */
export const PROXIES = {
  /** In writing, in the form the committee approves, stating the period of appointment, signed by each joint appointer (cl 42(3)). Module 3 states no form. */
  inWritingInCommitteeForm: true,
  mustStatePeriod: true,
  jointHoldersAppointJointly: true,
  capOnProxies: false,
  source: `${MM} cl 42; ${MM3} cl 34`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The committee (UTSA ss 74 to 77; MM Part 2). */
export const COMMITTEE = {
  /** Required for a higher scheme or a basic scheme with at least 4 unit owners; optional below by resolution without dissent (s 74(1)). */
  requiredFromUnitOwners: 4,
  optionalBelowByResolution: "WITHOUT_DISSENT",
  /** An individual unit owner, or an individual a corporate owner appoints (s 74(3)). */
  eligibility: ["a unit owner who is an individual", "an individual appointed by a unit owner that is a body corporate"],
  /** At least 2 and, unless decided by special resolution, not more than 7; all members where there are 3 or fewer (cl 5). */
  minMembers: 2,
  maxMembersUnlessSpecialResolution: 7,
  allMembersWhenMembersAtMost: 3,
  officeBearers: ["chairperson", "secretary"],
  electedAtEachAgm: true,
  codeOfConduct: "UTSA Schedule 1, Part 1 (text not read)",
  source: `${UTSA} ss 74 to 77; ${MM} cll 4 to 10; ${MM3} cll 4 to 9`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Records, access and retention (UTSA s 81; MM cll 55, 57, 58; MM3 cll 46, 47). */
export const RECORDS = {
  /** Within 10 working days after an application, inspect or a copy (s 81(3)); 20 penalty units. */
  accessWithinWorkingDays: 10,
  whoMayApply: ["a unit owner or mortgagee", "a person intending to buy a unit", "a person the body corporate reasonably considers to have a proper interest", "someone acting for one of them"],
  /** Module 1 or 2: the committee's approved form and a $30 fee or an application to waive it (cl 58). Module 3: in writing, no fee stated (cl 47). */
  accessFeeCents: 3_000,
  accessFeeMayBeWaived: true,
  smallSchemeFeeStated: false,
  /** Accounting records, annual financial statements and the listed records: at least 7 years after created (cll 55(3), 57(2); MM3 cl 46). */
  retentionYears: 7,
  kept: ["members' names and addresses", "minutes of general meetings", "resolutions", "voting results, including polls", "notices given", "proxy appointments", "used voting papers", "correspondence", "insurance policies", "contracts and agreements", "leases and licences"],
  /** An annual financial statement (income and expenditure; assets and liabilities, with mortgages and charges) is presented at the next AGM (cl 55). Not in module 3. */
  annualFinancialStatement: true,
  source: `${UTSA} s 81; ${MM} cll 55, 57, 58; ${MM3} cll 46, 47`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** No statutory resale certificate under the UTSA: a buyer may apply for records under s 81. The UTA's s 37 certificate is for UTA schemes. */
export const SALE_DISCLOSURE = {
  utsaResaleCertificate: false,
  buyerMayApplyForRecords: true,
  /** Off the plan: a registered scheme disclosure statement before contract, a replacement within 20 working days, cancellation and implied warranties (ss 43 to 49). */
  offThePlanDisclosureStatement: true,
  replacementWithinWorkingDays: 20,
  /** UTA s 37: a sealed certificate of unpaid contributions within 14 days; fee not more than cost. Not supported (SCHEME_ACT). */
  utaCertificateWithinDays: 14,
  source: `${UTSA} ss 43 to 49, 81; ${UTA} s 37`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Insurance (UTSA ss 52 to 57). */
export const INSURANCE = {
  /** A body corporate policy for the common property; reinstatement of damaged common property (ss 52, 53). */
  commonPropertyReinstatement: true,
  /** Public liability of at least $10,000,000, or another prescribed amount (s 54); prescribed amounts not checked. */
  publicLiabilityMinCents: 1_000_000_000,
  prescribedAmountChecked: false,
  additionalInsuranceBy: "ORDINARY",
  valuationFrequency: null,
  source: `${UTSA} ss 52 to 57`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Audit is optional: the body corporate may decide at an AGM to have the last year's records audited (MM cl 56). No clause in module 3. */
export const AUDIT = {
  mandatory: false,
  mayBeDecidedAtAgm: true,
  auditors: ["a registered company auditor, or a firm with one", "an authorised audit company", "a member of CPA Australia, the Institute of Public Accountants or the Institute of Chartered Accountants in Australia", "another person the Minister approves"],
  source: `${MM} cl 56`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The body corporate manager (UTSA ss 87 to 93; MM cll 63 to 66), headline only. */
export const MANAGER = {
  /** No licence under the UTSA. Whether the Agents Licensing Act requires one: NOT_CONFIRMED. */
  utsaLicence: false,
  agentsLicensingActStatus: "NOT_CONFIRMED" as RuleStatus,
  codeOfConduct: "UTSA Schedule 1, Part 2, a term of the engagement (text not read)",
  /** 3 months' written notice where the engagement does not say how it ends (cl 64). */
  defaultTerminationNoticeMonths: 3,
  /** Delegation by ordinary resolution, evidenced under seal (cl 66). */
  delegationBy: "ORDINARY",
  /** No trust account rule in the UTSA or modules. */
  trustAccountRule: false,
  source: `${UTSA} ss 87 to 93; ${MM} cll 63 to 66`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Disputes go to NTCAT ("Tribunal means the Civil and Administrative Tribunal", s 5), which may make any appropriate order (ss 84 to 86). */
export const DISPUTES = {
  tribunal: "NTCAT",
  ordersInclude: ["payment of money", "taking or not taking action", "confirming, varying or reversing a decision", "a change to a by-law", "performing a function or exercising a power"],
  /** Whether a levy debt is a dispute NTCAT hears: NOT_CONFIRMED (DEBT_RECOVERY). */
  levyDebtsStatus: "NOT_CONFIRMED" as RuleStatus,
  source: `${UTSA} ss 5, 84 to 86`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The building's time zone. The Northern Territory has no daylight saving, so
 * the offset is UTC+9:30 all year. From the IANA time zone database, not a
 * rule of strata law.
 */
export const TIME_ZONE = {
  zone: "Australia/Darwin",
  utcOffset: "+09:30",
  daylightSaving: false,
  source: "IANA time zone database (Australia/Darwin)",
  status: "STRATAVERZE" as RuleStatus,
} as const;

/** Most periods are in working days: not a Saturday, Sunday or public holiday under the Public Holidays Act 1981 (UTSA s 5). The holiday list was not read. */
export const WORKING_DAYS = {
  excludes: ["Saturday", "Sunday", "a public holiday under the Public Holidays Act 1981 (NT)"],
  publicHolidaySourceStatus: "NOT_CONFIRMED" as RuleStatus,
  source: `${UTSA} s 5 "working day"`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The Northern Territory's words for the things the platform names (UTSA ss 5, 10, 24, 38, 74, 87). */
export const TERMINOLOGY = {
  ownersCorporation: "body corporate",
  ownersCorporations: "bodies corporate",
  committee: "committee",
  act: "Unit Title Schemes Act 2009",
  actShort: "UTSA",
  jurisdictionShort: "NT",
  /**
   * The Northern Territory Civil and Administrative Tribunal (s 5). Whether it
   * hears levy debts is NOT_CONFIRMED (DEBT_RECOVERY.forum), so code must not
   * use this word for where levy claims are heard.
   */
  tribunal: "NTCAT",
  levy: "contribution",
  levies: "contributions",
  lateCharge: "interest",
  scheme: "unit title scheme",
  lot: "unit",
  lots: "units",
  /** How the scheme is named before its number: the registration number (s 10(3)). */
  planLabel: "Unit title scheme",
  /**
   * There is no fixed name format: the scheme statement may specify a body
   * corporate name, and otherwise the body corporate is identified by its
   * registration number (ss 18(2)(b), 25(1)). This template is a StrataVerze
   * proposal (FOR_REVIEW).
   */
  bodyCorporateName: "Body Corporate of {name} (registration number {plan})",
  bodyCorporateShortName: "Body Corporate of {name}",
  bodyCorporateNameStatus: "STRATAVERZE" as RuleStatus,
  manager: "body corporate manager",
  developer: "original owner",
  owner: "unit owner",
  regulator: "unit title schemes supervisor",
  source: `${UTSA} ss 5, 10, 18, 24, 25, 38, 74, 87, 99`,
} as const;

/** Changes and pending reforms (list of legislation in S1 and S2). */
export const CHANGES = [
  { instrument: "Statute Law Amendment (NTCAT Conferral of Jurisdiction) Act 2023 (No. 24, 2023)", commenced: "2023-11-27", touches: UTSA, status: "CONFIRMED" as RuleStatus },
  { instrument: "Water Legislation Amendment Act 2023 (No. 13, 2023)", commenced: "2023-08-01", touches: UTSA, status: "CONFIRMED" as RuleStatus },
  { instrument: "Unit Title Schemes (Management Modules) Amendment Regulations 2023 (SL No. 11, 2023)", commenced: "2023-05-12", touches: UTSMMR, status: "CONFIRMED" as RuleStatus, note: "What it changed was not read." },
] as const;

/** No enacted-but-not-commenced change and no Bill was found, so there are no dated rules yet. */
export const PENDING_REFORMS = [] as const;

/** What was not confirmed on 31 Oct 2026, for the review. */
export const NOT_CONFIRMED = [
  "The Supreme Court Act 1979 s 85 interest rate, which caps and defaults the late payment interest (MM cl 52(2)), and how it is fixed from time to time. Not read, so LATE_CHARGE has no rate.",
  "Who in the body corporate may decide to charge interest, set its rate or waive it: a general meeting only, or the committee too (MM cll 2, 23, 52).",
  "How interest accrues: from which day, any grace, simple or compound, and the days in a year (MM cl 52 is silent).",
  "Where levy debts are recovered (NTCAT, its small claims jurisdiction, or the Local Court) and any monetary limits. The NTCAT Act, Local Court Act and Small Claims Act were not read.",
  "Who decides to start recovery proceedings (UTSA ss 28(2)(g), 30, 75), and whether legal and collection costs are recoverable from the owner.",
  "The order a payment is applied to contributions, interest and costs: none found in the UTSA or modules, so the pack has no PAYMENT_ALLOCATION_ORDER.",
  "Whether the Agents Licensing Act requires a body corporate manager to be licensed, and any trust account rules.",
  "Planning Act 1999 s 202 (which permit applications bring land under the UTSA), so the exact cut-over between the UTSA and the UTA, and how many schemes are under each.",
  "The UTA beyond ss 33 to 37, 58, 80A, 80 and 113 to 116, the Unit Titles (Management Modules) Regulations 2009 and the Unit Titles Regulations 2002.",
  "The Unit Title Schemes (General Provisions and Transitional Matters) Regulations 2009: prescribed amounts (public liability), disclosure statement items, conversion rules, supervisor fees.",
  "UTSA ss 62 to 72 (development, layered schemes), 98A to 108 (administrators, the schemes supervisor) and Schedules 1 and 2 (codes of conduct, default by-laws).",
  "What SL No. 11, 2023 changed in the modules, and why module 1 cl 68 refers to a Part 7 that module 1 does not contain.",
  "How the body corporate serves notices on owners (for example by email): the Interpretation Act 1978 was not read.",
  "The body corporate's financial year: not defined in what was read.",
  "The NT public holidays, needed to count working days.",
  "NT postcodes from an official source (Australia Post not checked).",
  "Whether a resale certificate exists outside the UTSA (Land Title Act, the standard REINT contract).",
  "Exact subsection and subclause numbers: the official Word text was read without its automatic numbering, so numbers are taken from the order and cross-references.",
  "Whether any amending Bill is before the Legislative Assembly (the NT Bills list was not browsed).",
  "Whether a further general meeting that is held but does not confirm an interim resolution ends it (MM cl 34(3) does not say so expressly).",
] as const;

/** StrataVerze's decisions: none yet. The pack has not been reviewed. */
export const DECISIONS = [] as const;

/**
 * Points for Matthew Wrigley to decide or check before the pack is signed off
 * (31 Oct 2026). Not law and not decided: each moves to DECISIONS once he
 * decides it. Points marked "Proposed decision" are product choices this
 * draft had to propose to hold safe values.
 */
export const FOR_REVIEW = [
  "Proposed decision (scope): support UTSA schemes first, standard schemes on management module 2 (the default) and module 1 (which reads the same), and hold small schemes (module 3), supervisor-varied modules and UTA schemes as not supported (SCHEME_ACT, MANAGEMENT_MODULE). UTA schemes are probably the larger part of the NT market (older units plans), so the UTA and its own management modules should be the next research, not dropped.",
  "Proposed decision (funds): the UTSA and modules require and name no fund. FUND_CATALOGUE holds an \"administrative fund\" and a \"sinking fund\" as StrataVerze ledger names only, neither required. Confirm the names NT bodies corporate use, and whether a new building should be given either.",
  "Proposed decision (notice timing): NOTICE_RULES.checked holds the WA values as proposals (14 days least, 35 days lead, the due date never moved, one notice per instalment). None is law: the module leaves how contributions are paid to the body corporate (MM cl 48(b)).",
  "Interest (LATE_CHARGE): interest is charged only if the body corporate decides to (\"may charge\", MM cl 52), so a new building starts with none (NONE). The rate cap and default is the Supreme Court Act s 85 rate, not read, and who decides and how interest accrues are not confirmed, so no interest can be charged until a pack version records them. Confirm the s 85 rate source and whether it should be a dated rule.",
  "Entitlements: two schedules. Contribution entitlement (held on each unit) decides contributions and the special resolution's 25% against test (s 79(8)(b)); interest entitlement decides the share of common property and assets, and the quorum (50% of interest entitlements) and opposition and meeting-call thresholds. The quorum is not listed in `decides`, as no EntitlementUse fits a first quorum test. Confirm.",
  "Resolutions: the special resolution is two-thirds of votes cast plus an entitlement test against all contribution entitlements; the majority resolution is more than 50% of all units; an ordinary resolution counts heads (no module applies s 79(7)(a)). Debtors may vote only on unanimous and without dissent motions (s 79(9), (10)). Confirm before MEETING_RULES is built.",
  "Working days: almost every NT period is in working days (UTSA s 5). StrataVerze counts calendar days, so meeting and committee notices, interim resolution periods, record access (10 working days) and owner notices (28 working days) cannot be checked until a public holiday source is decided.",
  "Debt recovery: the forum and who decides to sue are not confirmed, there is no statutory charge or pre-action notice, and the owner's debt is a debt due (MM cl 53). FEATURES.debtRecoverySteps stays off. Confirm the forum (NTCAT or a court) before any step is drafted.",
  "Records inspection: within 10 working days (s 81(3)), with a $30 fee or a waiver application (MM cl 58); module 3 states no fee. FEATURES.recordsInspections stays off until working days are counted.",
  "Sale: the UTSA has no resale certificate; buyers use s 81 records access. FEATURES.strataInformationCertificate and bodyCorporateCertificate stay off. Confirm what NT conveyancers expect (REINT contract) before anything is offered.",
  "Name format: TERMINOLOGY.bodyCorporateName (\"Body Corporate of {name} (registration number {plan})\") is a StrataVerze template: the law has no format (ss 18(2)(b), 25(1)). Confirm the wording NT schemes use.",
  "Time zone: Australia/Darwin, UTC+9:30 all year (no daylight saving). Postcodes are held in src/config/jurisdictions.ts, which has no NT range yet; the 08xx range is not confirmed from an official source.",
  "Subsection numbers: read from text without automatic numbering. Check the citations against the PDF before any reach owner-facing text.",
] as const;

/**
 * None of the NSW workflows applies in the Northern Territory: there is no
 * statutory payment plan, committee training, Strata Hub report, 10-year
 * plan, key financial information form or resale certificate under the UTSA;
 * records inspections (s 81) and debt recovery are the Territory's own and
 * are not built yet.
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
