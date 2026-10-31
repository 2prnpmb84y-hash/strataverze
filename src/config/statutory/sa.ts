/**
 * Statutory rules for South Australian strata schemes under the Strata Titles
 * Act 1988 (SA) ("STA") and the Strata Titles Regulations 2018 (SA) ("STR"),
 * with the community scheme rules of the Community Titles Act 1996 (SA)
 * ("CTA") and the Community Titles Regulations 2026 (SA) ("CTR") held
 * separately in COMMUNITY_SCHEMES.
 *
 * DRAFT, FOR STRATAVERZE TO REVIEW (31 Oct 2026). Not signed off and not
 * applied to any building: `rulePackFor` returns active packs only, and South
 * Australia is not in SUPPORTED_SCHEME_STATES or the database's state check.
 * Every value below comes from the research notes of 31 Oct 2026 and keeps
 * their status (see RuleStatus in ./types). Nothing has been decided yet
 * (DECISIONS is empty). The points to decide are in FOR_REVIEW, each product
 * choice the pack needed as a proposed decision, not made. Where a value the
 * engine would rely on is not confirmed or not decided, it has no value, so
 * the engine refuses rather than guesses.
 *
 * Sources, read on 31 Oct 2026 on legislation.sa.gov.au (see SOURCES):
 * - the STA, current version 9.12.2021, read in full;
 * - the STR, current version 1.9.2026, read in full;
 * - the CTA, current version 9.12.2021, read in part (SOURCES says which);
 * - the CTR, in operation from 1 Sep 2026, read except the later forms;
 * - the Standard Time Act 2009 (SA), version 26.2.2009, s 3;
 * - the status of the Statutes Amendment (Community and Strata Titles) Bill
 *   2024 (a Bill of an earlier session: it did not pass), and Hansard.
 *
 * The STA's default articles (Schedule 3) hold conduct rules only. The money
 * and meeting rules below are in the Act and the regulations, not defaults.
 *
 * The shared shapes (FUND_CATALOGUE, ENTITLEMENT_SCHEDULES, NOTICE_RULES,
 * LATE_CHARGE, TERMINOLOGY) are written for strata schemes. A community
 * scheme's rules differ on notices, funds, meetings and audit, and the shared
 * shapes cannot yet choose by scheme type, so community schemes are not
 * supported (SCHEME_TYPE) and their rules are held apart, for review.
 */

import type {
  BuildingSelector,
  DatedRule,
  EntitlementScheduleDefinition,
  FundDefinition,
  LateChargeRules,
  NoticeRules,
  PackFeatures,
  RecordedBuildingSelector,
  RuleStatus,
  SelectorCondition,
} from "./types";

const STA = "Strata Titles Act 1988 (SA)";
const STR = "Strata Titles Regulations 2018 (SA)";
const CTA = "Community Titles Act 1996 (SA)";
const CTR = "Community Titles Regulations 2026 (SA)";
const STANDARD_TIME = "Standard Time Act 2009 (SA)";
const BILL_2024 = "Statutes Amendment (Community and Strata Titles) Bill 2024 (SA)";

/** What was read, in which version, and how. */
export const SOURCES = [
  {
    id: "S1",
    title: STA,
    url: "https://www.legislation.sa.gov.au/lz?path=%2FC%2FA%2FSTRATA%20TITLES%20ACT%201988",
    version: "Current (Authorised) version 9.12.2021; the unofficial RTF reprint read is dated 26.6.2025",
    read: "in full, including the legislative history, through Chrome (the official RTF fetched in the page); WebFetch refused the site and the proxy blocked curl",
  },
  {
    id: "S2",
    title: STR,
    url: "https://www.legislation.sa.gov.au/lz?path=%2FC%2FR%2FSTRATA%20TITLES%20REGULATIONS%202018",
    version: "Current version 1.9.2026 (variation 76/2026, Gazette 20.8.2026 p 2810); expires 1.9.2029",
    read: "in full, through Chrome",
  },
  {
    id: "S3",
    title: CTA,
    url: "https://www.legislation.sa.gov.au/lz?path=%2FC%2FA%2FCOMMUNITY%20TITLES%20ACT%201996",
    version: "Current (Authorised) version 9.12.2021",
    read: "ss 3 to 12, 15, 20, 71 to 99, 103 to 109, 113 to 119, 135 to 142, 155 and the legislative history table, through Chrome; the rest not read",
  },
  {
    id: "S4",
    title: CTR,
    url: "https://www.legislation.sa.gov.au/lz?path=%2FC%2FR%2FCOMMUNITY%20TITLES%20REGULATIONS%202026",
    version: "Current version 1.9.2026; in operation 1 September 2026 (r 2), replacing the 2011 regulations",
    read: "regs 1 to 47 and Forms 1 to 8, through Chrome; the legislative history and later forms not read",
  },
  {
    id: "S5",
    title: STANDARD_TIME,
    url: "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/standard-time-act-2009/current/2009.4.un.rtf",
    version: "Version 26.2.2009",
    read: "s 3, through the WebFetch tool's quotation only",
  },
  {
    id: "S6",
    title: BILL_2024,
    url: "https://www.legislation.sa.gov.au/lz?path=%2FB%2FARCHIVE%2FSTATUTES%20AMENDMENT%20(COMMUNITY%20AND%20STRATA%20TITLES)%20BILL%202024",
    version: "Listed under Bills of Earlier Sessions: as introduced in the House of Assembly, as passed the House of Assembly, as received in the Legislative Council",
    read: "the bill page only; the Bill text was not opened. Hansard of 13 Nov 2025 (Legislative Council) and the House of Assembly debate read through WebFetch summaries",
  },
] as const;

/**
 * The scheme type. A strata scheme under the STA (a strata corporation) or a
 * community scheme under the CTA (a community corporation). Which options are
 * `supported` is a StrataVerze proposal, not law (FOR_REVIEW
 * COMMUNITY_SCHEMES_SUPPORTED).
 */
export const SCHEME_TYPE: RecordedBuildingSelector = {
  key: "schemeType",
  held: "RECORDED",
  label: "Scheme type",
  help: "Whether the building is a strata scheme under the Strata Titles Act 1988 (a strata corporation) or a community scheme under the Community Titles Act 1996 (a community corporation).",
  options: [
    { value: "STRATA_TITLES", label: "Strata scheme (Strata Titles Act 1988)", supported: true, note: "A strata corporation created on the deposit of a strata plan (STA s 3(1))." },
    {
      value: "COMMUNITY_TITLES",
      label: "Community scheme (Community Titles Act 1996)",
      supported: false,
      note: "A community corporation, which may be a primary, secondary or tertiary corporation (CTA ss 7, 71). Its rules are held in COMMUNITY_SCHEMES, not in the shared shapes.",
    },
  ],
  source: `${STA} s 3(1); ${CTA} ss 3(1), 7, 71`,
  status: "CONFIRMED",
};

export const BUILDING_SELECTORS: readonly BuildingSelector[] = [SCHEME_TYPE];

const schemeTypeIn = (...values: string[]): SelectorCondition => ({ selector: SCHEME_TYPE.key, in: values });

