/**
 * Statutory rules for Western Australian strata titles schemes under the
 * Strata Titles Act 1985 (WA) ("STA") and the Strata Titles (General)
 * Regulations 2019 (WA) ("STGR").
 *
 * DRAFT, FOR STRATAVERZE TO REVIEW (27 Oct 2026). Not signed off and not
 * applied to any building: `rulePackFor` returns active packs only, and
 * Western Australia is not in SUPPORTED_SCHEME_STATES or the database's state
 * check. Every value below comes from the research notes of 27 Oct 2026 and
 * keeps their status (see RuleStatus in ./types). The StrataVerze decisions
 * so far are the payment order and the notice timing (DECISIONS,
 * 28 Oct 2026), and the points to decide are in FOR_REVIEW.
 *
 * Sources, read on 27 Oct 2026:
 * - the STA, consolidated HTML on legislation.wa.gov.au, version 08-a0-00,
 *   in force from 26 Jun 2025 (read section by section; not every section);
 * - the STGR, consolidated HTML on legislation.wa.gov.au, version 00-w0-00,
 *   in force from 20 Aug 2026 (Parts 1, 2, 7, 8, 12, 13, 14, 16 and 18 and the
 *   compilation table read);
 * - the STA subsidiary legislation list on legislation.wa.gov.au;
 * - Landgate guidance (no "last updated" dates shown): "Resources for strata
 *   managers" (parts out of date, citing the old STGR Schedule 4), "Resources
 *   for strata companies", "Resources for strata sellers", "WA strata law
 *   review" (the five-year review) and "Strata management education changes";
 * - Consumer Protection, "Strata property" (read only through a summary; it
 *   appears to predate the May 2020 reforms);
 * - Magistrates Court of WA, "Monetary claim for debt or damages" (page
 *   modified 28 Apr 2025; read only through a summary).
 *
 * Not read: STGR Parts 3 to 6, 9 to 11, 15 and 17 and the Schedules (mostly);
 * STA s 12, s 91, ss 56 to 58, ss 158 to 164, Part 12, Schedule 2A and
 * Schedule 5 cl 3; the Landgate fact sheet PDFs; the Magistrates Court (Civil
 * Proceedings) Act 2004; the WA Parliament bills list. See NOT_CONFIRMED.
 *
 * Schedule 1 governance by-laws are defaults: a scheme may have changed them
 * by resolution without dissent (STA s 44(2)(a)). Rules from Schedule 1 are
 * marked `defaultByLaw: true`.
 */

import type { MeetingRuleSet } from "@/lib/meetings/rules";
import type {
  BuildingFactDefinition,
  BuildingSelector,
  DerivedBuildingSelector,
  EntitlementScheduleDefinition,
  FundDefinition,
  LateChargeRules,
  NoticeRules,
  PackFeatures,
  PaymentAllocationPart,
  RecordedBuildingSelector,
  RecordedFactKey,
  RuleStatus,
  SizeClassRequirement,
} from "./types";

const STA = "Strata Titles Act 1985 (WA)";
const STGR = "Strata Titles (General) Regulations 2019 (WA)";
const LANDGATE_COMPANIES = "Landgate, Resources for strata companies";
const LANDGATE_SELLERS = "Landgate, Resources for strata sellers";
const LANDGATE_REVIEW = "Landgate, WA strata law review";
const LANDGATE_EDUCATION = "Landgate, Strata management education changes";
const CONSUMER_PROTECTION = "Consumer Protection (WA), Strata property";
const MAGISTRATES_COURT = "Magistrates Court of WA, Monetary claim for debt or damages (page modified 28 Apr 2025)";

/**
 * The kind of strata titles scheme (STA s 3(1), ss 8, 9). A strata scheme
 * defines lots by reference to a building; a survey-strata scheme defines
 * lots without one. Either may be freehold or leasehold: that is the separate
 * TENURE selector. Which options are `supported` is a StrataVerze proposal,
 * not law (FOR_REVIEW).
 */
export const SCHEME_TYPE: RecordedBuildingSelector = {
  key: "schemeType",
  // Recorded by the adviser in the Building rules section (stage 2, PR 2).
  held: "RECORDED",
  label: "Scheme type",
  help: "Whether the scheme is a strata scheme (lots defined by reference to a building) or a survey-strata scheme (lots defined without a building).",
  options: [
    { value: "STRATA", label: "Strata scheme", supported: true, note: "Lots defined by reference to a building." },
    { value: "SURVEY_STRATA", label: "Survey-strata scheme", supported: false, note: "Lots defined without a building; owners insure infrastructure on their own lot (s 97(1) note 1). Researched at headline level only." },
  ],
  source: `${STA} s 3(1), ss 8, 9`,
  status: "CONFIRMED",
};

/**
 * Whether the scheme is freehold or leasehold (STA s 3(1), ss 8(3)(d), 50).
 * Either scheme type may be leasehold. Which options are `supported` is a
 * StrataVerze proposal, not law (FOR_REVIEW).
 */
export const TENURE: RecordedBuildingSelector = {
  key: "tenure",
  // Recorded by the adviser in the Building rules section (stage 2, PR 2).
  held: "RECORDED",
  label: "Freehold or leasehold",
  help: "Whether the scheme is freehold or a leasehold scheme with a fixed expiry day.",
  options: [
    { value: "FREEHOLD", label: "Freehold", supported: true },
    {
      value: "LEASEHOLD",
      label: "Leasehold scheme",
      supported: false,
      note: "A strata or survey-strata scheme with a fixed expiry day, at least 20 years (or a period set by regulation) and no more than 99 years after registration; each lot is held under a strata lease that expires on the expiry day and is not subject to renewal or forfeiture (ss 8(3)(d), 50). Researched at headline level only.",
    },
  ],
  source: `${STA} s 3(1), ss 8(3)(d), 50`,
  status: "CONFIRMED",
};

/**
 * The scheme's size class, from its number of lots (STA s 3(1) "2, 3, 4 or
 * 5-lot scheme"). Three bands: 2 lots, 3 to 5 lots, 6 or more. The
 * designated strata company test (10 or more lots, or replacement cost) is
 * separate: DESIGNATED_STRATA_COMPANY.
 *
 * Worked out from the building's number of lots (stage 2, PR 2, 28 Oct 2026),
 * never recorded. The notes give no class for a scheme of fewer than 2 lots,
 * so none is worked out for one.
 */
export const SCHEME_SIZE: DerivedBuildingSelector = {
  key: "schemeSize",
  held: "DERIVED",
  label: "Scheme size",
  help: "Worked out from the number of lots in the scheme.",
  options: [
    { value: "TWO_LOT", label: "2-lot scheme", supported: true },
    { value: "THREE_TO_FIVE_LOT", label: "3, 4 or 5-lot scheme", supported: true },
    { value: "SIX_OR_MORE_LOT", label: "6 or more lots", supported: true },
  ],
  rules: [
    { value: "TWO_LOT", when: { number: "LOT_COUNT", atLeast: 2, atMost: 2 }, provision: `${STA} s 3(1)`, status: "CONFIRMED" },
    { value: "THREE_TO_FIVE_LOT", when: { number: "LOT_COUNT", atLeast: 3, atMost: 5 }, provision: `${STA} s 3(1)`, status: "CONFIRMED" },
    { value: "SIX_OR_MORE_LOT", when: { number: "LOT_COUNT", atLeast: 6 }, provision: `${STA} s 3(1)`, status: "CONFIRMED" },
  ],
  noRuleFits: "No scheme size fits the number of lots recorded. A scheme has at least 2 lots.",
  source: `${STA} ss 3(1), 123, 127, 130, 140`,
  status: "CONFIRMED",
};

/** What differs by size class (STA ss 106, 123, 127, 130, 140). */
export const SIZE_CLASSES = {
  /**
   * The "designated functions" a 2-lot scheme need not perform and a 3 to
   * 5-lot scheme's by-laws may exempt it from (s 140(4)).
   */
  designatedFunctions: [
    "administrative fund (s 100(1)(a))",
    "accounting records and statement of accounts (s 101)",
    "minutes of meetings (s 104(1)(b))",
    "letterbox (s 104(3)(a))",
    "roll (s 105(1))",
  ],
  /** On a member's application, SAT may require a designated function to be performed (s 140(3)). */
  satMayRequireDesignatedFunction: true,
  /** Where no roll is kept (2 to 5 lots), each owner gives written notice of their address for service to the company and the other owners (s 106; fine $3,000). */
  ownersNotifyAddressWhenNoRoll: true,
  TWO_LOT: {
    /** May, but need not, perform a designated function (s 140(1)(a)). */
    designatedFunctionsOptional: true,
    /** Cannot establish an administrative fund unless the by-laws require one (s 140(1)(b)). */
    administrativeFundOnlyIfByLawsRequire: true,
    /** No annual AGM requirement; the by-laws may adopt it (s 127(2)). */
    annualAgmRequired: false,
    /** Quorum: persons entitled to cast the votes of both lots present; the 30-minute fallback does not apply (s 130(2), (4)). */
    quorumBothLots: true,
    noQuorumFallback: false,
    /** A special resolution or resolution without dissent counts only if unanimous (s 123(3), (5)). */
    specialAndWithoutDissentOnlyIfUnanimous: true,
    source: `${STA} ss 123(3), (5), 127(2), 130(2), (4), 140(1)`,
    status: "CONFIRMED" as RuleStatus,
  },
  THREE_TO_FIVE_LOT: {
    /** The scheme by-laws may exempt the company from any designated function (s 140(2)). */
    byLawsMayExemptDesignatedFunctions: true,
    /**
     * Special resolution: in favour at least 2 (3 lots), 3 (4 lots) or 4 (5
     * lots) by number, and at least 50% of unit entitlement. No "against" test
     * (s 123(6)).
     */
    specialResolutionMinLotsFor: { 3: 2, 4: 3, 5: 4 },
    specialResolutionMinUnitEntitlementPercentFor: 50,
    specialResolutionAgainstTest: false,
    source: `${STA} ss 123(6), 140(2)`,
    status: "CONFIRMED" as RuleStatus,
  },
  SIX_OR_MORE_LOT: {
    /** Every designated function applies; the special resolution test is s 123(4) (RESOLUTIONS.SPECIAL). */
    designatedFunctionsRequired: true,
    source: `${STA} ss 123(4), 140`,
    status: "CONFIRMED" as RuleStatus,
  },
} as const;

/**
 * A designated strata company must have a reserve fund and a 10-year plan
 * (STA s 100(2), (2A), (7); STGR reg 79): (a) 10 or more lots; or (b) a strata
 * scheme whose "scheme building replacement cost" is more than $5,000,000; or
 * (c) a survey-strata scheme whose common property improvements have a
 * replacement cost of more than $5,000,000. Landgate says "$5 million or
 * greater"; the regulation says "more than", which is used here.
 */
