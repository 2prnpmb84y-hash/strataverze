/**
 * Statutory rules for Queensland community titles schemes under the Standard
 * Module: Body Corporate and Community Management Act 1997 (Qld) ("the Act")
 * and the Body Corporate and Community Management (Standard Module)
 * Regulation 2020 ("SM").
 *
 * SIGNED OFF by Matthew Wrigley on 27 Oct 2026, with the decisions in
 * DECISIONS; the points in NOT_CONFIRMED stay not confirmed. Not yet applied
 * to any building: `rulePackFor` returns active packs only, and Queensland is
 * not in SUPPORTED_SCHEME_STATES or the database's state check. It becomes
 * active in stage 2, when the shared code can apply it (multi-jurisdiction
 * plan, phase 2).
 *
 * Sources, read on 27 Oct 2026 on legislation.qld.gov.au (in-force HTML):
 * - the Act, reprint current from 1 Aug 2025;
 * - the SM (SL 2020 No 233), reprint current from 1 Aug 2025, no later
 *   amendment as at 27 Oct 2026;
 * - the Accommodation, Commercial and Small Schemes Module Regulations 2020,
 *   reprints current from 1 Aug 2025 (compared with the SM only);
 * - Queensland Civil and Administrative Tribunal Act 2009, reprint current
 *   from 22 Oct 2026 (schedule 3);
 * - Property Law Regulation 2024, reprint current from 1 Sep 2026;
 * - Queensland Government (Office of the Commissioner for Body Corporate and
 *   Community Management) pages: "About regulation modules" (13 Jan 2023),
 *   "Owner's contributions" (7 Feb 2018), "Fees for accessing body corporate
 *   records" (1 Jul 2026), "Keeping and disposing of body corporate records"
 *   (1 Mar 2021).
 * The research notes, with the source of every value, are in the review
 * document. Each rule below has a `status` (see RuleStatus in ./types).
 */

import type { EntitlementScheduleDefinition, FundDefinition, PackFeatures, RuleStatus, SchemeSelector } from "./types";

const ACT = "Body Corporate and Community Management Act 1997 (Qld)";
const SM = "Body Corporate and Community Management (Standard Module) Regulation 2020 (Qld)";

/**
 * The regulation module, chosen for each building from its community
 * management statement (Act s 21(2) to (5); SM s 3(2)): the module the CMS
 * names applies, or the Standard Module if it names none or the named
 * module's preconditions are not met. Only one module applies to a scheme.
 * StrataVerze applies the Standard Module only for now (decided 26 Oct 2026).
 */
export const REGULATION_MODULE: SchemeSelector = {
  key: "regulationModule",
  label: "Regulation module",
  help: "The module named in the building's community management statement. If it names none, the Standard Module applies.",
  options: [
    { value: "STANDARD", label: "Standard Module", supported: true },
    { value: "ACCOMMODATION", label: "Accommodation Module", supported: false, note: "Most lots are accommodation lots." },
    { value: "COMMERCIAL", label: "Commercial Module", supported: false, note: "Most lots are commercial; voting outside a general meeting and no committee spending limits." },
    { value: "SMALL_SCHEMES", label: "Small Schemes Module", supported: false, note: "6 lots or fewer; audit optional; one proxy per person." },
    { value: "SPECIFIED_TWO_LOT", label: "Specified Two-lot Schemes Module", supported: false, note: "Two lots; decisions by the lot owners' agreement. The Act's committee, proxy and meeting provisions do not apply (module itself not researched)." },
  ],
  source: `${ACT} s 21; ${SM} s 3(2)`,
  status: "CONFIRMED",
};