/**
 * The two ledger funds. The STA requires neither: a strata corporation "may
 * raise such funds (including reserve funds for future expenditure of a
 * capital nature) as it thinks necessary" (s 27(1)), and STR r 14(2)(b)
 * speaks of corporations "with no administrative or sinking funds". The CTA
 * requires both (s 116(1)).
 *
 * The administrative fund is given to every strata corporation as StrataVerze's
 * ledger fund (STRATAVERZE, proposed in FOR_REVIEW FUNDS), so every building
 * has a chart of accounts. The sinking fund is optional for a strata scheme.
 */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "ADMINISTRATIVE",
    name: "administrative fund",
    label: "Administrative Fund",
    shortLabel: "Admin",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Recurrent expenditure: the administration and maintenance of the common property and the corporation's other costs that are not non-recurrent.",
    required: false,
    requiredWhen: {
      rules: [
        {
          need: "REQUIRED",
          when: schemeTypeIn("COMMUNITY_TITLES"),
          reason: "Required for a community corporation, which must establish an administrative fund.",
          provision: `${CTA} s 116(1)`,
          status: "CONFIRMED",
        },
        {
          need: "REQUIRED",
          when: schemeTypeIn("STRATA_TITLES"),
          reason: "Kept for every strata corporation as the StrataVerze ledger fund. The Strata Titles Act requires no named fund.",
          provision: `${STA} s 27(1); ${STR} r 14(2)(b)`,
          status: "STRATAVERZE",
        },
      ],
      noRuleFits: "Whether an administrative fund is required could not be worked out from the scheme type recorded.",
    },
    source: `${STA} s 27(1); ${STR} r 14(2)(b); ${CTA} s 116`,
    status: "STRATAVERZE",
  },
  {
    key: "SINKING",
    name: "sinking fund",
    label: "Sinking Fund",
    shortLabel: "Sinking",
    ledgerFund: "CAPITAL_WORKS",
    purpose: "Non-recurrent expenditure and future expenditure of a capital nature held in reserve.",
    required: false,
    requiredWhen: {
      rules: [
        {
          need: "REQUIRED",
          when: schemeTypeIn("COMMUNITY_TITLES"),
          reason: "Required for a community corporation, which must establish a sinking fund for non-recurrent expenditure.",
          provision: `${CTA} s 116(1), (2)`,
          status: "CONFIRMED",
        },
        {
          need: "OPTIONAL",
          when: schemeTypeIn("STRATA_TITLES"),
          reason: "Not required of a strata corporation, which may raise reserve funds for future capital expenditure.",
          provision: `${STA} s 27(1); ${STR} r 14(2)(b)`,
          status: "CONFIRMED",
        },
      ],
      noRuleFits: "Whether a sinking fund is required could not be worked out from the scheme type recorded.",
    },
    source: `${STA} s 27(1); ${STR} r 14(2)(b); ${CTA} s 116`,
    status: "CONFIRMED",
  },
];