export const DESIGNATED_STRATA_COMPANY = {
  minLots: 10,
  replacementCostMoreThanCents: 500_000_000,
  replacementCostIsStrictlyMoreThan: true,
  landgateWordingDiffers: "Landgate guidance says \"$5 million or greater\"; reg 79 says \"more than $5 000 000\".",
  source: `${STA} s 100(7); ${STGR} reg 79; ${LANDGATE_COMPANIES}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The replacement cost the designated test reads (stage 2, PR 2): for a
 * strata scheme the scheme building replacement cost, for a survey-strata
 * scheme the replacement cost of the improvements on the common property
 * (STGR reg 79). Recorded by the adviser, in dollars.
 */
export const BUILDING_FACTS: Partial<Readonly<Record<RecordedFactKey, BuildingFactDefinition>>> = {
  REPLACEMENT_COST: {
    label: "Replacement cost",
    help: "For a strata scheme, the scheme building replacement cost. For a survey-strata scheme, the replacement cost of the improvements on the common property. In dollars.",
    source: `${STA} s 100(7); ${STGR} reg 79`,
    status: "CONFIRMED",
  },
};

const designatedCost = (schemeType: string) => ({
  all: [
    { selector: SCHEME_TYPE.key, in: [schemeType] },
    { number: "REPLACEMENT_COST_CENTS", moreThan: DESIGNATED_STRATA_COMPANY.replacementCostMoreThanCents },
  ],
}) as const;

/**
 * Whether the strata company is a designated strata company (STA s 100(7);
 * STGR reg 79), worked out from DESIGNATED_STRATA_COMPANY (stage 2, PR 2):
 * (a) 10 or more lots; (b) a strata scheme whose scheme building replacement
 * cost is more than $5,000,000; or (c) a survey-strata scheme whose common
 * property improvements have a replacement cost of more than $5,000,000.
 * Strictly more than, as reg 79 says (not Landgate's "or greater"). With 10 or
 * more lots no other fact is needed. Below 10 lots the scheme type and the
 * replacement cost are both needed, or it is not worked out. The notes record
 * no other way to be, or not be, designated, so no override is offered.
 */
export const DESIGNATED_STATUS: DerivedBuildingSelector = {
  key: "designatedStrataCompany",
  held: "DERIVED",
  label: "Designated strata company",
  help: "Worked out from the number of lots and, below 10 lots, the scheme type and the replacement cost. A designated strata company must have a reserve fund and a 10-year plan.",
  options: [
    { value: "DESIGNATED", label: "Designated strata company", supported: true },
    { value: "NOT_DESIGNATED", label: "Not a designated strata company", supported: true },
  ],
  rules: [
    {
      value: "DESIGNATED",
      when: { any: [{ number: "LOT_COUNT", atLeast: DESIGNATED_STRATA_COMPANY.minLots }, designatedCost("STRATA"), designatedCost("SURVEY_STRATA")] },
      provision: `${STA} s 100(7); ${STGR} reg 79`,
      status: DESIGNATED_STRATA_COMPANY.status,
    },
    {
      value: "NOT_DESIGNATED",
      when: {
        all: [
          { number: "LOT_COUNT", lessThan: DESIGNATED_STRATA_COMPANY.minLots },
          { selector: SCHEME_TYPE.key, in: ["STRATA", "SURVEY_STRATA"] },
          { number: "REPLACEMENT_COST_CENTS", atMost: DESIGNATED_STRATA_COMPANY.replacementCostMoreThanCents },
        ],
      },
      provision: `${STA} s 100(7); ${STGR} reg 79`,
      status: DESIGNATED_STRATA_COMPANY.status,
    },
  ],
  noRuleFits: "The designated strata company test could not be worked out from the facts recorded.",
  source: `${STA} s 100(2), (2A), (7); ${STGR} reg 79`,
  status: "CONFIRMED",
};

/**
 * What the scheme by-laws, or SAT, say about the administrative fund of a 2
 * to 5-lot scheme (STA s 140; stage 2, PR 3), recorded by the adviser. The
 * administrative fund is a designated function (s 140(4)): a 2-lot scheme
 * cannot establish one unless its by-laws require it (s 140(1)(b)), a 3 to
 * 5-lot scheme's by-laws may exempt it (s 140(2)), and SAT may require it on a
 * member's application (s 140(3)). One answer: an SAT order is recorded as
 * such whatever the by-laws say. Read by the administrative fund's condition
 * for 2 to 5 lots only, so a building is flagged for it only there. Which
 * options are `supported` is a StrataVerze proposal (FOR_REVIEW).
 *
 * It covers the administrative fund only. A later reader of it, or of a like
 * answer, for the other designated functions of s 140(4) (accounting records,
 * minutes, letterbox, roll) must widen its flagging too: `flagMissing` here
 * flags a missing answer only where a fund condition reads it.
 */
export const ADMINISTRATIVE_FUND_BY_LAWS: RecordedBuildingSelector = {
  key: "administrativeFundByLaws",
  held: "RECORDED",
  label: "Administrative fund by-laws",
  help: "For a scheme of 2 to 5 lots. Whether the scheme by-laws require an administrative fund or exempt the strata company from keeping one, or whether SAT has required one on a member's application. A 2-lot scheme cannot have an administrative fund unless its by-laws require one.",
  options: [
    { value: "NEITHER", label: "The by-laws neither require nor exempt", supported: true },
    { value: "REQUIRE", label: "The by-laws require an administrative fund", supported: true },
    { value: "EXEMPT", label: "The by-laws exempt the strata company", supported: true },
    { value: "SAT_REQUIRED", label: "SAT has required an administrative fund", supported: true },
  ],
  flagMissing: "FUND_CONDITIONS",
  source: `${STA} s 140(1) to (4)`,
  status: "CONFIRMED",
};

/**
 * The building selectors (stage 2, PR 2): the scheme type and tenure,
 * recorded by the adviser, and the size class and designated status, worked
 * out from the number of lots, the scheme type and the replacement cost. PR 3
 * adds the administrative fund by-laws, recorded by the adviser.
 */
export const BUILDING_SELECTORS: readonly BuildingSelector[] = [SCHEME_TYPE, TENURE, SCHEME_SIZE, DESIGNATED_STATUS, ADMINISTRATIVE_FUND_BY_LAWS];

const sizeIn = (...sizes: string[]) => ({ selector: SCHEME_SIZE.key, in: sizes });
const byLawsIn = (...answers: string[]) => ({ selector: ADMINISTRATIVE_FUND_BY_LAWS.key, in: answers });
const designatedIn = (...answers: string[]) => ({ selector: DESIGNATED_STATUS.key, in: answers });
const designatedCostWords = `$${(DESIGNATED_STRATA_COMPANY.replacementCostMoreThanCents / 100).toLocaleString("en-AU")}`;

/**
 * The two funds (STA s 100). Neither is required of every Western Australian
 * scheme, so both have `required: false` and `requiredWhen` says when the law
 * requires them (stage 2, PR 3), from the building selectors: the size class
 * and the administrative fund by-laws for the administrative fund (s 140),
 * and the designated status for the reserve fund (s 100(2), (7); reg 79).
 * These replace the first forms (PR #107) with the same meaning, and add an
 * SAT order under s 140(3). `defaultFunds` reads them, so a new building is
 * given each fund the law requires of it, never one it may not have (a 2-lot
 * scheme's administrative fund, s 140(1)(b)), and a fund that cannot be
 * worked out is flagged, never guessed.
 */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "ADMINISTRATIVE",
    name: "administrative fund",
    label: "Administrative Fund",
    shortLabel: "Admin",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Control and management of the common property, insurance premiums and the strata company's other obligations.",
    required: false,
    // 6 or more lots: always. 3 to 5 lots: unless the by-laws exempt the company
    // (s 140(2)). 2 lots: cannot establish one unless the by-laws require it
    // (s 140(1)(b)). SAT may require it on a member's application (s 140(3)).
    requiredWhen: {
      rules: [
        {
          need: "REQUIRED",
          when: sizeIn("SIX_OR_MORE_LOT"),
          reason: "Required for a scheme of 6 or more lots.",
          provision: `${STA} ss 100(1)(a), 140`,
          status: "CONFIRMED",
        },
        {
          need: "REQUIRED",
          when: { all: [sizeIn("THREE_TO_FIVE_LOT"), byLawsIn("SAT_REQUIRED")] },
          reason: "Required because SAT has required it on a member's application.",
          provision: `${STA} s 140(3)`,
          status: "CONFIRMED",
        },
        {
          // The notes give s 140(3) without its scope or how it sits with
          // s 140(1)(b) (a 2-lot scheme cannot establish one unless its by-laws
          // require it). Read as required, so a building is never given fewer
          // funds than an order may require: NOT_CONFIRMED (FOR_REVIEW).
          need: "REQUIRED",
          when: { all: [sizeIn("TWO_LOT"), byLawsIn("SAT_REQUIRED")] },
          reason: "Required because SAT has required it on a member's application.",
          provision: `${STA} s 140(1)(b), (3)`,
          status: "NOT_CONFIRMED",
        },
        {
          need: "REQUIRED",
          when: { all: [sizeIn("THREE_TO_FIVE_LOT"), byLawsIn("NEITHER", "REQUIRE")] },
          reason: "Required for a scheme of 3 to 5 lots unless its by-laws exempt the strata company.",
          provision: `${STA} ss 100(1)(a), 140(2)`,
          status: "CONFIRMED",
        },
        {
          need: "OPTIONAL",
          when: { all: [sizeIn("THREE_TO_FIVE_LOT"), byLawsIn("EXEMPT")] },
          reason: "Not required because the by-laws exempt the strata company.",
          provision: `${STA} s 140(2)`,
          status: "CONFIRMED",
        },
        {
          need: "REQUIRED",
          when: { all: [sizeIn("TWO_LOT"), byLawsIn("REQUIRE")] },
          reason: "Required because the by-laws of this 2-lot scheme require it.",
          provision: `${STA} s 140(1)(b)`,
          status: "CONFIRMED",
        },
        {
          need: "NOT_ALLOWED",
          when: { all: [sizeIn("TWO_LOT"), byLawsIn("NEITHER", "EXEMPT")] },
          reason: "A 2-lot scheme cannot have an administrative fund unless its by-laws require one.",
          provision: `${STA} s 140(1)(b)`,
          status: "CONFIRMED",
        },
      ],
      noRuleFits: "No administrative fund rule fits the scheme size and the by-laws answer recorded.",
    },
    source: `${STA} ss 100(1)(a), 140`,
    status: "CONFIRMED",
  },
  {
    key: "RESERVE",
    name: "reserve fund",
    label: "Reserve Fund",
    shortLabel: "Reserve",
    // Kept in the ledger's capital works fund type, shown as the reserve fund.
    ledgerFund: "CAPITAL_WORKS",
    purpose: "Contingent expenses (other than routine ones) and major future expenses.",
    required: false,
    // Mandatory for a designated strata company (DESIGNATED_STRATA_COMPANY: 10 or
    // more lots, or a replacement cost of more than $5,000,000; s 100(7), reg 79).
    // Other companies may establish one (s 100(2)).
    requiredWhen: {
      rules: [
        {
          need: "REQUIRED",
          when: designatedIn("DESIGNATED"),
          reason: `Required for a designated strata company: ${DESIGNATED_STRATA_COMPANY.minLots} or more lots, or a replacement cost of more than ${designatedCostWords}.`,
          provision: `${STA} s 100(2), (7); ${STGR} reg 79`,
          status: DESIGNATED_STRATA_COMPANY.status,
        },
        {
          need: "OPTIONAL",
          when: designatedIn("NOT_DESIGNATED"),
          reason: "Not required for a strata company that is not designated, which may establish one.",
          provision: `${STA} s 100(2)`,
          status: "CONFIRMED",
        },
      ],
      noRuleFits: "Whether a reserve fund is required could not be worked out from the designated strata company test.",
    },
    source: `${STA} s 100(2), (7); ${STGR} reg 79`,
    status: "CONFIRMED",
  },
];

/** Rules about the funds as a whole (STA ss 100, 104, 116, 117). */
export const FUND_RULES = {
  /** Reserve fund contributions are levied only in proportion to unit entitlements; s 100(2)(c) has no by-law alternative. */
  reserveLeviedByUnitEntitlementOnly: true,
  /** Administrative fund contributions follow unit entitlement unless the by-laws set another basis (s 100(1)(c)). */
  administrativeByUnitEntitlementUnlessByLaws: true,
  /** Investment in the manner permitted by law for trust funds or by the regulations; interest forms part of the fund (s 116(1)(e), (2)). No investment regulation was found in the parts of the STGR read. */
  investment: "as permitted by law for the investment of trust funds, or by the regulations",
  /** Power to borrow and secure by negotiable instrument, mortgage of unpaid contributions or of company property; common property may not be mortgaged (ss 116(1)(c), (d), 117(1)(b)). */
  mayBorrow: true,
  commonPropertyMayBeMortgaged: false,
  /** Kept accessible: current balances of both funds, the current budget, the latest contribution resolution and the latest 10-year plan (s 104(1)(d)). */
  recordsAccessible: ["current administrative and reserve fund balances", "current budget", "latest contribution resolution", "latest 10-year plan"],
  source: `${STA} ss 100(1)(c), (2)(c), 104(1)(d), 116(1)(c) to (e), (2), 117(1)(b)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * One schedule: unit entitlement, a whole number for each lot in the schedule
 * of unit entitlements, which also states the total (STA s 37(1)). There is no
 * separate contribution schedule, so it is the one held on each lot.
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "UNIT_ENTITLEMENT",
    name: "unit entitlement",
    onLot: true,
    usedFor: [
      "the owner's interest in the common property",
      "contributions to the administrative fund, unless the by-laws set another basis, and to the reserve fund (always)",
      "voting rights",
      "the count of special resolutions, and of ordinary resolutions or council elections where a poll by unit entitlement is demanded",
      "each lot's share of a judgment debt against the strata company",
    ],
    source: `${STA} ss 13, 37(1), 100(1)(c), (2)(c), 103(2), 120, 122, 135(3)`,
    status: "CONFIRMED",
  },
];

/**
 * How unit entitlement is set and changed (STA ss 37, 38; STGR regs 54, 55):
 * each lot's proportion within 5% either way of its proportion of the value of
 * all lots (capital value for a strata scheme, site value for survey-strata),
 * by a licensed valuer, on a certificate issued no more than 2 years before
 * the registration application. Amended only with a subdivision amendment, by
 * resolution without dissent (with designated interest holders' consent or no
 * objection within 60 days), or by SAT order.
 */