/** The two funds (SM ss 167, 169). Money must not be moved between them (s 167(7)). */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "ADMINISTRATIVE",
    name: "administrative fund",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Everything not paid from the sinking fund, for example insurance and recurrent costs.",
    required: true,
    source: `${SM} ss 167(1), (2), 169(2)`,
    status: "CONFIRMED",
  },
  {
    key: "SINKING",
    name: "sinking fund",
    // Kept in the ledger's capital works fund type, shown as the sinking fund.
    ledgerFund: "CAPITAL_WORKS",
    purpose: "Capital or non-recurrent spending, including periodic renewal or replacement of major capital items.",
    required: true,
    source: `${SM} ss 167(1), (3), 169(1)`,
    status: "CONFIRMED",
  },
];

/** Rules about the funds as a whole. */
export const FUND_RULES = {
  /** "Funds must not be transferred between the administrative fund and the sinking fund" (SM s 167(7)). */
  transfersBetweenFundsAllowed: false,
  /** The sinking fund budget provides for anticipated major spending over at least the next 9 years after the financial year (SM s 160(3)(a)). */
  sinkingFundBudgetYearsAfterCurrent: 9,
  /**
   * No separate sinking fund forecast or capital works plan, or review of one,
   * was found in the Act or SM (searched 27 Oct 2026). The only forecast is the
   * original owner's 10-year sinking fund estimate for the first AGM (SM s 96(1)(n)).
   */
  sinkingFundForecastRequired: false,
  /** Borrowing by ordinary resolution; debt over this amount per lot at any time needs a resolution without dissent (SM s 171). */
  borrowingWithoutDissentAbovePerLotCents: 25_000,
  /** Monthly reconciliation within 21 days of month end, where a body corporate manager administers a fund or the body corporate resolves (SM s 170). */
  reconciliationWithinDays: 21,
  source: `${SM} ss 160(3), 167, 170, 171`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Two schedules of lot entitlements, both in the community management
 * statement; each entitlement a whole number, not 0 (Act s 46(2) to (6)).
 * The contribution schedule is held on each lot (levies are worked out from
 * it); the interest schedule is held separately.
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "CONTRIBUTION",
    name: "contribution schedule lot entitlement",
    onLot: true,
    usedFor: [
      "each lot's share of contributions, except insurance and other amounts worked out another way",
      "the value of a lot's vote on a poll for an ordinary resolution",
      "the contribution test in a special resolution (lots against may hold no more than 25% of the total)",
    ],
    source: `${ACT} ss 46, 47(2), 106(3), 110(3); ${SM} s 162(5)`,
    status: "CONFIRMED",
  },
  {
    key: "INTEREST",
    name: "interest schedule lot entitlement",
    onLot: false,
    usedFor: [
      "each lot's share of common property",
      "each lot's share of the insurance premium for common property and, for building and volumetric format lots, the buildings",
      "each lot's interest on termination by resolution without dissent or court order",
      "value-based local government and State charges, rates and taxes",
    ],
    source: `${ACT} s 47(3); ${SM} ss 197(4), 201(1)`,
    status: "CONFIRMED",
  },
];

/**
 * Contribution (levy) notices (SM s 163): at least 30 days before payment is
 * due, stating the total levied, the amount now payable, the date for
 * payment, any discount, any monthly penalty and any arrears. No hardship
 * statement is required (the Act and SM searched for "hardship"; the only
 * mentions are the Commissioner's fee waiver and management rights).
 */