/** Rules about a strata corporation's money as a whole (STA ss 26, 27, 36A to 36L). */
export const FUND_RULES = {
  /** "Such funds (including reserve funds for future expenditure of a capital nature) as it thinks necessary" (s 27(1)). */
  namedFundsRequired: false,
  mayOpenAdiAccounts: true,
  /** Trustee investments, or a prescribed investment; none prescribed in the STR (read in full). */
  investment: "investments in which trustees are authorised by statute to invest trust funds, or a prescribed investment",
  mayBorrow: true,
  /** Money from selling real property pays the corporation's liabilities first; any balance may be divided by unit entitlement by unanimous resolution (s 26(6)). */
  saleProceeds: "liabilities first, then division by unit entitlement by unanimous resolution",
  source: `${STA} ss 26(1)(b) to (d), (6), 27(1); ${STR} (read in full)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * One schedule: unit entitlement, a whole number for each unit in proportion
 * to its capital value within ±10%, the aggregate being 10,000 (STA s 6; STR
 * r 5). It is held on each unit.
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "UNIT_ENTITLEMENT",
    name: "unit entitlement",
    label: "Unit Entitlement",
    help: "The unit's number in the schedule of unit entitlements annexed to the strata plan. The units' numbers add up to 10,000.",
    importLabel: "Unit Entitlement",
    onLot: true,
    usedFor: [
      "each unit's share of contributions, unless a unanimous resolution sets another basis",
      "each unit's equitable share in the common property",
      "each unit holder's share of the corporation's liabilities where the corporation defaults",
      "the shares on cancellation of the strata plan",
      "votes, only where all units are non-residential and a unanimous resolution adopts it",
    ],
    decides: ["CONTRIBUTIONS", "COMMON_PROPERTY_SHARE", "TERMINATION_INTEREST"],
    source: `${STA} ss 6, 10(3), 17(7), 21(2), 27(3), 34(2); ${STR} r 5`,
    status: "CONFIRMED",
  },
];

export const UNIT_ENTITLEMENT_RULES = {
  toleranceOfCapitalValuePercent: 10,
  wholeNumber: true,
  aggregate: 10_000,
  source: `${STA} s 6; ${STR} r 5`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The strata corporation (STA ss 3(1), 18, 21, 23). */
export const STRATA_CORPORATION = {
  createdOn: "deposit of the strata plan",
  /** "Strata Corporation No. [number of the deposited strata plan] Incorporated"; "Inc." may be used (s 18(1), (2)). */
  name: "Strata Corporation No. {plan} Incorporated",
  shortName: "Strata Corporation No. {plan} Inc.",
  commonSealRequired: true,
  /** All unit holders are members (s 18(4)). */
  membersAreUnitHolders: true,
  /** If the corporation defaults, unit holders are jointly and severally liable, sharing by unit entitlement (s 21). */
  unitHoldersGuaranteeLiabilities: true,
  /** Articles: Schedule 3 unless replaced by special resolution, which has no effect until lodged with the Registrar-General (s 19(2), (3)). */
  articles: { default: "Schedule 3", replacedBy: "SPECIAL", effectiveOnLodgement: true },
  source: `${STA} ss 3(1), 18, 19, 21`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Contributions (STA s 27; STR r 10). */
export const CONTRIBUTIONS = {
  /** Levied by ordinary resolution against all unit holders (s 27(2)). */
  leviedBy: "ORDINARY",
  /** In proportion to unit entitlements, or another basis by unanimous resolution (s 27(3)). */
  basis: "unit entitlement, or another basis decided by unanimous resolution",
  otherBasisBy: "UNANIMOUS",
  /** Instalments may be permitted by ordinary resolution, as the resolution specifies (s 27(4)(a)). */
  instalmentsBy: "ORDINARY",
  /** Recoverable from the current unit holder, whether or not the holder when it arose (s 27(5)). */
  currentHolderLiable: true,
  /** Work wholly or substantially for one unit or group is recoverable from its holder(s), by unit entitlement among them (s 27(6), (7)). */
  benefitWorkRecoverable: true,
  /** Not refunded when a person stops being a unit holder (s 27(8)). */
  refundOnLeaving: false,
  /** The treasurer notifies unit holders of contributions to be raised (STR r 10(2)(a)). */
  treasurerNotifies: true,
  /** No early payment discount in the STA or STR (read in full; articles not checked). */
  earlyPaymentDiscount: false,
  /** Whether a management committee may levy contributions: s 27(2) says "by ordinary resolution"; NOT_CONFIRMED (FOR_REVIEW COMMITTEE_LEVY). */
  committeeMayLevy: { value: null, status: "NOT_CONFIRMED" as RuleStatus, source: `${STA} ss 27(2), 35(2), (3)` },
  source: `${STA} s 27; ${STR} r 10(2)(a)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The statement each AGM must be given (STA s 33A; STR r 16): proposed
 * non-recurrent expenditure for the prescribed period, the current year's
 * recurrent and non-recurrent estimates, future expenditure to raise now and
 * hold in reserve, and the contributions to be raised. The period is 3 years
 * for 7 to 20 units and 5 years above 20, prepared again each period.
 * Excluded: 6 or fewer units, or common property buildings insured for not
 * more than $200,000. r 16(3) was amended on 1 Sep 2026; the value before
 * then was not read.
 */
export const EXPENDITURE_STATEMENT = {
  contents: [
    "proposed expenditure (other than recurrent expenditure) for the prescribed period",
    "estimated recurrent and non-recurrent expenditure for the current financial year",
    "estimated future expenditure for which funds should be raised now and held in reserve",
    "the amount to be raised by contributions to cover the current and reserve expenditure",
  ],
  periodYears: [
    { unitsFrom: 7, unitsTo: 20, years: 3, preparedEveryYears: 3 },
    { unitsFrom: 21, unitsTo: null, years: 5, preparedEveryYears: 5 },
  ],
  excluded: { unitsAtMost: 6, commonPropertyInsuredAtMostCents: 20_000_000 },
  formsPartOfMinutes: true,
  source: `${STA} s 33A; ${STR} r 16`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Levy notices for a strata scheme: the STA and STR set no notice period,
 * content or form for a contribution (read in full). The treasurer notifies
 * unit holders (STR r 10(2)(a)). Contrast a community scheme: 14 days' notice
 * with prescribed contents (COMMUNITY_SCHEMES.contributionNotice).
 */
export const LEVY_NOTICES = {
  statutoryContentRule: false,
  statutoryMinimumNoticeDays: null,
  statutoryForm: false,
  source: `${STA} s 27; ${STR} r 10(2)(a) (both read in full)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

const NOTICE_PROPOSAL = "Proposed in FOR_REVIEW NOTICE_TIMING; not decided";

/**
 * The notice rules in the shared shape, for a strata scheme. The law sets no
 * least or most notice, no content and no form, so every timing value is a
 * product choice. None has been made: each has no value, so every notice is
 * refused until a pack version records the decision (fails closed). The
 * numbers outside `checked` are only the safest values for a reader that does
 * not know `checked`, and they are the proposal in FOR_REVIEW, not decided.
 */
export const NOTICE_RULES: NoticeRules = {
  minimumNoticeDays: 14,
  issueDaysBeforeDue: 35,
  urgentNoticeDays: null,
  hardship: null,
  contents: [],
  source: LEVY_NOTICES.source,
  checked: {
    minimumNoticeDays: {
      value: null,
      status: "NOT_CONFIRMED",
      source: `${STA} s 27; ${NOTICE_PROPOSAL}`,
      note: "The STA and STR set no least notice for a contribution. A StrataVerze floor is needed and is not decided (14 days is proposed, as a community scheme must give)",
    },
    // The STA and STR set no most notice (CONFIRMED absent, read in full).
    maximumNoticeDays: null,
    issueDaysBeforeDue: {
      value: null,
      status: "NOT_CONFIRMED",
      source: NOTICE_PROPOSAL,
      note: "How long before the due date each notice goes out is a StrataVerze choice, not decided (35 days is proposed, as NSW and Queensland)",
    },
    dueDateMayMove: {
      value: null,
      status: "NOT_CONFIRMED",
      source: `${STA} s 27(2), (4)(a); ${NOTICE_PROPOSAL}`,
      note: "Whether the ordinary resolution that levies a contribution fixes its due date is not stated, so whether a late notice may fall due later is not decided (never moving it is proposed)",
    },
    noticeMode: {
      ADMINISTRATIVE: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STA} s 27(4)(a); ${NOTICE_PROPOSAL}`,
        note: "The STA sets no notice rule. One notice for each instalment is proposed, not decided",
      },
      CAPITAL_WORKS: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STA} s 27(4)(a); ${NOTICE_PROPOSAL}`,
        note: "The STA sets no notice rule. One notice for each instalment is proposed, not decided",
      },
    },
    requiredContents: [],
    form: null,
    source: `${STA} s 27; ${STR} (read in full)`,
  },
};

/** No hardship or payment plan statement on a contribution notice: CONFIRMED absent from the STA and STR (read in full) and from CTR r 26. */
export const HARDSHIP_STATEMENT = {
  required: false,
  source: `${STA}; ${STR}; ${CTR} r 26`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Interest on contributions in arrears (STA s 27(4)(b); STR r 11). There is no
 * statutory rate: by ordinary resolution the corporation may fix interest, in
 * accordance with the regulations, which cap it at 15% a year and forbid
 * interest on unpaid interest. The same in a community scheme (CTA s 114(4)(b);
 * CTR r 25).
 */
export const INTEREST = {
  statutoryRatePercent: null,
  fixedBy: "ORDINARY",
  maxAnnualRatePercent: 15,
  maxInclusive: true,
  noInterestOnInterest: true,
  /** From which day, any grace period and the daily basis: not stated (the resolution may set them). */
  accrualStated: false,
  recoverableAsDebt: true,
  source: `${STA} s 27(4)(b), (5); ${STR} r 11; ${CTA} s 114(4)(b), (8); ${CTR} r 25`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The late charge in the shared shape. No interest unless an ordinary
 * resolution fixes a rate, of not more than 15% a year, simple. From which day
 * interest runs, any grace period and the days a year's rate is shared over
 * are not stated in the law (the resolution may set them), so they have no
 * value and the engine charges nothing until a pack version records how a
 * resolution's terms are held (FOR_REVIEW LATE_CHARGE). No waiver provision.
 */
export const LATE_CHARGE: LateChargeRules = {
  method: "ANNUAL_RATE",
  modes: ["NONE", "RESOLVED_ANNUAL_RATE"],
  defaultMode: "NONE",
  resolutionRequiredFor: ["RESOLVED_ANNUAL_RATE"],
  annualRatePercent: null,
  maxMonthlyRatePercent: null,
  graceMonths: 0,
  source: INTEREST.source,
  annual: {
    // South Australia fixes no rate: interest only where an ordinary resolution fixes one.
    statutoryRatePercent: null,
    resolvedRate: {
      resolution: {
        value: { kind: "ORDINARY", words: "an ordinary resolution" },
        status: "CONFIRMED",
        source: `${STA} s 27(4)(b)`,
        note: "\"A strata corporation may, by ordinary resolution ... fix (in accordance with the regulations) interest\".",
      },
      minPercent: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STR} r 11`,
        note: "The regulations give only a highest rate. The lowest rate StrataVerze would accept is a product choice, not decided (0 is proposed)",
      },
      maxPercent: { value: 15, status: "CONFIRMED", source: `${STR} r 11(a)`, note: "Must not exceed a rate of 15% per annum." },
      // "Must not exceed": 15% itself may be fixed.
      maxInclusive: true,
    },
    accrual: {
      from: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STA} s 27(4)(b)`,
        note: "Interest is on a contribution \"in arrears\". The law does not say from which day, and the resolution may say",
      },
      graceMonths: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STA} s 27(4)(b)`,
        note: "No grace period is stated in the law. The resolution may set one",
      },
      simple: { value: true, status: "CONFIRMED", source: `${STR} r 11(b)`, note: "Interest must not comprise interest on unpaid interest." },
      daysInYear: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STR} r 11`,
        note: "The law gives a rate a year and does not say how a day's share of it is worked out",
      },
    },
    waiver: null,
    source: INTEREST.source,
  },
};

/**
 * The order a payment is applied: no statutory order in the STA or STR (read
 * in full) or the CTR. The CTA parts not read could hold one. No
 * PAYMENT_ALLOCATION_ORDER is given until one is decided (FOR_REVIEW
 * PAYMENT_ALLOCATION_ORDER).
 */
export const PAYMENT_ALLOCATION = {
  statutoryOrder: null,
  absentFrom: [STA, STR, CTR],
  source: `${STA}; ${STR}; ${CTR}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Service of documents (STA s 49). */