export const UNIT_ENTITLEMENT_RULES = {
  maxVarianceFromValuePercent: 5,
  valuationBasis: { STRATA: "capital value", SURVEY_STRATA: "site value" },
  valuerCertificateMaxAgeYears: 2,
  amendedBy: ["a subdivision amendment", "resolution without dissent, with designated interest holders' consent or no objection within 60 days", "SAT order"],
  source: `${STA} ss 37(2), (3), (5), 38(1), (2); ${STGR} regs 54, 55(3)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The strata company (STA ss 14, 118, 142). */
export const STRATA_COMPANY = {
  /** A body corporate made up of the owners of the lots, established on registration of the scheme (s 14(1), (5), (8)). */
  establishedOnRegistration: true,
  /** The council is the governing body (s 14(6), s 135(1)). */
  governingBody: "council",
  /** A common seal is optional; used only as authorised by ordinary resolution and attested by 2 council members. Documents may instead be signed by persons authorised by ordinary resolution (s 14(7), s 118). */
  commonSealOptional: true,
  sealAttestedByCouncilMembers: 2,
  /** An excluded matter under Corporations Act s 5F (s 142). */
  corporationsActExcluded: true,
  source: `${STA} ss 14, 118, 142`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Budgets and contributions (STA ss 100, 102, 204; STGR regs 80 to 82). */
export const CONTRIBUTIONS = {
  /** A budget for each financial year, submitted to the AGM for approval, taking into account the 10-year plan (if any), the regulations and the by-laws (s 102(1), (2)). */
  budgetEachFinancialYear: true,
  /** Approved by ordinary resolution at the AGM or a later general meeting, with or without changes; varied by ordinary resolution (s 102(3), (4)). */
  budgetApprovedBy: "ordinary resolution",
  /**
   * A budget with common property spending under s 91(2) (other than
   * sustainability infrastructure) of more than $500 times the number of lots
   * needs a special resolution; the notice gives a description, timeframe,
   * estimated cost, a drawing and quotation or tender particulars (s 102(5);
   * reg 80). Section 91(2) itself was not read; reg 80(2) describes it as an
   * improvement or alteration of the common property.
   */
  budgetSpecialResolutionAbovePerLotCents: 50_000,
  /** What the notice of that special resolution must give (s 102(5); reg 80). */
  budgetSpecialResolutionNoticeContents: ["a description", "the timeframe", "the estimated cost", "a drawing", "quotation or tender particulars"],
  /**
   * Spending outside the budget only (s 102(6), (7); regs 81, 82): up to the
   * per-lot amount fixed by special resolution or, if none, $500 per lot per
   * financial year; or after a notice in the approved form with at least 2
   * quotations or tenders and no written objection within 14 days from owners
   * or first mortgagees of 25% or more of lots, or of 25% or more of unit
   * entitlement (a first mortgagee's objection displaces the owner's); or
   * spending a court, tribunal or statutory notice requires.
   */
  unbudgetedSpending: {
    defaultCapPerLotPerYearCents: 50_000,
    capFixedBy: "SPECIAL",
    objectionRoute: {
      minQuotes: 2,
      objectionWithinDays: 14,
      /** The spending is blocked by written objections from 25% or more of the lots, or from lots with 25% or more of the unit entitlement. */
      objectorsAtLeastPercentOfLotsOrOfUnitEntitlement: 25,
      objectorsMayBe: ["owners", "first mortgagees"],
      /** For a lot, a first mortgagee's objection takes the place of the owner's. */
      firstMortgageeObjectionDisplacesOwners: true,
    },
    requiredByCourtTribunalOrNotice: true,
  },
  /** Determined by the strata company by resolution, unless the by-laws empower the council; a strata manager cannot be authorised to (ss 100(3), 143(5)(b)). */
  determinedBy: "resolution of the strata company, unless the by-laws empower the council",
  strataManagerMayDetermine: false,
  /** Due and payable "in accordance with the terms of the decision to make the levy"; no statutory frequency or minimum notice was found (s 100(4)(a)). */
  dueAsTheDecisionSays: true,
  /** No express instalment rule; SAT cannot override the company's instalment arrangements unless unreasonable, which implies the company may set them (s 204(b)(v)). */
  instalmentsImpliedOnly: true,
  /** An incoming owner is jointly and severally liable for contributions and interest unpaid when they became owner (s 100(6)). */
  incomingOwnerLiable: true,
  source: `${STA} ss 100(3), (4)(a), (6), 102, 143(5)(b), 204(b)(v); ${STGR} regs 80 to 82`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Levy notices: no statutory form, content or lead time in the STA or STGR
 * (searched for "levy", "instalment", "discount", "hardship"). The default
 * by-law makes the treasurer responsible for notifying owners of
 * contributions levied (Sch 1 by-law 10(a)). No discount for early payment
 * was found (by-laws not checked). The shared NOTICE_RULES below is built
 * from it (stage 2, PR 6a).
 */
export const LEVY_NOTICES = {
  statutoryContentRule: false,
  statutoryMinimumNoticeDays: null,
  /** No early payment discount in the STA or STGR (searched "discount"). Scheme by-laws were not checked, so one may exist there. */
  statutoryEarlyPaymentDiscount: false,
  /** Default by-law: the treasurer notifies owners of contributions levied. */
  treasurerNotifies: { defaultByLaw: true, source: `${STA} Sch 1 by-law 10(a)` },
  source: `${STA} s 100, Sch 1 by-law 10(a); ${STGR} (searched)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Who decided WA's notice timing, as DECISIONS records it. */
const NOTICE_DECISION = "Matthew Wrigley's StrataVerze decision of 28 Oct 2026 (DECISIONS)";

/**
 * The levy notice rules in the shared shape (stage 2, PR 6a, 28 Oct 2026),
 * from LEVY_NOTICES and the notes only. The STA and STGR set no notice form,
 * content, least or most notice (CONFIRMED absent; by-laws not checked). A
 * contribution is due as the decision to make the levy says (s 100(4)(a)), so
 * a notice's due date is never moved: one that cannot be given 14 days'
 * notice cannot go out. The 35-day lead, the 14-day floor and never moving a
 * due date are StrataVerze choices Matthew Wrigley made on 28 Oct 2026
 * (DECISIONS); one notice for each instalment is a StrataVerze choice for
 * review. No hardship statement is required (HARDSHIP_STATEMENT).
 */
export const NOTICE_RULES: NoticeRules = {
  minimumNoticeDays: 14,
  issueDaysBeforeDue: 35,
  urgentNoticeDays: null,
  hardship: null,
  // No statutory content: the notice states what every StrataVerze notice states.
  contents: [],
  source: LEVY_NOTICES.source,
  checked: {
    minimumNoticeDays: {
      value: 14,
      status: "STRATAVERZE",
      source: NOTICE_DECISION,
      note: "The STA and STGR set no least notice for a levy (s 100(4)(a)). 14 days is StrataVerze's floor, not a rule of law.",
    },
    // The STA and STGR set no most notice (CONFIRMED absent; by-laws not checked).
    maximumNoticeDays: null,
    issueDaysBeforeDue: {
      value: 35,
      status: "STRATAVERZE",
      source: NOTICE_DECISION,
      note: "Each notice goes out 35 days before it falls due, as NSW and Queensland notices do. Not a rule of law.",
    },
    dueDateMayMove: {
      value: false,
      status: "STRATAVERZE",
      source: `${NOTICE_DECISION}; ${STA} s 100(4)(a)`,
      note: "StrataVerze's reading of s 100(4)(a): a contribution is due as the decision to make the levy says, so StrataVerze never moves a due date.",
    },
    noticeMode: {
      ADMINISTRATIVE: {
        value: "PER_INSTALMENT",
        status: "STRATAVERZE",
        source: `${STA} ss 100(4)(a), 204(b)(v)`,
        note: "One notice for each instalment as it falls due, as NSW: a StrataVerze choice, since the Act sets no notice rule. FOR_REVIEW.",
      },
      CAPITAL_WORKS: {
        value: "PER_INSTALMENT",
        status: "STRATAVERZE",
        source: `${STA} ss 100(4)(a), 204(b)(v)`,
        note: "One notice for each instalment as it falls due, as NSW: a StrataVerze choice, since the Act sets no notice rule. FOR_REVIEW.",
      },
    },
    requiredContents: [],
    form: null,
    source: `${STA} s 100(4)(a), Sch 1 by-law 10(a); ${STGR} (searched)`,
  },
};

/** No hardship or payment plan statement is required on levy notices: CONFIRMED absent from the STA and STGR ("hardship" returned no hits). By-laws, Consumer Protection policy and court practice not checked. */
export const HARDSHIP_STATEMENT = {
  required: false,
  source: `${STA}; ${STGR} (full-text searches)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The 10-year plan, for a designated strata company (STA s 100(2A); STGR regs
 * 77, 179): anticipated non-routine maintenance, repair, renewal or
 * replacement of common property and the company's personal property, with
 * estimated costs; revised at least once every 5 years and extended to 10
 * years from each revision. The first is submitted for approval at the first
 * AGM (for schemes existing at 1 May 2020, the first AGM more than 12 months
 * after that date). The regulation says only "submitted for approval";
 * Landgate says it is approved by ordinary resolution at an AGM (GUIDANCE).
 */
export const TEN_YEAR_PLAN = {
  requiredFor: "designated strata company",
  periodYears: 10,
  reviseAtLeastEveryYears: 5,
  contents: [
    "name and scheme address",
    "preparer's name and address (and qualifications, if engaged)",
    "period",
    "list of covered items",
    "condition report",
    "costing method and assumptions",
    "funding plan or recommendation",
  ],
  firstPlan: "submitted for approval at the first AGM; for schemes existing at 1 May 2020, the first AGM more than 12 months after that date",
  approval: "submitted for approval",
  /** Landgate's guidance; the regulation states no threshold. */
  approvalThresholdGuidance: "ordinary resolution at an AGM",
  approvalThresholdStatus: "GUIDANCE" as RuleStatus,
  source: `${STA} s 100(2A); ${STGR} regs 77, 179; ${LANDGATE_COMPANIES}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Interest on unpaid contributions (STA s 100(4)(b), (5); STGR reg 78): 11% a
 * year simple interest from the due date, automatically, unless the strata
 * company determines (generally or in a particular case) no interest or a
 * lesser rate. No grace period. Interest goes to the fund the contribution
 * belongs to. The shared LATE_CHARGE below is built from it (stage 2, PR 5).
 */
export const INTEREST_ON_UNPAID_CONTRIBUTIONS = {
  annualRatePercent: 11,
  simple: true,
  appliesAutomatically: true,
  runsFrom: "the due date",
  graceMonths: 0,
  companyMaySetLowerRateOrNone: true,
  creditedToContributionFund: true,
  source: `${STA} s 100(4)(b), (5); ${STGR} reg 78`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The late charge in the shared shape (VIC, ACT and WA stage 2, PR 5,
 * 28 Oct 2026), from INTEREST_ON_UNPAID_CONTRIBUTIONS and the notes only.
 * 11% a year simple interest from the due date, with no grace period, applies
 * automatically (s 100(4)(b); reg 78). The strata company may determine,
 * generally or in a particular case, no interest or a lesser rate: a rate
 * from 0 (no interest) up to but not including 11%. Who in the strata company
 * determines it is not in the notes (NOT_CONFIRMED), so no lower rate, no
 * "no interest" and no waiver can be recorded until a pack version records
 * it (FOR_REVIEW). How a day's share of the yearly rate is worked out is not
 * in the notes either, so the engine charges nothing until that is recorded.
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
  source: INTEREST_ON_UNPAID_CONTRIBUTIONS.source,
  annual: {
    statutoryRatePercent: { value: INTEREST_ON_UNPAID_CONTRIBUTIONS.annualRatePercent, status: "CONFIRMED", source: `${STGR} reg 78` },
    resolvedRate: {
      resolution: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STA} s 100(4)(b)`,
        note: "The strata company \"determines\" no interest or a lesser rate. The notes do not record by what resolution or body.",
      },
      minPercent: { value: 0, status: "CONFIRMED", source: `${STA} s 100(4)(b)`, note: "No interest (0%) or a lesser rate." },
      maxPercent: { value: INTEREST_ON_UNPAID_CONTRIBUTIONS.annualRatePercent, status: "CONFIRMED", source: `${STA} s 100(4)(b); ${STGR} reg 78`, note: "A lesser rate than 11%, so 11% itself is not a resolved rate." },
      maxInclusive: false,
    },
    accrual: {
      from: { value: "DUE_DATE", status: "CONFIRMED", source: `${STA} s 100(4)(b)`, note: "Interest runs if a contribution is \"not paid when it becomes due and payable\"." },
      graceMonths: { value: INTEREST_ON_UNPAID_CONTRIBUTIONS.graceMonths, status: "CONFIRMED", source: `${STA} s 100(4)(b)`, note: "None stated. Interest runs if not paid when due and payable." },
      simple: { value: true, status: "CONFIRMED", source: `${STA} s 100(4)(b); ${STGR} reg 78` },
      daysInYear: { value: null, status: "NOT_CONFIRMED", source: `${STGR} reg 78`, note: "The notes give a rate a year and do not say how a day's share of it is worked out." },
    },
    waiver: {
      // "In a particular case": no interest (the whole of it) is the case the notes give. A lesser rate in one case is not offered yet (FOR_REVIEW).
      kinds: ["WHOLE"],
      decidedBy: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${STA} s 100(4)(b)`,
        note: "The strata company may determine no interest in a particular case. The notes do not record by what resolution or body.",
      },
      reportedToAgm: false,
      formWords: { meeting: "General meeting", motion: "Motion carried" },
      source: `${STA} s 100(4)(b)`,
      status: "CONFIRMED",
    },
    source: INTEREST_ON_UNPAID_CONTRIBUTIONS.source,
  },
};

/**
 * The order a payment is applied to what an owner owes: contributions, then
 * interest, then recovery costs, as NSW. The notes record none, so this is a
 * StrataVerze choice Matthew Wrigley made on 28 Oct 2026 (DECISIONS), not a
 * rule of law.
 */
export const PAYMENT_ALLOCATION_ORDER: readonly PaymentAllocationPart[] = ["LEVY", "INTEREST", "RECOVERY_COSTS"];