export const CONTRIBUTION_NOTICE_RULES = {
  minimumNoticeDays: 30,
  contents: ["total amount levied", "amount currently payable", "date for payment", "any discount for paying on time", "any monthly penalty for late payment", "any arrears"],
  hardshipStatementRequired: false,
  source: `${SM} s 163`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** How contributions are fixed (SM ss 160 to 162). */
export const CONTRIBUTIONS = {
  /** Budgets for both funds, and the contributions, instalments and due dates, by ordinary resolution each financial year. */
  fixedBy: "ordinary resolution",
  /** The AGM may adopt a budget differing from the proposed one by no more than 10%, only to add or remove spending on an agenda motion (s 161). */
  agmBudgetVariationMaxPercent: 10,
  /** The committee may fix interim contributions, from the end of the financial year to 2 months after the proposed AGM date (s 162(3), (4)). */
  interimContributionsUntilMonthsAfterAgm: 2,
  /** A special contribution, by ordinary resolution, for a liability with no or too little budget provision (s 162(2)). */
  specialContributionBy: "ordinary resolution",
  /** The owner when the debt became payable and a later owner (including a mortgagee in possession) are jointly and severally liable (s 166(3), (4)). */
  laterOwnerLiable: true,
  /** A lot owing a body corporate debt cannot vote, except on a resolution without dissent or a committee election (s 102(2)); the owner and their nominee cannot be on the committee (s 10(2)). */
  debtorMayVote: "only on a resolution without dissent or a committee election",
  debtorMayBeOnCommittee: false,
  source: `${SM} ss 10(2), 102(2), 160, 161, 162, 166(3), (4)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** An optional discount for paying on time, by ordinary resolution: "can not be more than 20%" (SM s 164). */
export const CONTRIBUTION_DISCOUNT = {
  optional: true,
  /** None applies until the building records the ordinary resolution that sets it (decided 27 Oct 2026). */
  appliesOnlyAfterResolutionRecorded: true,
  maxPercent: 20,
  source: `${SM} s 164`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * An optional penalty for late payment, by ordinary resolution: simple
 * interest at a stated rate of not more than 2.5% for each month the
 * contribution is in arrears, from the date for payment (SM s 165(1), (2)).
 * Only the section's example shows how months are counted: whole months in
 * arrears (due 31 March, paid 27 June: 2 months). `perWholeMonthInArrears`
 * rests on that example. The body corporate may waive the penalty or recovery costs, or
 * allow the discount, for special reasons (s 166(6)).
 */
export const LATE_PAYMENT_PENALTY = {
  optional: true,
  /** None applies until the building records the ordinary resolution that sets it, with the rate (decided 27 Oct 2026). */
  appliesOnlyAfterResolutionRecorded: true,
  /** Owners are shown "penalty", never "interest" (decided 27 Oct 2026). */
  ownerFacingTerm: "penalty",
  maxMonthlyPercent: 2.5,
  simple: true,
  perWholeMonthInArrears: true,
  waivableForSpecialReasons: true,
  source: `${SM} ss 165, 166(6)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * A payment goes first to the penalty, then to the contribution, then to
 * recovery costs (SM s 166(5)). "INTEREST" stands for the penalty here, so
 * the shared token works; owners must be shown "penalty", not "interest",
 * when Queensland goes live. NSW applies levies first.
 */
export const PAYMENT_ALLOCATION_ORDER = ["INTEREST", "LEVY", "RECOVERY_COSTS"] as const;

/** Recovering unpaid contributions. */
export const DEBT_RECOVERY = {
  /** Recoverable as a debt once unpaid by the date for payment, with the penalty and recovery costs reasonably incurred (SM s 166(1)). */
  mayStartAfterDueDate: true,
  recoveryCostsRecoverable: true,
  /** A debt outstanding for 2 years: proceedings must start within 2 months after the 2-year period (SM s 166(2)). */
  mustStartProceedings: { overdueYears: 2, withinMonths: 2 },
  /** The committee may decide to recover a liquidated debt (SM s 52(1)(e)(i)). */
  committeeMayDecide: true,
  /** A debt claim is a QCAT minor civil dispute up to $25,000, or a claim in a court (Act s 229A(1), (2); QCAT Act sch 3). */
  tribunal: "QCAT",
  tribunalLimitCents: 2_500_000,
  /** Adjudicators cannot decide debt disputes (Act s 229A(3)). */
  adjudicatorMayDecide: false,
  /** No statutory payment plan regime (the Act and SM searched); instalments (s 162) and waiver (s 166(6)) only. */
  statutoryPaymentPlans: false,
  /** NOT CONFIRMED: the Magistrates Court limit for larger debts (Magistrates Courts Act 1921 not read). */
  courtLimitConfirmed: false,
  source: `${SM} ss 52, 166; ${ACT} s 229A; Queensland Civil and Administrative Tribunal Act 2009 (Qld) sch 3`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * General meetings and committee meetings. Held as data for review; the
 * meeting engine does not apply it yet (its rule set is NSW-shaped).
 */
export const MEETINGS = {
  /** All body corporate meetings are general meetings: an AGM or an EGM (SM s 81). */
  generalMeetingTypes: ["AGM", "EGM"],
  /** A general meeting must be held at least 21 days after notice is given to the owners (SM s 91). */
  generalMeetingNoticeDays: 21,
  /** NOT CONFIRMED: how the 21 days is counted and when a posted or emailed notice is taken to be given (SM silent; Acts Interpretation Act 1954 not read). */
  noticeCountingConfirmed: false,
  /** Later AGMs within 3 months after the end of each financial year (SM s 83). */
  agmWithinMonthsAfterYearEnd: 3,
  /** First AGM within 2 months after the earlier of more than 50% of lots sold by the original owner, or 6 months after establishment (SM s 94(1)). */
  firstAgm: { withinMonthsAfter: 2, lotsSoldMoreThanPercent: 50, orMonthsAfterEstablishment: 6 },
  /** EGM requested by owners of 25% of lots: called within 14 days, held within 6 weeks (SM s 84). */
  requestedEgm: { lotsPercent: 25, callWithinDays: 14, holdWithinWeeks: 6 },
  /** The notice inviting committee nominations and motions: at least 3 weeks, and not earlier than 6 weeks, before the end of the financial year (SM ss 16(3), 86). */
  nominationsInvitation: { atLeastWeeksBeforeYearEnd: 3, notEarlierThanWeeksBeforeYearEnd: 6 },
  /**
   * Quorum (SM s 99): at least 25% of voters, or a lower minimum of 10% to 25%
   * set by special resolution; and present personally at least 2 where there
   * are 3 or more voters (1 if a special resolution says so), or 1 where there
   * are fewer than 3. Proxies, hard copy votes before the meeting and
   * electronic votes count as present.
   */
  quorum: {
    percentOfVoters: 25,
    minPercentBySpecialResolution: 10,
    presentPersonallyWhenAtLeast3Voters: 2,
    presentPersonallyBySpecialResolution: 1,
    presentPersonallyWhenFewerThan3Voters: 1,
    proxiesAndVotesCastCountAsPresent: true,
  },
  /**
   * No quorum after 30 minutes: adjourned to the same place, day and time a
   * week later; there, if still none after 30 minutes, those present form a
   * quorum if the chairperson (or a body corporate manager with the chair's
   * powers) is there in person (SM s 100).
   */
  noQuorumWaitMinutes: 30,
  noQuorumAdjournDays: 7,
  adjournedMeetingQuorumIfChairPresent: true,
  /** Owners' motions go on the AGM agenda only if received before the financial year ends (SM s 86(8)). */
  ownerMotionsBy: "the end of the financial year",
  /** The AGM notice includes the statutory motions, an explanatory schedule, the proposed budgets, the statement of accounts, the auditor's certificate, the insurance disclosure and latest valuation, and committee ballot papers (SM ss 87, 90, 93(3), 160(6), 175(6), 176(7), 196, 22(6)). */
  agmNoticeIncludes: ["statutory motions", "explanatory schedule", "proposed budgets", "statement of accounts", "auditor's certificate", "insurance disclosure and latest valuation", "committee ballot papers", "proxy form", "voting paper"],
  /** General meeting minutes to each owner within 21 days (SM s 117(2)). */
  generalMeetingMinutesDays: 21,
  /** Committee meetings: 7 days' written notice, or 2 days if all voting members agree; quorum half the voting members; minutes within 21 days (SM ss 55, 60, 71). */
  committee: { noticeDays: 7, noticeDaysIfAllAgree: 2, quorumHalfOfVotingMembers: true, minutesDays: 21 },
  /** Electronic voting and attendance at general meetings, each by ordinary resolution (SM ss 99(2), 106, 111). */
  electronicVotingByOrdinaryResolution: true,
  electronicAttendanceByOrdinaryResolution: true,
  /** Voting outside a general meeting is not available under the Standard Module (Act s 111 applies only if the module says so). */
  votingOutsideMeeting: false,
  source: `${SM} ss 22, 55, 60, 71, 81, 83, 84, 86, 87, 90, 91, 93, 94, 99, 100, 106, 111, 117, 160, 175, 176, 196; ${ACT} s 111`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Resolutions (Act ss 105 to 110). One vote per lot, except an ordinary
 * resolution on a poll, which is decided by contribution schedule lot
 * entitlement. A poll is available only for an ordinary resolution, not one
 * by secret ballot (s 109). The two-thirds test is "at least": it passes when
 * 3 times the votes for is at least 2 times the votes cast (whole numbers, no
 * rounding).
 */
export const RESOLUTIONS = {
  ORDINARY: { basis: "votes for are more than votes against; on a poll, by contribution schedule lot entitlement", pollAvailable: true, source: `${ACT} ss 108, 109, 110(3)` },
  SPECIAL: {
    basis: "at least two-thirds of the votes cast are for; the votes against are not more than 25% of the number of lots; the lots against hold not more than 25% of the total contribution schedule lot entitlements",
    forAtLeastFractionOfVotesCast: 2 / 3,
    againstMaxFractionOfLots: 0.25,
    againstMaxFractionOfContributionEntitlement: 0.25,
    pollAvailable: false,
    source: `${ACT} s 106`,
  },
  WITHOUT_DISSENT: { basis: "no vote is counted against", pollAvailable: false, source: `${ACT} s 105` },
  MAJORITY: { basis: "more than 50% of the lots entitled to vote, in writing, no proxies", pollAvailable: false, source: `${ACT} s 107` },
  /** The voting paper states the type each motion needs (SM s 88(5)(b)); a resolution is amended or revoked only by one of the same type (SM s 116). */
  votingPaperStatesType: true,
  amendedOnlyBySameType: true,
  /** What some decisions need (Act s 62; SM s 74). */
  requiredFor: {
    newCmsForByLawsOrModuleChange: "SPECIAL",
    newCmsOtherwiseIncludingExclusiveUseByLaws: "WITHOUT_DISSENT",
    changeContributionSchedule: "WITHOUT_DISSENT",
    managerReplacingCommittee: "SPECIAL, no proxies, secret ballot unless an ordinary resolution allows an open one",
  },
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Proxies (SM ss 128 to 131). */
export const PROXIES = {
  /** A person may hold proxies no greater in number than 5% of the lots where there are 20 or more lots (so at most 5% of lots, rounded down), and 1 where there are fewer (SM s 128(4)). */
  maxPercentOfLotsWhenAtLeast20Lots: 5,
  maxWhenFewerThan20Lots: 1,
  /** Lapses at the end of the financial year, or a shorter period in the proxy (SM s 129(1)(e)). */
  lapsesAtYearEnd: true,
  /**
   * Cannot be exercised by the original owner, a body corporate manager or an
   * associate (SM s 131(2)), except the original owner's proxy under a sale
   * contract for limited listed matters, ending no later than 1 year after the
   * scheme is established (s 131(3)).
   */
  cannotBeExercisedBy: ["the original owner", "a body corporate manager", "an associate of either"],
  /** Lodged with the secretary before the meeting, or by an earlier time no more than 24 hours before (SM s 128(5)). */
  lodgeBeforeMeetingOrUpToHoursBefore: 24,
  /** The body corporate may prohibit proxies, for some matters or altogether, by special resolution (SM s 128(2)). */
  mayBeProhibitedBySpecialResolution: true,
  /** Committee proxies: only another voting member, one per holder per meeting, for one meeting, no more than 2 meetings a year (SM ss 121 to 125). */
  committee: { onlyAnotherVotingMember: true, perHolderPerMeeting: 1, maxMeetingsPerYear: 2 },
  /** Cannot be used for, among others: committee elections, majority resolutions, engaging or ending a body corporate manager, service contractor or letting agent, and secret ballots (SM s 130(3)). */
  notFor: ["electing or appointing committee members", "a majority resolution", "engaging, changing or ending a body corporate manager, service contractor or letting agent", "a secret ballot", "a special resolution to prohibit proxies or change the module"],
  source: `${SM} ss 121 to 125, 128 to 131`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The committee (SM ss 7 to 15, 172 to 174, sch 1). */
export const COMMITTEE = {
  /** Required unless a body corporate manager is engaged to carry out its functions (SM s 7; Act s 98). */
  requiredUnlessManagerEngaged: true,
  executivePositions: ["chairperson", "secretary", "treasurer"],
  /**
   * At least 3 voting members, except a minor committee (1 to 3 members where
   * there are only 1 to 3 distinct owners, s 13); at most 7 where there are 7
   * or more lots, the number of lots where fewer, and up to 12 for a principal
   * scheme in a layered arrangement by ordinary resolution (SM s 9(4); sch 1).
   */
  minVotingMembers: 3,
  minorCommitteeExempt: true,
  maxVotingMembers: 7,
  maxIsLotsWhenFewerThan: 7,
  maxForLayeredPrincipalScheme: 12,
  /** Elected at each AGM by secret ballot unless an ordinary resolution chooses an open ballot (SM ss 13, 15). */
  electedBySecretBallotByDefault: true,
  /** Committee spending limit: $200 times the number of lots, unless an ordinary resolution sets another amount (SM s 172; sch 1). */
  spendingLimitPerLotCents: 20_000,
  /** Major spending limit: the lesser of $1,100 times the number of lots and $10,000, unless set by ordinary resolution (sch 1). */
  majorSpendingPerLotCents: 110_000,
  majorSpendingCapCents: 1_000_000,
  /** Above the major spending limit, at least 2 quotes (SM ss 173, 174). */
  quotesAboveMajorSpending: 2,
  source: `${SM} ss 7, 9, 13, 15, 172 to 174, sch 1; ${ACT} s 98`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Audit (SM s 176): the statement of accounts is audited each financial year
 * unless the scheme is a basic scheme and the body corporate resolves by
 * special resolution not to (in the prescribed words). The auditor is
 * chosen by ordinary resolution and cannot be a committee member or a body
 * corporate manager. A basic scheme is one that is not a principal scheme in
 * a layered arrangement (Act s 10(5)). The financial year can be changed by
 * ordinary resolution once in 5 years (Act s 321A).
 */
export const AUDIT = {
  requiredUnless: "the scheme is a basic scheme and the body corporate resolves by special resolution not to audit",
  waiverResolution: "SPECIAL",
  waiverOnlyForBasicScheme: true,
  financialYearChangeOncePerYears: 5,
  source: `${SM} ss 176, 177; ${ACT} ss 10(5), 321A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Insurance (SM ss 196 to 206). */
export const INSURANCE = {
  /** Full replacement value of each building containing a lot (building and volumetric format plans), and of standard format buildings with a common wall (SM ss 198, 199). */
  buildingBasis: "full replacement value",
  /** An independent valuation at least every 5 years, disclosed with the AGM notice (SM ss 196(3), 200(2)). */
  valuationEveryYears: 5,
  /** Public risk cover of at least $10 million for a single event (SM s 206(3)(b)). */
  publicLiabilityMinCents: 1_000_000_000,
  source: `${SM} ss 196 to 206`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Keeping records (SM s 231). There is no general 7-year rule: some records
 * may be disposed of after 6 years and some after 2; minutes, the roll,
 * registers and insurance policies have no disposal provision (the platform
 * keeps them). A record of "current relevance" is kept regardless.
 */
export const RECORD_RETENTION = {
  disposableAfterYears: {
    6: ["statements of account and audit certificates", "meeting notices and agendas", "records of major repairs", "orders", "authority notices", "written agreements", "part 5 body corporate manager reports"],
    2: ["other meeting material", "insignificant correspondence", "reconciliation statements with their bank statements and invoices"],
  },
  /** No disposal provision in s 231, so the platform keeps them. Records in neither list (for example other correspondence, exclusive use agreements and occupation authorities) have no stated period: kept until reviewed. */
  noDisposalProvision: ["minutes", "the roll", "registers", "insurance policies"],
  source: `${SM} s 231(3) to (5)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Fees set in fee units (SM s 233). The dollar values change each 1 July; the
 * 2026-27 values are from Queensland Government guidance (status GUIDANCE),
 * not read in legislation.
 */
export const FEE_UNIT_DOLLARS = {
  "2026-27": {
    inspectionOwnerCents: 2_070,
    inspectionOtherCents: 3_975,
    copyPerPageCents: 75,
    certificateCents: 8_695,
    certificateRepeatCents: 7_390,
    certificatePriorityCents: 3_100,
  },
  /** The guidance says these fees carry no GST, and that copies alone carry no inspection fee. */
  gstApplies: false,
  source: "Queensland Government, Fees for accessing body corporate records (updated 1 Jul 2026)",
  status: "GUIDANCE" as RuleStatus,
} as const;

/**
 * Inspecting records and receiving copies (Act s 205(2), (3); SM s 233):
 * within 7 days after a written request and the fee. That no GST applies is
 * from guidance (FEE_UNIT_DOLLARS).
 */
export const RECORDS_INSPECTION = {
  withinDaysOfRequest: 7,
  feeUnits: { OWNER: 18.25, OTHER: 35.1, copyPerPage: 0.65 },
  /** Fees are rounded to the nearest 5 cents (SM s 233(7)). */
  roundedToNearestCents: 5,
  source: `${ACT} s 205(2), (3); ${SM} s 233(1), (7)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Body corporate certificate (Act s 205(4) to (7); SM ss 233, 233AA): in the
 * approved form within 5 business days after a written request and the fee;
 * conclusive evidence against the body corporate except for a reasonably
 * apparent error. From 1 Aug 2025 a seller's disclosure statement includes
 * the latest CMS and a body corporate certificate, or an explanatory
 * statement where there are no usable records or no committee and no
 * body corporate manager (Property Law Regulation 2024 ss 5(1)(i), 6). The
 * repeat fee applies to the same person for the same lot within 3 months; the
 * priority fee is refunded if 24 hours is missed. A request for financial
 * information only is answered within 5 business days for no more than the
 * certificate fee (Act s 205(8) to (11)). The form number (BCCM Form 33) is
 * from guidance.
 */
export const BODY_CORPORATE_CERTIFICATE = {
  withinBusinessDays: 5,
  form: "BCCM Form 33",
  formStatus: "GUIDANCE" as RuleStatus,
  feeUnits: 76.75,
  repeatFeeUnits: 65.24,
  repeatWithinMonths: 3,
  repeatOnlyForSamePersonAndLot: true,
  priorityFeeUnits: 27.35,
  priorityFeeRefundedIfLate: true,
  priorityWithinHours: 24,
  requesters: ["owner", "mortgagee", "buyer", "a person given a seller's disclosure statement", "a person with a proper interest", "an agent of any of these"],
  conclusive: true,
  source: `${ACT} s 205(4) to (11), (13); ${SM} ss 233, 233AA; Property Law Regulation 2024 (Qld) ss 5(1)(i), 6`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Disputes (Act ch 6). */
export const DISPUTES = {
  /** Reasonable attempts at internal resolution first (Act s 238(1)(b)). */
  internalResolutionFirst: true,
  /** Conciliation or adjudication through the Commissioner's office (Act ch 6). */
  resolvedBy: "the Commissioner for Body Corporate and Community Management",
  /** An application to void a meeting, resolution or election within 3 months (Act s 242). */
  voidMotionWithinMonths: 3,
  /** Appeal to QCAT's appeal tribunal on a question of law within 6 weeks after receiving the order (Act ss 289, 290(1)). */
  appealWithinWeeks: 6,
  /** NOT CONFIRMED: the application fee (Act s 239(1)(c)). */
  applicationFeeConfirmed: false,
  source: `${ACT} ss 229, 238, 239, 242, 289, 290`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Queensland's words for the things the platform names (Act ss 22, 31, 33, 46; SM ss 81, 162, 167). */
export const TERMINOLOGY = {
  ownersCorporation: "body corporate",
  committee: "committee",
  act: "Body Corporate and Community Management Act 1997",
  actShort: "BCCMA",
  jurisdictionShort: "Qld",
  /** Hears levy debt claims (Act s 229A). Other disputes go to the Commissioner first (DISPUTES). */
  tribunal: "QCAT",
  levy: "contribution",
  scheme: "community titles scheme",
  governingDocument: "community management statement",
  manager: "body corporate manager",
  developer: "original owner",
  generalMeetings: ["annual general meeting", "extraordinary general meeting"],
  source: `${ACT} ss 22, 31, 33, 46; ${SM} ss 81, 162, 167`,
} as const;

/** What was not confirmed on 27 Oct 2026, for the review. */
export const NOT_CONFIRMED = [
  "How the 21-day general meeting notice is counted, and when a posted or emailed notice is taken to be given.",
  "The Magistrates Court limit for levy debts over $25,000.",
  "The dispute application fee.",
  "How and when a seller's disclosure statement must be given (Property Law Act 2023 s 99 not read).",
  "The Specified Two-lot Schemes Module's own rules (audit, levies, records).",
  "The dollar value of a fee unit in legislation (the 2026-27 dollar amounts are from guidance).",
  "What the Disaster Management and Other Legislation Amendment Act 2024 changed in the Standard Module (1 Jul 2024), and the content of 2024 Act No 27.",
  "Which instrument inserted SM s 233AA (the certificate contents).",
  "The assent date of the Body Corporate and Community Management and Other Legislation Amendment Act 2023.",
] as const;

/** StrataVerze's decisions in the sign-off of 27 Oct 2026 (review document, "Decisions"). */
export const DECISIONS = [
  { decision: "Apply the Standard Module only for now; the other four modules are listed but blocked.", decidedBy: "Matthew Wrigley", decidedOn: "2026-10-27" },
  { decision: "Keep the sinking fund in the ledger's capital works fund, shown as \"sinking fund\".", decidedBy: "Matthew Wrigley", decidedOn: "2026-10-27" },
  { decision: "Keep minutes, the roll, registers and insurance policies without a limit (the law gives no disposal period).", decidedBy: "Matthew Wrigley", decidedOn: "2026-10-27" },
  { decision: "No penalty or discount applies until a building records the ordinary resolution that sets it, with the rate.", decidedBy: "Matthew Wrigley", decidedOn: "2026-10-27" },
  { decision: "Hold fees in fee units, with a dollar table updated each 1 July from Queensland Government guidance.", decidedBy: "Matthew Wrigley", decidedOn: "2026-10-27" },
  { decision: "Show owners \"penalty\", never \"interest\", for late payment.", decidedBy: "Matthew Wrigley", decidedOn: "2026-10-27" },
] as const;

/**
 * None of the NSW workflows applies in Queensland: there is no statutory
 * payment plan, committee training, Strata Hub report, capital works fund
 * plan or key financial information form; the certificate, inspections and
 * debt recovery are Queensland's own (stage 2, steps 8 and 9).
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