export const SERVICE = {
  methods: ["personally", "by post", "by email, if the recipient consents to email at an address given for that purpose"],
  letterBox: "a letter box with the corporation's name for postal delivery to the site, or a post office box where there is none",
  onCorporation: ["placing it in the corporation's letter box", "post to the corporation, its secretary or treasurer at its postal address"],
  /** A unit holder cannot nominate someone else to receive meeting notices (s 33(3aa)). */
  noNomineeForMeetingNotices: true,
  source: `${STA} ss 33(3aa), 49`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** General meetings of a strata corporation (STA ss 33, 38; STR r 15). */
export const MEETINGS = {
  /** The original proprietor convenes a general meeting within 3 months after 2 or more members hold different units (s 38). */
  firstMeetingWithinMonths: 3,
  /** At least one AGM in every calendar year, no more than 15 months after the last (s 33(4)). */
  agm: { everyCalendarYear: true, maxMonthsAfterLast: 15 },
  convenedBy: ["the secretary", "any 2 members of the management committee", "unit holders of one-fifth or more of the units", "the original proprietor (first meeting)", "an order of the Magistrates Court"],
  /** Written notice of the day, time and place to all unit holders at least 14 days before (s 33(3)). */
  noticeDays: 14,
  agenda: [
    "the text of any unanimous or special resolution",
    "a motion confirming the minutes of the previous general meeting",
    "AGM: the accounts for the previous accounting period",
    "AGM: the contributions for the current accounting period",
    "AGM: the s 33A statements",
    "AGM: copies of all insurance policies required by the Act",
    "AGM: appointment of the presiding officer, treasurer and secretary, and other appointments",
    "AGM: the number and nature of applications for relief under Part 3A",
    "AGM: any body corporate manager contract to enter, renew or extend, and where to see it and the pamphlet",
    "AGM: proposed controls on expenditure by delegates",
  ],
  /** Persons entitled to exercise the voting power for not less than one-half of the units (s 33(5)). */
  quorum: { fractionOfUnits: 1 / 2, counts: "voting power for the units, present when the meeting proceeds to business" },
  /** After 30 minutes: adjourn 7 to 14 days, same time and place, reasonable written notice; then those present and entitled are the quorum (s 33(6), (7)). */
  noQuorum: { waitMinutes: 30, adjournDaysMin: 7, adjournDaysMax: 14, thenPresentAreQuorum: true },
  /** Remote attendance where the articles provide, or on a written request the secretary arranges; no duty to provide (s 33(11); r 15(4)). */
  remoteAttendance: true,
  /** A body corporate manager presides only if a majority present and entitled agree (s 33(9); r 15(2), (3)). */
  managerMayPresideIfMajorityAgree: true,
  /** The secretary prepares and distributes the minutes and moves their confirmation at the next meeting; no deadline (r 10(1)(a)). */
  minutesDeadlineDays: null,
  source: `${STA} ss 33, 38, 40(1)(a); ${STR} rr 10(1), 15`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Resolutions of a strata corporation (STA ss 3(1), 34(8), 46; STR r 3(2)). */
export const RESOLUTIONS = {
  ORDINARY: {
    test: "a simple majority of the votes of unit holders present and voting at a properly convened meeting",
    /** No express tie rule in the STA; a tie is not a simple majority (NOT_CONFIRMED reading). */
    tieRuleStatus: "NOT_CONFIRMED" as RuleStatus,
  },
  SPECIAL: {
    noticeDays: 14,
    noticeStates: ["the terms of the proposed resolution", "the reasons for it (STR r 3(2))"],
    /** Votes against not more than 25% of the total votes that could be cast if all unit holders were present and entitled to vote. */
    againstAtMostPercentOfTotalVotes: 25,
    countsTotalForAllUnits: true,
    /** With only 3 units, 1 vote each: no vote, or only 1 vote, against. */
    threeUnits: { againstAtMostVotes: 1 },
  },
  UNANIMOUS: { test: "a special resolution passed without any dissentient vote at a general meeting" },
  /** Decisions are by ordinary resolution unless the Act or articles say otherwise (s 34(8)). */
  defaultKind: "ORDINARY",
  /** A failed unanimous resolution with special support may be declared sufficient by the Supreme Court or Magistrates Court (s 46). */
  courtReliefForFailedUnanimous: true,
  source: `${STA} ss 3(1), 34(8), 46; ${STR} r 3(2)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Votes, proxies and debtors (STA ss 34, 34A). */
export const VOTING = {
  votesPerUnit: 1,
  /** By unit entitlement only where all units are non-residential and a unanimous resolution adopts it (s 34(2)). */
  unitEntitlementVotingIfAllNonResidential: true,
  proxy: {
    by: "written notice to the secretary",
    scope: "all meetings and matters, or specified meetings or matters, with any conditions",
    mustStatePecuniaryInterestBehindDirection: true,
    revocable: true,
    maxMonths: 12,
    invalidIfFormNotMet: true,
    /** A body corporate manager's proxy ends when the manager stops acting (s 34(3c)). */
    managerProxyEndsWithRole: true,
    /** No numerical cap on proxies held (CONFIRMED absent). */
    cap: null,
  },
  attorneyMaxMonths: 12,
  absenteeVoteHoursBefore: 6,
  writtenBallotOnDemand: true,
  /** "Except where a unanimous resolution is required, a vote is not exercisable in relation to a unit unless all amounts due and payable ... have been paid" (s 34(7)). */
  debtorsMayVoteOn: ["UNANIMOUS"],
  source: `${STA} ss 34, 34A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Officers (STA s 23; STR r 10). */
export const OFFICERS = {
  required: ["presiding officer", "secretary", "treasurer"],
  mustBeUnitHoldersUnlessAllNonResidential: true,
  oneMayHoldAll: true,
  appointedAt: "a general meeting",
  maxVacantMonths: 6,
  source: `${STA} ss 23, 44A; ${STR} r 10`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The management committee, which is optional (STA ss 35, 36). */
export const MANAGEMENT_COMMITTEE = {
  required: false,
  appointedBy: "ORDINARY",
  membersAreUnitHoldersUnlessAllNonResidential: true,
  /** Full power to transact business, subject to limits, but nothing needing a special or unanimous resolution (s 35(2), (3)). */
  fullPowerSubjectToLimits: true,
  quorum: "the number of members divided by 2, ignoring any fraction, plus 1",
  /** A majority decision at a meeting of which at least 3 days' notice was given to all members (s 35(4b)). */
  meetingNoticeDays: 3,
  removalBy: "ORDINARY",
  coOptsCasualVacancies: true,
  mustKeepMinutesAndAccounts: true,
  source: `${STA} ss 35, 36`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Recovering unpaid contributions (STA ss 27(5), 41A, 48A). A debt, with no
 * statutory pre-action notice, charge or payment plan. Held as data only:
 * FEATURES.debtRecoverySteps is off and no shared recovery rule is given, as
 * who decides to sue and which court hears a plain debt claim are not
 * confirmed.
 */
export const RECOVERY = {
  /** An unpaid contribution and its interest are recoverable as a debt from the current unit holder (s 27(5)). */
  recoverableAsDebt: true,
  /** The Magistrates Court hears Part 3A applications, may give judgment on a monetary claim, as a minor civil action (ss 41A(2), (9)(f), 48A). */
  partThreeAForumWords: "the Magistrates Court",
  partThreeAMayGiveMonetaryJudgment: true,
  /** Which court hears a plain debt claim, and its limits: the Magistrates Court Act 1991 was not read. */
  plainDebtCourt: { value: null, status: "NOT_CONFIRMED" as RuleStatus, source: `${STA} s 27(5)` },
  /** Who decides to start proceedings: not stated (ss 27A, 35). */
  whoDecides: { value: null, status: "NOT_CONFIRMED" as RuleStatus, source: `${STA} ss 27A(2)(d), 35(2)` },
  noStrataTribunal: true,
  statutoryPreActionNotice: false,
  statutoryCharge: false,
  statutoryPaymentPlan: false,
  /** Legal and collection costs beyond court costs orders (s 41A(9)(g)): not confirmed. */
  recoveryCostsRecoverable: { value: null, status: "NOT_CONFIRMED" as RuleStatus, source: `${STA} s 41A(9)(g)` },
  source: `${STA} ss 27(5), 34(7), 41A, 48A; ${STR} (read in full)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** A penalty for breaching the articles (STA s 19(3a) to (5); STR r 9(2), Form 4). */
export const ARTICLES_PENALTY = {
  maxCents: { residentialOrMixed: 50_000, businessOnly: 200_000 },
  notice: "Schedule 1 Form 4",
  payWithinDaysAtLeast: 60,
  recoverableAsContributionWithInterest: true,
  revocationApplicationWithinDays: 60,
  source: `${STA} s 19(3a) to (5); ${STR} r 9(2), Sch 1 Form 4`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Information on application (STA s 41; STR r 31): the statement a buyer or
 * mortgagee relies on, and copies and inspection. Within 5 business days.
 * Fees as amended on 1 Sep 2026 (the earlier values were not read); the
 * corporation may reduce or waive them. FEATURES for the NSW certificate and
 * inspections stay off: this shape is not the NSW one.
 */
export const INFORMATION_ON_APPLICATION = {
  whoMayApply: ["the owner of a unit", "a mortgagee of a unit", "a prospective purchaser", "a prospective mortgagee", "a person acting for any of them"],
  withinBusinessDays: 5,
  givenTo: ["the secretary", "any member of the management committee"],
  statement: [
    "particulars of contributions payable for the unit, including arrears",
    "particulars of the corporation's assets and liabilities",
    "particulars of expenditure incurred or resolved to which the unit holder must or is likely to contribute",
  ],
  copies: ["minutes of general and committee meetings for up to 2 years", "the last statement of accounts", "the articles", "current insurance policies"],
  inspection: ["the accounting records", "the minute books", "the original proprietor's handover documents (s 38(3))", "any body corporate manager contract", "the register of unit holders"],
  /** The statement is conclusive evidence, as at its date, for the person given it, against the corporation (s 41(4)). */
  statementConclusive: true,
  feesCents: {
    statement: { owner: 0, other: 5_000 },
    copies: { owner: 1_000, other: 5_000, otherWithInsurancePolicies: 7_000 },
    inspection: { owner: 0, other: 1_000 },
  },
  feesIncreasedForGst: true,
  corporationMayReduceOrWaive: true,
  feesFrom: "2026-09-01",
  /** Quarterly ADI statements on a unit holder's application, unless a manager keeps the accounts (s 41(1a), (1b)). */
  quarterlyBankStatements: true,
  /** Insurance policies produced within 5 business days of a request (s 32). */
  insurancePoliciesWithinBusinessDays: 5,
  /** Records held by a delegate: inspection within 10 business days, copies at most $1.75 a page (s 27D(7); r 13(3)). */
  delegateRecords: { inspectWithinBusinessDays: 10, copyPerPageMaxCents: 175 },
  source: `${STA} ss 27D(7), 32, 41; ${STR} rr 13(3), 31`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Records and how long they are kept (STA ss 39A, 40; STR rr 29, 30). */
export const RECORDS_RETENTION_PERIODS = {
  years: {
    minuteBooks: 30,
    accountingRecords: 7,
    statementsOfAccount: 7,
    noticesOrOrdersServed: 7,
    correspondence: 7,
    noticesOfMeetings: 7,
    originalProprietorDocuments: 30,
    registerSourceInformation: 7,
  },
  register: ["name", "last contact address", "telephone number", "email address", "unit entitlement"],
  /** Ending 30 June, or a fixed period of 9 to 18 months (s 40(2)). */
  accountingPeriod: { defaultEnds: "06-30", fixedMonthsMin: 9, fixedMonthsMax: 18 },
  agentRecordsYears: 5,
  source: `${STA} ss 36G(4), 39A, 40; ${STR} rr 29, 30`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Insurance (STA ss 29A to 32; STR r 14). */
export const INSURANCE = {
  buildings: "all buildings and building improvements on the site, to replacement value, including demolition and professional fees",
  risks: "home building prescribed events under Part 5 of the Insurance Contracts Act 1984 (Cth), other than subsidence, and regulation risks",
  proceedsToReinstatement: true,
  /** Not required where one proprietor holds every unit and none is under contract for sale (s 29A). */
  exemptWhenOneOwnerNoSale: true,
  /** At least $10,000,000 (the Act's $5,000,000 raised by the regulations). */
  publicLiabilityMinCents: 1_000_000_000,
  fidelity: {
    amount: "the higher of the maximum total bank balances in the preceding 3 years and $50,000",
    floorCents: 5_000_000,
    notRequiredWhen: "the corporation has no administrative or sinking funds",
  },
  policiesAtAgm: true,
  valuationFrequency: null,
  source: `${STA} ss 29A, 30, 31, 32, 33(4b)(c)(iv); ${STR} r 14`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Audit: none required of a strata corporation's accounts (STA and STR read in full); agents' trust accounts are audited yearly. */
export const AUDIT = {
  corporationAccountsAuditRequired: false,
  courtMayOrderAudit: true,
  agentTrustAccounts: { auditEachFinancialYear: true, auditor: "a registered company auditor", statementToSecretaryWithinMonths: 2 },
  source: `${STA} ss 36H, 41A(9)(ba); ${STR} r 26`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Body corporate managers and trust money, headline only (STA ss 27A to 27D, 36A to 36L; STR rr 12, 13, 17 to 28). */
export const BODY_CORPORATE_MANAGERS = {
  /** No licence under the STA (read in full). Other licensing law (Land Agents Act 1994) not researched. */
  licenceUnderStrataTitlesAct: false,
  paidOnlyUnderWrittenContract: true,
  professionalIndemnityMinCentsPerClaim: 150_000_000,
  terminationAfterContinuousMonths: 12,
  terminationNoticeDays: 28,
  terminationBy: "ORDINARY",
  contractAvailableClearDaysBeforeMeeting: 5,
  returnRecordsWithinBusinessDays: 10,
  returnTrustMoneyWithinBusinessDays: 7,
  trustAccounts: "accounts approved by the Commissioner for Consumer Affairs under the Land Agents Act 1994 and the Conveyancers Act 1994",
  delegationBy: "ORDINARY",
  /** Functions needing a special or unanimous resolution cannot be delegated (s 27A(4)). */
  noDelegationOfSpecialOrUnanimousFunctions: true,
  source: `${STA} ss 27A to 27D, 36A to 36L; ${STR} rr 12, 13, 17, 18, 26`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Disputes (STA Part 3A): the Magistrates Court; there is no strata tribunal. */
export const DISPUTES = {
  forum: "the Magistrates Court (the District Court with its permission or on transfer; the Supreme Court on a question of general importance)",
  whoMayApply: ["the strata corporation", "the owner or occupier of a unit", "a contracted purchaser", "any other person bound by the articles except visitors"],
  orders: ["settlement", "reports", "audits", "remedial orders", "restraint", "declarations of validity", "altering the articles", "varying decisions", "varying or ending a body corporate manager contract", "monetary judgment", "costs", "interim orders"],
  source: `${STA} ss 19A, 41AA, 41A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Time (Standard Time Act 2009 (SA) s 3): one standard time for the whole
 * State, 9 hours 30 minutes ahead of UTC, subject to the Daylight Saving Act
 * 1971 (not read). No part of SA has another standard time, so no Broken Hill
 * style exception applies inside SA. Broken Hill is in New South Wales and
 * keeps South Australian time: that is a point for the NSW pack (FOR_REVIEW
 * TIME_ZONE).
 */
export const TIME_ZONE = {
  standardOffsetMinutes: 570,
  standardTimeStatus: "CONFIRMED" as RuleStatus,
  daylightSavingStatus: "NOT_CONFIRMED" as RuleStatus,
  /** The IANA zone StrataVerze would use: a proposal (FOR_REVIEW TIME_ZONE). */
  iana: { value: "Australia/Adelaide", status: "STRATAVERZE" as RuleStatus, decided: false },
  exceptionsInsideState: [],
  source: `${STANDARD_TIME} ss 3, 4`,
} as const;

/** Postcodes: not researched. src/config/jurisdictions.ts holds no SA ranges (FOR_REVIEW POSTCODES). */
export const POSTCODES = {
  ranges: null,
  status: "NOT_CONFIRMED" as RuleStatus,
  note: "Check against Australia Post, including border localities, before adding SA ranges.",
} as const;

/**
 * Community schemes (CTA; CTR), held apart from the shared shapes, which are
 * written for strata schemes. Not supported (SCHEME_TYPE). Every value has a
 * status; where the CTA was not read, it says so.
 */
export const COMMUNITY_SCHEMES = {
  terminology: {
    ownersCorporation: "community corporation",
    committee: "management committee",
    act: "Community Titles Act 1996",
    actShort: "CTA",
    lot: "lot",
    lots: "lots",
    byLaws: "by-laws",
    developer: "developer",
    /** "Community Corporation No. [number of the deposited community plan] Incorporated" (s 71(2), (3)). */
    bodyCorporateName: "Community Corporation No. {plan} Incorporated",
    planLabel: "Community plan",
    source: `${CTA} ss 3(1), 71`,
    status: "CONFIRMED" as RuleStatus,
  },
  tiers: {
    kinds: ["PRIMARY", "SECONDARY", "TERTIARY"],
    /** A lower corporation, not its lot owners, is the member of the higher corporation for its lot (s 74(2)); it votes there only if authorised by resolution of its members (s 86). */
    lowerCorporationIsMember: true,
    developmentLotOwnerIsMember: false,
    source: `${CTA} ss 3(1), 7, 8, 74, 86`,
    status: "CONFIRMED" as RuleStatus,
  },
  lotEntitlement: {
    basis: "unimproved value (for a strata lot, including its part of the building), within ±10%",
    aggregate: { min: 2, max: 100_000 },
    decides: ["contribution shares unless a unanimous resolution says otherwise", "shares of defaulted liabilities", "distribution of excess funds", "the 20% convening test"],
    source: `${CTA} ss 20, 77(2), 81(1)(c), 114(3), 117; ${CTR} r 5`,
    status: "CONFIRMED" as RuleStatus,
  },
  funds: {
    administrativeAndSinkingRequired: true,
    nonRecurrentFrom: "sinking fund",
    assetSaleProceedsTo: "sinking fund",
    excessBy: "SPECIAL",
    source: `${CTA} ss 116, 117`,
    status: "CONFIRMED" as RuleStatus,
  },
  contributions: {
    fixedBy: "ORDINARY",
    fixedInGeneralMeetingNotByCommittee: true,
    basis: "lot entitlement, unless a unanimous resolution provides otherwise",
    instalmentsBy: "ORDINARY",
    ownerAndSubsequentOwnerJointlyLiable: true,
    source: `${CTA} s 114(1) to (8)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** CTA s 114(5), (6); CTR r 26. Shared NOTICE_RULES cannot hold these beside the strata values. */
  contributionNotice: {
    payableOnDayInNotice: true,
    minimumNoticeDays: 14,
    contents: [
      "the lot the contribution or instalment is for",
      "the amount of the contribution or instalment",
      "for instalments, the amount and day of each",
      "the day on or before which it must be paid, at least 14 days after the notice is served",
      "the total the corporation has decided to raise by contributions",
      "the purpose or purposes of the money raised",
      "the rate of interest on a contribution or instalment in arrears",
      "the name of the person to whom payment should be sent or delivered",
    ],
    source: `${CTA} s 114(5), (6); ${CTR} r 26`,
    status: "CONFIRMED" as RuleStatus,
  },
  interest: { sameAsStrata: true, source: `${CTA} s 114(4)(b); ${CTR} r 25`, status: "CONFIRMED" as RuleStatus },
  expenditureResolutions: {
    /** Less than $5,000 times lots: ordinary. At least that: special if council or authority works, or less than $10,000 times lots. Otherwise unanimous. */
    ordinaryBelowPerLotCents: 500_000,
    specialBelowPerLotCents: 1_000_000,
    specialForAuthorityRequiredWorks: true,
    source: `${CTA} s 119; ${CTR} r 27`,
    status: "CONFIRMED" as RuleStatus,
  },
  meetings: {
    firstStatutoryMeetingWithinMonths: 3,
    agmWithinMonthsOfFinancialYearStart: { PRIMARY: 3, SECONDARY: 6, TERTIARY: 6 },
    noticeDays: 14,
    convenedBy: ["an officer", "any 2 committee members", "members with 20% or more of the lot entitlement value or of the lots", "an order of the Magistrates Court"],
    quorum: "the number of persons entitled to attend and vote divided by 2, disregarding any fraction, plus 1",
    noQuorum: { waitMinutes: 30, adjournDaysMin: 7, adjournDaysMax: 14, thenPresentAreQuorum: true },
    tieLoses: true,
    source: `${CTA} ss 79, 81 to 84; ${CTR} rr 17 to 19`,
    status: "CONFIRMED" as RuleStatus,
  },
  resolutions: {
    special: "at least 14 days' notice of the text and reasons, served on all owners; votes against 25% or less of the total votes that could be cast; 3 lots: no vote or only 1 against",
    unanimous: "at least 14 days' notice of the text and reasons; no vote against",
    source: `${CTA} ss 3(1), 88; ${CTR} rr 3, 20`,
    status: "CONFIRMED" as RuleStatus,
  },
  voting: {
    votesPerLotIfAnyResidential: 1,
    developerVotesCappedAtOthers: true,
    developerMayNotBeProxyIfAnyResidential: true,
    /** No vote for a lot unless all amounts payable for it are paid; no unanimous resolution exception (s 84(14)). */
    debtorsMayVoteOn: [],
    source: `${CTA} ss 84, 87`,
    status: "CONFIRMED" as RuleStatus,
  },
  officers: {
    appointedBy: "ORDINARY",
    combinedOffices: { upTo10Lots: "two or all offices by one person", from11Lots: "two offices by one person" },
    termEndsAtNextAgm: true,
    removalBy: "SPECIAL, on misconduct, neglect of duty or incapacity",
    source: `${CTA} s 76`,
    status: "CONFIRMED" as RuleStatus,
  },
  managementCommittee: {
    required: false,
    noticeDays: 3,
    decisionWithoutMeetingWithinDays: 7,
    mayNotFixContributions: true,
    source: `${CTA} ss 90 to 99, 114(2)`,
    status: "CONFIRMED" as RuleStatus,
  },
  audit: {
    required: true,
    exemptWhen: [
      "contributions for the year and each fund's opening balance are each not more than $30,000",
      "one person owns every lot",
      "residential only, not more than 6 lots, and a unanimous resolution not to audit that year",
    ],
    thresholdCents: 3_000_000,
    source: `${CTA} ss 80(2)(d), 138; ${CTR} r 30`,
    status: "CONFIRMED" as RuleStatus,
  },
  insurance: {
    bodilyInjuryMinCents: 1_000_000_000,
    buildings: "buildings and improvements on the common property and, in a strata scheme, the divided buildings, for full replacement with new materials",
    fidelityNotRequiredWhen: ["common property buildings insured for not more than $100,000", "a 2-lot corporation with no administrative or sinking funds"],
    source: `${CTA} ss 103 to 108; ${CTR} r 21`,
    status: "CONFIRMED" as RuleStatus,
  },
  information: {
    withinBusinessDays: 5,
    feesCents: { statement: { owner: 0, other: 5_000 }, quarterlyStatements: 5_000, copies: { owner: 1_000, other: 5_000, otherWithInsurancePolicies: 7_000 }, inspection: { owner: 0, other: 1_000 } },
    higherTierMustAnswer: true,
    source: `${CTA} ss 139, 140; ${CTR} r 31`,
    status: "CONFIRMED" as RuleStatus,
  },
  retentionYears: { minutes: 30, accountingRecords: 7, statementsOfAccount: 7, noticesOrOrders: 7, correspondence: 7, noticesOfMeetings: 7, registerSourceInformation: 7 },
  retentionSource: `${CTA} ss 135 to 137; ${CTR} rr 28, 29`,
  service: { source: `${CTA} s 155`, status: "CONFIRMED" as RuleStatus },
  disputes: { forum: "the Magistrates Court", source: `${CTA} ss 141, 142`, status: "CONFIRMED" as RuleStatus },
  notRead: ["ss 13, 14, 16 to 19, 21 to 70", "ss 78A to 78D (body corporate managers)", "ss 100 to 102, 110 to 112", "ss 120 to 134 (agents' trust accounts, owners' obligations)", "ss 142A to 154, 155A, 155B, 156", "the Schedule (including converting a strata scheme, cl 2)"],
} as const;

/**
 * Reform Bills, never applied. The 2024 Bill passed the House of Assembly and
 * reached the Legislative Council (second reading moved 13 Nov 2025), but is
 * listed under Bills of Earlier Sessions: it did not pass. No strata or
 * community titles Bill is in the current session (checked 31 Oct 2026). The
 * Bill text was not read, so no value of it is held as a dated rule.
 */
export const PENDING_REFORMS = [
  {
    key: "BILL_2024_COMMUNITY_AND_STRATA_TITLES",
    title: BILL_2024,
    legalStatus: "NOT_LAW",
    stage: "passed the House of Assembly; second reading moved in the Legislative Council on 13 Nov 2025; not passed before the session ended",
    proposed: [
      "public liability insurance of at least $20 million",
      "a 10-year spending plan in place of the 5-year limit",
      "an easier quorum",
      "limits on conflicted proxy votes",
      "body corporate manager disclosure",
      "a higher community audit threshold",
      "21 days to lodge varied by-laws",
    ],
    textStatus: "NOT_READ",
    inForce: false,
    source: "legislation.sa.gov.au bill page (Bills of Earlier Sessions); Hansard, Legislative Council, 13 Nov 2025; House of Assembly debate 2025 (summaries)",
  },
  {
    key: "BIODIVERSITY_ACT_2025",
    title: "Biodiversity Act 2025 (SA), Sch 5 cl 98 (STA) and cl 10 (CTA)",
    legalStatus: "ENACTED_NOT_COMMENCED",
    stage: "assented 26 Jun 2025; uncommenced",
    proposed: ["consequential amendments; the provisions affected were not read (probably the statutory encumbrance definitions)"],
    textStatus: "NOT_READ",
    inForce: false,
    source: `${STA} and ${CTA} legislative history`,
  },
] as const;

/**
 * Rules whose current value starts on a date. Only the current values were
 * read (those in force from 1 Sep 2026), so a day before then has no value.
 */
export const DATED_RULES = {
  INFORMATION_FEES: {
    title: "The STA s 41 information fees (STR r 31(2))",
    versions: [
      {
        legalStatus: "IN_FORCE",
        from: "2026-09-01",
        value: INFORMATION_ON_APPLICATION.feesCents,
        source: `${STR} r 31(2), as amended by 76/2026`,
        status: "CONFIRMED",
        note: "The values before 1 Sep 2026 were not read.",
      },
    ],
  } satisfies DatedRule<typeof INFORMATION_ON_APPLICATION.feesCents>,
  DELEGATE_COPY_FEE: {
    title: "The most a delegate may charge a page for copies of records (STR r 13(3))",
    versions: [
      {
        legalStatus: "IN_FORCE",
        from: "2026-09-01",
        value: INFORMATION_ON_APPLICATION.delegateRecords.copyPerPageMaxCents,
        source: `${STR} r 13(3), as amended by 76/2026`,
        status: "CONFIRMED",
        note: "The value before 1 Sep 2026 was not read.",
      },
    ],
  } satisfies DatedRule<number>,
  EXPENDITURE_STATEMENT_EXCLUSION: {
    title: "Strata corporations excluded from the multi-year expenditure statement (STR r 16(3))",
    versions: [
      {
        legalStatus: "IN_FORCE",
        from: "2026-09-01",
        value: EXPENDITURE_STATEMENT.excluded,
        source: `${STR} r 16(3), as amended by 76/2026`,
        status: "CONFIRMED",
        note: "The value before 1 Sep 2026 was not read.",
      },
    ],
  } satisfies DatedRule<typeof EXPENDITURE_STATEMENT.excluded>,
} as const;

/**
 * The words for the things the platform names, for a strata scheme. A
 * community scheme's words are in COMMUNITY_SCHEMES.terminology.
 */
export const TERMINOLOGY = {
  ownersCorporation: "strata corporation",
  ownersCorporations: "strata corporations",
  committee: "management committee",
  act: "Strata Titles Act 1988",
  actShort: "STA",
  jurisdictionShort: "SA",
  /**
   * SA has no strata tribunal: disputes and Part 3A applications go to the
   * Magistrates Court (s 41A(2)). The shared field is named "tribunal"; it
   * holds the court (FOR_REVIEW TERMINOLOGY).
   */
  tribunal: "Magistrates Court",
  levy: "contribution",
  levies: "contributions",
  lateCharge: "interest",
  planLabel: "Strata plan",
  /** "Strata Corporation No. [number] Incorporated" (s 18(1)); "Inc." may be used (s 18(2)). */
  bodyCorporateName: "Strata Corporation No. {plan} Incorporated",
  bodyCorporateShortName: "Strata Corporation No. {plan} Inc.",
  scheme: "strata scheme",
  lot: "unit",
  lots: "units",
  owner: "unit holder",
  articles: "articles",
  manager: "body corporate manager",
  developer: "original registered proprietor",
  officers: ["presiding officer", "secretary", "treasurer"],
  source: `${STA} ss 3(1), 18, 23, 27, 35, 41A`,
} as const;

/** What is not confirmed (31 Oct 2026), for the review. */
export const NOT_CONFIRMED = [
  "Whether a strata corporation's management committee may levy contributions: STA s 27(2) says \"by ordinary resolution\", and s 35(2) gives the committee full power subject to limits.",
  "Who in a strata corporation decides to start debt proceedings, and whether a delegation of \"the collection of money due\" (STA s 27A(2)(d)) covers starting them.",
  "Which court hears a plain contribution debt claim, and its limits (the Magistrates Court Act 1991 was not read). The Part 3A route to the Magistrates Court is confirmed.",
  "From which day interest runs, any grace period, and how a day's share of the yearly rate is worked out: the law leaves these to the resolution.",
  "Whether legal and collection costs are recoverable from the owner beyond court costs orders (STA s 41A(9)(g)).",
  "The values before 1 Sep 2026 of STR rr 13(3), 16(3) and 31(2), and of the community regulations (the 2011 regulations were not read).",
  "CTA ss 13, 14, 16 to 19, 21 to 70, 78A to 78D, 100 to 102, 110 to 112, 120 to 134, 142A to 154, 155A, 155B, 156 and the Schedule (including converting a strata scheme to the CTA, Sch cl 2).",
  "Whether new strata plans can still be deposited under the STA: Part 2 Division 2 was deleted from 1 Jun 2009, and what it held was not read.",
  "Disclosure to a buyer on sale (SA vendor statement law, outside the two Acts, not researched).",
  "The Daylight Saving Act 1971 (SA) and the Daylight Saving Regulations 2024.",
  "SA postcode ranges and border localities.",
  "The text of the Statutes Amendment (Community and Strata Titles) Bill 2024 and the day it lapsed.",
  "What the Biodiversity Act 2025 amendments to the STA and CTA change.",
  "Whether a tie on an STA ordinary resolution fails: the STA has no tie rule (the CTA says a tie is lost, s 84(15)).",
  "Whether the CTA parts not read set a payment allocation order.",
  "Land Agents Act 1994 licensing as it applies to body corporate managers.",
] as const;

/** StrataVerze's decisions: none yet. Each FOR_REVIEW point moves here once Matthew Wrigley decides it. */
export const DECISIONS: readonly { decision: string; decidedBy: string; decidedOn: string }[] = [];

/**
 * Points for Matthew Wrigley to decide or confirm before sign-off. LEGAL:
 * a reading of the law to confirm. PRODUCT: a StrataVerze choice, with the
 * proposed decision, not made.
 */
export const FOR_REVIEW: readonly { key: string; kind: "LEGAL" | "PRODUCT"; point: string; proposedDecision?: string }[] = [
  {
    key: "COMMUNITY_SCHEMES_SUPPORTED",
    kind: "PRODUCT",
    point:
      "Whether StrataVerze supports community schemes at first. The CTA differs from the STA on rules the engine runs: the contribution notice (14 days and eight prescribed items, CTR r 26, against none), the funds (both required, against neither), the quorum, the debtor vote rule (no unanimous exception), the AGM timing, the audit and the spending thresholds (CTR r 27). The shared NOTICE_RULES and MEETING_RULES hold one value per pack and cannot choose by scheme type. Secondary and tertiary corporations are members of a higher corporation (CTA ss 74(2), 86), and development lots, leaseback arrangements and developer vote caps are not modelled. Community schemes are common in SA and new subdivisions are community titled, so a strata-only launch covers older stock only.",
    proposedDecision:
      "Launch with strata schemes only (SCHEME_TYPE COMMUNITY_TITLES not supported), keep the community rules in COMMUNITY_SCHEMES, and add community schemes next, starting with primary schemes with no secondary or tertiary plan, no development lot and no leaseback, once the shared shapes can choose by scheme type and the unread CTA sections are read.",
  },
  {
    key: "SCHEME_TYPE_RECORDED",
    kind: "PRODUCT",
    point: "SCHEME_TYPE is recorded by the adviser in the Building rules section, outside the locked building record. A community scheme recorded there is flagged as not supported.",
    proposedDecision: "Record it as proposed, and refuse onboarding of a building recorded as a community scheme until community schemes are supported.",
  },
  {
    key: "FUNDS",
    kind: "PRODUCT",
    point:
      "The STA requires no named fund (s 27(1); STR r 14(2)(b)). Every strata corporation is given the administrative fund as StrataVerze's ledger fund (STRATAVERZE), and the sinking fund is optional (CONFIRMED). The fund label \"sinking fund\" for a strata scheme comes from STR r 14(2)(b); the STA says \"reserve funds\".",
    proposedDecision: "Give every strata corporation the administrative fund and offer the sinking fund as optional, labelled \"Sinking Fund\".",
  },
  {
    key: "NOTICE_TIMING",
    kind: "PRODUCT",
    point:
      "The STA and STR set no least or most notice, no content and no form for a contribution notice. NOTICE_RULES.checked holds no timing value, so every SA notice is refused until decided. A due date set by the levy resolution and whether it may move are not stated.",
    proposedDecision: "A 14-day least notice (as the CTA requires of community schemes), notices issued 35 days before the due date (as NSW and Queensland), one notice for each instalment, and a due date that never moves.",
  },
  {
    key: "LATE_CHARGE",
    kind: "LEGAL",
    point:
      "No interest unless an ordinary resolution fixes a rate (STA s 27(4)(b)), of at most 15% a year (inclusive), simple (STR r 11). The law does not say from which day interest runs, any grace period or the daily basis; the resolution may. These have no value, so no interest is charged. The lowest rate accepted is not stated. No waiver provision exists. Confirm, and decide how a resolution's own terms (start day, grace period) are recorded.",
    proposedDecision: "Accept rates from 0 to 15% inclusive; record the start day and any grace period from each resolution; share a year's rate over 365 days; round once to the cent, as NSW.",
  },
  {
    key: "PAYMENT_ALLOCATION_ORDER",
    kind: "PRODUCT",
    point: "No statutory order in the STA, STR or CTR. No PAYMENT_ALLOCATION_ORDER is given yet.",
    proposedDecision: "Contributions, then interest, then recovery costs, as NSW and the other draft packs.",
  },
  {
    key: "DEBTOR_VOTING",
    kind: "LEGAL",
    point:
      "STA s 34(7): no vote for a unit with any amount due and payable unpaid, except on a unanimous resolution. Confirm that \"all amounts due and payable\" covers contributions, interest and articles penalties, and that the test is on the meeting's day.",
  },
  {
    key: "SPECIAL_RESOLUTION",
    kind: "LEGAL",
    point:
      "An STA special resolution is measured by the votes against (not more than 25% of the total votes that could be cast if all unit holders were present and entitled), not by votes for, so abstentions and absentees do not stop it. With only 3 units, 1 vote each: no vote, or only 1 vote, against. The notice states the terms and the reasons (STR r 3(2)). Confirm.",
  },
  {
    key: "QUORUM",
    kind: "LEGAL",
    point: "STA quorum: persons entitled to exercise the voting power for at least half of the units, present when the meeting proceeds to business; then adjourn 7 to 14 days, after which those present and entitled are the quorum (s 33(5), (6)). Whether a unit in arrears (which cannot vote) counts towards the quorum is not stated. Confirm.",
  },
  {
    key: "DEBT_RECOVERY",
    kind: "LEGAL",
    point:
      "Contributions and interest are recoverable as a debt (s 27(5)); no statutory final notice, charge or payment plan; no strata tribunal. Who decides to sue and which court hears a plain debt are NOT_CONFIRMED, so FEATURES.debtRecoverySteps stays off and no shared recovery rule is given.",
    proposedDecision: "Accept a motion carried at a general meeting or a management committee meeting as the decision to sue, never the manager alone, and record a court of competent jurisdiction, once confirmed.",
  },
  {
    key: "TERMINOLOGY",
    kind: "PRODUCT",
    point: "TERMINOLOGY.tribunal holds \"Magistrates Court\", as SA has no strata tribunal. TERMINOLOGY.lot and lots are \"unit\" and \"units\", and the body is named \"Strata Corporation No. {plan} Incorporated\". Confirm the screens may call the Magistrates Court the place disputes are heard.",
  },
  {
    key: "INFORMATION_ON_APPLICATION",
    kind: "PRODUCT",
    point:
      "The s 41 statement (5 business days, conclusive, fees from 1 Sep 2026) is not the NSW certificate shape, so FEATURES.strataInformationCertificate and recordsInspections stay off. Decide whether to build an SA s 41 workflow.",
  },
  {
    key: "AUDIT",
    kind: "LEGAL",
    point: "No audit of a strata corporation's accounts is required (STA and STR read in full); community corporations must audit unless exempt (CTA s 138; CTR r 30). Confirm.",
  },
  {
    key: "TIME_ZONE",
    kind: "PRODUCT",
    point:
      "SA has one standard time, UTC+9:30 (Standard Time Act 2009 s 3), so no Broken Hill style exception applies inside SA. Daylight saving law was not read. Broken Hill is in NSW and keeps SA time: check the NSW pack and the building time zone for NSW postcode 2880.",
    proposedDecision: "Use Australia/Adelaide for every SA building.",
  },
  {
    key: "POSTCODES",
    kind: "PRODUCT",
    point: "SA postcode ranges were not researched. src/config/jurisdictions.ts holds none for SA.",
    proposedDecision: "Add SA ranges from Australia Post, with border localities, before SA is switched on.",
  },
  {
    key: "PENDING_REFORMS",
    kind: "LEGAL",
    point:
      "The Statutes Amendment (Community and Strata Titles) Bill 2024 is listed as a Bill of an earlier session and did not pass; no successor is in the current session (31 Oct 2026). Its proposals (public liability $20 million, a 10-year plan, quorum, proxies, manager disclosure) are held as NOT_LAW notes, not dated rules. Watch for a new Bill.",
  },
  {
    key: "NON_RESIDENTIAL_SCHEMES",
    kind: "PRODUCT",
    point: "Where all units are non-residential the STA relaxes several rules (officers and committee need not be unit holders, votes by unit entitlement may be adopted, alterations by the articles). The pack holds no selector for it.",
    proposedDecision: "Refuse onboarding of an all non-residential strata scheme until a selector is added.",
  },
] as const;

/**
 * None of the NSW workflows applies in SA at stage 1, as WA and the ACT had
 * at their stage 1. Every switch is off.
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
