/**
 * Statutory rules for Tasmanian strata schemes under the Strata Titles Act
 * 1998 (Tas) ("STA") and the Strata Titles (Insurance) Regulations 2019 (Tas)
 * ("STIR").
 *
 * DRAFT, FOR STRATAVERZE TO REVIEW (31 Oct 2026). Not signed off and not
 * applied to any building: `rulePackFor` returns active packs only, and
 * Tasmania is not in SUPPORTED_SCHEME_STATES or the database's state check.
 * Every value below comes from the research notes of 31 Oct 2026
 * (tas-research.md) and keeps their status (see RuleStatus in ./types). No
 * StrataVerze decision has been made (DECISIONS is empty); the points to
 * decide, including every product choice a later stage will need, are in
 * FOR_REVIEW, and the gaps in NOT_CONFIRMED.
 *
 * Sources, read on 31 Oct 2026:
 * - the STA, whole Act HTML on legislation.tas.gov.au, "Version current from
 *   5 November 2021" (read in Chrome: s 3, ss 16, 17, Parts 6 to 9, ss 144,
 *   147, 149, 154 to 156, 158A to 161, Schedules 1 and 1A in full; the rest in
 *   the contents only), and its legislative history (first page);
 * - the STIR, S.R. 2019 No. 48, "Version current from 26 August 2019" (read in
 *   full: 3 regulations);
 * - NRE Tasmania guidance (no dates shown): Strata Title Information and FAQs,
 *   Body Corporate - Strata Schemes, and Review of the Strata Titles Act 1998
 *   (the last through a summary only);
 * - the Parliament of Tasmania's list of Bills introduced in 2026 (through a
 *   summary only).
 *
 * The Act is thin: it has no budget, audit, accounts, financial year, records
 * retention, levy notice content, special resolution, statutory interest rate,
 * proxy rule, debtor voting bar or manager licensing. Those points are
 * "CONFIRMED absent" (read and searched in the Act; scheme by-laws never
 * checked), and the engine values that would need them have no value, so the
 * engine refuses rather than guesses (it fails closed).
 *
 * Schedule 1 model by-laws apply only where a scheme's own by-laws do not deal
 * with the subject (STA s 90(5)). Rules from Schedule 1 are marked
 * `defaultByLaw: true`.
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

const STA = "Strata Titles Act 1998 (Tas)";
const STIR = "Strata Titles (Insurance) Regulations 2019 (Tas)";
const NRE_BODY_CORPORATE = "NRE Tasmania, Body Corporate - Strata Schemes (no date shown)";
const NRE_REVIEW = "NRE Tasmania, Review of the Strata Titles Act 1998 (no date shown; read through a summary only)";
const PARLIAMENT_BILLS_2026 = "Parliament of Tasmania, Bills introduced into Parliament 2026 (read through a summary only)";

/** The versions read, for the review. */
export const SOURCES = {
  act: { title: STA, version: "Version current from 5 November 2021", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-1998-017", readOn: "2026-10-31" },
  insuranceRegulations: { title: STIR, version: "Version current from 26 August 2019", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2019-048", readOn: "2026-10-31" },
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The kind of scheme (STA s 3 "scheme"; ss 71, 72, 74(2)): a strata scheme
 * (Part 2), a staged development scheme (Part 3) or a community development
 * scheme (Part 4), and a strata scheme may have 2 or more bodies corporate
 * with constituent documents. Which options are `supported` is a StrataVerze
 * proposal, not law (FOR_REVIEW): only a strata scheme with a single body
 * corporate was researched beyond headline level.
 */
export const SCHEME_TYPE: SchemeSelector = {
  key: "schemeType",
  label: "Scheme type",
  help: "The kind of Tasmanian scheme the building is, as registered.",
  options: [
    { value: "STRATA_SINGLE_BODY_CORPORATE", label: "Strata scheme with one body corporate", supported: true },
    {
      value: "STRATA_SEVERAL_BODIES_CORPORATE",
      label: "Strata scheme with 2 or more bodies corporate",
      supported: false,
      note: "Membership, voting and functions follow the constituent documents (STA ss 72(6), (7), 74(2), 81(2)). Not researched.",
    },
    { value: "STAGED_DEVELOPMENT", label: "Staged development scheme", supported: false, note: "STA Part 3. Not researched beyond the contents." },
    { value: "COMMUNITY_DEVELOPMENT", label: "Community development scheme", supported: false, note: "STA Part 4. Not researched beyond the contents." },
  ],
  source: `${STA} ss 3, 71, 72, 74(2)`,
  status: "CONFIRMED",
};

/** No lot-count tiers or size thresholds: none found anywhere in the STA. */
export const SIZE_CLASSES = {
  tiers: null,
  note: "No lot-count tier or threshold was found in the STA. The only number of members in the Act is a committee of at least 3 (s 79(3)).",
  source: STA,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The body corporate (STA ss 71, 73, 74, 87, 88). Established on registration
 * of the strata plan as "Strata Corporation No. ....... with the addition of
 * the name of the strata scheme". It must, as soon as practicable, appoint a
 * chairperson, secretary and treasurer.
 */
export const BODY_CORPORATE = {
  establishedOn: "registration of the strata plan",
  nameFormat: "Strata Corporation No. ....... with the addition of the name of the strata scheme",
  /** NRE's example. That the number is the strata plan number is stated only in guidance. */
  nameExample: { value: "Strata Corporation No. 751231, 1 North Street, New Town", source: NRE_BODY_CORPORATE, status: "GUIDANCE" as RuleStatus },
  perpetualSuccessionAndSeal: true,
  excludedFromCorporationsAct: true,
  officers: ["chairperson", "secretary", "treasurer"],
  officersAppointed: "as soon as practicable after it is established",
  /** Each owner of a lot is a member (single body corporate). A mortgagee in possession exercises the owner's votes. */
  members: "each owner of a lot",
  mortgageeInPossessionVotes: true,
  /** The seal is affixed only if authorised by a resolution of the body corporate or its committee, attested by at least 2 members (or the only one). */
  sealAuthorisedBy: ["resolution of the body corporate", "resolution of the committee of management"],
  sealAttestedByMembers: 2,
  addressForService: "as registered by the Recorder, with changes notified to the Recorder",
  mailbox: "a mailbox clearly showing its name at or near the street alignment, or suitable alternative arrangements",
  source: `${STA} ss 71(1), (3) to (5), 73(2), 74(1), (3), 87, 88(1)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * One fund (STA s 82): a body corporate must maintain a fund for meeting its
 * financial obligations; all income is paid into it and all expenditure made
 * from it; "if the body corporate thinks fit" it may be subdivided into a part
 * for recurrent expenditure and a part for capital expenditure; and it must be
 * kept at a level sufficient for reasonably foreseeable expenditure.
 *
 * The ledger has two fund types, so the fund is held as the ledger's
 * administrative fund, and the optional capital expenditure part as its
 * capital works fund. That mapping and the names below are StrataVerze
 * proposals (FUND_NAMING, FOR_REVIEW). The law in each entry is CONFIRMED.
 */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "FUND",
    name: "body corporate fund",
    label: "Body Corporate Fund",
    shortLabel: "Fund",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Meeting the body corporate's financial obligations under the Act. All income is paid into it and all expenditure made from it. Where the fund is subdivided, this is its recurrent expenditure part.",
    required: true,
    source: `${STA} s 82(1), (2), (4)`,
    status: "CONFIRMED",
  },
  {
    key: "CAPITAL_EXPENDITURE",
    name: "capital expenditure fund",
    label: "Capital Expenditure Fund",
    shortLabel: "Capital",
    ledgerFund: "CAPITAL_WORKS",
    purpose: "The part of the fund related to capital expenditure, where the body corporate has subdivided the fund.",
    // Optional: the fund may be subdivided "if the body corporate thinks fit" (s 82(3)).
    required: false,
    source: `${STA} s 82(3)`,
    status: "CONFIRMED",
  },
];

/** Rules about the fund as a whole (STA s 82). */
export const FUND_RULES = {
  singleFundRequired: true,
  allIncomeInAllExpenditureOut: true,
  mayBeSubdividedIntoRecurrentAndCapital: true,
  /** "If the body corporate thinks fit": by what resolution is not stated. */
  subdivisionDecidedBy: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Section 82(3) says \"if the body corporate thinks fit\" and names no resolution." },
  levelSufficientForReasonablyForeseeableExpenditure: true,
  capitalWorksPlanRequired: false,
  source: `${STA} s 82`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The fund names and the ledger mapping above: StrataVerze proposals, not law (FOR_REVIEW). */
export const FUND_NAMING = {
  names: { FUND: "Body Corporate Fund", CAPITAL_EXPENDITURE: "Capital Expenditure Fund" },
  note: "The Act says only \"a fund\", with parts \"related to recurrent expenditure\" and \"related to capital expenditure\" (s 82(1), (3)). The names and the ledger mapping are StrataVerze proposals.",
  source: `${STA} s 82`,
  status: "STRATAVERZE" as RuleStatus,
} as const;

/**
 * One schedule held on each lot: the lot's general unit entitlement (STA
 * s 16). A lot may also have special unit entitlements, each for one or more
 * of: contributions, interest in the common property, votes at a general
 * meeting, and the share of income (s 16(2)(b), (3)). StrataVerze holds none
 * of them yet, so a building with a special unit entitlement is not supported
 * (UNIT_ENTITLEMENT_RULES, FOR_REVIEW).
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "UNIT_ENTITLEMENT",
    name: "unit entitlement",
    label: "Unit Entitlement",
    help: "The lot's general unit entitlement, a whole number, as shown on the strata plan.",
    onLot: true,
    usedFor: [
      "contributions, unless a special unit entitlement for contributions is fixed",
      "the owner's interest in the common property, unless a special unit entitlement for it is fixed",
      "votes on a poll at a general meeting, unless a special unit entitlement for votes is fixed",
      "the share of the body corporate's income, unless a special unit entitlement for it is fixed",
    ],
    source: `${STA} ss 16, 76(2)(a), 83(2)(a)`,
    status: "CONFIRMED",
  },
];

/** How unit entitlements are fixed and changed (STA ss 16, 17, 124). */
export const UNIT_ENTITLEMENT_RULES = {
  wholeNumber: true,
  fairAndEquitable: true,
  generalOrSpecial: true,
  specialPurposes: ["contributions", "interest in the common property", "votes at a general meeting", "share of income"],
  /** A lot with a special unit entitlement also has a general one for other purposes (s 16(3)). */
  specialNeedsGeneralToo: true,
  /** StrataVerze proposal: a building with any special unit entitlement is not supported yet (FOR_REVIEW). */
  specialEntitlementsSupported: { value: false, status: "STRATAVERZE" as RuleStatus, note: "Proposed, not decided: StrataVerze holds one schedule only." },
  changedBy: ["unanimous resolution", "order under Part 9", "agreement of the owners concerned, with mortgagee and lessee consent, where the total is not affected"],
  changeTakesEffect: "on registration of an amendment of the plan",
  recorderMayRedetermine: true,
  source: `${STA} ss 16, 17, 124`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Contributions (STA ss 83, 125). The body corporate may from time to time
 * levy contributions to raise an amount it decides is necessary to meet
 * anticipated expenditure, "or for any other purpose as agreed by an ordinary
 * resolution". For a strata scheme they are proportionate to the unit
 * entitlements. A contribution falls due on a date the body corporate fixes
 * and notifies by written notice of the amount due. The owner at the due date
 * is liable, and a later owner before payment jointly and severally. While
 * unpaid, the owner is taken to have failed to comply with the Act.
 */
export const CONTRIBUTIONS = {
  purposes: ["to meet anticipated expenditure, as the body corporate decides", "any other purpose agreed by an ordinary resolution"],
  /** Whether the ordinary resolution qualifies only "any other purpose" or the whole power: a reading point (FOR_REVIEW). */
  ordinaryResolutionScope: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Section 83(1) can be read either way. Who decides a contribution for anticipated expenditure (general meeting or committee, s 79(2)) is not stated." },
  basis: "proportionate to the unit entitlements of the lots",
  dueDate: "a date fixed by the body corporate and notified by written notice of the amount due",
  liableOwner: "the owner at the due date, and jointly and severally any later owner before payment",
  unpaidIsFailureToComplyWithAct: true,
  budgetRequired: false,
  instalmentsInAct: false,
  earlyPaymentDiscountInAct: false,
  recorderMayRedetermine: "contributions that are inadequate or excessive, and an unreasonable manner of payment",
  source: `${STA} ss 83(1) to (4A), 125`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The contribution notice (STA s 83(3)): written notice of the amount due. No form, content, least or most notice, and no hardship statement (CONFIRMED absent; by-laws not checked). */
export const CONTRIBUTION_NOTICES = {
  writtenNoticeOfAmountDue: true,
  statutoryForm: false,
  statutoryContent: false,
  statutoryMinimumNoticeDays: null,
  statutoryMaximumNoticeDays: null,
  hardshipStatementRequired: false,
  source: `${STA} s 83(3) (Act searched for "hardship", "instalment", "discount")`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Why each notice timing value has none yet. */
const NO_NOTICE_CHOICE = "The Act sets none (s 83(3)). A StrataVerze value is a product choice, proposed in FOR_REVIEW and not decided, so no notice can be issued until a pack version records it.";

/**
 * The contribution notice rules in the shared shape, from CONTRIBUTION_NOTICES
 * only. The Act sets no least or most notice, no form and no content beyond a
 * written notice of the amount due, so every timing value is a product choice
 * StrataVerze has not made: each has no value (NOT_CONFIRMED) and every notice
 * is refused (it fails closed). The numbers outside `checked` are 0 because
 * the Act gives no number. They are the most permissive values, not the
 * safest, and are never relied on: `checked` refuses every notice
 * (noticeRuleProblems). They are not law.
 */
export const NOTICE_RULES: NoticeRules = {
  minimumNoticeDays: 0,
  issueDaysBeforeDue: 0,
  urgentNoticeDays: null,
  hardship: null,
  contents: [],
  source: CONTRIBUTION_NOTICES.source,
  checked: {
    minimumNoticeDays: { value: null, status: "NOT_CONFIRMED", source: `${STA} s 83(3)`, note: NO_NOTICE_CHOICE },
    // The Act sets no most notice (CONFIRMED absent; by-laws not checked).
    maximumNoticeDays: null,
    issueDaysBeforeDue: { value: null, status: "NOT_CONFIRMED", source: `${STA} s 83(3)`, note: NO_NOTICE_CHOICE },
    dueDateMayMove: {
      value: null,
      status: "NOT_CONFIRMED",
      source: `${STA} s 83(3)`,
      note: "The body corporate fixes the due date and notifies it. Whether StrataVerze may give a later date where a notice is late is a reading and a product choice, proposed in FOR_REVIEW.",
    },
    noticeMode: {
      ADMINISTRATIVE: { value: null, status: "NOT_CONFIRMED", source: `${STA} s 83(3)`, note: "The Act sets no notice rule. One notice for each instalment is proposed in FOR_REVIEW, not decided." },
      CAPITAL_WORKS: { value: null, status: "NOT_CONFIRMED", source: `${STA} ss 82(3), 83(3)`, note: "The Act sets no notice rule. One notice for each instalment is proposed in FOR_REVIEW, not decided." },
    },
    requiredContents: [],
    form: null,
    source: `${STA} s 83(3) (Act searched for "hardship", "instalment", "discount")`,
  },
};

/**
 * Interest on overdue contributions (STA ss 84, 117): it accrues at a rate
 * fixed by resolution of the body corporate, on a fair and reasonable basis.
 * The Act fixes no rate and no maximum, so there is none without a
 * resolution. The Recorder may vary an unreasonable rate and remit accrued
 * interest.
 */
export const INTEREST_ON_OVERDUE_CONTRIBUTIONS = {
  statutoryRatePercent: null,
  rateFixedBy: "resolution of the body corporate",
  /** The kind of resolution, and whether a committee decision is one (s 79(2)), are not stated. */
  resolutionKind: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "\"resolution of the body corporate\": not said to be ordinary or unanimous, and a committee may exercise the body corporate's powers other than those needing a unanimous resolution (s 79(2))." },
  fairAndReasonable: true,
  statutoryMaximumPercent: null,
  recorderMayVaryAndRemit: true,
  bodyCorporateWaiverInAct: false,
  source: `${STA} ss 79(2), 84, 117`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The late charge in the shared shape, from INTEREST_ON_OVERDUE_CONTRIBUTIONS
 * only. No interest by default (the Act fixes no rate). A rate may be fixed by
 * resolution, but the kind of resolution, any bounds StrataVerze would apply
 * (the Act has only "fair and reasonable"), from when it runs, whether it is
 * simple and the day count are NOT_CONFIRMED, so no rate can be recorded and
 * no interest is charged until a pack version records them. No waiver: the
 * Act gives the body corporate none (only the Recorder may remit, s 117).
 */
export const LATE_CHARGE: LateChargeRules = {
  method: "ANNUAL_RATE",
  modes: ["NONE", "RESOLVED_ANNUAL_RATE"],
  defaultMode: "NONE",
  resolutionRequiredFor: ["RESOLVED_ANNUAL_RATE"],
  // The annual-rate rule is in `annual`; these older fields hold nothing for it.
  annualRatePercent: null,
  maxMonthlyRatePercent: null,
  graceMonths: 0,
  source: INTEREST_ON_OVERDUE_CONTRIBUTIONS.source,
  annual: {
    // Tasmania fixes no rate: interest only at a rate fixed by resolution (s 84(1)).
    statutoryRatePercent: null,
    resolvedRate: {
      resolution: { value: null, status: "NOT_CONFIRMED", source: `${STA} ss 79(2), 84(1)`, note: INTEREST_ON_OVERDUE_CONTRIBUTIONS.resolutionKind.note },
      minPercent: { value: null, status: "NOT_CONFIRMED", source: `${STA} s 84`, note: "The Act sets no lowest rate. Any bound StrataVerze applies is a product choice, proposed in FOR_REVIEW." },
      maxPercent: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STA} ss 84(2), 117`,
        note: "The Act sets no highest rate: the rate must be fair and reasonable (s 84(2)) and the Recorder may vary an unreasonable one (s 117). Any cap StrataVerze applies is a product choice, proposed in FOR_REVIEW.",
      },
      maxInclusive: true,
    },
    accrual: {
      from: { value: null, status: "NOT_CONFIRMED", source: `${STA} ss 83(3), 84(1)`, note: "Interest accrues on \"overdue contributions\". Reading that as from the day after the due date (s 83(3)) is not confirmed." },
      graceMonths: { value: null, status: "NOT_CONFIRMED", source: `${STA} s 84`, note: "The Act states no grace period, and the resolution fixing the rate may set terms." },
      simple: { value: null, status: "NOT_CONFIRMED", source: `${STA} s 84`, note: "The Act does not say whether the interest is simple." },
      daysInYear: { value: null, status: "NOT_CONFIRMED", source: `${STA} s 84`, note: "The Act does not say how a day's share of a yearly rate is worked out." },
    },
    waiver: null,
    source: INTEREST_ON_OVERDUE_CONTRIBUTIONS.source,
  },
};

/**
 * The order a payment is applied to contributions, interest and recovery
 * costs: no statutory order (CONFIRMED absent: Part 6 read in full; by-laws
 * not checked). The pack has no PAYMENT_ALLOCATION_ORDER until StrataVerze
 * decides one (FOR_REVIEW).
 */
export const PAYMENT_ALLOCATION = {
  statutoryOrder: "NO_STATUTORY_RULE" as const,
  source: `${STA} Part 6 (read in full; searched "unpaid", "overdue", "arrear")`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Service of notices (STA ss 154 to 156). No electronic service in the Act (searched "electronic", "email"). */
export const SERVICE_OF_NOTICES = {
  general: ["post in accordance with the regulations to the address for service or last known residence or business", "leaving it at the address for service or last known residence or business"],
  addressForServiceMayBe: ["the address in a dealing or caveat", "the address in the valuation roll", "the address in the electoral roll"],
  recorderMayDirectAnotherManner: true,
  onBodyCorporate: ["the chairperson, secretary or another committee member", "prepaid post to the body corporate's address in the registered plan"],
  onOwners: "prepaid post to the owner's address in the body corporate's records, or if none, to the lot",
  toOwnersGenerally: "may be served on the body corporate, which must bring it to all owners' attention",
  electronicServiceInAct: false,
  /** "in accordance with the regulations": no postal regulation was found. */
  postalRegulation: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "The statutory rules list for the STA showed no results, so whether a regulation governs posting was not confirmed." },
  /** Whether email service is valid under other law (Electronic Transactions Act 2000 (Tas), not read). */
  emailValid: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "The Electronic Transactions Act 2000 (Tas) was not read." },
  source: `${STA} ss 154 to 156`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * General meetings (STA ss 75, 78, 128; Sch 1 cl 10). The first AGM is called
 * by the original proprietor within 3 months after registration or on the sale
 * of half the lots, whichever is earlier. Each later AGM within 15 months of
 * the last. A special general meeting may be called by the committee or the
 * secretary, and must be on the requisition of not less than one-third of the
 * members. At least 7 days' written notice to each member.
 */
export const MEETINGS = {
  firstAgm: {
    calledBy: "the original proprietor",
    withinMonthsAfterRegistration: 3,
    orOnSaleOfFractionOfLots: 1 / 2,
    whicheverEarlier: true,
    noticeStatesBusiness: true,
    insurancePoliciesProduced: true,
    penaltyUnits: 50,
    source: `${STA} s 75(1), (1A)`,
    status: "CONFIRMED" as RuleStatus,
  },
  agmWithinMonthsOfLastAgm: 15,
  /** NRE also says each year (GUIDANCE); the Act says only within 15 months. */
  agmEveryYearGuidance: { value: true, source: NRE_BODY_CORPORATE, status: "GUIDANCE" as RuleStatus },
  specialGeneralMeeting: {
    calledBy: ["the committee of management", "the secretary"],
    mustOnRequisitionOfNotLessThanFractionOfMembers: 1 / 3,
    /** NRE says "more than one-third of the lot owners", which differs from the Act's "not less than one-third of the total number of members". The Act is followed. */
    guidanceDiffers: { guidance: "more than one-third of the lot owners", source: NRE_BODY_CORPORATE, status: "GUIDANCE" as RuleStatus },
    source: `${STA} s 75(3)`,
    status: "CONFIRMED" as RuleStatus,
  },
  noticeDays: 7,
  noticeGivenBy: "the secretary",
  noticeContents: ["the date, time and place", "the nature of the business", "the terms of any proposed unanimous resolution"],
  coOwnersNoticeMayBeJoint: true,
  /** How the 7 days is counted (clear days or not) is not confirmed: the Acts Interpretation Act 1931 (Tas) was not read. */
  noticeDayCounting: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "\"at least 7 days before\": whether clear days are meant was not checked." },
  quorum: {
    words: "a majority of the total number of the members of the body corporate",
    defaultByLaw: true,
    note: "Schedule 1 cl 10, a model by-law that applies only where the scheme's by-laws do not deal with quorum (s 90(5)).",
    source: `${STA} Sch 1 cl 10; s 90(3), (5)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** No fallback, adjournment or reduced quorum where a meeting has no quorum (Act and model by-laws). */
  noQuorumFallback: null,
  generalMeetingMinutesRuleInAct: false,
  remoteAttendanceInAct: false,
  recorderMayConvene: true,
  recorderMayInvalidateWithinDaysAfterMeeting: 30,
  source: `${STA} ss 75, 123, 128; Sch 1 cl 10`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Resolutions (STA ss 3, 76, 78). Two kinds only: ordinary (a majority of the
 * votes of members present and voting at a duly convened meeting) and
 * unanimous (no member casts a dissentient vote, at the meeting or by written
 * notice within 28 days after it). There is no special resolution. Voting is
 * by show of hands, or on a poll by unit entitlement.
 */
export const RESOLUTIONS = {
  ORDINARY: {
    words: "a majority of the votes of members present and voting at the meeting",
    atDulyConvenedMeeting: true,
    /** No tie or casting vote rule found (searched "casting"). */
    tie: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Equal votes are not addressed and no casting vote was found." },
    source: `${STA} s 3 "ordinary resolution"`,
    status: "CONFIRMED" as RuleStatus,
  },
  UNANIMOUS: {
    words: "no member of the body corporate casts a dissentient vote (at the meeting or later as allowed by this Act)",
    atDulyConvenedMeeting: true,
    noticeMustSetOutTerms: true,
    laterWrittenVoteWithinDaysAfterMeeting: 28,
    recorderMayExcludeOrShortenIfUrgent: true,
    /** Where the written vote must be received, and how the 28 days is counted. */
    laterVoteCounting: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Section 78(1)(b) says \"by giving the body corporate written notice of the member's vote within 28 days after the date of that meeting\". Day counting was not checked." },
    source: `${STA} ss 3 "unanimous resolution", 75(4)(c), 78`,
    status: "CONFIRMED" as RuleStatus,
  },
  specialResolutionInAct: false,
  voting: {
    showOfHands: true,
    pollBy: "unit entitlement of the member's lot (strata scheme)",
    coOwners: "a jointly appointed proxy; without one, no vote on a show of hands except on a unanimous resolution, but any co-owner may require a poll and votes on it in proportion to their interest",
    underDisability: ["a guardian", "a person authorised to administer the member's property", "a person appointed by the Tribunal"],
    source: `${STA} ss 74(3), 76, 77`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** No bar on owners in arrears voting was found (Act searched "arrear", "unpaid", "overdue"; by-laws not checked). */
  debtorsBarred: false,
  debtorsBarredSource: `${STA} (searched)`,
  debtorsBarredStatus: "CONFIRMED" as RuleStatus,
  /** What the Act requires each kind for (selected). */
  requiredFor: [
    { matter: "changing unit entitlements", kind: "UNANIMOUS", provision: "s 17(1)(a)" },
    { matter: "dividing the body corporate", kind: "UNANIMOUS", provision: "s 72(1)" },
    { matter: "appointing, changing, overruling or removing the committee of management", kind: "ORDINARY", provision: "s 79(1)" },
    { matter: "levying contributions for any other purpose", kind: "ORDINARY", provision: "s 83(1)" },
    { matter: "further insurance", kind: "ORDINARY", provision: "s 81(1)(d)" },
    { matter: "the body corporate bearing a one-lot excess", kind: "ORDINARY", provision: "s 99(5)" },
    { matter: "making, amending, rescinding or confirming an exclusive use by-law", kind: "ORDINARY", provision: "s 94(1), (8)" },
  ],
  /** The resolution needed for other by-laws is not stated in ss 90 or 92. */
  otherByLawsResolution: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Section 92(1)(b) requires the application to state \"the nature of the resolution\", but ss 90 and 92 name none." },
  certificateUnderSeal: "a certificate under the common seal that a resolution was passed on a date, and its nature, may be relied on by the Recorder or a council (s 149)",
  source: `${STA} ss 3, 17, 72, 75(4), 76 to 79, 81, 83, 94, 99, 149`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Proxies (STA ss 74(1), 76(1), (3)): allowed. No form, duration, limit or bar on a manager holding them was found. */
export const PROXIES = {
  allowed: true,
  formInAct: false,
  limitInAct: false,
  managerBarInAct: false,
  coOwnersJointProxy: true,
  source: `${STA} ss 74(1), 76(1), (3)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The committee of management (STA ss 75(3), 79). Optional: the body corporate
 * may appoint one by ordinary resolution, of at least 3 members. It may
 * exercise the body corporate's powers other than those needing a unanimous
 * resolution, subject to general meeting limits and directions. Quorum a
 * majority of its members and decisions by a majority present, unless the
 * general meeting sets other fair and reasonable rules. It must keep proper
 * minutes, available on request to any member.
 */
export const COMMITTEE = {
  required: false,
  appointedBy: "ORDINARY",
  minMembers: 3,
  mayRepresentSectionalInterests: true,
  powers: "any power of the body corporate except those that may only be exercised by unanimous resolution, subject to general meeting limits and directions",
  quorum: "a majority of the total number of committee members",
  decisions: "a majority of the members present",
  /** The general meeting may set other rules, which must be fair and reasonable (s 79(4), (5)). */
  rulesMayBeChangedByGeneralMeeting: true,
  minutesKeptAndAvailableToMembers: true,
  meetingNoticeInAct: false,
  source: `${STA} ss 75(3), 79`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Recovering unpaid contributions (STA ss 83(4), (4A), 105, 113, 138, 144;
 * Sch 1A). An unpaid contribution is a failure to comply with the Act, so the
 * body corporate may apply to the Recorder of Titles for relief (fee $25.00),
 * and the Recorder may order the contributions paid. A payment order may be
 * registered in a court having jurisdiction for the recovery of debts and
 * enforced as its judgment. An appeal lies to the Tribunal within 30 days.
 * The Act does not say contributions are recoverable as a debt in a court
 * (NOT_CONFIRMED). Held in its own shape (not the shared DEBT_RECOVERY): the
 * pack has no recovery steps and FEATURES.debtRecoverySteps is off.
 */
export const LEVY_RECOVERY = {
  forum: {
    words: "the Recorder of Titles, on an application for relief",
    orderToPayContributions: true,
    applicationInWriting: ["the grounds in detail", "the general nature of the relief sought", "the prescribed fee"],
    applicationFeeCents: 2_500,
    source: `${STA} ss 83(4A), 105(1), 113(1)(a); Sch 1A item 9`,
    status: "CONFIRMED" as RuleStatus,
  },
  enforcement: {
    words: "a Recorder's order for the payment of money may be registered in a court having jurisdiction for the recovery of debts up to the amount, and enforced as a judgment of that court",
    source: `${STA} s 138`,
    status: "CONFIRMED" as RuleStatus,
  },
  appeal: {
    to: "the Tribunal",
    withinDaysAfterOrder: 30,
    lodgedWith: "the Recorder",
    feeCents: 25_200,
    onlyByAppeal: true,
    source: `${STA} s 144; Sch 1A item 12`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Whether a court debt claim lies outside Part 9, and the court's limits: not in the STA, not researched. */
  courtDebtClaim: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "The STA says exclusive use charges (s 94(7)(a)) and by-law fines (s 96(3)) are recoverable as a debt, but says nothing of the kind for contributions." },
  /** Who in the body corporate decides to apply or sue: not stated (committee powers s 79(2); a manager's delegation is limited to the common property, s 80(1)). */
  authority: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Not stated. The committee may exercise the body corporate's powers (s 79(2)). A manager may be delegated functions related to the common property only (s 80(1))." },
  preActionNoticeInAct: false,
  statutoryChargeInAct: false,
  /** Costs are provided for only on by-law penalty applications (s 133(5)). */
  costs: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "No general costs rule for relief applications was found. Section 133(5) covers penalty applications only." },
  compensationCapCents: 500_000,
  compensationCapSource: `${STA} s 113(1)(b)`,
  incomingOwnerJointlyAndSeverallyLiable: true,
  source: `${STA} ss 83(4), (4A), 105, 113, 133(5), 138, 144; Sch 1A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The certificate on a sale (STA s 83(5), (6)). On application by an owner or
 * a person having an interest in a lot, the body corporate must certify the
 * items below. It is conclusive evidence of them in favour of a person dealing
 * with the owner. The Act sets no fee and no deadline.
 */
export const SECTION_83_CERTIFICATE = {
  whoMayApply: ["the owner", "a person having an interest in a lot"],
  items: [
    "the amount of any contribution payable by the owner",
    "the due date for payment of the contribution",
    "any amount by way of unpaid contribution that remains outstanding",
    "the amount of any other liability to the body corporate that remains outstanding from the owner",
    "information in relation to any funds of the body corporate administered by it",
    "information on any legal action to which the body corporate is a party",
    "any other matters that the body corporate considers relevant",
  ],
  conclusiveInFavourOfPersonDealingWithOwner: true,
  feeInAct: false,
  deadlineInAct: false,
  /** Whether the body corporate may charge a fee, and seller disclosure outside the STA, were not researched. */
  feeMayBeCharged: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Schedule 1A lists Recorder and council fees only." },
  sellerDisclosureOutsideAct: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "Seller disclosure is not in the STA and was not researched." },
  source: `${STA} s 83(5), (6); Sch 1A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** What an owner or member may see (STA ss 79(6), 97, 104, 118). No general records inspection right, fee or deadline. */
export const RECORDS_ACCESS = {
  committeeMinutes: "available on request for inspection by any member",
  byLaws: "a copy of the by-laws in force, on request of an owner, occupier or a person they authorise",
  insurancePolicies: "produced for inspection on an owner's request",
  repeatRequestMayBeRefusedIfUnreasonable: true,
  generalInspectionRight: false,
  feeInAct: false,
  deadlineInAct: false,
  recorderMayOrderInformation: true,
  source: `${STA} ss 79(6), 97, 104, 118`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Record keeping (STA ss 79(6), 81(4)(b)): committee minutes and a business's separate records only. No roll, accounts or retention periods. */
export const RECORD_KEEPING = {
  mustKeep: ["proper minutes of the committee of management", "separate records of any business the body corporate operates"],
  rollInAct: false,
  retentionPeriodsInAct: false,
  source: `${STA} ss 79(6), 81(4)(b) (Part 6 read in full; searched "record", "account", "retain")`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Insurance (STA ss 75(1A), 99 to 104; STIR reg 3). Building cover to
 * reinstatement as new against fire, storm, tempest, explosion and any other
 * prescribed risks, with incidental costs. Public risk cover of at least
 * $10,000,000. A one-lot excess is the lot owner's unless the body corporate
 * decides by ordinary resolution that this is unreasonable.
 */
export const INSURANCE = {
  building: {
    risks: ["fire", "storm", "tempest", "explosion", "any other prescribed risks"],
    incidentalCosts: ["removing debris", "fees of architects and other professional advisers"],
    reinstatement: "to their condition when new",
    penaltyUnits: 50,
    defence: "all reasonable steps taken and no insurer willing on reasonable terms",
    source: `${STA} s 99(1), (2), (7)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Whether any regulation prescribes further risks (s 99(2)(a)(ia)): the STIR does not; others not confirmed. */
  prescribedRisks: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "The STIR prescribes only the public risk minimum. The statutory rules list showed no results, so other regulations were not confirmed." },
  publicRiskMinimumCents: 1_000_000_000,
  publicRiskCovers: ["accidental death", "personal injury", "property damage"],
  publicRiskSource: `${STA} s 101(1); ${STIR} reg 3 (in force from 26 Aug 2019)`,
  excess: "the body corporate pays the excess and any under-insurance shortfall, but an excess from an event affecting only one lot is that lot owner's unless the body corporate decides by ordinary resolution that this is unreasonable",
  noSubrogationAgainstOwnerUnlessWilful: true,
  optionalCover: ["loss from dishonesty, negligence or other wrongful conduct", "other risks"],
  ownerMayInsureOnDefault: true,
  policiesInspectableByOwners: true,
  valuationFrequencyInAct: false,
  source: `${STA} ss 75(1A), 99 to 104; ${STIR} reg 3`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Audit, accounts and financial year: none in the STA (searched "audit", "account", "financial year": no hits). */
export const AUDIT_AND_ACCOUNTS = {
  auditRequired: false,
  accountsRequired: false,
  financialYearInAct: null,
  source: `${STA} (searched)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The manager (STA ss 80, 130). Licensing and trust money are not in the STA; other law not read. */
export const MANAGER = {
  appointedBy: "the body corporate",
  delegableFunctions: "functions related to the administration, management and control of the common property",
  subjectToControlBy: ["the general meeting", "the committee of management"],
  licensingInAct: false,
  trustAccountRulesInAct: false,
  /** Whether the Property Agents and Land Transactions Act 2016 (Tas) or other law licenses strata managers or governs their trust money: not read. */
  licensingOtherLaw: { value: null, status: "NOT_CONFIRMED" as RuleStatus, note: "The Property Agents and Land Transactions Act 2016 (Tas) was not read." },
  recorderMayTerminateUnfairServiceContract: "unfair to the owners of 25% or more of the lots, or for an excessively long term",
  source: `${STA} ss 80, 130 (searched "licen", "trust")`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** By-laws (STA ss 90 to 97). */
export const BY_LAWS = {
  firstByLaws: "those lodged with the plan, or the Schedule 1 model by-laws",
  modelByLawsFillGaps: true,
  registerWithinMonths: 3,
  lapsesIfNotLodged: true,
  inForceOn: "the day the Recorder registers it, or a later date stated in it",
  minimumLettingTermMaxMonths: 6,
  complianceNoticeMinDays: 30,
  tribunalFineMaxPenaltyUnits: 50,
  exclusiveUseLapsesAfterYearsUnlessConfirmed: 5,
  /** An exclusive use by-law expressed to be of permanent effect does not lapse (s 94(9)). */
  exclusiveUsePermanentEffectExempt: true,
  exclusiveUsePermanentEffectExemptSource: `${STA} s 94(9)`,
  source: `${STA} ss 90 to 97`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Disputes (STA Parts 9, 10). Applications for relief go to the Recorder of
 * Titles (fee $25.00), with appeals to the Tasmanian Civil and Administrative
 * Tribunal within 30 days. By-law enforcement after a compliance notice goes to
 * the Tribunal, and penalties for wilful and persistent breach to the Recorder
 * (up to 20 penalty units) or the Tribunal (up to 50).
 */
export const DISPUTES = {
  firstInstance: "the Recorder of Titles",
  appealTo: "the Tasmanian Civil and Administrative Tribunal",
  penaltyMaxPenaltyUnits: { recorder: 20, tribunal: 50 },
  interimOrderMaxMonths: 3,
  administratorBy: ["the Supreme Court (s 89)", "the Recorder (s 127)"],
  source: `${STA} ss 89, 95, 96, 105, 113, 127, 133, 144; Sch 1A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The time zone: the platform gives every Tasmanian building Australia/Hobart (src/lib/jurisdiction/time-zone.ts). The law was not read. */
export const TIME_ZONE = {
  value: "Australia/Hobart",
  note: "The platform's existing mapping, unchanged, so a StrataVerze value, not law. The Tasmanian standard time law was not read, and whether any scheme sits outside Hobart time was not checked (NOT_CONFIRMED).",
  source: "src/lib/jurisdiction/time-zone.ts",
  status: "STRATAVERZE" as RuleStatus,
} as const;

/** Postcodes: no official range was read, so none is held (src/config/jurisdictions.ts lists none for Tasmania either). */
export const POSTCODES = {
  ranges: null,
  note: "No official source was read. A range must be checked against Australia Post before a locality check is added.",
  source: "not read",
  status: "NOT_CONFIRMED" as RuleStatus,
} as const;

/**
 * Reforms (31 Oct 2026). None enacted and not in force was found, so no dated
 * rule is held and nothing is switched off for a pending change.
 */
export const PENDING_REVIEW = {
  review: {
    words: "Review of the Strata Titles Act 1998, begun in 2020, with amendments being made in three tranches. No dates, Bill or tranche status given.",
    source: NRE_REVIEW,
    status: "GUIDANCE" as RuleStatus,
  },
  bills: {
    words: "No Bill with \"Strata\", \"Land Titles\" or \"Body Corporate\" in its title on the 2026 list of Bills introduced (23 Bills). The 2025 list could not be read.",
    source: PARLIAMENT_BILLS_2026,
    status: "GUIDANCE" as RuleStatus,
  },
  enactedNotInForce: [] as const,
  latestActVersion: { from: "2021-11-05", source: `${STA}, legislative history`, status: "CONFIRMED" as RuleStatus },
} as const;

/**
 * The words the platform uses for Tasmania. Every shared term is given, from
 * the Act, so the review can see them; none is applied (the pack is a draft).
 */
export const TERMINOLOGY = {
  ownersCorporation: "body corporate",
  ownersCorporations: "bodies corporate",
  committee: "committee of management",
  act: "Strata Titles Act 1998",
  actShort: "STA",
  jurisdictionShort: "Tas",
  /**
   * The Tribunal of the Act (s 3): it hears appeals from the Recorder (s 144),
   * by-law enforcement (s 96) and penalties (s 133). Applications for relief,
   * including for unpaid contributions, go first to the Recorder of Titles
   * (s 105; DISPUTES, LEVY_RECOVERY). The full name is used because no
   * abbreviation was read in the Act. Code must not use this word for where
   * levy claims are heard.
   */
  tribunal: "Tasmanian Civil and Administrative Tribunal",
  disputesBody: "Recorder of Titles",
  levy: "contribution",
  levies: "contributions",
  /** Interest on overdue contributions (s 84). */
  lateCharge: "interest",
  planLabel: "Strata plan",
  scheme: "strata scheme",
  /**
   * "Strata Corporation No. ....... with the addition of the name of the strata
   * scheme" (s 71(1)). The number as the strata plan number, and the comma
   * before the name, follow NRE's example only (bodyCorporateNameStatus).
   */
  bodyCorporateName: "Strata Corporation No. {plan}, {name}",
  bodyCorporateShortName: "Strata Corporation No. {plan}, {name}",
  bodyCorporateNameStatus: "GUIDANCE" as RuleStatus,
  manager: "manager",
  developer: "developer",
  originalProprietor: "original proprietor",
  officers: ["chairperson", "secretary", "treasurer"],
  generalMeetings: ["annual general meeting", "special general meeting"],
  resolutions: ["ordinary resolution", "unanimous resolution"],
  source: `${STA} ss 3, 71, 75, 79, 80, 82 to 84, 105; ${NRE_BODY_CORPORATE}`,
} as const;

/** What was not confirmed on 31 Oct 2026, for the review. */
export const NOT_CONFIRMED = [
  "Whether other statutory rules under the STA are in force: the site's statutory rules list showed no results. Only the Strata Titles (Insurance) Regulations 2019 were found (by web search).",
  "Prescribed risks for building insurance (s 99(2)(a)(ia)): the STIR prescribes only the public risk minimum.",
  "The kind of resolution that fixes the interest rate (s 84(1) \"resolution of the body corporate\"), and whether a committee decision is enough (s 79(2)).",
  "From when interest runs on an overdue contribution, whether it is simple, any grace period and the day count (s 84 says none of these).",
  "Whether the ordinary resolution in s 83(1) qualifies only \"any other purpose\" or the whole power to levy, and who decides a contribution for anticipated expenditure.",
  "Who in the body corporate decides to apply to the Recorder or to sue for unpaid contributions, and whether a manager may (s 80(1) limits delegation to the common property).",
  "Whether contributions may be sued for as a debt in a court outside Part 9, the court's limits and the recoverable costs.",
  "The resolution needed to make or amend by-laws other than exclusive use by-laws (ss 90, 92).",
  "By what resolution the fund is subdivided into recurrent and capital parts (s 82(3) \"if the body corporate thinks fit\").",
  "How the 7 days' notice of a general meeting is counted, where a s 78 written vote must be received and how its 28 days is counted (the Acts Interpretation Act 1931 (Tas) was not read).",
  "Whether notices may be served by email (the Electronic Transactions Act 2000 (Tas) was not read), and whether a regulation governs posting under s 154(1)(a).",
  "A tie on an ordinary resolution (no casting vote found), and what happens where a general meeting has no quorum (no fallback found).",
  "Seller disclosure outside the STA, and whether a body corporate may charge for a s 83(5) certificate.",
  "Any deadline for giving a s 83(5) certificate: none is in the STA, and other law was not read.",
  "Records inspection beyond committee minutes (s 79(6)), by-laws (s 97) and insurance policies (s 104): no general right was found in the STA, and other law was not read.",
  "Manager licensing and trust money rules outside the STA (the Property Agents and Land Transactions Act 2016 (Tas) was not read).",
  "The details of the three-tranche review (NRE page read through a summary only), and the 2025 Bills list (could not be fetched).",
  "Postcode ranges for Tasmania, and the time zone law.",
  "Staged development and community development schemes, and strata schemes with 2 or more bodies corporate, beyond headline level.",
  "That the body corporate's number is the strata plan number, and the comma in the name (NRE's example only).",
  "NRE guidance on special general meetings (\"more than one-third of the lot owners\") differs from the Act (\"not less than one-third of the total number of members\", s 75(3)). The Act is followed.",
] as const;

/** StrataVerze's decisions: none yet. The pack has not been reviewed. */
export const DECISIONS = [] as const;

/**
 * Points for Matthew Wrigley to confirm or decide before the pack is signed
 * off (31 Oct 2026). Not law and not decided: each proposed decision moves to
 * DECISIONS once he decides it.
 */
export const FOR_REVIEW = [
  "Supported options (proposed decision): `supported: true` only for a strata scheme with one body corporate (SCHEME_TYPE). Staged development and community development schemes and schemes with 2 or more bodies corporate are proposed as not supported, because they were researched at headline level only.",
  "Funds (proposed decision): the single fund the Act requires (s 82(1)) is held as the ledger's administrative fund, named \"Body Corporate Fund\", required for every building. Its optional capital expenditure part (s 82(3)) is held as the ledger's capital works fund, named \"Capital Expenditure Fund\", not required. The Act names neither (FUND_NAMING, STRATAVERZE). Confirm the mapping and the names, and whether a building that has not subdivided its fund should show one fund only.",
  "No statutory interest (s 84): interest accrues only at a rate fixed by resolution, on a fair and reasonable basis, with no maximum. LATE_CHARGE starts every building at no interest, and no rate can be recorded until the kind of resolution, the bounds StrataVerze applies, from when interest runs, simple or compound and the day count are recorded. Proposed decisions: whether a committee decision counts as a \"resolution of the body corporate\"; a cap or a check for \"fair and reasonable\" (the Act has none; the Recorder may vary an unreasonable rate, s 117).",
  "Contribution notices (proposed decision): the Act requires only written notice of the amount due and the due date (s 83(3)). Every NOTICE_RULES timing value has no value, so every notice is refused. Proposed: a least notice, a lead (NSW and Queensland use 35 days), whether a late notice may fall due later, and one notice for each instalment for both funds. None is law.",
  "Payment order (proposed decision): the Act sets no order for applying a payment to contributions, interest and recovery costs (PAYMENT_ALLOCATION). The pack has no PAYMENT_ALLOCATION_ORDER until one is decided. The other draft packs use contributions, then interest, then recovery costs.",
  "Meetings: the pack holds no MEETING_RULES yet. To confirm for a later stage: 7 days' written notice by the secretary (s 75(4)); the model by-law quorum, a majority of the total number of members (Sch 1 cl 10, a default a scheme's by-laws may replace); two resolution kinds only, ordinary (a majority of the votes of members present and voting) and unanimous (no dissentient vote, with written votes within 28 days, s 78); no special resolution; polls by unit entitlement (s 76(2)); no debtor voting bar and no proxy rules in the Act. Whether \"members\" in the quorum and requisition tests count each co-owner (s 74(1) makes each owner a member) is a reading point.",
  "Debt recovery: an unpaid contribution goes to the Recorder of Titles on an application for relief (ss 83(4A), 105, 113(1)(a)), not to a court or the Tribunal at first instance; a payment order is enforced by registering it in a court (s 138). The shared DebtForumKey has no Recorder option, so recovery would need a shared change before it can be switched on. FEATURES.debtRecoverySteps stays off. Who decides to apply, a court debt claim and costs are NOT_CONFIRMED.",
  "TERMINOLOGY.tribunal is the Tasmanian Civil and Administrative Tribunal (s 3), which hears appeals, by-law enforcement and penalties. First-instance strata disputes go to the Recorder of Titles (TERMINOLOGY.disputesBody). Confirm which word the screens should use for where disputes are heard, and whether an abbreviation (for example TASCAT, not read in the Act) may be used.",
  "Body corporate name (GUIDANCE): \"Strata Corporation No. {plan}, {name}\" follows NRE's example (s 71(1) says \"Strata Corporation No. ....... with the addition of the name of the strata scheme\"). Confirm that the number is the strata plan number and the punctuation.",
  "Special unit entitlements (proposed decision): a lot may have special unit entitlements for contributions, common property, votes or income (s 16(2)(b)). StrataVerze holds the general one only, so a building with any special unit entitlement is proposed as not supported until a second schedule is held.",
  "Certificate (s 83(5)): seven items, conclusive in favour of a person dealing with the owner, with no fee or deadline in the Act. FEATURES.strataInformationCertificate stays off (it runs the NSW certificate). Proposed for a later stage: a Tasmanian certificate with these items, once fees and seller disclosure outside the STA are researched.",
  "Records: the Act gives no general inspection right, fee, deadline or retention period (RECORDS_ACCESS, RECORD_KEEPING). FEATURES.recordsInspections stays off. Proposed: StrataVerze retention periods (a product choice) and the screens offering only committee minutes, by-laws and insurance policies as of right.",
  "Insurance: public risk at least $10,000,000 (s 101(1); STIR reg 3) and building cover to reinstatement as new (s 99). Confirm whether any other regulation prescribes further risks (s 99(2)(a)(ia)).",
  "No audit, accounts or financial year in the Act (AUDIT_AND_ACCOUNTS). Proposed for a later stage: the financial year StrataVerze defaults to (a product choice).",
  "Postcodes and time zone: no postcode range is held (NOT_CONFIRMED), and the platform's Australia/Hobart mapping is unchanged. Confirm a range against Australia Post before a locality check is added.",
  "Reforms: the NRE review page says amendments are being made in three tranches, but no Bill, Act or date was found (PENDING_REVIEW). Check the 2025 Bills list and the Land Titles Office before sign-off. Nothing is held as a dated rule.",
] as const;

/**
 * None of the NSW workflows applies in Tasmania, and no Tasmanian workflow is
 * built yet: every switch is off, as the other draft packs had at stage 1.
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