/** Recovering unpaid contributions (STA ss 47(8), 100(4)(c), 116(1)(f), 120(2), 143(5)(e), 197(3)(f)). */
export const DEBT_RECOVERY = {
  /** Contributions, with accrued interest, are recoverable as a debt in a court of competent jurisdiction; the company may compromise (ss 100(4)(c), 116(1)(f)). */
  recoverableAsDebtInCourt: true,
  mayCompromise: true,
  /**
   * A court, not SAT: a dispute about an amount owed as a debt is not a scheme
   * dispute (except s 99(2) and Sch 2A cl 53E debts) (s 197(3)(f)); Landgate:
   * debt recovery "is still handled through a relevant court". The Act names
   * no particular court; MAGISTRATES_COURT_LIMITS gives one court's limits
   * (GUIDANCE).
   */
  forumKind: "COURT",
  forum: "a court of competent jurisdiction",
  courtNamedInAct: false,
  satMayDecide: false,
  /** No statutory pre-steps, pre-action or final notice in the STA or STGR (court rules not checked). */
  statutoryPreSteps: false,
  statutoryPreActionNotice: false,
  /** A strata manager cannot be authorised to commence proceedings (s 143(5)(e)). Who within the company decides is not stated (NOT_CONFIRMED). */
  strataManagerMayCommence: false,
  /** No statutory payment plan scheme; compromise and instalment arrangements only. */
  statutoryPaymentPlans: false,
  /** An unfinancial owner cannot vote except on unanimous, without dissent, leasehold expiry postponement or termination resolutions (s 120(2)). */
  unfinancialMayVoteOnlyOn: ["unanimous resolution", "resolution without dissent", "leasehold expiry postponement resolution", "termination resolution"],
  /** A SAT by-law penalty is recoverable, with interest, as if it were an unpaid contribution (s 47(8)). */
  byLawPenaltyRecoverableAsContribution: true,
  /** NOT CONFIRMED: whether legal and collection costs are recoverable from the owner (no STA or STGR provision found). */
  legalCostsRecoverable: null,
  legalCostsStatus: "NOT_CONFIRMED" as RuleStatus,
  source: `${STA} ss 47(8), 100(4)(c), 116(1)(f), 120(2), 143(5)(e), 197(3)(f); ${LANDGATE_COMPANIES}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Magistrates Court limits, from the court's website only (the Magistrates Court (Civil Proceedings) Act 2004 not read). */
export const MAGISTRATES_COURT_LIMITS = {
  generalProcedureClaimUpToCents: 7_500_000,
  minorCaseClaimUpToCents: 1_000_000,
  source: MAGISTRATES_COURT,
  status: "GUIDANCE" as RuleStatus,
} as const;

/**
 * General meetings (STA ss 77, 127 to 132, 120(3), (8); STGR reg 89). Held as
 * data for review; the meeting engine does not apply it (the shared meeting
 * rules shape is being changed elsewhere).
 */
export const MEETINGS = {
  /** The scheme developer convenes the first AGM within 3 months after registration; if not, another member may (s 77). */
  firstAgmWithinMonthsOfRegistration: 3,
  /**
   * Developer handover: the scheme developer gives the key documents at the
   * first general meeting after the subdivision, and must make remuneration
   * and benefit disclosures (ss 78, 79; reg 10). The list of key documents is
   * not recorded in the notes (NOT_CONFIRMED).
   */
  developerHandover: {
    keyDocumentsAt: "the first general meeting after the subdivision",
    remunerationAndBenefitDisclosures: true,
    keyDocumentsList: null,
    keyDocumentsListStatus: "NOT_CONFIRMED" as RuleStatus,
    source: `${STA} ss 78, 79; ${STGR} reg 10`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Once in each 12-month period and not more than 15 months after the previous AGM (not 2-lot schemes) (s 127(1), (2)). */
  agmEveryMonths: 12,
  agmMaxMonthsAfterPrevious: 15,
  /** Election of council members, consideration of accounts, and current insurance certificates and schedules; everything else is special business (s 127(3), (4)). */
  agmMandatoryItems: ["election of council members", "consideration of accounts", "current insurance certificates and schedules"],
  /** An EGM requested in writing by owners of 25% or more of unit entitlement; if no steps within 21 days, the requisitioners (or any of them with more than 50% of unit entitlement) may convene it, held within 3 months of the request (s 128). */
  requestedEgm: { unitEntitlementPercent: 25, councilStepsWithinDays: 21, holdWithinMonthsOfRequest: 3 },
  /** At least 14 days' notice to all owners and first mortgagees (s 129(1)). */
  noticeDays: 14,
  noticeTo: ["owners", "first mortgagees"],
  /** Date, time and venue; the AGM mandatory items; the general nature of special business; each acceptable voting method (s 129(2)). */
  noticeContents: ["date, time and venue", "AGM mandatory items", "general nature of special business", "each acceptable voting method, electronic or otherwise"],
  /** An owner's written notice of an item to a council member puts it on as special business (s 129(4)). */
  ownerMayAddItem: true,
  /** Accidental omission or non-receipt does not invalidate proceedings (s 129(3)). */
  defectiveNoticeInvalidates: false,
  /** Quorum (other than 2-lot): persons entitled to cast the votes of 50% of the lots present, proxies counting (s 130(3), (5)). */
  quorumPercentOfLots: 50,
  proxiesCountForQuorum: true,
  /** No quorum after 30 minutes: those present and entitled to vote are the quorum; no automatic adjournment (s 130(4)). */
  noQuorumWaitMinutes: 30,
  noQuorumThosePresentAreQuorum: true,
  /** The chair may adjourn with the meeting's consent; only unfinished business at the adjourned meeting (s 132(1)). */
  adjournmentWithMeetingConsent: true,
  /** Remote attendance by telephone, video, internet or similar, per any by-law requirements, if not an unreasonable burden; remote attendees are present (s 131). */
  remoteAttendance: true,
  /** Voting outside a meeting is allowed; the notice states how the vote is conducted and submitted, the closing date, how owners know their vote was cast and how results are published (s 120(3)(b), (8); reg 89). */
  votingOutsideMeeting: true,
  /** Electronic voting systems must protect the integrity of the vote (s 120(8)(a)). */
  electronicVotingMustProtectIntegrity: true,
  /** Minutes kept for 7 years (s 104(1)(b)(i); reg 83). No deadline for distributing minutes was found. */
  minutesRetentionYears: 7,
  minutesDistributionDeadlineDays: null,
  /** Default by-law: the secretary prepares and distributes minutes and moves their confirmation at the next meeting (Sch 1 by-law 9(a)). */
  minutesBySecretary: { defaultByLaw: true, source: `${STA} Sch 1 by-law 9(a)` },
  source: `${STA} ss 77, 104(1)(b), 120(3), (8), 127 to 132; ${STGR} regs 83, 89`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Resolutions (STA ss 120 to 123, 133). One vote per lot, by the owner in
 * person or by proxy; only a member entitled to vote may propose. Every type
 * needs 14 days' notice of its terms (an ordinary resolution only outside a
 * meeting). Recorded as plain data for review.
 */
export const RESOLUTIONS = {
  votesPerLot: 1,
  /** Only a member entitled to vote on the resolution may propose it (s 120(4)). */
  whoMayPropose: "a member entitled to vote on the resolution",
  noticeOfTermsDays: 14,
  UNANIMOUS: { basis: "the vote of every lot is cast in favour", countedBy: "number", source: `${STA} ss 122, 123(1)` },
  WITHOUT_DISSENT: { basis: "no vote of any lot is cast against (a 2-lot scheme: only if unanimous)", countedBy: "number", source: `${STA} ss 122, 123(2), (3)` },
  /**
   * 6 or more lots: in favour, at least 50% of all lots by number and at least
   * 50% of all unit entitlements; against, less than 25% of lots by number and
   * less than 25% of unit entitlements. Measured against all lots in the
   * scheme, not votes cast (s 123(4)). Smaller schemes: SIZE_CLASSES.
   */
  SPECIAL: {
    basis: "for: at least 50% of all lots and at least 50% of all unit entitlements; against: less than 25% of all lots and less than 25% of all unit entitlements",
    forMinFractionOfAllLots: 0.5,
    forMinFractionOfAllUnitEntitlement: 0.5,
    againstLessThanFractionOfAllLots: 0.25,
    againstLessThanFractionOfAllUnitEntitlement: 0.25,
    measuredAgainstAllLots: true,
    countedBy: "number and unit entitlement",
    source: `${STA} ss 122, 123(4)`,
  },
  /**
   * More than 50% of lots for which votes are cast or, where unit entitlement
   * counting is demanded, more than 50% of their unit entitlements; a tie
   * fails. Any person entitled to vote may demand unit entitlement counting
   * (at a meeting before the vote is put; outside one when the vote is cast),
   * and only they can withdraw the demand (ss 122, 123(7)).
   */
  ORDINARY: { basis: "more than 50% of the lots for which votes are cast (or of their unit entitlements, if demanded); a tie fails", countedBy: "number, or unit entitlement if demanded", source: `${STA} ss 122, 123(7)` },
  /** 28 days for unanimous, without dissent and special resolutions only (or a period set by regulation; none found). At a meeting it opens at the meeting and closes 28 days after (s 121). */
  votingPeriodDays: 28,
  votingPeriodAppliesTo: ["UNANIMOUS", "WITHOUT_DISSENT", "SPECIAL"],
  /** For those three, owners with no-one present at the meeting are given written notice of the outcome and may vote by written notice until the period closes (s 121(2)). */
  outcomeNoticeToAbsentOwners: true,
  /** General meeting resolutions may be ordinary unless the Act requires otherwise (s 133). */
  defaultType: "ORDINARY",
  /** What some decisions need. */
  requiredFor: {
    governanceByLaws: "WITHOUT_DISSENT",
    conductByLaws: "SPECIAL",
    budgetApprovalOrVariation: "ORDINARY",
    budgetWithCommonPropertySpendingAbove500PerLot: "SPECIAL",
    unbudgetedSpendingCap: "SPECIAL",
    amendUnitEntitlements: "WITHOUT_DISSENT",
    commonSealAndSigningAuthority: "ORDINARY",
    restrictOrDirectCouncil: "ORDINARY",
    /** A default by-law (Sch 1 by-law 4(8)), which a scheme may have changed; not where the council is all owners. */
    removeCouncilMember: { type: "SPECIAL", notWhereCouncilIsAllOwners: true, defaultByLaw: true, source: `${STA} Sch 1 by-law 4(8)` },
    surveyStrataInsuranceNotForReinstatement: "WITHOUT_DISSENT",
  },
  /** By-laws must be lodged for registration within 3 months after being made (s 48). Whether they have no effect until registered is NOT CONFIRMED. */
  byLawRegistrationWithinMonths: 3,
  /** For 10 years after completion, the scheme developer and associates cannot vote on defect resolutions and their unit entitlement is disregarded (s 80(2), (3)). */
  developerExcludedFromDefectVotesYears: 10,
  source: `${STA} ss 38(1)(b), 44(2), 48, 80, 97(6), 102, 118, 120 to 123, 133, 134, 135(1), Sch 1 by-law 4(8); ${STGR} reg 80`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Proxies (STA ss 120(7), 124 to 126; STGR reg 103). */
export const PROXIES = {
  /** In writing, executed by the appointer or their attorney; for all general meetings and purposes unless the instrument limits it; need not be a member (s 124(1) to (4)). */
  inWriting: true,
  mustBeMember: false,
  /** The Act allows regulations to limit strata managers as proxies; no such limit is in the current STGR (s 124(5)). */
  strataManagerProxyCap: null,
  /** An individual sole owner who is present votes personally; an owner and their proxy both present: the owner votes (ss 120(7), 125(1)). */
  ownerPresentVotes: true,
  /** A proxy with an interest must not vote on a resolution about goods, amenities or services to the company unless the instrument expressly authorises and directs the vote; for strata management contracts the notice must also give the manager's name, dates, variations and remuneration (s 125(2) to (4)). */
  conflictedProxyRestricted: true,
  /** Co-owners vote only through a single jointly appointed proxy (s 126(b)(iii)). */
  coOwnersSingleProxy: true,
  /** A first mortgagee may vote in person or by proxy; the owner votes if the mortgagee does not (s 126(a)). */
  firstMortgageeMayVote: true,
  source: `${STA} ss 120(7), 124 to 126; ${STGR} (searched for "proxy")`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The council of owners and its office bearers. The council is required and
 * performs the company's functions (STA ss 14(6), 135(1), 138). Its size,
 * meetings, quorum, office bearers and duties are default by-laws (Schedule 1,
 * changeable by resolution without dissent, s 44(2)(a)), marked
 * `defaultByLaw: true`.
 */
export const COUNCIL = {
  required: true,
  /** If there is no council or no quorum, the owners in general meeting may act (s 138). */
  generalMeetingMayActIfNoCouncil: true,
  size: {
    /** Until the first AGM, and in a scheme of 3 or fewer lots, all owners are the council; otherwise 3 to 7 owners, as the company decides, elected at each AGM. */
    allOwnersUntilFirstAgm: true,
    allOwnersWhenLotsAtMost: 3,
    minMembers: 3,
    maxMembers: 7,
    electedAtEachAgm: true,
    defaultByLaw: true,
    source: `${STA} Sch 1 by-laws 4(2) to (4)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Owners; one co-owner per lot; a corporation through an authorised individual (Sch 1 by-law 4(3), (6); s 136). */
  eligibility: { ownersOnly: true, oneCoOwnerPerLot: true, defaultByLaw: true, source: `${STA} s 136, Sch 1 by-law 4(3), (6)`, status: "CONFIRMED" as RuleStatus },
  /** Votes counted by number unless unit entitlement counting is demanded; nominee consent; ballot procedure (s 135(3); by-laws 4(4), 5). */
  election: { countedBy: "number, or unit entitlement if demanded", nomineeConsentRequired: true, defaultByLaw: true, source: `${STA} s 135(3), Sch 1 by-laws 4(4), 5`, status: "CONFIRMED" as RuleStatus },
  /** Council quorum by council size (by-law 4(11)). */
  quorum: { bySize: { 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 }, defaultByLaw: true, source: `${STA} Sch 1 by-law 4(11)`, status: "CONFIRMED" as RuleStatus },
  /** Meets when a member gives the others not less than 7 days' notice stating the reason; otherwise regulates its own meetings; decides by simple majority (by-law 8). */
  meetings: { memberMayCallOnDaysNotice: 7, decisionsBySimpleMajority: true, defaultByLaw: true, source: `${STA} Sch 1 by-law 8(1), (2)(a)`, status: "CONFIRMED" as RuleStatus },
  /**
   * Chairperson, secretary and treasurer appointed by the council at its first
   * meeting, from its members; one person may hold more than one office; the
   * council's chairperson chairs the company (s 135(4); by-laws 6, 7).
   */
  officeBearers: {
    positions: ["chairperson", "secretary", "treasurer"],
    appointedByCouncilFromMembers: true,
    onePersonMayHoldSeveral: true,
    defaultByLaw: true,
    source: `${STA} s 135(4), Sch 1 by-laws 6, 7`,
    status: "CONFIRMED" as RuleStatus,
  },
  secretaryDuties: {
    duties: ["minutes", "notices", "supplying information under ss 108 and 109", "correspondence", "calling nominations", "convening meetings"],
    defaultByLaw: true,
    source: `${STA} Sch 1 by-law 9`,
    status: "CONFIRMED" as RuleStatus,
  },
  treasurerDuties: {
    duties: ["notifying owners of contributions levied", "receipting and banking", "preparing s 110 certificates", "accounting records and statement of accounts"],
    defaultByLaw: true,
    source: `${STA} Sch 1 by-law 10`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** May delegate to members, engage persons for goods and services; a member may appoint an owner as substitute for a meeting (by-law 8). */
  delegation: { toMembers: true, substituteMayBeOwner: true, defaultByLaw: true, source: `${STA} Sch 1 by-law 8(2)(b), (c), (3) to (5)`, status: "CONFIRMED" as RuleStatus },
  /** Casual vacancies filled by the remaining members; office vacancies by the council (by-laws 4(10), 6(3A)). */
  vacancies: { filledByCouncil: true, defaultByLaw: true, source: `${STA} Sch 1 by-laws 4(10), 6(3A)`, status: "CONFIRMED" as RuleStatus },
  /** Removal by special resolution, unless the council is all owners (by-law 4(8)). */
  removal: { by: "SPECIAL", defaultByLaw: true, source: `${STA} Sch 1 by-law 4(8)`, status: "CONFIRMED" as RuleStatus },
  /** No separate council spending cap: spending limits are set at company level (s 102(6); CONTRIBUTIONS). */
  councilSpendingCap: null,
  /** Act honestly, loyally and in good faith; care and diligence; no improper use of position; disclose conflicts in writing and do not vote on them (owning a lot alone is not a conflict) (s 137). */
  duties: ["act honestly, loyally and in good faith", "reasonable care and diligence", "no improper use of position", "disclose conflicts in writing and do not vote on them"],
  /** No civil liability for good-faith acts; liability attaches to the company (s 141). */
  goodFaithProtection: true,
  source: `${STA} ss 14(6), 102(6), 135, 136, 137, 138, 141, Sch 1`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Strata managers (STA Part 9; STGR Part 13). */
export const STRATA_MANAGERS = {
  /** No licensing scheme under the STA or STGR; managers are regulated through Part 9 (s 144; STGR Part 13). */
  licensingScheme: false,
  /** Consumer Protection says a manager who is a licensed real estate agent is covered by the Real Estate and Business Agents Act 1978 and holds levies in trust (page appears outdated). */
  realEstateAgentNote: { text: "A manager who is a licensed real estate agent is covered by the Real Estate and Business Agents Act 1978 and must hold levies in trust.", source: CONSUMER_PROTECTION, status: "GUIDANCE" as RuleStatus },
  /** A written strata management contract (or volunteer agreement), plus the criminal check, qualification and PI insurance requirements (s 144). */
  writtenContractRequired: true,
  /** Contract minimum terms (s 145(1), (3); regs 93(4), 97, 97C, 99). Variations, extensions and renewals in writing. */
  contractTerms: [
    "names and addresses for service",
    "ACN or ABN",
    "start and end dates",
    "scheme functions and conditions",
    "written reporting requirements (content and timing)",
    "remuneration or how it is calculated",
    "the accounts to be used",
    "the text of, or a notice drawing attention to, s 151",
    "criminal record check, qualification, experience and PI insurance warranties",
  ],
  /** Before contracting: conflicts of interest, and expected remuneration or benefits from sources other than the company (s 145(2)). */
  preContractDisclosure: ["conflicts of interest", "expected remuneration or benefits from sources other than the strata company"],
  /**
   * Ongoing disclosure of conflicts, and of remuneration or benefits from
   * others, as soon as practicable (ss 146(2), 147). Not required where both
   * the benefit is under $100 and the total from that person in the calendar
   * year is under $100 (reg 100).
   */
  ongoingDisclosureExemption: {
    benefitUnderCents: 10_000,
    calendarYearTotalFromSamePersonUnderCents: 10_000,
    bothMustApply: true,
    source: `${STA} ss 146(2), 147; ${STGR} reg 100`,
  },
  /** National criminal record check for the manager (or its directors or partners) and each principal, strata community manager and assistant, at least every 3 years; a criminal record statement before contracting (regs 92, 93). */
  nationalCriminalRecordCheckEveryYears: 3,
  /** Professional indemnity insurance of not less than $1,000,000 for any one claim, warranted in the contract (regs 98, 99). */
  professionalIndemnityMinPerClaimCents: 100_000_000,
  /** No fidelity guarantee or fidelity insurance requirement (searched "fidelity"). */
  fidelityCoverRequired: false,
  /** A separate ADI trust account, a pooled ADI trust account for the manager's strata companies only, or the company's own ADI account if authorised; not capable of being overdrawn; "trust account" in the name; protected from the manager's creditors (s 148; reg 101). */
  trustAccountRequired: true,
  /** Accounting information within 7 days of written notice; not for matters more than 7 years old (s 149). */
  accountingInformationWithinDays: 7,
  /** Annual return to Landgate in the approved form within 3 months after each calendar year end, for the first calendar year starting on or after 1 May 2020 and the next 9 years; volunteers exempt (s 153; reg 102). The years 2021 to 2030 are a calculation. */
  annualReturn: { withinMonthsAfterCalendarYear: 3, calendarYears: 10, volunteersExempt: true, sizeBands: { small: "under 6 lots", medium: "6 to 20", large: "21 to 50", veryLarge: "over 50" } },
  /** Termination for cause: show cause notice allowing at least 14 days, then at least 28 days' termination notice stating the right to SAT review (s 151). Records returned within 28 days, no lien (s 152). */
  termination: { showCauseMinDays: 14, terminationNoticeMinDays: 28, recordsReturnWithinDays: 28 },
  /** Developer-era service contracts: an implied right to terminate after 5 years; SAT may extend up to the lesser of the term or 10 years (s 115). */
  developerContractTerminableAfterYears: 5,
  /** A lot owner working for no more than $250 per lot per calendar year: no PI insurance or qualifications, but a national criminal record check every 3 years (s 3(1), s 144(2), (3); regs 11, 94). */
  volunteer: { maxHonorariumPerLotPerYearCents: 25_000, piInsuranceRequired: false, qualificationsRequired: false, nationalCriminalRecordCheckEveryYears: 3 },
  /** Functions a strata manager cannot be given (s 143(5)). */
  cannotBeDelegated: [
    "authorising others to perform scheme functions (other than as the manager's agents)",
    "determining contributions",
    "dealing with another strata manager's contract",
    "terminating s 115 contracts",
    "commencing proceedings",
    "authorising use of the seal",
    "authorising signatories",
    "functions declared by regulation",
  ],
  source: `${STA} ss 3(1), 115, 143 to 153; ${STGR} regs 11, 90 to 102`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Strata manager education and experience (STGR regs 90, 95, 97B to 97E, 172,
 * 182). Qualifications by role, based on the Certificate IV in Strata
 * Community Management (CPP40521) or the Diploma of Property (Agency
 * Management — Strata) (CPP51122). Reg 95 applies at the end of the 7-year
 * and 6-month transitional period from 1 May 2020 (CONFIRMED); the calendar
 * date 1 Nov 2027 is a calculation that Landgate confirms (GUIDANCE).
 * Experience: principals 2 years, strata community managers 1 year; those
 * required before 1 Nov 2027 are deemed compliant until 1 Nov 2029
 * (principals) or 1 Nov 2028 (community managers); the reg 97C warranty does
 * not apply to contracts entered into before 1 Nov 2027.
 */
export const STRATA_MANAGER_EDUCATION = {
  qualifications: ["Certificate IV in Strata Community Management (CPP40521)", "Diploma of Property (Agency Management — Strata) (CPP51122)"],
  roles: ["principal", "strata community manager", "assistant"],
  appliesFrom: "2027-11-01",
  appliesFromStatus: "GUIDANCE" as RuleStatus,
  experienceYears: { principal: 2, strataCommunityManager: 1 },
  deemedCompliantUntil: { principal: "2029-11-01", strataCommunityManager: "2028-11-01" },
  warrantyNotForContractsBefore: "2027-11-01",
  source: `${STGR} regs 90, 95, 97B to 97E, 172, 182(1); ${LANDGATE_EDUCATION}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Accounts and audit (STA ss 3(1), 101, 116(1)(k), 127(3)(b), 150; STGR regs
 * 172, 175). Proper records of income and expenditure, and a statement of
 * accounts each financial year (a designated function). No mandatory audit:
 * the company has a power to arrange one; if it has an auditor, the manager
 * must cooperate. The financial year ends 30 June unless the by-laws specify
 * another 12-month period; the phase-in ended 1 May 2025 (a calculation).
 */
export const FINANCIAL_STATEMENTS = {
  statementOfAccounts: ["assets and liabilities at year end", "income and expenditure for the year"],
  consideredAtAgm: true,
  auditRequired: false,
  auditIsPower: true,
  financialYearEnds: "30 June, unless the by-laws specify another 12-month period",
  source: `${STA} ss 3(1), 101, 116(1)(k), 127(3)(b), 150; ${STGR} regs 172, 175`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Insurance (STA ss 3(1), 97 to 99, 127(3)(c); STGR reg 9). */
export const INSURANCE = {
  /** All insurable assets to replacement value against fire, storm and tempest (not sea, flood or erosion), lightning, explosion and earthquake; a cap for a kind of event if a reasonable limitation (s 97(1)(a)). */
  buildingBasis: "replacement value",
  events: ["fire", "storm and tempest (excluding damage by sea, flood or erosion)", "lightning", "explosion", "earthquake"],
  /** Public liability of not less than $10,000,000, or another amount under the regulations (none found) (s 97(1)(b)). */
  publicLiabilityMinCents: 1_000_000_000,
  /** No periodic insurance valuation requirement in the STA or STGR. */
  valuationEveryYears: null,
  /** If no insurer offers reasonable terms, the closest available cover; SAT may exempt (s 97(2), (3)). */
  closestAvailableCoverIfUnavailable: true,
  /** Proceeds applied to reinstatement (survey-strata exception by resolution without dissent) (s 97(5), (6)). */
  proceedsToReinstatement: true,
  /** The company may require a member to act, refrain or pay an attributable premium loading (s 98); a member may insure if the company fails (s 99). */
  memberPremiumLoading: true,
  memberMayInsureIfCompanyFails: true,
  /** Current insurance certificates and schedules at the AGM (s 127(3)(c)). */
  presentedAtAgm: true,
  source: `${STA} ss 3(1), 97 to 99, 127(3)(c); ${STGR} reg 9`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Records the company keeps, and for how long (STA ss 104, 105; STGR regs 83, 84). Electronic records are permitted. */
export const RECORD_RETENTION = {
  keepYears: {
    7: [
      "minutes",
      "ordinary resolutions and council decisions",
      "accounts",
      "notices",
      "proposed resolution material",
      "disclosures",
      "correspondence",
      "other contracts",
    ],
    20: ["special, unanimous and without dissent resolutions", "insurance contracts", "infrastructure contracts for a common property easement"],
  },
  sevenYearsAfterEnd: ["s 92 leases", "leases, licences and special privileges over common property"],
  lifeOfScheme: ["key documents (unless a shorter period applies)", "s 63(8) and (9) documents"],
  electronicPermitted: true,
  /**
   * The roll (s 105; fine $3,000) is a designated function (s 140(4)): a
   * 6-or-more-lot scheme must keep it; a 3 to 5-lot scheme must unless its
   * by-laws exempt it (s 140(2)); a 2-lot scheme may, but need not (s
   * 140(1)(a)). SAT may require it on a member's application (s 140(3)). Where
   * no roll is kept, each owner gives written notice of their address for
   * service to the company and the other owners (s 106).
   */
  roll: {
    requiredBySchemeSize: { TWO_LOT: "OPTIONAL", THREE_TO_FIVE_LOT: "UNLESS_BY_LAWS_EXEMPT", SIX_OR_MORE_LOT: "ALWAYS" } as Readonly<Record<string, SizeClassRequirement>>,
    offenceFineCents: 300_000,
    /** What the roll records, each person with their address for service (s 105). */
    records: ["the strata company's name", "council members", "officers", "owners", "strata managers", "notified tenants", "notified mortgagees"],
    withAddressesForService: true,
    source: `${STA} ss 105, 106, 140`,
  },
  /** A named letterbox on the parcel and a reasonably available electronic means of contact (s 104(3)); the letterbox is a designated function (s 140(4)). */
  letterboxAndElectronicContact: true,
  source: `${STA} ss 104, 105; ${STGR} regs 83, 84`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/*
 * The meeting rules in the shared shape (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026), from MEETINGS, RESOLUTIONS, SIZE_CLASSES, DEBT_RECOVERY and
 * RECORD_RETENTION. Each resolution rule carries its source and status;
 * MEETING_RULES_STATUS gives those of the other parts. What the count at a
 * meeting records and refuses:
 * - an ordinary resolution: more than half of the lots for which votes are
 *   cast, by unit entitlement where that is demanded (a poll); a tie fails
 *   (s 123(7));
 * - special, without dissent and unanimous resolutions stay open for 28 days
 *   after the meeting (s 121), so they are decided when that period closes.
 *   Since stage 2, PR 8b-ii (29 Oct 2026, Matthew Wrigley's decisions D1, D2
 *   and D8 to D11, DECISIONS) the meeting records the votes cast and the item
 *   stays open (pendingResolutions VOTING_PERIOD, the item stored as OPEN):
 *   the count at the meeting is still refused where a fact is missing, but
 *   gives neither carried nor lost. Owners of the lots with nothing entered
 *   at the item may vote for or against in writing until the period closes
 *   (s 121(2)), a lot owing money judged on the day the vote is received
 *   (s 120(2)), and the written notice of the outcome to them must be
 *   recorded as given before it is decided. It is made on the later of the
 *   meeting's day and the day it is recorded, in the building's time zone,
 *   its period closes at the end of the 28th day after that, and it is
 *   decided as at the next day, only then (even if every lot has voted), on
 *   the votes at the meeting and the written votes, by the test below for the
 *   building's size. The daily run records the decision 7 days later
 *   (settleAfterGraceDays), so a written vote received in time can still be
 *   recorded; the day it is decided does not move. A count that cannot be
 *   made, or a missing outcome notice, leaves it open with what stops it. The
 *   tests are held: unanimous, every lot for (s 123(1)); without dissent, no
 *   vote against, and with 2 lots only if unanimous (s 123(2), (3)); special,
 *   with 6 or more lots at least 50% of all lots and of all unit entitlement
 *   for and less than 25% of each against (s 123(4)), with 3, 4 or 5 lots
 *   2, 3 or 4 lots and at least 50% of unit entitlement for and no against
 *   test (s 123(6)), and with 2 lots only if unanimous (s 123(5));
 * - an unfinancial owner votes only on unanimous and without dissent
 *   resolutions (s 120(2));
 * - common property rows are not counted as lots;
 * - an item with no resolution category cannot be recorded as resolved at a
 *   general meeting, since nothing counts it (a StrataVerze choice);
 * - in a 2-lot scheme the quorum needs both lots, with no fallback after 30
 *   minutes (s 130(2), (4)): since stage 2, PR 8a-ii (29 Oct 2026, Matthew
 *   Wrigley's decision) a count is refused unless both lots have a vote or an
 *   abstention recorded at the item (quorumNeedsEveryLot). A lot whose vote is
 *   not counted for money owed (s 120(2)) still makes up the quorum;
 * - a council meeting's notice (7 days by default, Sch 1 by-law 8(2)(a), a
 *   default by-law a scheme may have changed) is not checked: since stage 2,
 *   PR 8b-iii (29 Oct 2026, Matthew Wrigley's decision D12) such a notice is
 *   stored as not compliant with no period (noticeNotCheckedFor) and shown
 *   as "Notice period not checked", never as met;
 * - the minutes (no content is prescribed beyond the record kept, s 104(1)(b)):
 *   since stage 2, PR 8b-iv (29 Oct 2026) an item whose voting period is
 *   open is named "Voting open", and its later effect is given as at the day
 *   the minutes are assembled: the day voting closes, the day it is decided
 *   as at and where it stands (minutesContents).
 */

/** The days of grace after a voting period closes before the daily run records its decision (Matthew Wrigley's decision of 29 Oct 2026). */
const PENDING_SETTLE_GRACE_DAYS = 7;

const WA_GENERAL_QUORUM = {
  basis: "PERCENT_OF_LOTS_THEN_THOSE_PRESENT",
  percent: MEETINGS.quorumPercentOfLots,
  waitMinutes: MEETINGS.noQuorumWaitMinutes,
  source: `${STA} s 130`,
  status: "CONFIRMED",
} as const;

const WA_TOO_FEW_LOTS = "This resolution needs a scheme of at least 2 lots, and fewer are recorded";
const WA_TWO_LOT_QUORUM =
  `In a 2-lot scheme the meeting has a quorum only with both lots present or represented, and there is no fallback (${STA} s 130(2), (4)). Both lots must have a vote or an abstention entered at this item (a lot whose vote is not counted for money owed still makes up the quorum), so the votes cannot be counted`;
const WA_MIN_LOTS_FOR = SIZE_CLASSES.THREE_TO_FIVE_LOT.specialResolutionMinLotsFor;
const WA_SMALL_SPECIAL = (lots: 3 | 4 | 5) => ({
  when: { lotsAtLeast: lots, lotsAtMost: lots },
  rule: {
    basis: "SHARE_OF_ALL_LOTS",
    forAtLeastLots: WA_MIN_LOTS_FOR[lots],
    forAtLeastFractionOfAllEntitlement: SIZE_CLASSES.THREE_TO_FIVE_LOT.specialResolutionMinUnitEntitlementPercentFor / 100,
  },
  source: `${STA} s 123(6)`,
  status: "CONFIRMED",
}) as const;

export const MEETING_RULES: MeetingRuleSet = {
  state: "WA",
  version: "WA-2026.1",
  effectiveFrom: "2026-10-28",
  // The council's 7 days is a default by-law a scheme may have changed, so it is not held. Since stage 2, PR 8b-iii its
  // notice is recorded as not checked (noticeNotCheckedFor, decision D12).
  noticePeriods: { AGM: MEETINGS.noticeDays, EGM: MEETINGS.noticeDays, FIRST_AGM: MEETINGS.noticeDays },
  // No deadline for distributing minutes was found (MEETINGS.minutesDistributionDeadlineDays).
  minutesDeadlines: {},
  quorumRules: { AGM: WA_GENERAL_QUORUM, EGM: WA_GENERAL_QUORUM, FIRST_AGM: WA_GENERAL_QUORUM },
  resolutionCategories: {
    ORDINARY: { basis: "COUNT_MAJORITY", source: RESOLUTIONS.ORDINARY.source, status: "CONFIRMED" },
    SPECIAL: {
      basis: "BY_VARIANT",
      votingPeriodDays: RESOLUTIONS.votingPeriodDays,
      variants: [
        { when: { lotsAtLeast: 2, lotsAtMost: 2 }, rule: { basis: "SHARE_OF_ALL_LOTS", forAtLeastFractionOfAllLots: 1 }, source: `${STA} s 123(5)`, status: "CONFIRMED" },
        WA_SMALL_SPECIAL(3),
        WA_SMALL_SPECIAL(4),
        WA_SMALL_SPECIAL(5),
        {
          when: { lotsAtLeast: 6 },
          rule: {
            basis: "SHARE_OF_ALL_LOTS",
            forAtLeastFractionOfAllLots: RESOLUTIONS.SPECIAL.forMinFractionOfAllLots,
            forAtLeastFractionOfAllEntitlement: RESOLUTIONS.SPECIAL.forMinFractionOfAllUnitEntitlement,
            againstLessThanFractionOfAllLots: RESOLUTIONS.SPECIAL.againstLessThanFractionOfAllLots,
            againstLessThanFractionOfAllEntitlement: RESOLUTIONS.SPECIAL.againstLessThanFractionOfAllUnitEntitlement,
          },
          source: RESOLUTIONS.SPECIAL.source,
          status: "CONFIRMED",
        },
      ],
      noVariantFitsRefusal: WA_TOO_FEW_LOTS,
      source: `${STA} ss 121, 122, 123(4) to (6)`,
      status: "CONFIRMED",
    },
    WITHOUT_DISSENT: {
      basis: "BY_VARIANT",
      votingPeriodDays: RESOLUTIONS.votingPeriodDays,
      variants: [
        { when: { lotsAtLeast: 2, lotsAtMost: 2 }, rule: { basis: "SHARE_OF_ALL_LOTS", forAtLeastFractionOfAllLots: 1 }, source: `${STA} s 123(3)`, status: "CONFIRMED" },
        { when: { lotsAtLeast: 3 }, rule: { basis: "NO_AGAINST" }, source: `${STA} s 123(2)`, status: "CONFIRMED" },
      ],
      noVariantFitsRefusal: WA_TOO_FEW_LOTS,
      source: `${STA} ss 121, 122, 123(2), (3)`,
      status: "CONFIRMED",
    },
    UNANIMOUS: {
      basis: "SHARE_OF_ALL_LOTS",
      forAtLeastFractionOfAllLots: 1,
      votingPeriodDays: RESOLUTIONS.votingPeriodDays,
      source: `${STA} ss 121, 122, 123(1)`,
      status: "CONFIRMED",
    },
  },
  retention: { generalYears: 20, secretBallotMonths: null },
  preMeetingEvoting: null,
  resolutionLabels: {
    ORDINARY: { short: "Ordinary", full: "Ordinary Resolution" },
    SPECIAL: { short: "Special", full: "Special Resolution" },
    WITHOUT_DISSENT: { short: "Without dissent", full: "Resolution without Dissent" },
    UNANIMOUS: { short: "Unanimous", full: "Unanimous Resolution" },
  },
  generalMeetingCategories: ["ORDINARY", "SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"],
  committeeCategories: ["ORDINARY"],
  committeeCategoryRefusal: "Only an ordinary resolution can go on a council meeting agenda. Put this motion on a general meeting agenda instead.",
  motionCategories: ["ORDINARY", "SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"],
  debtorsMayVoteOn: ["UNANIMOUS", "WITHOUT_DISSENT"],
  pollCategories: ["ORDINARY"],
  excludeCommonPropertyRows: true,
  // Every outcome at a general meeting comes from the count, so an item with no category cannot be recorded as resolved there.
  categoryRequiredAtGeneralMeetings: true,
  // A 2-lot scheme's quorum needs both lots (s 130(2), (4)): Matthew Wrigley's decision of 29 Oct 2026 (DECISIONS).
  quorumNeedsEveryLot: { lotsAtMost: 2, refusal: WA_TWO_LOT_QUORUM, source: `${STA} s 130(2), (4)`, status: "CONFIRMED" },
  // The voting period (s 121), recorded since stage 2, PR 8b-ii: Matthew Wrigley's decisions of 29 Oct 2026 (DECISIONS).
  pendingResolutions: {
    VOTING_PERIOD: {
      label: "Voting period",
      windowDays: RESOLUTIONS.votingPeriodDays,
      takesEffectAs: "SAME",
      // No deadline for the outcome notice was found (s 121(2)): it is required before the close is decided (lateVotes).
      noticeWithinDays: null,
      noticeRequiredBeforeEffect: false,
      settleAfterGraceDays: PENDING_SETTLE_GRACE_DAYS,
      lateVotes: {
        by: "LOTS_WITH_NOTHING_ENTERED",
        outcomeNoticeRequired: RESOLUTIONS.outcomeNoticeToAbsentOwners,
        words: "Owners with no-one present at the meeting may vote for or against by written notice until the voting period closes. StrataVerze takes a written vote from a lot with nothing entered at this item at the meeting. Record each one with the day it was received.",
        noticeWords: "written notice of the outcome to the owners with no-one present at the meeting",
        noticeLabel: "Day the owners with no-one present were given written notice of the outcome",
      },
      conductHelp: `Its vote stays open for ${RESOLUTIONS.votingPeriodDays} days after the meeting. Record the votes cast at the meeting. It is decided when the voting period closes, with the written votes received by then.`,
      help: `Special, without dissent and unanimous resolutions stay open for ${RESOLUTIONS.votingPeriodDays} days after the meeting. The owners with no-one present at the meeting are given written notice of the outcome, and may vote by written notice until the period closes. StrataVerze takes the period to close at the end of the ${RESOLUTIONS.votingPeriodDays}th day after the meeting, or after the day the votes are recorded if that is later, counts the votes at the meeting and the written votes received by then by the test for the building's size, and decides it as at the next day, once the notice of the outcome is recorded as given. It records that ${PENDING_SETTLE_GRACE_DAYS} days later, so a written vote received in time can still be recorded.`,
      source: `${STA} ss 120(2), 121, 123`,
      status: "STRATAVERZE",
    },
  },
  // Stage 2, PR 8b-iii (29 Oct 2026, Matthew Wrigley's decision D12): a council meeting's notice is not checked.
  noticeNotCheckedFor: {
    COMMITTEE: `A council meeting's notice is set by the scheme's by-laws, ${COUNCIL.meetings.memberMayCallOnDaysNotice} days by default (${STA} Sch 1 by-law 8(2)(a)), and StrataVerze does not hold the scheme's by-laws`,
  },
  // Stage 2, PR 8b-iv (29 Oct 2026): the later effect of a resolution with a voting period in the minutes.
  minutesContents: {
    laterEffect: true,
    source: `${STA} ss 104(1)(b), 121`,
    status: "STRATAVERZE",
  },
  notes:
    "Draft, from the Western Australian pack (not signed off), VIC, ACT and WA stage 2, PR 8a-i, 8a-ii, 8b-ii, 8b-iii and 8b-iv. A council meeting's notice period is not checked. The minutes give the later effect of a resolution with a voting period. Special, without dissent and unanimous resolutions stay open for their 28-day voting period: the meeting records the votes, written votes are recorded after it, and the resolution is decided when the period closes. A 2-lot scheme's count needs both lots recorded at the item.",
};

/** How far each part of MEETING_RULES not carrying its own status is checked. */
export const MEETING_RULES_STATUS = {
  noticePeriods: {
    status: "CONFIRMED" as RuleStatus,
    source: `${STA} s 129(1)`,
    note: "14 days for a general meeting. The council's 7 days (Sch 1 by-law 8(2)(a)) is a default by-law a scheme may have changed, so council notice is not checked.",
  },
  noticeNotCheckedFor: {
    status: "STRATAVERZE" as RuleStatus,
    source: `${STA} s 129(1); Sch 1 by-law 8(2)(a)`,
    note: "Since stage 2, PR 8b-iii a council meeting's notice is stored as not compliant with no period and shown as \"Notice period not checked\" (Matthew Wrigley's decision D12 of 29 Oct 2026, DECISIONS): its 7 days is a default by-law a scheme may have changed, and the scheme's by-laws are not held (FOR_REVIEW). The 14 days' notice of the terms of a resolution (s 123) equals the general meeting notice, so nothing more is checked.",
  },
  minutesContents: {
    status: "STRATAVERZE" as RuleStatus,
    source: `${STA} ss 104(1)(b), 121`,
    note: "No content for the minutes is prescribed in the STA or STGR read. Since stage 2, PR 8b-iv a resolution with a voting period (s 121) is named \"Voting open\" while it is open, and its later effect is given as at the day the minutes are assembled (a StrataVerze choice, FOR_REVIEW).",
  },
  minutesDeadlines: { status: "CONFIRMED" as RuleStatus, source: MEETINGS.source, note: "No deadline for distributing minutes was found in the STA or STGR read." },
  quorumRules: {
    status: "CONFIRMED" as RuleStatus,
    source: `${STA} s 130`,
    note: "Held as data; not evaluated. A 2-lot scheme needs both lots (s 130(2), (4)), which the shared basis does not hold: since stage 2, PR 8a-ii its count is refused unless both lots are recorded at the item (quorumNeedsEveryLot). The council's quorum is a default by-law and is not held.",
  },
  retention: {
    status: "STRATAVERZE" as RuleStatus,
    source: RECORD_RETENTION.source,
    note: "20 years, the longest period for a meeting's records: special, unanimous and without dissent resolutions are kept 20 years and minutes 7 (reg 83). Keeping the whole meeting record for 20 years is a StrataVerze choice (FOR_REVIEW).",
  },
  debtorsMayVoteOn: {
    status: "CONFIRMED" as RuleStatus,
    source: `${STA} s 120(2)`,
    note: "An unfinancial owner votes only on unanimous and without dissent resolutions (and leasehold expiry postponement and termination resolutions, which are not categories). Unfinancial is read as a levy notice issued, past its due date and not paid in full (FOR_REVIEW).",
  },
  labelsAndLists: { status: "STRATAVERZE" as RuleStatus, source: "StrataVerze", note: "The names, the categories each meeting and the motions list offer, the poll categories, pre-meeting voting not offered and common property rows not counted are StrataVerze choices (FOR_REVIEW)." },
} as const;

/**
 * Information and inspection (STA ss 107 to 109, 111; STGR regs 85 to 88). For
 * a person with a proper interest (member, contracted buyer, mortgagee and the
 * regulation classes) or a person they authorise in writing. An application
 * is not duly made until any fee charged is paid. Maximum fees increase by
 * 10% where GST must be remitted. Legally privileged material need not be
 * provided.
 */
export const RECORDS_INSPECTION = {
  /**
   * Who has a proper interest and may apply for information (s 107(1), (2);
   * reg 85), or a person authorised in writing by one of them.
   */
  properInterest: [
    "a member",
    "a buyer under a contract",
    "a mortgagee",
    "an owner of a leasehold scheme (reg 85)",
    "a guardian or administrator of an owner (reg 85)",
    "a retirement village resident or contract holder (reg 85)",
  ],
  authorisedInWritingByProperInterest: true,
  /** Contact details of a council member or officer within 14 days, fee at most $10 (s 108; reg 86(1)(a)). */
  contactInformation: { withinDays: 14, maxFeeCents: 1_000 },
  /** At an agreed place and time or, if not agreed within 3 days, as notified; between 9am and 5pm on a day not more than 10 days after the application (s 109(1) to (3)). */
  inspection: { agreeWithinDays: 3, withinDaysOfApplication: 10, hours: "9am to 5pm" },
  /** Maximum $1 for a person with a proper interest, $100 for a person they authorise (reg 86(1)(b)). */
  inspectionMaxFeeCents: { PROPER_INTEREST: 100, AUTHORISED_PERSON: 10_000 },
  /** Photographs with the person's own camera are free and cannot be restricted (reg 87(3), (4)). */
  photographsFree: true,
  /** Copies are optional for the company; at most $50 plus device cost (storage device), $50 for the first 5 pages plus $1 a page (photocopy), $50 (electronic) (s 109(5); reg 88). */
  copies: { optional: true, storageDeviceCents: 5_000, storageDevicePlusDeviceCost: true, photocopyFirst5PagesCents: 5_000, photocopyExtraPageCents: 100, electronicCents: 5_000 },
  gstAddsPercent: 10,
  source: `${STA} ss 107 to 109, 111; ${STGR} regs 85 to 88`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The strata company's certificate (STA s 110; STGR reg 86(1)(c), (d), (3)):
 * on a written application by a person with a proper interest or a person
 * they authorise, within 14 days (fine $3,000). Two types, each at most $140
 * (plus 10% if GST applies; the 2019 amounts, reg 86 shows no amendment).
 * Conclusive evidence as at its date for a person taking an interest for
 * value.
 */
export const SECTION_110_CERTIFICATE = {
  withinDays: 14,
  maxFeeCents: { SCHEME: 14_000, LOT: 14_000 },
  contents: {
    SCHEME: ["whether a strata management contract is in effect, with its start and end dates", "insurance: insurer, policy number, type and amount of cover, expiry", "unregistered common property dispositions or exclusive use by-laws"],
    LOT: ["contributions determined at the last AGM, since then and in the previous 12 months, with amounts and due dates", "outstanding amounts owed by the owner or occupier, with date and nature", "the interest rate on outstanding amounts"],
  },
  conclusive: true,
  source: `${STA} ss 107, 110; ${STGR} reg 86(1)(c), (d), (3)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The seller's disclosure before the buyer signs (STA ss 156, 157; STGR regs
 * 103 to 106): by notice in the approved form, or in the contract. The form's
 * name is from Landgate guidance; "Form 28" is NOT CONFIRMED. The buyer's
 * remedies (ss 158 to 164) were not read.
 */
export const SELLER_DISCLOSURE = {
  beforeBuyerSigns: true,
  contents: [
    "seller's name and address",
    "scheme notice, plan, by-laws (including unregistered) and schedule of unit entitlements",
    "strata lease (leasehold)",
    "strata company's name and address for service",
    "minutes of the last AGM and later EGMs (or why not)",
    "the last statement of accounts (or why not)",
    "any termination proposal notice",
    "the lot's location and definition",
    "the lot's unit entitlement and the total",
    "contributions determined in the previous 12 months with due dates (or a 12-month estimate)",
    "details of any debt owed to the strata company",
    "exclusive use by-laws for a special lot",
    "voting right restrictions in the contract (reg 103)",
    "the approved form of general information about buying and selling in strata (reg 103)",
  ],
  /** Extra items where the developer controls the scheme (s 156(3), (4)). */
  developerControlledExtras: ["12-month income and expenditure estimate", "s 79 disclosures", "service contracts", "common property leases and licences"],
  form: "Precontractual disclosure statement to the buyer",
  formStatus: "GUIDANCE" as RuleStatus,
  formNumber: null,
  formNumberStatus: "NOT_CONFIRMED" as RuleStatus,
  /** Notifiable variations after contract: written notice within 10 working days of becoming aware, or as soon as practicable within 15 working days of settlement (s 157; regs 105, 106). */
  variationNoticeWithinWorkingDays: 10,
  variationNearSettlementWorkingDays: 15,
  source: `${STA} ss 156, 157; ${STGR} regs 103 to 106; ${LANDGATE_SELLERS}`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Disputes (STA ss 46, 47, 119, 197 to 210; STGR regs 57, 58, 162). SAT hears
 * scheme disputes, except, among others, debt disputes (s 197(3)(f)): levy
 * debts go to a court (DEBT_RECOVERY). No mandatory internal dispute step;
 * SAT may decline trivial applications or ones the parties could reasonably
 * resolve (s 198(5)).
 */
export const DISPUTES = {
  tribunal: "State Administrative Tribunal",
  excludesLevyDebts: true,
  mandatoryInternalStep: false,
  /** By-law enforcement at SAT: serious adverse consequences, 3 or more contraventions, or a contravened s 47 notice (s 47(1)(b), (3), (4)). */
  byLawEnforcement: {
    grounds: ["the contravention has had serious adverse consequences for another person", "3 or more separate contraventions", "a s 47 notice has been contravened"],
    applicants: ["the strata company", "owners", "mortgagees", "occupiers"],
  },
  /** SAT by-law penalty at most $2,000; not against the company; no daily penalties (none authorised) (s 47(5) to (7); reg 58). */
  byLawPenaltyMaxCents: 200_000,
  /** Interim orders up to 3 months, renewable (s 201). */
  interimOrderMonths: 3,
  /** Internal review of a non-legally qualified member's order, with leave, within 28 days (s 210; reg 162). */
  internalReviewWithinDays: 28,
  /** The company must not act in a way that is unfairly prejudicial, discriminatory, oppressive or unreasonable (s 119). */
  objectivesTest: true,
  source: `${STA} ss 46, 47, 119, 197 to 210; ${STGR} regs 57, 58, 162`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Pending law reform: not law. The statutory five-year review of the STA (s
 * 227), Phase Two consultation 15 Oct to 26 Nov 2026. Topics include strata
 * costs and financial information, council responsibilities, strata manager
 * fees and accountability, short-term rental accommodation, buyer
 * information, by-laws, proxy voting, levies, budgets and financial
 * management, scheme insurance, building defects and permanent strata manager
 * annual returns. A final report is to be tabled in Parliament; no Bill was
 * mentioned.
 */
export const PENDING_REVIEW = {
  isLaw: false,
  review: "Statutory five-year review of the Strata Titles Act 1985 (s 227), Phase Two",
  consultationFrom: "2026-10-15",
  consultationTo: "2026-11-26",
  topics: [
    "strata costs and financial information",
    "council responsibilities",
    "strata manager fees and accountability",
    "short-term rental accommodation",
    "buyer information",
    "by-laws",
    "proxy voting",
    "levies, budgets and financial management",
    "scheme insurance",
    "building defects",
    "permanent strata manager annual returns",
  ],
  billIntroduced: null,
  source: LANDGATE_REVIEW,
  status: "GUIDANCE" as RuleStatus,
} as const;

/**
 * Changes since 2024 (STA and STGR compilation tables). STA: no amending Act
 * has commenced since the Transfer of Land Amendment Act 2022 (7 Aug 2023).
 * The current consolidation (08-a0-00, from 26 Jun 2025) adds only editorial
 * changes under the Legislation Act 2021. Separately, the Land Legislation
 * (Postponement of Expiry) Proclamation 2024 (SL 2024/43) postponed the
 * expiry of STA s 225 (prescribed fees may exceed cost recovery) to the end
 * of 31 Dec 2029; the notes record no commencement date for it. The STGR
 * entries are amending regulations.
 */
export const CHANGES_SINCE_2024 = [
  { instrument: "SL 2024/43", amends: "STA", commenced: null, touched: "s 225 (prescribed fees may exceed cost recovery): expiry postponed to the end of 31 Dec 2029" },
  { instrument: "SL 2024/18", amends: "STGR", commenced: "2024-03-01", touched: "reg 3 (definitions)" },
  { instrument: "SL 2024/50", amends: "STGR", commenced: "2024-04-18", touched: "regs 97, 172, 182 (education transitional period)" },
  { instrument: "SL 2024/83", amends: "STGR", commenced: "2024-07-01", touched: "fees (regs 86 and 88 show no amendment note)" },
  { instrument: "SL 2024/209", amends: "STGR", commenced: "2024-10-17", touched: "regs 97, 172, 182; reg 182A inserted" },
  { instrument: "SL 2025/85", amends: "STGR", commenced: "2025-07-01", touched: "fees" },
  { instrument: "SL 2025/182", amends: "STGR", commenced: "2025-10-30", touched: "regs 3, 90, 92, 93, 95, 96 (deleted), 97, 97A to 97C, 172, 182, 182A (education and experience framework)" },
  { instrument: "SL 2026/64", amends: "STGR", commenced: "2026-07-01", touched: "fees" },
  { instrument: "SL 2026/171", amends: "STGR", commenced: "2026-08-20", touched: "regs 90, 95, 102; regs 97D and 97E inserted (experience transition)" },
] as const;

/** Western Australia's words for the things the platform names (STA ss 3(1), 14, 100, 143). */
export const TERMINOLOGY = {
  ownersCorporation: "strata company",
  committee: "council",
  act: "Strata Titles Act 1985",
  actShort: "STA",
  jurisdictionShort: "WA",
  /**
   * The strata disputes tribunal, the State Administrative Tribunal (s 3(1)).
   * It does NOT hear levy debts: a dispute about an amount owed as a debt is
   * not a scheme dispute (s 197(3)(f)), so levy debts go to a court
   * (DEBT_RECOVERY.forumKind; FOR_REVIEW). Code must not use this word for
   * where levy claims are heard.
   */
  tribunal: "SAT",
  levy: "contribution",
  levies: "contributions",
  /** Interest on unpaid contributions (s 100(4)(b)). */
  lateCharge: "interest",
  /** As the strata company's name gives the scheme type before its number (s 14(2)); a survey-strata scheme would read "Survey-strata scheme". */
  planLabel: "Strata scheme",
  /**
   * "The Owners of [the name of the scheme] (strata scheme/survey-strata scheme
   * [the reference number allocated by the Registrar of Titles])" (s 14(2),
   * (3)), for a strata scheme. The scheme name is the name in the scheme
   * notice. Pre-2020 scheme names (Sch 5 cl 3) NOT CONFIRMED.
   */
  bodyCorporateName: "The Owners of {name} (strata scheme {plan})",
  /** No short form: the full name. */
  bodyCorporateShortName: "The Owners of {name} (strata scheme {plan})",
  manager: "strata manager",
  developer: "scheme developer",
  officers: ["chairperson", "secretary", "treasurer"],
  generalMeetings: ["annual general meeting", "extraordinary general meeting"],
  source: `${STA} ss 3(1), 14, 100, 135, 143; Sch 1 by-law 6`,
} as const;

/** What was not confirmed on 27 Oct 2026, for the review. */
export const NOT_CONFIRMED = [
  // The research notes' list.
  "Who decides, inside the strata company, to start debt recovery proceedings (council or general meeting). The Act only bars the strata manager (s 143(5)(e)).",
  "Whether legal and collection costs on levy debts are recoverable from the owner. No STA or STGR provision was found; this depends on court costs rules and possibly by-laws.",
  "Whether newly made or amended by-laws have no effect until registered (s 48 requires registration within 3 months; the operative provision, likely ss 56 to 58, was not read).",
  "The name format for schemes continued from before 1 May 2020 (Sch 5 cl 3).",
  "The meaning of s 91(2), the common property spending that triggers the special resolution budget rule (s 91 not read; reg 80 describes it as improvement or alteration).",
  "Sections 158 to 164 (buyer remedies): Landgate guidance only.",
  "Single tier strata scheme rules (Sch 2A; STGR Sch 1), including insurance.",
  "\"Form 28\": the approved form is named on Landgate as the \"Precontractual disclosure statement to the buyer\"; no form number was verified.",
  "The Magistrates Court limits ($75,000 general procedure, $10,000 minor case) are from the court's website, not the Magistrates Court (Civil Proceedings) Act 2004.",
  "The Landgate fact sheet PDFs (finances and insurance, meetings, disputes, strata managers) could not be read; their dates are unknown.",
  "The detailed content of each 2024 to 2026 amending regulation (only the amendment notes in the consolidation were read).",
  "Whether a Bill to amend the STA has been introduced (the WA Parliament bills list was not checked).",
  "Investment rules under regulation (s 116(1)(e) \"or by the regulations\"); none found in the parts of the STGR read.",
  // Parts not read.
  "STGR Parts 3 to 6, 9 to 11, 15 and 17 and the Schedules (mostly not read), including the Sch 2 text of the s 47 notice.",
  "STA s 12 (scheme documents), Part 12 and STGR Part 15 (termination, out of scope), and survey-strata and leasehold schemes beyond headline level.",
  "The Consumer Protection strata page was read only through a summary and appears to predate the May 2020 reforms (the Real Estate and Business Agents Act point).",
  // Gaps found while writing the pack.
  "Who within the strata company determines no interest or a lower rate (s 100(4)(b) says the company \"determines\"; the notes do not record by what resolution or body).",
  "The order a payment is applied to contributions, interest and recovery costs: the notes record none. PAYMENT_ALLOCATION_ORDER is a StrataVerze choice (DECISIONS, 28 Oct 2026).",
  "How a day's share of the 11% yearly rate is worked out (365 days or another basis): the notes do not say.",
  "The list of key documents the scheme developer must hand over at the first general meeting (ss 78, 79; reg 10): the notes confirm the duty but do not record the list.",
] as const;

/**
 * StrataVerze's decisions. The pack as a whole has not been reviewed; the
 * decisions so far are the payment order and the notice timing (28 Oct 2026),
 * the 2-lot quorum, the voting period and council notice not checked
 * (29 Oct 2026).
 */
export const DECISIONS: readonly { decision: string; decidedBy: string; decidedOn: string }[] = [
  {
    decision: "Apply a payment to contributions first, then interest, then recovery costs, as NSW (PAYMENT_ALLOCATION_ORDER). A StrataVerze choice: the notes record no order.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-28",
  },
  {
    decision:
      "Notice timing (NOTICE_RULES): each levy notice goes out 35 days before it falls due and is never given less than 14 days' notice, and a due date is never moved, because the decision to make the levy fixes it (STA s 100(4)(a)). Matthew Wrigley's StrataVerze decision of 28 Oct 2026: the STA and STGR set no notice rule, so these are StrataVerze choices, not rules of law.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-28",
  },
  {
    decision:
      "2-lot quorum (MEETING_RULES.quorumNeedsEveryLot): at a general meeting of a 2-lot scheme, where the quorum needs both lots with no fallback (STA s 130(2), (4)), a count is refused unless both lots are recorded at the item, voting or abstaining, with a clear refusal and nothing written. A lot that owes money can make up the quorum: a lot whose vote is not counted for money owed (s 120(2)) still makes up the quorum if it is recorded at the item (s 130), and the ordinary resolution is then decided by the counted votes. Matthew Wrigley's StrataVerze decision of 29 Oct 2026 (the stricter reading first applied, that such a lot does not make up the quorum, was relaxed the same day). Fewer than 2 lots entered is refused too.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
  {
    decision:
      "Voting period (MEETING_RULES.pendingResolutions VOTING_PERIOD, STA s 121; stage 2, PR 8b-ii). Matthew Wrigley's StrataVerze decisions of 29 Oct 2026, kept in FOR_REVIEW for legal confirmation: a special, without dissent or unanimous resolution counted at a general meeting is recorded with the votes cast and stays open (the item stored as OPEN), and the 2-lot quorum (quorumNeedsEveryLot) still applies at the meeting. Day counting (D1): a written vote can be received up to and including the 28th day after the day it was made, and it is decided as at the next day. The day it is made (D2) is the later of the meeting's start day and the day it is recorded, in the building's time zone. Late voters (D8): the lots with nothing entered at the item at the meeting, for or against only, a debt (s 120(2)) judged on the day the written vote was received, one written vote per lot; the written notice of the outcome (s 121(2)) must be recorded as given before the close is decided whenever such a lot exists. No early decision (D9): decided only at the close, even if every lot has voted. Locked (D10): an item with a voting period cannot be recorded again, deferred or deleted. A daily run (D11) decides it, and only after 7 days of grace (settleAfterGraceDays), the day it is decided staying the day after the close. At the close the votes at the meeting and the written votes are counted by the s 123 test for the building's size, as it was at the meeting: carried or lost, ended by VOTES_AT_CLOSE. A count that cannot be made, or a missing outcome notice, leaves it open with what stops it.",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
  {
    decision:
      "Notice not checked (MEETING_RULES.noticeNotCheckedFor, stage 2, PR 8b-iii): (D12) a council meeting's notice, whose 7 days is a default by-law a scheme may have changed (Sch 1 by-law 8(2)(a)), is not checked. Such a notice is stored as not compliant with no period, with no database change, and shown as \"Notice period not checked\", never as met. Matthew Wrigley's StrataVerze decision of 29 Oct 2026, kept for confirmation (FOR_REVIEW).",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
];

/**
 * Points for StrataVerze to decide or check before the pack is signed off
 * (review of 27 Oct 2026). Not law and not decided: each moves to DECISIONS
 * once Matthew Wrigley decides it.
 */
export const FOR_REVIEW = [
  "Supported options: `supported: true` for STRATA (SCHEME_TYPE), FREEHOLD (TENURE) and all three size classes (SCHEME_SIZE) is a StrataVerze proposal, not law. Survey-strata and leasehold schemes are proposed as not supported because they were researched at headline level only.",
  "Levy debts go to a court, not SAT (s 100(4)(c), s 197(3)(f)). TERMINOLOGY.tribunal (\"SAT\") is the strata disputes tribunal only; shared code that names where levy claims are heard must take the forum from DEBT_RECOVERY, not from TERMINOLOGY.tribunal.",
  "Funds: both funds have `required: false`, and `requiredWhen` gives the law's test through the building selectors (stage 2, PR 3), read by defaultFunds and requiredFunds. The administrative fund reads the size class and ADMINISTRATIVE_FUND_BY_LAWS, the reserve fund the designated status. A fund that cannot be worked out is not given to a new building, and the building is flagged in Building data missing, as is a required fund it lacks or an administrative fund a 2-lot scheme may not have. The SAT order under s 140(3) is a new answer the first form did not hold.",
  "SAT order for a 2-lot scheme: the notes give s 140(3) (SAT may require a designated function on a member's application) without its scope or how it sits with s 140(1)(b) (a 2-lot scheme cannot establish an administrative fund unless its by-laws require one). A 2-lot scheme recorded with an SAT order is read as required, so it is never given fewer funds than an order may require, and that rule is NOT_CONFIRMED. For 3 to 5 lots the order is read as required (CONFIRMED). Confirm.",
  "Schemes with no fund (stage 2 PR 3 review): a building with no administrative and no reserve fund has no ledger, as the chart of accounts needs at least one fund. Onboarding refuses such a building in plain words: one whose funds cannot be worked out from the lots entered (every 2 to 5-lot scheme, since the wizard does not ask for the by-laws answer, the scheme type or the replacement cost), and one whose rules require no fund (a 2-lot scheme whose by-laws do not require an administrative fund and that is not designated). An existing building in that state is flagged in Building data missing. Decide how StrataVerze should handle such schemes: ask for the by-laws answer, scheme type and replacement cost during onboarding, keep a ledger with no statutory fund, or decline them.",
  "ADMINISTRATIVE_FUND_BY_LAWS: one answer for a 2 to 5-lot scheme (neither, by-laws require, by-laws exempt, SAT has required), recorded by the adviser or StrataVerze in the Building rules section, and asked for only where the administrative fund depends on it. It covers the administrative fund only, not the other designated functions of s 140(4). Every answer is marked supported (a StrataVerze proposal). Confirm who checks the by-laws, and whether by-laws that exempt a 3 to 5-lot scheme still let it keep a fund: the notes say only that it is exempt, so the screens say only that the fund is not required.",
  "Building selectors (BUILDING_SELECTORS): the scheme type and tenure are recorded by the adviser or StrataVerze in the Building rules section, outside the locked building record, and any listed option may be recorded (one not supported is flagged). The size class and designated status are worked out, never recorded. The number of lots is the building's lots other than common property rows, read only where it matches the building's total lots.",
  "Designated status (DESIGNATED_STATUS): the notes record no way to be, or not be, designated other than the s 100(7) and reg 79 tests, so no override is offered. Below 10 lots the replacement cost must be recorded, and its meaning follows the scheme type (scheme building for a strata scheme, common property improvements for a survey-strata scheme). Who may record the replacement cost, and from what valuation, is for review.",
  "Scheme size (SCHEME_SIZE): no class is worked out for fewer than 2 lots, because the notes give none.",
  "LATE_CHARGE (stage 2, PR 5): a one-case waiver is refused on a notice that already has interest charged, until a way to reverse a charge exists. 11% a year simple interest from the due date, with no grace period, is from the notes (s 100(4)(b); reg 78). Who in the strata company determines no interest or a lesser rate, generally or in a particular case, is NOT_CONFIRMED, so neither a lower rate (from 0, which is no interest, up to but not including 11%) nor a one-case waiver can be recorded until a pack version records it. How a day's share of the yearly rate is worked out (365 days or another basis) is NOT_CONFIRMED, so no interest is charged at all until that is recorded. A lesser rate in a particular case is not offered: only waiving all of the interest on one notice. Rounding (once, half up, to the cent, on the sum of the days, as NSW interest) and applying each payment to the contribution first are StrataVerze choices. Confirm each.",
  "PAYMENT_ALLOCATION_ORDER: contributions, then interest, then recovery costs, as NSW. Decided by Matthew Wrigley on 28 Oct 2026 as a StrataVerze choice (DECISIONS), since the notes record no order. Recorded here so the decision is visible at sign-off.",
  "NOTICE_RULES (stage 2, PR 6a): each notice goes out 35 days before it falls due, never with less than 14 days' notice, as Matthew Wrigley decided on 28 Oct 2026 (DECISIONS). A due date is never moved (s 100(4)(a): the levy decision fixes it), so a notice that can no longer be given 14 days' notice cannot go out: the Adviser is told, and the levy must be decided again with a later date. Recorded here so the decision is visible at sign-off.",
  "NOTICE_RULES: one notice for each instalment as it falls due is a StrataVerze choice (the STA and STGR set no notice rule). Scheme by-laws were not checked: one may set a notice form, content or period, or an early payment discount. Confirm.",
  "NOTICE_RULES, notices that cannot go out because their due date cannot move: the daily job logs them as held (LEVY_NOTICES_HELD) again on every run until the planned notices are stopped, and when the Adviser sends overdue notices they are held while the others go out. When a schedule is first planned, one such instalment refuses the whole schedule (nothing is planned). Decide whether to keep both.",
  "MEETING_RULES (stage 2, PR 8a-i) is StrataVerze's mapping of MEETINGS, RESOLUTIONS and SIZE_CLASSES to the shared shape. StrataVerze choices: the names (Ordinary, Special, Unanimous Resolution and Resolution without Dissent); a general meeting and the motions list offer all four, and a council meeting ordinary resolutions only; pre-meeting voting and voting outside a meeting (s 120(3)) are not offered; common property rows are not counted as lots; a poll means unit entitlement counting demanded on an ordinary resolution (s 122); an item with no resolution category (such as an election) cannot be recorded as resolved at a general meeting, because every outcome there comes from the count and such an item has no test to count it by (it can be recorded as lost, or deferred). Confirm each.",
  "Voting period (stage 2, PR 8b-ii, 29 Oct 2026, Matthew Wrigley's decisions D1, D2 and D8 to D11, DECISIONS): special, without dissent and unanimous resolutions stay open for 28 days after the meeting (s 121), and owners with no-one present may still vote by written notice (s 121(2)). The meeting records the votes cast and the item stays open: the chair's only choices are Record the votes and Deferred, a count missing a fact is still refused, and closing a ballot never records one. Points to confirm: day counting (D1: up to and including the 28th day after the day it is made, decided as at the next day; the Interpretation Act 1984 s 61 was not read); the day it is made (D2: the later of the meeting's day and the day it is recorded, in the building's time zone); who had no-one present (D8: attendance is not recorded, so the lots with nothing entered at the item, counted or not counted for money owed, are taken as those owners, and a lot with an abstention entered was present); written votes for or against only, one per lot, and a debt judged on the day the vote is received, a lot owing money on that day refused and nothing stored (it may be recorded again if the debt is shown paid by then); the outcome notice (D8: no deadline was found, so it is required before the close is decided whenever such a lot exists, and one given after the close is flagged, not refused); no early decision (D9: even if every lot has voted, it is decided only at the close); the 7 days of grace before the daily run records the decision (the day it is decided stays the day after the close); and the count at the close by the test for the building's size as it was at the meeting, the number of lots and total unit entitlement as at the meeting and each written vote weighed by its lot's unit entitlement when it is counted. After review (29 Oct 2026): only the building's lots at the meeting, kept with the resolution, may vote in writing (a lot added or entered again since may not, and the close is refused if a written vote is from any other lot or the lots voting are more than the lots then); the debtor rule a written vote is judged by is the one the pack held at the meeting, kept with the resolution; an outcome notice given after the voting period closed is flagged in its record and to the adviser. Since stage 2, PR 8b-iv (29 Oct 2026) the minutes name an open item \"Voting open\" in place of its stored outcome (OPEN), and give its later effect as at the day they are assembled: the day voting closes, the day it is decided as at, and once decided whether it was carried or lost. Minutes assembled while it is open are not changed when it is decided, so a later version must be assembled to show it. Confirm each.",
  "A 2-lot special resolution and resolution without dissent are counted as unanimous: every lot for (s 123(3), (5)). Below 2 lots no test fits and the count is refused. The 3 to 5-lot special resolution is read as at least 50% of the total unit entitlement for (s 123(6) says \"unit entitlement\"). Confirm.",
  "A resolution without dissent with no vote cast at all passes the test (no vote against, s 123(2)). Since stage 2, PR 8b-ii these resolutions are recorded, so one with no vote at the meeting and no written vote is carried at the close. Confirm that reading.",
  "An unfinancial owner (s 120(2)) is read as a lot with a levy notice issued, past its due date and not paid in full on the meeting's date, as for Queensland. A special resolution is measured against all lots, so a lot whose vote is not counted for money owed still counts in the total. Confirm.",
  "The meeting record is kept 20 years (retention), the period for special, unanimous and without dissent resolutions; minutes alone are kept 7 (reg 83). Confirm.",
  "Not applied: the scheme developer's exclusion from defect resolutions for 10 years (s 80(2), (3)); council meeting notice (a default by-law, see the next point); a deadline for minutes (none found).",
  "Council meeting notice (stage 2, PR 8b-iii, 29 Oct 2026), by Matthew Wrigley's StrataVerze decision D12 of 29 Oct 2026 (DECISIONS), kept here for confirmation: the council's 7 days' notice (Sch 1 by-law 8(2)(a)) is a default by-law a scheme may have changed, and StrataVerze does not hold the scheme's by-laws, so a council meeting's notice period is not checked. Such a notice is stored as not compliant with no period, with no database change (a notice with no period was always stored as compliant before), and shown as \"Notice period not checked\", never as met; it can still be issued. The 14 days' notice of the terms of a resolution (s 123) equals the general meeting notice, so nothing more is checked for it. Confirm, and decide whether a scheme's council notice should be recorded per building.",
  "Pre-meeting electronic voting is not offered for this draft (preMeetingEvoting is null). Before it is, closing a ballot must apply what the count at the meeting applies: the debtor condition (debtorRuleAppliesWhen), judged lot by lot as an owner's own vote is (debtorVoteCheck), the quorum answer, and any refusal of the whole count (Victoria's tier 5, Western Australia's 2-lot quorum). closeBallotAction applies none of these yet (stage 2, PR 8a-ii review). Confirm before any Western Australian ballot is offered.",
  "2-lot quorum (stage 2, PR 8a-ii, 29 Oct 2026, Matthew Wrigley's decision): a 2-lot scheme's quorum needs persons entitled to cast the votes of both lots, with no fallback after 30 minutes (s 130(2), (4)). StrataVerze does not record attendance, so at a general meeting of a 2-lot scheme (by the lots entered or the number the building records, which must agree) a count is refused unless both lots have a vote or an abstention recorded at the item, and nothing is written. A lot whose vote is not counted for money owed (s 120(2)) still makes up the quorum (Matthew Wrigley's decision, DECISIONS), and the resolution is decided by the counted votes. Fewer than 2 lots entered is refused. An item with no resolution category is not counted, so it is not checked. Other schemes' quorum (50% of the lots, then those present) is not checked, as before. Confirm.",
] as const;

/**
 * None of the NSW workflows applies in Western Australia: there is no
 * statutory payment plan, committee training, Strata Hub report or key
 * financial information form; the 10-year plan, the s 110 certificate,
 * records inspections and debt recovery are Western Australia's own.
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
