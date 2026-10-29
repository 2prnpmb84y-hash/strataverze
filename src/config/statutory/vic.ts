/**
 * Statutory rules for Victorian owners corporations: Owners Corporations Act
 * 2006 (Vic) ("OCA"), Owners Corporations Regulations 2018 (Vic) ("OCR") and
 * Part 5 of the Subdivision Act 1988 (Vic) ("SA").
 *
 * DRAFT, FOR STRATAVERZE TO REVIEW (27 Oct 2026). Not signed off and not
 * applied to any building: `rulePackFor` returns active packs only, and
 * Victoria is not in SUPPORTED_SCHEME_STATES or the database's state check.
 * DECISIONS lists proposed choices, and two decided: the payment order and
 * the notice timing (Matthew Wrigley, 28 Oct 2026). FOR_REVIEW lists the
 * points to settle first.
 *
 * Every value comes from the research notes of 27 Oct 2026 prepared for
 * Matthew Wrigley ("Victoria: owners corporation law research notes"), which
 * give the provision and source of each. The notes read:
 * - S1 OCA, Version 024 ("incorporating amendments as at 9 September 2026"),
 *   in force 9 Sep 2026, read in full from the DOCX of that version (not the
 *   authorised PDF itself);
 * - S2 OCR, Version 002 (as at 1 Dec 2021), read in full; no later version;
 *   sunset 10 Oct 2028;
 * - S3 Consumer Legislation Amendment Act 2026 (No. 36/2026), as made,
 *   assented 8 Sep 2026: ss 1, 2 and Part 6;
 * - S4 Owners Corporations Amendment Regulations 2026 (SR 53/2026), as made,
 *   commencing 25 Nov 2026;
 * - S5 SA, Version 085 (as at 9 Sep 2026): Part 5 (ss 27 to 34H);
 * - S6 Consumer and Planning Legislation Amendment (Housing Statement Reform)
 *   Act 2025 (No. 6/2025), as made: s 2 and Part 4;
 * - S7 Owners Corporations (Education) Regulations 2026 (SR 54/2026): page
 *   metadata only, text not read;
 * - S8 to S22 Consumer Affairs Victoria (CAV) pages and approved forms, S23
 *   and S24 Premier of Victoria media releases, S25 the Department of Treasury
 *   and Finance fee unit notice for 2026-27, S26 the Supreme Court of
 *   Victoria penalty interest rates page (see SOURCES).
 *
 * Each rule has a `status` (see RuleStatus in ./types): CONFIRMED (read in the
 * in-force provision), GUIDANCE (official guidance only) or NOT_CONFIRMED.
 * A rule may carry more than one status, for example a CONFIRMED rule whose
 * dollar value is NOT_CONFIRMED: the second status is held beside the value it
 * covers.
 *
 * In force, enacted but not commenced, and announced: rules in force are
 * held in the sections below. Rules enacted or made but not yet commenced, and
 * the one announcement with no legislation, are held only in PENDING_CHANGES,
 * each with its latest start date and its commencement. None of them is in
 * force (`inForce: false`, `commencedOn: null`) until a new pack version
 * records its commencement.
 *
 * Where CAV guidance differs from the Act, the pack follows the Act and
 * records the difference (GUIDANCE_CONFLICTS).
 *
 * Shared shapes: TERMINOLOGY, FUND_CATALOGUE, ENTITLEMENT_SCHEDULES and
 * FEATURES are given, LATE_CHARGE (from INTEREST) and
 * PAYMENT_ALLOCATION_ORDER (a StrataVerze choice) since stage 2, PR 5, and
 * NOTICE_RULES (from FEE_NOTICES, with checked values) since stage 2, PR 6a,
 * and MEETING_RULES (from MEETINGS, RESOLUTIONS, ARREARS and RECORDS) since
 * stage 2, PR 8a-i, so no shared shape is deferred (DEFERRED_SHARED_SHAPES is
 * empty). The final fee notice (s 32) stays in FEE_NOTICES.finalNotice.
 */

import type { MeetingRuleSet } from "@/lib/meetings/rules";
import type {
  BuildingFactDefinition,
  BuildingSelector,
  DatedRules,
  DatedValue,
  DerivedBuildingSelector,
  DerivedSelectorRule,
  EntitlementScheduleDefinition,
  NoStatutoryRule,
  FundDefinition,
  LateChargeRules,
  NoticeRules,
  PackFeatures,
  PaymentAllocationPart,
  ProxyRules,
  RecordedBuildingSelector,
  RecordedFactKey,
  RuleStatus,
  SharedTerminology,
} from "./types";

const OCA = "Owners Corporations Act 2006 (Vic)";
const OCR = "Owners Corporations Regulations 2018 (Vic)";
const SA = "Subdivision Act 1988 (Vic)";
const CLAA = "Consumer Legislation Amendment Act 2026 (Vic) (No. 36/2026), as made";
const HSRA = "Consumer and Planning Legislation Amendment (Housing Statement Reform) Act 2025 (Vic) (No. 6/2025), as made";
const SR53 = "Owners Corporations Amendment Regulations 2026 (Vic) (SR 53/2026), as made";
const SR54 = "Owners Corporations (Education) Regulations 2026 (Vic) (SR 54/2026)";
const CAV_FEES = "CAV, Fees - owners corporations (last updated 9 Apr 2026)";
const CAV_FORMS = "CAV approved forms, Owners corporation fee notice and Owners corporation final fee notice (Word, no date on the forms)";
const CAV_TIERS = "CAV, Tiers of owners corporations (last updated 25 Jul 2023)";
const CAV_VOTING = "CAV, Voting and ballot guidelines (last updated 19 Apr 2021)";
const CAV_AGM = "CAV, Annual general meeting (last updated 29 Feb 2024)";
const CAV_WHAT_IS = "CAV, What is an owners corporation? (last updated 9 Apr 2026)";
const CAV_MULTIPLE = "CAV, Multiple owners corporations (last updated 9 Apr 2026)";
const CAV_INSURANCE = "CAV, Insurance - owners corporations (last updated 5 May 2021)";
const CAV_RECORDS = "CAV, Records - owners corporations (last updated 9 Apr 2026)";
const CAV_FINANCIAL = "CAV, Financial management - owners corporations (last updated 8 Apr 2021)";
const CAV_DISPUTES = "CAV, Complaint handling and resolving disputes (last updated 7 Mar 2024)";
const CAV_EDUCATION = "CAV, New education rules: Owners corporation managers (last updated 28 May 2026)";
const PREMIER_2025 = "Premier of Victoria, New Financial Support For Apartment And Unit Residents (media release, 24 Apr 2025)";
const PREMIER_2026 = "Premier of Victoria, A Better Deal For Apartment And Townhouse Owners (media release, 3 Jun 2026)";
const DTF_FEE_UNIT = "Notice under s 6 of the Monetary Units Act 2004 fixing the fee unit and penalty unit for 2026-27 (published 5 May 2026)";
const SUPREME_COURT_PIR = "Supreme Court of Victoria, Penalty interest rates (published February 2020)";

/** The versions and pages the notes were written from (notes, "Sources read"). */
export const SOURCES = [
  { id: "S1", title: "Owners Corporations Act 2006", version: "Version 024, in force 9 Sep 2026", read: "in full (DOCX of the version; the authorised PDF was not text-readable)", kind: "primary" },
  { id: "S2", title: "Owners Corporations Regulations 2018", version: "Version 002, in force 1 Dec 2021; sunset 10 Oct 2028", read: "in full", kind: "primary" },
  { id: "S3", title: "Consumer Legislation Amendment Act 2026 (No. 36/2026)", version: "as made, assented 8 Sep 2026", read: "ss 1, 2 and Part 6 (ss 32 to 51)", kind: "primary (as made)" },
  { id: "S4", title: "Owners Corporations Amendment Regulations 2026 (SR 53/2026)", version: "as made 26 May 2026; commences 25 Nov 2026", read: "in full", kind: "primary (as made)" },
  { id: "S5", title: "Subdivision Act 1988", version: "Version 085, in force 9 Sep 2026", read: "Part 5 (ss 27 to 34H)", kind: "primary" },
  { id: "S6", title: "Consumer and Planning Legislation Amendment (Housing Statement Reform) Act 2025 (No. 6/2025)", version: "as made", read: "s 2 and Part 4 (ss 85 to 112)", kind: "primary (as made)" },
  { id: "S7", title: "Owners Corporations (Education) Regulations 2026 (SR 54/2026)", version: "Version 001, in force 26 May 2026", read: "page metadata only; text not read", kind: "primary (metadata only)" },
  { id: "S8", title: "CAV, Fees - owners corporations", version: "last updated 9 Apr 2026 (also cites the 2026-27 fee unit)", read: "web page", kind: "official guidance" },
  { id: "S9", title: "CAV approved forms: Owners corporation fee notice; Owners corporation final fee notice", version: "no date on the forms; file metadata created 16 Apr 2025 and 30 Apr 2025; server Last-Modified 16 Apr 2026", read: "in browser memory", kind: "official approved form (OCA s 200)" },
  { id: "S10", title: "CAV, Tiers of owners corporations", version: "last updated 25 Jul 2023", read: "web page", kind: "official guidance" },
  { id: "S11", title: "CAV, Voting and ballot guidelines", version: "last updated 19 Apr 2021", read: "web page (stale in places)", kind: "official guidance" },
  { id: "S12", title: "CAV, Owners corporation committees", version: "last updated 12 Nov 2021", read: "web page", kind: "official guidance" },
  { id: "S13", title: "CAV, Annual general meeting", version: "last updated 29 Feb 2024", read: "web page (contains an error)", kind: "official guidance" },
  { id: "S14", title: "CAV, Working with your owners corporation manager", version: "last updated 18 Mar 2021", read: "web page", kind: "official guidance" },
  { id: "S15", title: "CAV, What is an owners corporation?", version: "last updated 9 Apr 2026", read: "web page", kind: "official guidance" },
  { id: "S16", title: "CAV, Multiple owners corporations", version: "last updated 9 Apr 2026", read: "web page", kind: "official guidance" },
  { id: "S17", title: "CAV, Owners corporations definitions", version: "no last updated date shown", read: "web page", kind: "official guidance" },
  { id: "S18", title: "CAV, Insurance - owners corporations", version: "last updated 5 May 2021", read: "web page (stale)", kind: "official guidance" },
  { id: "S19", title: "CAV, Records - owners corporations", version: "last updated 9 Apr 2026", read: "web page", kind: "official guidance" },
  { id: "S20", title: "CAV, Financial management - owners corporations", version: "last updated 8 Apr 2021", read: "web page (stale, pre-tier)", kind: "official guidance" },
  { id: "S21", title: "CAV, Complaint handling and resolving disputes", version: "last updated 7 Mar 2024", read: "web page", kind: "official guidance" },
  { id: "S22", title: "CAV, New education rules: Owners corporation managers", version: "last updated 28 May 2026", read: "web page", kind: "official guidance" },
  { id: "S23", title: "Premier of Victoria, New Financial Support For Apartment And Unit Residents", version: "24 Apr 2025", read: "through a summary", kind: "official (media release)" },
  { id: "S24", title: "Premier of Victoria, A Better Deal For Apartment And Townhouse Owners", version: "3 Jun 2026", read: "through a summary", kind: "official (media release)" },
  { id: "S25", title: "DTF notice under s 6 of the Monetary Units Act 2004 (fee unit and penalty unit 2026-27)", version: "published 5 May 2026, for the financial year from 1 Jul 2026", read: "through a summary; Gazette reference not shown", kind: "official notice" },
  { id: "S26", title: "Supreme Court of Victoria, Penalty interest rates", version: "published February 2020", read: "web page (old)", kind: "official (court)" },
] as const;

// ---------------------------------------------------------------------------
// A. Identity
// ---------------------------------------------------------------------------

/** The owners corporation itself (notes section A). */
export const IDENTITY = {
  /** "a body corporate which is incorporated by registration of a plan of subdivision or a plan of strata or cluster subdivision" (OCA s 3). */
  definition: "a body corporate which is incorporated by registration of a plan of subdivision or a plan of strata or cluster subdivision",
  /**
   * A plan may create one or more owners corporations of the owners of
   * specified lots; a plan with common property must create at least one.
   * Each is incorporated on registration of the plan; the owners for the time
   * being are its members; it has perpetual succession and can sue and be sued
   * in its own name (SA ss 27(1), 27A, 28(1), (2)).
   */
  incorporatedOn: "registration of the plan",
  planWithCommonPropertyCreatesAtLeast: 1,
  members: "the lot owners for the time being",
  perpetualSuccession: true,
  suesAndIsSuedInOwnName: true,
  /** An "excluded matter" under s 5F of the Corporations Act, except for unauthorised activities (SA s 29). */
  corporationsActExcludedMatter: true,
  /** The common seal "must include the name of the owners corporation and the plan of subdivision number" (OCA s 19(1)). */
  sealIncludes: ["the name of the owners corporation", "the plan of subdivision number"],
  /** On a merger, the plan names the new owners corporation "by reference to a relevant plan number" (SA s 32AH(a)). */
  mergerNamedByReferenceToPlanNumber: true,
  /**
   * No statutory name format was found. CAV's examples use the form
   * "owners corporation No 1 PS12345" (GUIDANCE).
   */
  nameFormat: { example: "owners corporation No 1 PS12345", status: "GUIDANCE" as RuleStatus, source: CAV_MULTIPLE },
  source: `${OCA} ss 3, 19(1); ${SA} ss 27(1), 27A, 28(1), (2), 29, 32AH(a)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * More than one owners corporation on a plan (SA ss 27(2), (3), 27C(3) to (5),
 * 27D, 27H(3)).
 */
export const MULTIPLE_OWNERS_CORPORATIONS = {
  /** An owners corporation is unlimited or limited, and the plan must say which. */
  kinds: ["unlimited", "limited"],
  planMustSayWhich: true,
  /** A lot can be in only one unlimited owners corporation. */
  lotInUnlimitedOwnersCorporationsMax: 1,
  /** A lot can be in more than one owners corporation only if one is unlimited and the rest are limited. */
  lotInSeveralOnlyIf: "one is unlimited and the rest are limited",
  /** Only members of a limited owners corporation may use its common property. */
  limitedCommonPropertyUsedOnlyByItsMembers: true,
  /** Functions of a limited owners corporation can be shifted to the unlimited one by a document lodged with the plan; changing that later needs a special resolution of each owners corporation. */
  limitedFunctionsMayShiftToUnlimited: true,
  changingTheShiftNeeds: "a special resolution of each owners corporation",
  /**
   * NOT CONFIRMED: how the tier is assessed for a plan with more than one
   * owners corporation. Each owners corporation's tier depends on its own lot
   * count (OCA s 7). CAV's example says the whole development must have a
   * maintenance plan, audit and valuation; no rule for this was found in OCA
   * s 7 or SA Part 5.
   */
  tierForMultipleOwnersCorporations: { status: "NOT_CONFIRMED" as RuleStatus, guidance: "CAV's example says the whole development must have a maintenance plan, audit and valuation", guidanceSource: CAV_MULTIPLE },
  source: `${SA} ss 27(2), (3), 27C(3) to (5), 27D, 27H(3); ${OCA} s 7`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Whether the plan makes the owners corporation unlimited or limited (SA
 * s 27(2)). Which options are supported is a StrataVerze choice for this draft,
 * not a rule of law (FOR_REVIEW, DECISIONS).
 */
export const OWNERS_CORPORATION_TYPE: RecordedBuildingSelector = {
  key: "ownersCorporationType",
  // Recorded by the adviser in the Building rules section (stage 2, PR 2).
  held: "RECORDED",
  label: "Owners corporation type",
  help: "Whether the plan of subdivision makes this owners corporation unlimited or limited.",
  options: [
    { value: "UNLIMITED", label: "Unlimited owners corporation", supported: true, note: "Supported in this draft as a StrataVerze choice, not a rule of law (for review)." },
    {
      value: "LIMITED",
      label: "Limited owners corporation",
      supported: false,
      note: "Only its members may use its common property, and its functions may be shifted to the unlimited owners corporation (SA ss 27C, 27D). Not supported in this draft.",
    },
  ],
  source: `${SA} ss 27(2), (3), 27C(3) to (5), 27D`,
  status: "CONFIRMED",
};

// ---------------------------------------------------------------------------
// B. Tiers, and the tests that count lots instead
// ---------------------------------------------------------------------------

/**
 * The five tiers (OCA s 7). A tier is worked out from the number of
 * occupiable lots. Some duties are set by tier and others by a count of lots;
 * a tier never stands in for a lot count (LOT_COUNT_TESTS).
 */
export const TIERS = {
  /**
   * Tiers 1 to 4 exclude services only owners corporations (s 7(2) to (5)), so
   * a services only owners corporation is tier 5 whatever its number of lots
   * (s 7(6)).
   */
  tiers: [
    { tier: 1, occupiableLotsMin: 101, occupiableLotsMax: null, words: "more than 100 occupiable lots, not services only", servicesOnly: false, provision: "s 7(2)" },
    { tier: 2, occupiableLotsMin: 51, occupiableLotsMax: 100, words: "51 to 100 occupiable lots, not services only", servicesOnly: false, provision: "s 7(3)" },
    { tier: 3, occupiableLotsMin: 10, occupiableLotsMax: 50, words: "10 to 50 occupiable lots, not services only", servicesOnly: false, provision: "s 7(4)" },
    { tier: 4, occupiableLotsMin: 3, occupiableLotsMax: 9, words: "3 to 9 occupiable lots, not services only", servicesOnly: false, provision: "s 7(5)" },
    {
      tier: 5,
      occupiableLotsMin: 2,
      occupiableLotsMax: 2,
      words: "an owners corporation for a 2-lot subdivision (\"comprising of 2 occupiable lots\"), or a services only owners corporation",
      alsoServicesOnly: true,
      provision: "s 7(6); s 3 (def. 2-lot subdivision)",
    },
  ],
  /** "a lot that is ordinarily used for residential or business purposes" (s 3). */
  occupiableLot: "a lot that is ordinarily used for residential or business purposes",
  /** A non-occupiable lot is a car park, a storage locker, or a lot not ordinarily used for residential or business purposes (s 3). */
  nonOccupiableLot: ["a car park", "a storage locker", "a lot not ordinarily used for residential or business purposes"],
  /** Counting rules for plans with mostly or only non-occupiable lots (s 7(7), (8)). */
  countingRules: [
    { when: "fewer than 10 occupiable lots and more than 50 non-occupiable lots", occupiableLotsFewerThan: 10, nonOccupiableLotsMoreThan: 50, rule: "apply tiers 1 and 2, counting non-occupiable lots", provision: "s 7(7)" },
    { when: "only non-occupiable lots", rule: "apply tiers 1 to 5, counting non-occupiable lots", provision: "s 7(8)" },
  ],
  /**
   * Services only owners corporation (s 3): no land or building designated as
   * common property, and either the common meters installed by a utility
   * company are the common property, or there is an unmetered common supply or
   * service.
   */
  servicesOnly: {
    noCommonPropertyLandOrBuilding: true,
    andEitherOf: ["common meters installed by a utility company are the common property", "there is an unmetered common supply or service"],
  },
  /**
   * 2-lot owners corporations are exempt from these (s 7A). For them a
   * "special resolution" means a unanimous resolution, which means the total
   * votes for those lots.
   */
  twoLotExemptions: {
    sections: ["18", "31", "32", "59", "60", "61", "61A", "62", "65", "89A", "89B", "95", "96", "97"],
    parts: [
      "Part 3 Divs 2 to 4 (accounts and audit, maintenance plan, maintenance fund)",
      "Part 4 Divs 1 to 5 (first meeting, AGM, SGM, meeting procedure, ballots)",
      "Part 9 Divs 1 and 2 (records, register)",
      "Part 10 Div 1 (complaints)",
    ],
    specialResolutionMeans: "a unanimous resolution (the total votes for those lots)",
    provision: "s 7A",
  },
  /** Services only owners corporations are exempt from everything in s 7A(1), and also these (s 8). */
  servicesOnlyExemptions: {
    includesTwoLotExemptions: true,
    sections: ["48", "49", "50", "51", "61A", "129", "133", "135"],
    parts: ["Part 4 Div 8 (office-holders)", "Part 9 Div 3 (owners corporation certificate)"],
    provision: "s 8",
  },
  source: `${OCA} ss 3, 7, 7A, 8`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Duties that differ by tier (notes section B, "Duties that differ by tier").
 * Tiers are listed by number. Duties set by a lot count, not by tier, are in
 * LOT_COUNT_TESTS.
 */
export const DUTIES_BY_TIER = {
  /** Tier 1 must appoint a manager, unless it opts out by special resolution; tiers 2 to 5 may (s 119(1), (1A), (1C)). */
  manager: { mustAppoint: [1], mayAppoint: [2, 3, 4, 5], tier1OptOutBy: "SPECIAL", source: `${OCA} s 119(1), (1A), (1C)`, status: "CONFIRMED" as RuleStatus },
  /** A manager's contract may not require notice to revoke of this many months or more (s 119A(1)(c), (d)). */
  managerRevocationNotice: {
    contractMayNotRequireMonthsOrMore: { 1: 3, 2: 3, 3: 1, 4: 1, 5: 1 },
    source: `${OCA} s 119A(1)(c), (d)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Tiers 1 and 2 must have a maintenance plan; tiers 3 to 5 may (2-lot and services only owners corporations are exempt from Part 3 Div 3 anyway) (s 36; s 7A(1)(b)). */
  maintenancePlan: { must: [1, 2], may: [3, 4, 5], source: `${OCA} s 36; s 7A(1)(b)`, status: "CONFIRMED" as RuleStatus },
  /** Annual financial statements (s 34; s 7A(1)(b)). */
  financialStatements: {
    must: [1, 2, 3],
    tier1: "must, to Australian Accounting Standards (general or special purpose)",
    tier4: "must, in any financial year it levies annual fees",
    tier5: "exempt (Part 3 Div 2)",
    source: `${OCA} s 34; s 7A(1)(b)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Audit or review (ss 35, 35A). */
  auditOrReview: {
    auditMandatory: [1],
    reviewMandatory: [2],
    byTier: {
      1: "audit is mandatory; the Director may exempt (s 35A)",
      2: "independent review by a CPA, IPA or CA ANZ member with a practising certificate; the AGM may choose audit instead",
      3: "optional audit or review by AGM resolution",
      4: "optional",
      5: "optional per s 35(5), but Part 3 Div 2 is exempt (an anomaly)",
    },
    reviewerMemberOf: ["CPA", "IPA", "CA ANZ"],
    reviewerNeedsPractisingCertificate: true,
    source: `${OCA} ss 35, 35A`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Insurance valuation every 5 years: tiers 1 to 4; tier 5 exempt (s 65; note to s 65(1); s 7A(1)(a)). */
  insuranceValuation: { everyYears: 5, must: [1, 2, 3, 4], exempt: [5], source: `${OCA} s 65; note to s 65(1); s 7A(1)(a)`, status: "CONFIRMED" as RuleStatus },
  /** Reinstatement and public liability insurance: tiers 1 to 4; exempt for 2-lot and services only (ss 59, 60; ss 7A, 8). */
  reinstatementAndPublicLiabilityInsurance: { must: [1, 2, 3, 4], exempt: [5], source: `${OCA} ss 59, 60, 7A, 8`, status: "CONFIRMED" as RuleStatus },
  /** Payment plans would apply to tiers 1 to 4 ("specified owners corporation") once commenced; not in force (PENDING_CHANGES). */
  paymentPlansPending: { wouldApplyTo: [1, 2, 3, 4], wouldNotApplyTo: [5], inForce: false, source: `${CLAA} s 33 (def. specified owners corporation)`, status: "CONFIRMED" as RuleStatus },
} as const;

/**
 * The facts the tier is worked out from (stage 2, PR 2, 28 Oct 2026): each
 * lot's answer to whether it is occupiable (s 3), and whether the owners
 * corporation is services only (s 3). Words from TIERS.
 */
export const BUILDING_FACTS: Partial<Readonly<Record<RecordedFactKey, BuildingFactDefinition>>> = {
  LOT_OCCUPIABLE: {
    label: "Occupiable lot",
    help: `An occupiable lot is ${TIERS.occupiableLot}. A lot is not occupiable if it is ${TIERS.nonOccupiableLot.slice(0, -1).join(", ")} or ${TIERS.nonOccupiableLot[TIERS.nonOccupiableLot.length - 1]}.`,
    yesLabel: "Occupiable",
    noLabel: "Not occupiable",
    // A car park or a storage locker is not occupiable (s 3). Reading StrataVerze's PARKING and STORAGE lot types as
    // those is a StrataVerze choice (FOR_REVIEW BUILDING_FACTS_RECORDED_BY).
    neverForLotTypes: { lotTypes: ["PARKING", "STORAGE"], status: "STRATAVERZE" },
    source: `${OCA} s 3`,
    status: "CONFIRMED",
  },
  SERVICES_ONLY: {
    label: "Services only owners corporation",
    help: `No land or building is designated as common property, and either ${TIERS.servicesOnly.andEitherOf[0]}, or ${TIERS.servicesOnly.andEitherOf[1]}.`,
    yesLabel: "Services only",
    noLabel: "Not services only",
    source: `${OCA} s 3`,
    status: "CONFIRMED",
  },
};

/**
 * Whether this owners corporation is one of several on its plan (SA s 27(1);
 * MULTIPLE_OWNERS_CORPORATIONS). Recorded by the adviser. How the tier is
 * assessed for a plan with several is NOT CONFIRMED, so the tier is refused
 * for one (stage 2, PR 2).
 */
export const SEVERAL_OWNERS_CORPORATIONS: RecordedBuildingSelector = {
  key: "severalOwnersCorporations",
  held: "RECORDED",
  label: "Owners corporations on the plan",
  help: "Whether the plan of subdivision creates more than one owners corporation.",
  options: [
    { value: "NO", label: "This is the only owners corporation on the plan", supported: true },
    {
      value: "YES",
      label: "One of several owners corporations on the plan",
      supported: false,
      note: "How the tier is assessed for a plan with several owners corporations is not confirmed, so StrataVerze does not work it out.",
    },
  ],
  source: `${SA} s 27(1); ${OCA} s 7`,
  status: "CONFIRMED",
};

const [TIER_1, TIER_2, TIER_3, TIER_4, TIER_5] = TIERS.tiers;
const [MOSTLY_NON_OCCUPIABLE, ONLY_NON_OCCUPIABLE] = TIERS.countingRules;
const tierValue = (tier: number) => `TIER_${tier}`;
/** Tiers 1 to 4: the occupiable lot range, and not services only (s 7(2) to (5)). */
const countedTier = (t: typeof TIER_1 | typeof TIER_2 | typeof TIER_3 | typeof TIER_4): DerivedSelectorRule => ({
  value: tierValue(t.tier),
  when: {
    all: [
      { flag: "SERVICES_ONLY", is: false },
      t.occupiableLotsMax == null
        ? { number: "OCCUPIABLE_LOT_COUNT", atLeast: t.occupiableLotsMin }
        : { number: "OCCUPIABLE_LOT_COUNT", atLeast: t.occupiableLotsMin, atMost: t.occupiableLotsMax },
    ],
  },
  provision: `${OCA} ${t.provision}`,
  status: TIERS.status,
});

/**
 * The tier (OCA s 7), worked out from the building's facts. Read in this
 * order:
 * 1. one of several owners corporations on the plan: refused, because the
 *    notes do not confirm how the tier is assessed (MULTIPLE_OWNERS_CORPORATIONS,
 *    NOT_CONFIRMED);
 * 2. services only: tier 5 (s 7(6)). Tiers 1 to 4 exclude services only owners
 *    corporations (s 7(2) to (5)), and the counting rules of s 7(7) only apply
 *    tiers 1 and 2, so this is read before them. That order is a StrataVerze
 *    reading (FOR_REVIEW BUILDING_SELECTORS_TIER);
 * 3. the counting rules for plans with mostly or only non-occupiable lots
 *    (s 7(7), (8)): refused, because the notes do not say how the
 *    non-occupiable lots are counted with the occupiable ones (a StrataVerze
 *    choice);
 * 4. a 2-lot subdivision, "comprising of 2 occupiable lots" (s 7(6); s 3): tier
 *    5 where the plan has those 2 lots and no other. With 2 occupiable lots and
 *    other lots it is refused until Matthew Wrigley decides (a StrataVerze
 *    choice: the notes do not say whether other lots count);
 * 5. tiers 1 to 4 by occupiable lots, not services only.
 * A tier is never worked out while a fact a rule needs is missing.
 */
export const TIER: DerivedBuildingSelector = {
  key: "tier",
  held: "DERIVED",
  label: "Tier",
  help: "Worked out from the number of occupiable lots, whether the owners corporation is services only, and whether it is the only one on the plan.",
  options: TIERS.tiers.map((t) => ({ value: tierValue(t.tier), label: `Tier ${t.tier}`, supported: true, note: `${t.words[0].toUpperCase()}${t.words.slice(1)}.` })),
  rules: [
    {
      value: null,
      when: { selector: SEVERAL_OWNERS_CORPORATIONS.key, in: ["YES"] },
      refusal: "This owners corporation is one of several on its plan. How the tier is assessed then is not confirmed, so StrataVerze does not work it out.",
      provision: `${OCA} s 7; ${SA} s 27(1)`,
      status: MULTIPLE_OWNERS_CORPORATIONS.tierForMultipleOwnersCorporations.status,
    },
    {
      value: tierValue(TIER_5.tier),
      when: { all: [{ selector: SEVERAL_OWNERS_CORPORATIONS.key, in: ["NO"] }, { flag: "SERVICES_ONLY", is: true }] },
      provision: `${OCA} s 7(2) to (6)`,
      status: "STRATAVERZE",
    },
    {
      value: null,
      when: { all: [{ number: "OCCUPIABLE_LOT_COUNT", atMost: 0 }, { number: "NON_OCCUPIABLE_LOT_COUNT", atLeast: 1 }] },
      refusal: "Every lot is recorded as not occupiable. The tier is then worked out counting the lots that are not occupiable, which StrataVerze does not do yet.",
      provision: `${OCA} ${ONLY_NON_OCCUPIABLE.provision}`,
      status: "STRATAVERZE",
    },
    {
      value: null,
      when: {
        all: [
          { number: "OCCUPIABLE_LOT_COUNT", lessThan: MOSTLY_NON_OCCUPIABLE.occupiableLotsFewerThan },
          { number: "NON_OCCUPIABLE_LOT_COUNT", moreThan: MOSTLY_NON_OCCUPIABLE.nonOccupiableLotsMoreThan },
        ],
      },
      refusal: `Fewer than ${MOSTLY_NON_OCCUPIABLE.occupiableLotsFewerThan} lots are occupiable and more than ${MOSTLY_NON_OCCUPIABLE.nonOccupiableLotsMoreThan} are not. Tiers 1 and 2 are then worked out counting the lots that are not occupiable, which StrataVerze does not do yet.`,
      provision: `${OCA} ${MOSTLY_NON_OCCUPIABLE.provision}`,
      status: "STRATAVERZE",
    },
    {
      value: tierValue(TIER_5.tier),
      when: {
        all: [
          { number: "OCCUPIABLE_LOT_COUNT", atLeast: TIER_5.occupiableLotsMin, atMost: TIER_5.occupiableLotsMax },
          { number: "NON_OCCUPIABLE_LOT_COUNT", atMost: 0 },
        ],
      },
      provision: `${OCA} ${TIER_5.provision}`,
      status: TIERS.status,
    },
    {
      value: null,
      when: { all: [{ number: "OCCUPIABLE_LOT_COUNT", atLeast: TIER_5.occupiableLotsMin, atMost: TIER_5.occupiableLotsMax }, { number: "NON_OCCUPIABLE_LOT_COUNT", atLeast: 1 }] },
      refusal: `The plan has ${TIER_5.occupiableLotsMin} occupiable lots and other lots that are not occupiable. Whether it is then a 2-lot subdivision is for StrataVerze to decide, so the tier is not worked out yet.`,
      provision: `${OCA} ${TIER_5.provision}`,
      status: "STRATAVERZE",
    },
    countedTier(TIER_1),
    countedTier(TIER_2),
    countedTier(TIER_3),
    countedTier(TIER_4),
  ],
  noRuleFits: "No tier fits the lots recorded. Check each lot's occupiable answer.",
  source: `${OCA} ss 3, 7; ${SA} s 27(1)`,
  status: "CONFIRMED",
};

/**
 * Whether the owners corporation has approved a maintenance plan (stage 2,
 * PR 3), recorded by the adviser. A maintenance fund is required where there
 * is an approved maintenance plan (OCA ss 40, 42), and a plan has no effect
 * until approved (s 38). Tiers 1 and 2 must prepare and approve one and the
 * other tiers may (s 36; DUTIES_BY_TIER.maintenancePlan). Read by the
 * maintenance fund's condition for tiers 3 and 4 only, so a building is
 * flagged for it only there.
 */
export const MAINTENANCE_PLAN_APPROVED: RecordedBuildingSelector = {
  key: "maintenancePlanApproved",
  held: "RECORDED",
  label: "Maintenance plan approved",
  help: `Whether the owners corporation has approved a maintenance plan. Tiers ${DUTIES_BY_TIER.maintenancePlan.must.join(" and ")} must prepare and approve one, and other tiers may. A maintenance fund is required where a plan is approved.`,
  options: [
    { value: "NO", label: "No maintenance plan approved", supported: true },
    { value: "YES", label: "Maintenance plan approved", supported: true },
  ],
  flagMissing: "FUND_CONDITIONS",
  source: `${OCA} ss 36, 38, 40, 42`,
  status: "CONFIRMED",
};

/**
 * The building selectors (stage 2, PR 2): the owners corporation type and
 * whether it is the only one on the plan, recorded by the adviser, and the
 * tier, worked out from those and the facts above. PR 3 adds whether a
 * maintenance plan is approved, recorded by the adviser.
 */
export const BUILDING_SELECTORS: readonly BuildingSelector[] = [OWNERS_CORPORATION_TYPE, SEVERAL_OWNERS_CORPORATIONS, TIER, MAINTENANCE_PLAN_APPROVED];

const tierIn = (tiers: readonly number[]) => ({ selector: TIER.key, in: tiers.map(tierValue) });
const [PLAN_MUST_TIERS, PLAN_MAY_TIERS] = [DUTIES_BY_TIER.maintenancePlan.must, DUTIES_BY_TIER.maintenancePlan.may];
/** Tiers 3 and 4: may have a plan, and are not exempt from the maintenance fund provisions (tier 5 is, s 7A). */
const PLAN_OPTIONAL_COUNTED_TIERS = PLAN_MAY_TIERS.filter((t) => t !== TIER_5.tier);

/**
 * Tests the Act words by a count of lots, not by tier (OCA ss 77, 89D, 100).
 * Each says which lots it counts.
 */
export const LOT_COUNT_TESTS = {
  /**
   * An owners corporation "affecting 10 or more lots" must elect a committee
   * at each AGM; under 10 lots it may (s 100). The test counts all lots, not
   * tiers or occupiable lots. CAV's tiers page says "Tier 1, 2 and 3 must",
   * which differs where non-occupiable lots bring the count to 10 or more
   * (GUIDANCE_CONFLICTS).
   */
  committeeRequired: { lotsAtLeast: 10, counts: "all lots", source: `${OCA} s 100`, status: "CONFIRMED" as RuleStatus },
  /**
   * The current proxy limit: one lot owner where there are 20 or fewer
   * occupiable lots; no more than 5% of lot owners where there are more
   * (s 89D). See PROXIES.
   */
  proxyLimit: { occupiableLotsThreshold: 20, counts: "occupiable lots", source: `${OCA} s 89D`, status: "CONFIRMED" as RuleStatus },
  /** Quorum: at least 50% of the total number of lots, or failing that 50% of the total lot entitlement (s 77). See MEETINGS. */
  quorum: { percentOfTotalLots: 50, counts: "the total number of lots", source: `${OCA} s 77`, status: "CONFIRMED" as RuleStatus },
} as const;

// ---------------------------------------------------------------------------
// Shared shapes: funds and entitlements
// ---------------------------------------------------------------------------

/**
 * The funds the platform's ledger holds. Victoria has no mandatory
 * administrative and capital works fund split: the only statutory fund is the
 * maintenance fund, required where there is an approved maintenance plan (OCA
 * ss 27, 40; no other fund provision found).
 *
 * The administrative fund here is a StrataVerze ledger choice (status
 * STRATAVERZE), not a fund the Act names: it holds annual fees and other money
 * not paid into the maintenance fund, so the ledger's two fund types keep
 * working (FOR_REVIEW, DECISIONS).
 */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "ADMINISTRATIVE",
    name: "administrative fund",
    label: "Administrative Fund",
    shortLabel: "Admin",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Annual fees and other money not paid into the maintenance fund: general administration, maintenance and repairs, insurance and other recurrent obligations (OCA s 23(1)).",
    // The Act requires accounts and a bank account (ss 27, 33), not this fund.
    // Not a statutory fund: a StrataVerze ledger choice for money not paid into the maintenance fund.
    // Required as a ledger choice (stage 2, PR 3 review), so every Victorian
    // building has a ledger fund for annual fees and its chart of accounts can
    // be set up. The status STRATAVERZE says so (FOR_REVIEW ADMINISTRATIVE_FUND).
    required: true,
    source: `${OCA} ss 23(1), 27, 33(1) (no administrative fund provision found)`,
    status: "STRATAVERZE",
  },
  {
    key: "MAINTENANCE",
    name: "maintenance fund",
    label: "Maintenance Fund",
    shortLabel: "Maintenance",
    // Kept in the ledger's capital works fund type, shown as the maintenance fund.
    ledgerFund: "CAPITAL_WORKS",
    purpose: "Money to carry out the approved maintenance plan: designated annual fees, insurance proceeds for plan items, interest and other prescribed or determined amounts (OCA s 42).",
    // Required where there is an approved maintenance plan (ss 40, 42). Tiers 1
    // and 2 must prepare and approve a plan (s 36); other tiers may. Tier 5
    // (2-lot and services only owners corporations) is exempt from the
    // maintenance plan and maintenance fund provisions (s 7A(1)(b); s 8).
    // `requiredWhen` (stage 2, PR 3) reads the TIER selector and the
    // MAINTENANCE_PLAN_APPROVED selector. Requiring the fund for tiers 1 and 2
    // whether or not a plan is approved yet is a StrataVerze reading of ss 36
    // and 40, so a building is never given fewer funds than the law requires
    // (FOR_REVIEW MAINTENANCE_FUND_REQUIRED). Where the tier cannot be worked
    // out, or at tier 3 or 4 no answer is recorded for the plan, the fund is
    // not worked out and the building is flagged.
    required: false,
    requiredWhen: {
      rules: [
        {
          need: "REQUIRED",
          when: tierIn(PLAN_MUST_TIERS),
          reason: `Required for a tier ${PLAN_MUST_TIERS.join(" or tier ")} owners corporation, which must prepare and approve a maintenance plan.`,
          provision: `${OCA} ss 36, 40, 42`,
          status: "STRATAVERZE",
        },
        {
          need: "OPTIONAL",
          when: tierIn([TIER_5.tier]),
          reason: `Not required for a tier ${TIER_5.tier} owners corporation, which is exempt from the maintenance plan and maintenance fund provisions.`,
          provision: `${OCA} ss 7A(1)(b), 8`,
          status: TIERS.status,
        },
        {
          need: "REQUIRED",
          when: { all: [tierIn(PLAN_OPTIONAL_COUNTED_TIERS), { selector: MAINTENANCE_PLAN_APPROVED.key, in: ["YES"] }] },
          reason: "Required because the owners corporation has approved a maintenance plan.",
          provision: `${OCA} ss 40, 42`,
          status: "CONFIRMED",
        },
        {
          need: "OPTIONAL",
          when: { all: [tierIn(PLAN_OPTIONAL_COUNTED_TIERS), { selector: MAINTENANCE_PLAN_APPROVED.key, in: ["NO"] }] },
          reason: "Not required while no maintenance plan is approved.",
          provision: `${OCA} ss 36, 40`,
          status: "CONFIRMED",
        },
      ],
      noRuleFits: "No maintenance fund rule fits the tier and the maintenance plan answer recorded.",
    },
    source: `${OCA} ss 33(2), 36, 40, 42 to 45`,
    status: "CONFIRMED",
  },
];

/** Rules about the funds and bank accounts (notes section K). */
export const FUND_RULES = {
  /** No mandatory administrative or capital works fund split (ss 27, 40). */
  statutoryAdministrativeAndCapitalSplit: false,
  /** The maintenance fund is the only statutory fund, required where there is an approved maintenance plan. */
  onlyStatutoryFund: "maintenance fund",
  /** Bank accounts are in the owners corporation's name; all fees are paid into an owners corporation account or the manager's account (s 27(2), (3)). */
  bankAccountInOwnersCorporationName: true,
  feesPaidInto: ["an owners corporation account", "the manager's account"],
  /** Separate accounts must be kept for the maintenance fund (s 33(2)). */
  separateMaintenanceFundAccounts: true,
  /** Borrowing beyond the current annual fees needs a special resolution (s 25). */
  borrowingBeyondCurrentAnnualFeesBy: "SPECIAL",
  source: `${OCA} ss 25, 27, 33(2), 40`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Two numbers for each lot (OCA s 3). Lot liability decides fees and is held on
 * each lot (`lots.entitlement`); lot entitlement is held separately
 * (`lots.lot_entitlement`, stage 2 PR 4, migration 20261121).
 *
 * `decides` (stage 2 PR 4, 28 Oct 2026), from the notes (sections A, C and E):
 * - Lot liability: CONTRIBUTIONS, each lot's share of annual fees (s 23(3)),
 *   special fees (s 24(2)) and upgrading fees (s 53(1A)).
 * - Lot entitlement: POLL_VOTE, a poll on an ordinary resolution (s 89(3));
 *   SPECIAL_RESOLUTION and UNANIMOUS_RESOLUTION, the tests on a ballot or poll
 *   (ss 95, 96); QUORUM_FALLBACK, the test a quorum falls back to only where
 *   50% of the lots is not available (s 77: the quorum is counted by lots
 *   first); COMMON_PROPERTY_SHARE, each owner's share of the common property
 *   as tenants in common (SA s 30); INSURANCE_PREMIUM_FEE, the separate fee
 *   for the reinstatement and replacement premium (s 23A). Nothing reads
 *   INSURANCE_PREMIUM_FEE: the pack has no CONTRIBUTION_INSURANCE, so every
 *   Victorian fee is shared by lot liability until FOR_REVIEW
 *   CONTRIBUTION_INSURANCE_S23A is decided.
 * The other uses in `usedFor` have no key, because no StrataVerze feature
 * reads them yet: each owner's cap on contributions (s 28(2)) and
 * administrator costs (s 175) by lot liability; the nomination, by owners
 * holding at least 25% of lot entitlements, of the person who convenes a
 * special general meeting or arranges a ballot (ss 74, 83 to 85), and VCAT
 * consent to a plan change (SA s 34D(3)(ba)), by lot entitlement.
 * Since stage 2, PR 8a-i the count at conduct reads POLL_VOTE, and
 * SPECIAL_RESOLUTION and UNANIMOUS_RESOLUTION on a poll (MEETING_RULES); a
 * poll is taken on an ordinary resolution only, so only POLL_VOTE is read at
 * a meeting. Nothing reads QUORUM_FALLBACK yet.
 *
 * Each value is held as a whole number of at least 1, the shape of the lot
 * columns. The notes do not say that Victorian lot liability or lot
 * entitlement is a whole number (FOR_REVIEW SECOND_SCHEDULE_HELD).
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "LOT_LIABILITY",
    name: "lot liability",
    label: "Lot Liability",
    help: "From the owners corporation register. Enter a whole number of at least 1.",
    importLabel: "Lot Liability",
    onLot: true,
    usedFor: [
      "each lot's share of annual fees (s 23(3))",
      "each lot's share of special fees (s 24(2))",
      "upgrading fees (s 53(1A))",
      "each owner's cap on contributions (s 28(2))",
      "administrator costs (s 175)",
    ],
    decides: ["CONTRIBUTIONS"],
    source: `${OCA} ss 3, 23(3), 24(2), 28(2), 53(1A), 148, 175`,
    status: "CONFIRMED",
  },
  {
    key: "LOT_ENTITLEMENT",
    name: "lot entitlement",
    label: "Lot Entitlement",
    help: "From the owners corporation register. Enter a whole number of at least 1.",
    onLot: false,
    usedFor: [
      "special and unanimous resolutions on a ballot or poll (ss 95, 96)",
      "polls on ordinary resolutions (s 89(3))",
      "the quorum, only where 50% of the lots is not available (s 77)",
      "each owner's share of the common property, as tenants in common (SA s 30)",
      "the insurance premium fee (s 23A)",
      "nominating, by owners holding at least 25% of lot entitlements, the lot owner or manager who convenes a special general meeting, or the owner who arranges a ballot (ss 74, 83 to 85)",
      "VCAT consent to a change for members who did not consent (SA s 34D(3)(ba))",
    ],
    decides: ["POLL_VOTE", "SPECIAL_RESOLUTION", "UNANIMOUS_RESOLUTION", "QUORUM_FALLBACK", "COMMON_PROPERTY_SHARE", "INSURANCE_PREMIUM_FEE"],
    source: `${OCA} ss 3, 23A(2), 74, 77, 83 to 85, 89(3), 95, 96, 148; ${SA} ss 30, 34D(3)(ba)`,
    status: "CONFIRMED",
  },
];

/*
 * GO-LIVE GAP (stage 2 PR 4, 28 Oct 2026): what holds and uses each lot's lot
 * entitlement.
 * - Held: lots.lot_entitlement (migration 20261121, not applied), entered on
 *   lot create and edit (locked like lot liability), the CSV lot import
 *   (browser key lot_entitlement, through the shared mapping table in
 *   src/lib/finance/migration-import-fields.ts) and the Add Property wizard.
 *   A lot without it is flagged in "Building data missing" on the building
 *   and lot pages. A state change clears it, as it does each lot's
 *   occupiable answer, since a lot has no state for a database check.
 * - Read: since stage 2 PR 8a-i, the count at conduct on a poll on an
 *   ordinary resolution (s 89(3)), refused where a lot that voted has none.
 *   Since stage 2 PR 8a-ii (29 Oct 2026) the outcome is recorded where the
 *   chair answers that the meeting had a quorum for the item and the tier is
 *   1 to 4 (MEETING_RULES). Every reader fails closed on a lot with no lot
 *   entitlement (src/lib/jurisdiction/building-data.ts).
 * - Not applied yet: the s 23A insurance premium fee. The pack has no
 *   CONTRIBUTION_INSURANCE, so the whole of every Victorian fee, insurance
 *   included, is shared by lot liability (s 23(3)) until FOR_REVIEW
 *   CONTRIBUTION_INSURANCE_S23A is decided. Also not applied: special and
 *   unanimous resolutions by lot entitlement on a ballot or poll (a poll is
 *   taken on an ordinary resolution only, and ballots are not recorded,
 *   MEETING_RULES since stage 2 PR 8a-i) and the quorum fallback; recovery of
 *   the excess, premium and damage from a culpable owner (s 23A); the cap on
 *   contributions (s 28(2)).
 */

/** Allocating and changing lot entitlement and lot liability (SA ss 27EA, 27F, 33, 34D). */
export const ENTITLEMENT_RULES = {
  /** Lot entitlement: "expressing the extent of the lot owner's interest in any common property" (OCA s 3). */
  lotEntitlementMeans: "the extent of the lot owner's interest in any common property",
  /** Lot liability: "the proportion of the administrative and general expenses" a lot owner must pay (OCA s 3). */
  lotLiabilityMeans: "the proportion of the administrative and general expenses a lot owner must pay",
  /** A licensed surveyor sets the initial allocation; not required for 2-lot owners corporations (SA s 27EA). */
  initialAllocationBy: "a licensed surveyor",
  initialAllocationNotRequiredForTwoLot: true,
  /** Lot liability is equal unless a listed exception applies; lot entitlement follows market value (SA s 27F(4), (5)). */
  lotLiabilityEqualUnless: [
    "a substantial difference in lot size",
    "consumption or use of common utilities, or the cost of maintaining common property",
    "the number of occupiers (then by bedrooms)",
  ],
  lotEntitlementFollows: "market value",
  /** A change needs a unanimous resolution; the owners corporation then applies to the Registrar in the approved form within 60 days, on the s 27F(4) basis (SA s 33(1), (1A), (2)). */
  changeBy: "UNANIMOUS",
  applyToRegistrarWithinDays: 60,
  /** VCAT may authorise a change without unanimity (SA s 34D). */
  vcatMayAuthoriseWithoutUnanimity: true,
  /**
   * In force 9 Sep 2026 (SA s 34D(3)(ba), inserted by No. 36/2026 s 114): VCAT
   * may consent for non-consenting or non-voting members if more than half of
   * the members, holding more than half of the total lot entitlement, consent,
   * and the economic or social benefits to the subdivision as a whole outweigh
   * the disadvantages.
   */
  vcatOverride: {
    inForceFrom: "2026-09-09",
    membersConsentingMoreThanFraction: 0.5,
    lotEntitlementConsentingMoreThanFraction: 0.5,
    benefitTest: "the economic or social benefits to the subdivision as a whole outweigh the disadvantages",
    source: `${SA} s 34D(3)(ba) (inserted by ${CLAA} s 114)`,
  },
  source: `${OCA} s 3; ${SA} ss 27EA, 27F(4), (5), 33(1), (1A), (2), 34D`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// C. Fees
// ---------------------------------------------------------------------------

/** Annual fees (OCA ss 23, 42, 71, 72). */
export const ANNUAL_FEES = {
  /** General administration, maintenance and repairs, insurance, and other recurrent obligations (s 23(1)). */
  purpose: ["general administration", "maintenance and repairs", "insurance", "other recurrent obligations"],
  /** By lot liability (s 23(3)). */
  basis: "lot liability",
  /** An additional annual fee for extra costs from a particular use of a lot ("the lot that benefits more ... pays more") (s 23(3A), (3B)). */
  additionalFeeForParticularUseOfLot: true,
  /** With an approved maintenance plan, annual fees must include designated fees sufficient to implement it; the amount paid into the fund is set by ordinary resolution (ss 23(2), 42(2), (3)). */
  maintenancePlanComponentRequired: true,
  maintenanceFundAmountSetBy: "ORDINARY",
  /** The owners corporation determines the times for payment (s 23(4)). */
  timesForPaymentSetBy: "the owners corporation",
  /**
   * The AGM agenda must include "the consideration of the proposed annual
   * budget", and the AGM notice must include the proposed annual budget and
   * the financial statements (ss 71(2)(d), (f), 72(2)(d), (e)): CONFIRMED.
   * The Act does not expressly say annual fees must be set at the AGM; CAV
   * says the budget is estimated before the AGM and sent with the notice
   * (GUIDANCE).
   */
  budgetConsideredAtAgm: true,
  feesSetAtAgm: { status: "GUIDANCE" as RuleStatus, guidance: "the budget is estimated before the AGM and sent with the notice", source: CAV_FEES },
  source: `${OCA} ss 23(1) to (4), 42(2), (3), 71(2)(d), (f), 72(2)(d), (e)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** A separate fee for the reinstatement and replacement insurance premium, by lot entitlement (OCA s 23A). */
export const INSURANCE_PREMIUM_FEE = {
  basis: "lot entitlement",
  /** The excess, premium and damage may be recovered from a culpable owner. */
  recoverableFromCulpableOwner: ["excess", "premium", "damage"],
  source: `${OCA} s 23A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/*
 * No CONTRIBUTION_INSURANCE for Victoria yet (stage 2 PR 4 review, 28 Oct
 * 2026). The notes limit the s 23A fee to the reinstatement and replacement
 * premium (the s 59 cover), while annual fees cover insurance among other
 * things and are shared by lot liability (s 23(1), (3), CONFIRMED). The
 * budget's Insurance account holds every policy together (public liability
 * under s 60 and any other), so it cannot be shared by lot entitlement as it
 * stands. Every Victorian fee, insurance included, is shared by lot liability
 * until FOR_REVIEW CONTRIBUTION_INSURANCE_S23A is decided. The shared engine
 * is ready (src/lib/levies/contribution-shares.ts): the pack would add
 * CONTRIBUTION_INSURANCE with uses ["INSURANCE_PREMIUM_FEE"] once the
 * reinstatement premium is held apart from the other policies.
 */

/** Special fees and charges, for extraordinary expenditure (OCA s 24, headed "Extraordinary fees and charges"). */
export const SPECIAL_FEES = {
  /** A special resolution is needed if the amount is "more than twice the total amount of the current annual fees" (s 24(4)). */
  specialResolutionIfMoreThanTimesCurrentAnnualFees: 2,
  /** What the multiple is applied to, as s 24(4) words it. */
  comparedWith: "the total amount of the current annual fees",
  thresholdWords: "more than twice the total amount of the current annual fees",
  /** The threshold does not apply to urgent safety or loss-prevention repairs (s 24(5)). */
  thresholdDoesNotApplyTo: "urgent safety or loss-prevention repairs",
  /** By lot liability, or "benefits more pays more" for works that benefit some lots (s 24(2), (2A), (2B)). */
  basis: ["lot liability", "benefits more pays more, for works that benefit some lots"],
  source: `${OCA} s 24(2), (2A), (2B), (4), (5)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The fee notice and final notice (OCA ss 31, 32), and the approved forms
 * (S9). The long form text is not reproduced here: the platform must use the
 * approved forms themselves.
 */
export const FEE_NOTICES = {
  /** Fee notice (s 31): in the approved form, stating the three items below. */
  feeNotice: {
    approvedFormRequired: true,
    mustState: [
      "the obligation to pay within 28 days after the date of the notice",
      "the interest rate, if applicable",
      "details of the dispute resolution process under the rules for disputed fees",
    ],
    /** Due 28 days after the date of the fee notice (s 31(2)(a)). */
    payWithinDaysAfterNotice: 28,
    /** GUIDANCE: with several due dates, CAV says the first must be at least 28 days after the notice. */
    severalDueDates: { firstAtLeastDaysAfterNotice: 28, status: "GUIDANCE" as RuleStatus, source: CAV_FORMS },
    source: `${OCA} s 31(1), (2)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /**
   * Final notice (s 32): may be given if the money is not paid within 28 days
   * after the fee notice, in the approved form. It states that the amount must
   * be paid "immediately", the interest due to date and its daily accrual, and
   * that the owners corporation intends Part 11 action if it is unpaid within
   * 28 days after the final notice.
   */
  finalNotice: {
    approvedFormRequired: true,
    mayBeGivenIfUnpaidDaysAfterFeeNotice: 28,
    mustState: [
      "the amount must be paid \"immediately\"",
      "interest due to date and its daily accrual",
      "the owners corporation intends Part 11 action if unpaid within 28 days after the final notice",
    ],
    partElevenActionIfUnpaidDaysAfterFinalNotice: 28,
    source: `${OCA} s 32(1), (2)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /**
   * The approved forms (S9, under OCA s 200). Only the layout may change; the
   * title must be the form's own; only reference numbers, manager details and
   * web or email details may be added. A non-conforming notice "may be
   * invalid". This is from the forms themselves (GUIDANCE).
   */
  approvedForms: {
    forms: [
      { title: "Owners corporation fee notice", reference: "https://www.consumer.vic.gov.au/library/forms/housing-and-accommodation/owners-corporations/fee-notice.docx", fileCreated: "2025-04-16" },
      { title: "Owners corporation final fee notice", reference: "https://www.consumer.vic.gov.au/library/forms/housing-and-accommodation/owners-corporations/final-fee-notice.docx", fileCreated: "2025-04-30" },
    ],
    serverLastModified: "2026-04-16",
    layoutMayChange: true,
    titleMustBeFormTitle: true,
    mayBeAdded: ["reference numbers", "manager details", "web or email details"],
    nonConformingNotice: "may be invalid",
    /** The pack references the forms and does not hold their text. */
    formTextHeldInPack: false,
    /**
     * NOT CONFIRMED: the date the current forms applied from. The media
     * release of 24 Apr 2025 calls them "the official approved notices owners
     * corporations must use" and says "Older versions are no longer valid",
     * with no start date. The form files were created in April 2025. The
     * "28 April 2025" start date was not found in any official source.
     */
    appliedFrom: { date: null, guidance: "April 2025", status: "NOT_CONFIRMED" as RuleStatus, source: `${PREMIER_2025}; ${CAV_FORMS}` },
    source: `${CAV_FORMS}; ${OCA} s 200`,
    status: "GUIDANCE" as RuleStatus,
  },
  /**
   * NOT CONFIRMED which governs: the fee notice form text says the dispute
   * meeting "must be held within 14 days"; the model rule says the parties
   * meet "within 28 calendar days after the dispute comes to the attention of
   * all the parties" (OCR Sch 2 rule 7(5)). The pack follows the model rule
   * (DISPUTES) until reviewed.
   */
  disputeMeetingConflict: {
    formTextDays: 14,
    modelRuleDays: 28,
    /**
     * Only where the model rules apply (the owners corporation has made no
     * dispute rule of its own). Under s 31(2)(c) the fee notice describes the
     * dispute resolution process in the owners corporation's own rules, which
     * may differ.
     */
    packUsesDays: 28,
    packUsesDaysOnlyWhereModelRulesApply: true,
    status: "NOT_CONFIRMED" as RuleStatus,
    source: `${CAV_FORMS}; ${OCR} Sch 2 rule 7(5)`,
  },
} as const;

/**
 * The fee notice rules in the shared shape (stage 2, PR 6a, 28 Oct 2026),
 * from FEE_NOTICES and the notes only. Every Victorian fee notice is refused
 * today:
 * - it must be in the approved form, "Owners corporation fee notice"
 *   (s 31(1)), which StrataVerze cannot produce yet, and the day the current
 *   form applied from is NOT_CONFIRMED;
 * - it must state the obligation to pay within 28 days after the date of the
 *   notice, the interest rate (if any) and the dispute resolution process
 *   under the rules (s 31(2)), none of which StrataVerze notices state yet;
 * - the most notice a fee notice may give is NOT_CONFIRMED: the approved
 *   form's words "or by the due date specified below" are guidance only.
 * The least notice, 28 days, is StrataVerze's reading of s 31(2)(a) (the
 * obligation to pay within 28 days after the date of the notice), kept as the
 * legal rule by Matthew Wrigley's decision of 28 Oct 2026, with the 35-day
 * lead (DECISIONS). No hardship statement is required until new s 31(2)(ab)
 * commences (HARDSHIP_ON_NOTICES). The tier 5 exemption from s 31 (s 7A(1)(a))
 * is not applied yet, and the final fee notice (s 32) is a later PR.
 *
 * The fields outside `checked` hold the safest values for a reader that knows
 * only them: the 28-day minimum, and a lead of 28 days, since the most notice
 * is not confirmed. Until the most notice is checked, notices are timed with
 * that 28-day lead, never the decided 35 (noticeLeadDays).
 */
export const NOTICE_RULES: NoticeRules = {
  minimumNoticeDays: FEE_NOTICES.feeNotice.payWithinDaysAfterNotice,
  issueDaysBeforeDue: FEE_NOTICES.feeNotice.payWithinDaysAfterNotice,
  urgentNoticeDays: null,
  hardship: null,
  contents: FEE_NOTICES.feeNotice.mustState,
  source: FEE_NOTICES.feeNotice.source,
  checked: {
    minimumNoticeDays: {
      value: FEE_NOTICES.feeNotice.payWithinDaysAfterNotice,
      status: "CONFIRMED",
      source: `${OCA} s 31(2)(a)`,
      note: "StrataVerze's reading of s 31(2)(a): a fee notice states the obligation to pay within 28 days after the date of the notice, read as the least notice. Kept as the legal rule by Matthew Wrigley's decision of 28 Oct 2026 (DECISIONS); FOR_REVIEW NOTICE_MINIMUM.",
    },
    maximumNoticeDays: {
      value: null,
      status: "NOT_CONFIRMED",
      source: `${OCA} s 31(2)(a); ${CAV_FORMS}`,
      note: "whether a fee notice may give more than 28 days to pay is not confirmed. The approved form says payment is due within 28 days of the date of the notice \"or by the due date specified below\", which is guidance only.",
    },
    issueDaysBeforeDue: {
      value: 35,
      status: "STRATAVERZE",
      source: "Matthew Wrigley's StrataVerze decision of 28 Oct 2026 (DECISIONS)",
      note: "Each fee notice goes out 35 days before it falls due, as NSW and Queensland notices do. Not a rule of law.",
    },
    dueDateMayMove: {
      value: true,
      status: "STRATAVERZE",
      source: `${OCA} s 31(2)(a)`,
      note: "StrataVerze's reading: a fee notice that goes out late falls due 28 days after it is given, the s 31(2)(a) period. FOR_REVIEW NOTICE_DUE_DATE_MOVE.",
    },
    noticeMode: {
      ADMINISTRATIVE: {
        value: "PER_INSTALMENT",
        status: "STRATAVERZE",
        source: `${OCA} s 31; ${CAV_FORMS}`,
        note: "One fee notice for each instalment as it falls due, as NSW: a StrataVerze choice. CAV guidance allows one notice with several due dates. FOR_REVIEW NOTICE_MODE.",
      },
      CAPITAL_WORKS: {
        value: "PER_INSTALMENT",
        status: "STRATAVERZE",
        source: `${OCA} s 31; ${CAV_FORMS}`,
        note: "One fee notice for each instalment as it falls due, as NSW: a StrataVerze choice. CAV guidance allows one notice with several due dates. FOR_REVIEW NOTICE_MODE.",
      },
    },
    requiredContents: [
      { key: "PAY_WITHIN_DAYS_STATEMENT", words: "the obligation to pay within 28 days after the date of the notice", status: "CONFIRMED", source: `${OCA} s 31(2)(a)` },
      { key: "LATE_CHARGE_STATEMENT", words: "the interest rate, if interest is charged", status: "CONFIRMED", source: `${OCA} s 31(2)(b)` },
      { key: "DISPUTE_PROCESS", words: "the dispute resolution process for disputed fees under the owners corporation's rules", status: "CONFIRMED", source: `${OCA} s 31(2)(c)` },
    ],
    form: {
      required: { value: FEE_NOTICES.feeNotice.approvedFormRequired, status: "CONFIRMED", source: `${OCA} s 31(1)` },
      title: FEE_NOTICES.approvedForms.forms[0].title,
      reference: FEE_NOTICES.approvedForms.forms[0].reference,
      appliedFrom: {
        value: null,
        status: "NOT_CONFIRMED",
        source: FEE_NOTICES.approvedForms.appliedFrom.source,
        note: "the day the current approved forms applied from is not confirmed (April 2025 in guidance; the 28 April 2025 date was found in no official source).",
        guidance: FEE_NOTICES.approvedForms.appliedFrom.guidance,
      },
      source: `${OCA} ss 31(1), 200; ${CAV_FORMS}`,
    },
    source: `${OCA} ss 31, 200; ${CAV_FORMS}`,
  },
};

/** Owners in arrears (OCA ss 89B, 89C(10), 103(7)). */
export const ARREARS = {
  /** An owner in arrears cannot vote, in person, by ballot or by proxy, unless paid in full; they may still vote on special or unanimous resolutions (s 89B). */
  mayVote: false,
  mayStillVoteOn: ["SPECIAL", "UNANIMOUS"],
  /** A non-cash payment counts only if made at least 4 business days before the vote (s 89B). */
  nonCashPaymentCountsIfMadeBusinessDaysBeforeVote: 4,
  /** May not act as a proxy for another owner (s 89C(10)). */
  mayActAsProxy: false,
  /** Ineligible for, or suspended from, the committee (s 103(7)). */
  mayBeOnCommittee: false,
  source: `${OCA} ss 89B, 89C(10), 103(7)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * GUIDANCE (CAV): "administration fees" for late payment are not permitted.
 * Only a lot-liability share of the actual overdue-notice cost may be passed
 * on (CAV's example: 10% of $33 = $3.30). No section of the Act states this
 * directly.
 */
export const LATE_PAYMENT_ADMINISTRATION_FEES = {
  permitted: false,
  mayPassOn: "a lot-liability share of the actual overdue-notice cost",
  example: { lotLiabilityPercent: 10, noticeCostCents: 3_300, shareCents: 330 },
  statedInAct: false,
  source: CAV_FEES,
  status: "GUIDANCE" as RuleStatus,
} as const;

/** Rules may provide for "Payment of fees by instalments by lot owners in financial difficulty" (OCA Sch 1 item 3.5). */
export const HARDSHIP_INSTALMENTS_RULE = {
  rulesMayProvide: true,
  source: `${OCA} Sch 1 item 3.5`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// D. Interest
// ---------------------------------------------------------------------------

/**
 * Interest on amounts outstanding after the due date (OCA s 29), as the
 * notes give it. The shared LATE_CHARGE below is built from it (stage 2,
 * PR 5).
 */
export const INTEREST = {
  /** Only "If authorised by a resolution at a general meeting", on amounts still outstanding after the due date (s 29(1)). */
  onlyIf: "authorised by a resolution at a general meeting",
  appliesTo: "amounts still outstanding after the due date",
  /** Must not exceed "the maximum rate of interest payable under the Penalty Interest Rates Act 1983" (s 29(2)). */
  capWords: "the maximum rate of interest payable under the Penalty Interest Rates Act 1983",
  /** The owners corporation may waive in a particular case; decisions to waive or not, with reasons, are reported to the AGM (s 29(3), (4)). */
  mayWaiveInParticularCase: true,
  waiverDecisionsReportedToAgm: true,
  /** The fee notice states the rate; the final notice states interest due to date and the daily amount (ss 31(2)(b), 32(2)(b)). CAV says to write 0 if none is charged (GUIDANCE). */
  disclosure: {
    feeNoticeStates: "the interest rate",
    finalNoticeStates: ["interest due to date", "the daily amount"],
    writeZeroIfNone: { value: true, status: "GUIDANCE" as RuleStatus, source: CAV_FORMS },
  },
  /**
   * GUIDANCE, not checked against the rate notice: 10% a year, "since
   * 1 February 2017", from the Supreme Court page (published Feb 2020). The
   * DJCS page CAV cites returned "no longer exists"; the Government Gazette
   * notice was not checked. Not to be used as a default cap until checked
   * (FOR_REVIEW).
   */
  penaltyInterestRate: {
    annualPercent: 10,
    since: "2017-02-01",
    usableAsDefaultCap: false,
    status: "GUIDANCE" as RuleStatus,
    source: SUPREME_COURT_PIR,
  },
  /** VCAT damages in the nature of interest may be based on the Penalty Interest Rates Act s 2 rate or a lesser rate (s 165(2)). */
  vcatInterestBasis: "the Penalty Interest Rates Act 1983 s 2 rate, or a lesser rate",
  source: `${OCA} ss 29, 31(2)(b), 32(2)(b), 165(2)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The late charge in the shared shape (VIC, ACT and WA stage 2, PR 5,
 * 28 Oct 2026), from INTEREST and the notes only. No interest unless a
 * resolution at a general meeting authorises it (s 29(1)), so a building
 * starts with none. The rate must not exceed the Penalty Interest Rates Act
 * 1983 maximum (s 29(2)), whose current value (10%) is guidance only, so the
 * cap has no value and no rate can be recorded until it is checked
 * (FOR_REVIEW PENALTY_INTEREST_RATE). How interest accrues is not in the
 * notes either (NOT_CONFIRMED), so the engine charges nothing until a pack
 * version records it. The owners corporation may waive in a particular case,
 * and decisions to waive or not, with reasons, go to the AGM (s 29(3), (4)).
 * Who decides a waiver is NOT_CONFIRMED, so none can be recorded yet.
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
  source: `${OCA} s 29`,
  annual: {
    // Victoria fixes no rate: interest only if a general meeting resolution authorises it (s 29(1)).
    statutoryRatePercent: null,
    resolvedRate: {
      resolution: {
        value: { kind: "GENERAL_MEETING", words: "general meeting resolution" },
        status: "CONFIRMED",
        source: `${OCA} s 29(1)`,
        note: "\"If authorised by a resolution at a general meeting\". The notes give no kind of resolution, so any resolution carried at a general meeting.",
      },
      minPercent: { value: 0, status: "STRATAVERZE", source: `${OCA} s 29`, note: "The notes give no lowest rate. A rate below 0 is not a rate, so 0 is the lowest StrataVerze takes." },
      maxPercent: {
        value: null,
        status: "GUIDANCE",
        guidance: INTEREST.penaltyInterestRate.annualPercent,
        source: `${OCA} s 29(2); ${SUPREME_COURT_PIR}`,
        note: "The cap is the Penalty Interest Rates Act 1983 maximum (s 29(2), CONFIRMED). Its current value is guidance only and the rate notice was not read, so it is not used as a cap and no rate can be recorded (FOR_REVIEW PENALTY_INTEREST_RATE).",
      },
      // "Must not exceed": the maximum itself may be set.
      maxInclusive: true,
    },
    accrual: {
      from: { value: "DUE_DATE", status: "CONFIRMED", source: `${OCA} s 29(1)`, note: "On \"amounts still outstanding after the due date\"." },
      graceMonths: { value: 0, status: "CONFIRMED", source: `${OCA} s 29(1)`, note: "Interest applies to amounts still outstanding after the due date. The notes record no grace period." },
      simple: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${OCA} ss 29, 32(2)(b)`,
        note: "How interest accrues (daily, simple or otherwise) beyond the final notice's daily amount: the notes do not say.",
      },
      daysInYear: { value: null, status: "NOT_CONFIRMED", source: `${OCA} s 29`, note: "The notes do not say how a day's share of a yearly rate is worked out." },
    },
    waiver: {
      // All of the interest on one notice only, until Matthew Wrigley decides whether part may be waived (FOR_REVIEW INTEREST_WAIVER).
      kinds: ["WHOLE"],
      decidedBy: {
        value: null,
        status: "NOT_CONFIRMED",
        source: `${OCA} s 29(3)`,
        note: "The notes say the owners corporation may waive in a particular case. They do not say by what resolution or whether its committee may decide it. A general meeting resolution is proposed (FOR_REVIEW INTEREST_WAIVER), not decided, so no waiver can be recorded yet.",
      },
      reportedToAgm: INTEREST.waiverDecisionsReportedToAgm,
      formWords: { meeting: "General meeting", motion: "Motion carried" },
      source: `${OCA} s 29(3), (4)`,
      status: "CONFIRMED",
    },
    source: `${OCA} s 29`,
  },
};

/**
 * The order a payment is applied to what an owner owes: fees, then interest,
 * then recovery costs, as NSW. The notes record no order in force before
 * s 32I commences (DATED_RULES.PAYMENT_ALLOCATION_ORDER keeps that record),
 * so this is a StrataVerze choice Matthew Wrigley made on 28 Oct 2026
 * (DECISIONS), not a rule of law. It is the same order as the pending s 32I
 * (fees and charges, then penalty interest, then recovery costs).
 */
export const PAYMENT_ALLOCATION_ORDER: readonly PaymentAllocationPart[] = ["LEVY", "INTEREST", "RECOVERY_COSTS"];

// ---------------------------------------------------------------------------
// E. Fee recovery
// ---------------------------------------------------------------------------

/**
 * Authority to start proceedings (OCA s 18, as substituted by No. 36/2026
 * s 32, in force 9 Sep 2026). A special resolution by default; an ordinary
 * resolution for an order for payment or relief of no more than twice the
 * current annual fees, and for orders that are not for money.
 *
 * NOT CONFIRMED whether a committee may give this authority by delegation:
 * s 11(3) bars delegating powers that need a special or unanimous resolution
 * or a resolution at a general meeting, and whether the committee may
 * authorise s 18(2) proceedings under its default delegation (s 11(5)) was not
 * tested against case law. No debt workflow may automate it until reviewed
 * (FOR_REVIEW).
 */
export const AUTHORITY_TO_SUE = {
  inForceFrom: "2026-09-09",
  /** (1) A special resolution before starting "any proceeding in a court or tribunal". */
  defaultResolution: "SPECIAL",
  appliesTo: "any proceeding in a court or tribunal",
  /** (2) An ordinary resolution suffices for an order for payment or relief "no more than twice the total amount of the current annual fees". */
  ordinaryResolutionForMoneyUpToTimesCurrentAnnualFees: 2,
  /** What the multiple is applied to, as s 18(2) words it. */
  comparedWith: "the total amount of the current annual fees",
  ordinaryResolutionMoneyWords: "no more than twice the total amount of the current annual fees",
  /** (2A) An ordinary resolution suffices for orders that are not for money. */
  ordinaryResolutionForNonMonetaryOrders: true,
  /** 2-lot owners corporations are exempt from s 18 (s 7A(1)(a)). */
  twoLotExempt: true,
  committeeDelegation: {
    status: "NOT_CONFIRMED" as RuleStatus,
    mayBeAutomated: false,
    provisions: "ss 11(3), (5), 18",
  },
  source: `${OCA} s 18(1), (2), (2A) (substituted by ${CLAA} s 32); s 7A(1)(a)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** Recovering unpaid fees (notes section E). Payment plans are not in force (PENDING_CHANGES). */
export const FEE_RECOVERY = {
  /** Recoverable in any court of competent jurisdiction as a debt; ss 31 and 32 and Part 11 Div 1 apply to recovery from lot owners (s 30). */
  recoverableAsDebt: true,
  /** Fee notice (s 31), then final notice (s 32). An owners corporation's VCAT application for payment "can only be made if the amount is not paid within 28 days after the final notice" (s 163(2)). */
  steps: ["fee notice (s 31)", "final notice (s 32)", "VCAT application or court"],
  vcatOnlyIfUnpaidDaysAfterFinalNotice: 28,
  /** The owners for the time being, any purchaser in possession, and anyone entitled to the rents and profits (s 28(1)). */
  liable: ["the lot owners for the time being", "any purchaser in possession", "anyone entitled to the rents and profits"],
  /** Fee recovery cannot be brought as a s 152 complaint, and s 153 does not apply to it (ss 152(4), 153(1A)). */
  complaintProcessExcluded: true,
  /** 2-lot owners corporations are exempt from ss 18, 31 and 32 (s 7A(1)(a)). */
  twoLotExemptFrom: ["18", "31", "32"],
  /** Any "owners corporation dispute" under the Act, the Regulations or the rules (ss 162, 163). */
  vcatApplicants: ["the owners corporation", "lot owners", "occupiers", "managers", "mortgagees", "insurers", "the Director"],
  /**
   * No monetary cap appears in OCA ss 162 to 169 (CONFIRMED). Limits in the
   * VCAT Act were not checked (NOT_CONFIRMED).
   */
  ocaMonetaryCap: null,
  vcatActLimits: { status: "NOT_CONFIRMED" as RuleStatus },
  /**
   * VCAT may order the owner to pay the owners corporation's "reasonable
   * costs ... in recovering an unpaid amount", other than costs in the
   * proceeding (s 165(1)(ca), (4)): CONFIRMED. Proceeding costs fall under
   * VCAT Act s 109, which was not read (NOT_CONFIRMED).
   */
  reasonableRecoveryCostsOrderable: true,
  proceedingCosts: { under: "VCAT Act s 109", status: "NOT_CONFIRMED" as RuleStatus },
  /** No statutory payment plan is in force (ss 32A to 32J not yet commenced). */
  statutoryPaymentPlansInForce: false,
  source: `${OCA} ss 7A(1)(a), 28(1), 30, 31, 32, 152(4), 153(1A), 162, 163, 165(1)(ca), (4)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// Pending: enacted or made but not commenced, and announced
// ---------------------------------------------------------------------------

/** Where a pending change stands: enacted but not commenced, made but not commenced, or announced with no legislation. */
export type PendingLegalStatus = "ENACTED_NOT_COMMENCED" | "MADE_NOT_COMMENCED" | "ANNOUNCED_NO_LEGISLATION";

const CLAA_DIV2_COMMENCEMENT = "on proclamation, or 1 Dec 2027 if not proclaimed earlier (No. 36/2026 s 2(3), (6))";

/**
 * Changes not yet in force. Each is a dated switch: `inForce` is false and
 * `commencedOn` is null until a new pack version records its commencement,
 * and it applies only on and after that date. Two dates are kept apart:
 * `fixedStartDate` is the date the instrument itself fixes for commencement
 * (SR 53/2026), or null where it commences on proclamation; `latestStartDate`
 * is the date it commences at the latest, the fixed date or the default date
 * if not proclaimed earlier (null where there is no legislation).
 * Until then the in-force rules above apply. The rule values are CONFIRMED as
 * enacted or made text, not as law in force. Each change is also restated as
 * a dated rule (DATED_RULES), for code to read with `ruleInForceOn`; the
 * officer in effective control fee (new reg 20(2)) is held here only.
 */
export const PENDING_CHANGES = [
  {
    key: "CLAA_2026_PAYMENT_PLANS",
    title: "Payment plans (new OCA ss 32A to 32J)",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-12-01",
    fixedStartDate: null,
    commencement: CLAA_DIV2_COMMENCEMENT,
    commencedOn: null,
    rules: {
      /** Specified owners corporations only: not tier 5 (s 3 def.). */
      appliesToTiers: [1, 2, 3, 4],
      /** s 32A: after a fee notice or final notice, in writing in the approved form; the owners corporation may ask only for prescribed information and evidence. */
      request: { after: ["a fee notice", "a final notice"], inWriting: true, approvedForm: true, ownersCorporationMayAskOnlyFor: "prescribed information and evidence" },
      /**
       * s 32B: accepts or refuses within 28 days, with written notice within 28
       * days; if not decided in time, deemed accepted on its terms, except where
       * the request was not in the approved form and was for a term over 12
       * months. Refusals for owner-occupiers need written reasons (s 32B(4)).
       */
      decision: {
        decideWithinDays: 28,
        writtenNoticeWithinDays: 28,
        deemedAcceptedIfNotDecided: true,
        deemedAcceptanceExcludedIf: "the request was not in the approved form and was for a term over 12 months",
        ownerOccupierRefusalNeedsWrittenReasons: true,
      },
      /** s 32C: an owner-occupier's request may be refused only on these grounds. */
      ownerOccupierRefusalGroundsOnly: [
        "the plan would likely cause prescribed financial circumstances for the owners corporation",
        "prescribed hardship information is missing",
        "the owner has an existing plan, or did not comply with a plan within the last 2 years",
        "the requested term is longer than 12 months",
        "another prescribed ground",
      ],
      maxTermMonthsBeforeRefusalGround: 12,
      /** s 32D: no fee may be charged for a plan. */
      feeMayBeCharged: false,
      /** s 32E: no identifying information goes in minutes. */
      identifyingInformationInMinutes: false,
      /** s 32F: starts on acceptance, or 29 days after the request if deemed accepted. */
      startsOn: "acceptance, or 29 days after the request if deemed accepted",
      deemedStartDaysAfterRequest: 29,
      /** s 32G: may be varied by written agreement. */
      variedBy: "written agreement",
      /** s 32H: on default, the owners corporation may terminate the plan or recover the debt through s 32. */
      onDefault: ["terminate the plan", "recover the debt through s 32"],
      /** s 32I, for all owners corporations: payments go first to fees and charges, then penalty interest, then reasonable recovery costs. */
      paymentAllocationOrder: ["LEVY", "INTEREST", "RECOVERY_COSTS"] as readonly PaymentAllocationPart[],
      paymentAllocationAppliesToAllOwnersCorporations: true,
      /** s 32J: the AGM report. */
      agmReport: ["the number of plan requests", "how many were accepted or refused", "refusal reasons", "variations"],
      /** New ss 32(3), 163(3): the 28-day final-notice and VCAT clocks pause from the request until refusal, or until the plan ends or is terminated. */
      recoveryClocksPause: true,
      /** New s 163(4): no VCAT payment application while a request is pending or the owner is complying. */
      noVcatPaymentApplicationWhilePendingOrComplying: true,
      /** New s 31(2)(ab): fee notices must state the effect of new s 32(3) (the clock pause). */
      feeNoticeMustStateClockPause: true,
      /** New s 162(ca): payment-plan requests become an owners corporation dispute. */
      vcatJurisdiction: true,
    },
    source: `${CLAA} ss 2(3), (6), 33, 38 to 46 (new OCA ss 31(2)(ab), 32(3), 32A to 32J, 162(ca), 163(3), (4))`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "CLAA_2026_INTEREST_PAUSE",
    title: "No interest while a payment-plan request is unanswered or a plan is being complied with (new OCA s 29(1A))",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-12-01",
    fixedStartDate: null,
    commencement: CLAA_DIV2_COMMENCEMENT,
    commencedOn: null,
    rules: {
      appliesToTiers: [1, 2, 3, 4],
      noInterestWhile: ["a payment-plan request is unanswered under s 32B(2)", "the owner has entered, and is complying with, a payment plan"],
    },
    source: `${CLAA} s 36 (new OCA s 29(1A))`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "CLAA_2026_ARREARS_CARVE_OUTS",
    title: "An owner with a pending request or complying plan is not in arrears for voting, proxy or committee purposes (new OCA ss 89B(4), 89C(11), 103(8))",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-12-01",
    fixedStartDate: null,
    commencement: CLAA_DIV2_COMMENCEMENT,
    commencedOn: null,
    rules: { notInArrearsFor: ["voting (s 89B(4))", "acting as a proxy (s 89C(11))", "the committee (s 103(8))"] },
    source: `${CLAA} Part 6 Div 2 (new OCA ss 89B(4), 89C(11), 103(8))`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "CLAA_2026_PROXY_LIMIT",
    title: "Proxy limit of one lot owner (new OCA s 89D(1))",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-12-01",
    fixedStartDate: null,
    commencement: CLAA_DIV2_COMMENCEMENT,
    commencedOn: null,
    rules: {
      /** "A person must not vote as a proxy on a resolution at a meeting of the owners corporation on behalf of more than one lot owner." */
      words: "A person must not vote as a proxy on a resolution at a meeting of the owners corporation on behalf of more than one lot owner.",
      maxLotOwners: 1,
      /** The s 89D(2) exceptions are not amended. */
      exceptionsUnchanged: true,
    },
    source: `${CLAA} s 43A (new OCA s 89D(1))`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "CLAA_2026_PRIVACY",
    title: "Privacy of owner information (new OCA ss 203AA to 203AAF)",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-12-01",
    fixedStartDate: null,
    commencement: CLAA_DIV2_COMMENCEMENT,
    commencedOn: null,
    rules: {
      /** Owners corporations must protect owner information and notify misuse within 7 days; return or destroy it within set 28-day periods; disclose it only as permitted. */
      protectOwnerInformation: true,
      notifyMisuseWithinDays: 7,
      returnOrDestroyWithinDays: 28,
      discloseOnlyAsPermitted: true,
      penaltyUnitsEach: 60,
    },
    source: `${CLAA} Part 6 Div 2 (new OCA ss 203AA to 203AAF)`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "CLAA_2026_OTHER_DIV2",
    title: "Seal witness and the s 3 \"Part 12\" correction (new OCA s 21(2A); s 3)",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-12-01",
    fixedStartDate: null,
    commencement: CLAA_DIV2_COMMENCEMENT,
    commencedOn: null,
    rules: { sealWitness: "new s 21(2A)", registeredManagerDefinitionPart: { from: "Part 6", to: "Part 12" } },
    source: `${CLAA} s 33(2) and Part 6 Div 2 (new OCA s 21(2A))`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "SR_53_2026_MANAGER_FEES",
    title: "Manager registration fees (OCR regs 19 to 21, as amended by SR 53/2026)",
    legalStatus: "MADE_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2026-11-25",
    fixedStartDate: "2026-11-25",
    commencement: "25 Nov 2026 (SR 53/2026 reg 3); new reg 20(2) applies from 30 Jun 2027",
    commencedOn: null,
    rules: {
      feeUnits: { application: 29.12, annual: 22.05, lateLodgement: 1.35 },
      /** New reg 20(2): from 30 Jun 2027, 22.05 fee units for s 183(1A) (officers in effective control). */
      officerInEffectiveControlAnnualFeeUnits: 22.05,
      officerInEffectiveControlFeeFrom: "2027-06-30",
    },
    source: `${SR53} regs 3, 5 to 7`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "HSRA_2025_MANAGER_EDUCATION",
    title: "Manager education reforms (HSRA 2025 Part 4 Div 1, ss 85 to 110)",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-06-30",
    fixedStartDate: null,
    commencement: "on proclamation, or 30 Jun 2027 at the latest (HSRA 2025 s 2(4))",
    commencedOn: null,
    rules: {
      adds: [
        "corporate managers must appoint a registered \"officer in effective control\"",
        "natural persons must complete prescribed courses or examinations",
        "Business Licensing Authority registration conditions",
        "mandatory continuing professional development (ss 198A, 198B)",
      ],
      // The transitional deadlines in OCA s 212 are already in force: see MANAGER.educationTransitionalDeadlines.
      /**
       * GUIDANCE (CAV): initial training of "any 5 core units from the
       * Certificate IV in Strata Community Management" by 30 Jun 2027; officer
       * in effective control registration by 30 Jun 2027 (1 Aug 2027 if already
       * registered); annual CPD from 1 Apr 2028; fee changes from 25 Nov 2026.
       * The detail is in SR 54/2026, which was not read.
       */
      cavSummary: {
        initialTrainingCoreUnits: 5,
        initialTrainingBy: "2027-06-30",
        officerRegistrationBy: "2027-06-30",
        officerRegistrationIfAlreadyRegisteredBy: "2027-08-01",
        annualCpdFrom: "2028-04-01",
        status: "GUIDANCE" as RuleStatus,
        source: `${CAV_EDUCATION}; ${SR54} (text not read)`,
      },
    },
    source: `${HSRA} ss 2(4), 85 to 110; ${OCA} s 212`,
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "CLAA_2026_SALE_OF_LAND",
    title: "When vendor's s 32 statements are made available, and notice of changes (CLAA 2026 Part 9 Div 1)",
    legalStatus: "ENACTED_NOT_COMMENCED" as PendingLegalStatus,
    inForce: false,
    latestStartDate: "2027-06-01",
    fixedStartDate: null,
    commencement: "on proclamation, or 1 Jun 2027 at the latest; ss 106 to 108 at the latest 1 Jul 2027",
    commencedOn: null,
    rules: { sections106To108LatestStartDate: "2027-07-01", contentRead: false },
    source: `${CLAA} Part 9 Div 1 (commencement only)`,
    /** Only the commencement was read. */
    status: "CONFIRMED" as RuleStatus,
  },
  {
    key: "MANAGER_LICENSING_ANNOUNCEMENT_2026",
    title: "A new licensing scheme for owners corporation managers, and stronger CAV powers, announced for 2027",
    legalStatus: "ANNOUNCED_NO_LEGISLATION" as PendingLegalStatus,
    inForce: false,
    latestStartDate: null,
    fixedStartDate: null,
    commencement: "no Bill or Act yet; the media release lists it among changes \"to come next year\"",
    commencedOn: null,
    rules: { reviewRecommendations: { supportedInFull: 17, supportedInPart: 3, supportedInPrinciple: 26 } },
    source: PREMIER_2026,
    status: "GUIDANCE" as RuleStatus,
  },
] as const;

// ---------------------------------------------------------------------------
// F. Meetings
// ---------------------------------------------------------------------------

/**
 * General meetings (notes section F). Held as data for review; the meeting
 * engine does not apply it (its rule set is NSW-shaped).
 */
export const MEETINGS = {
  /** Convened by the applicant for registration within 6 months of plan registration; it is the first AGM (ss 66, 70(1)). */
  firstMeeting: { convenedBy: "the applicant for registration", withinMonthsOfPlanRegistration: 6, isFirstAgm: true },
  /**
   * First meeting documents (s 67(1)) include the register, maintenance plan,
   * building manual (s 67(1)(da), from 1 Feb 2024), contracts and insurance,
   * warranties and asset register. The developer discloses its relationship
   * with the manager (s 67A). A manager contract made before the first meeting
   * expires at it; other developer-benefit contracts are limited to 3 years
   * (s 67B).
   */
  firstMeetingDocumentsInclude: ["register", "maintenance plan", "building manual", "contracts and insurance", "warranties", "asset register"],
  developerDisclosesManagerRelationship: true,
  preFirstMeetingManagerContractExpiresAtFirstMeeting: true,
  developerBenefitContractsMaxYears: 3,
  /** An AGM is required if the owners corporation receives or pays out money in any financial year (s 69(1)); the interval "must not exceed 15 months" (s 69(2)). */
  agmRequiredIf: "the owners corporation receives or pays out money in the financial year",
  agmIntervalMaxMonths: 15,
  /** Mandatory AGM agenda items (s 71(2)). */
  agmAgenda: [
    "committee election (if any)",
    "manager appointment",
    "insurance details",
    "fees fixed",
    "financial statements",
    "proposed budget",
    "delegations",
    "reports under ss 29(4), 39, 65(3), 115, 126 and 159",
    "previous AGM minutes",
  ],
  /** AGM notice: written, at least 14 days before; electronic notice allowed (s 72). */
  agmNoticeDays: 14,
  agmNoticeIncludes: [
    "date, time and place",
    "agenda",
    "full text of any special or unanimous resolution",
    "financial statements",
    "proposed annual budget",
    "proxy-right statement",
    "reports under s 71(2)(h)",
    "previous AGM minutes",
  ],
  /** Who may convene a special general meeting (s 74). */
  sgmConvenedBy: [
    "the chairperson",
    "the secretary",
    "the manager (on committee authority, or where there is no committee)",
    "a lot owner or the manager nominated by owners holding at least 25% of lot entitlements",
  ],
  sgmNominatorsLotEntitlementPercentAtLeast: 25,
  /** SGM notice: at least 14 days (s 76). */
  sgmNoticeDays: 14,
  sgmNoticeIncludes: ["date, time and place", "agenda", "text of special or unanimous resolutions", "the proxy statement"],
  /**
   * Quorum (s 77): "at least 50% of the total number of lots or if 50% of the
   * total number of lots is not available the quorum is at least 50% of the
   * total lot entitlement". CAV's paraphrase ("50 per cent of the total votes
   * or lot entitlements") is not used.
   */
  quorum: { percentOfTotalLots: 50, otherwisePercentOfTotalLotEntitlement: 50 },
  /** No quorum: the meeting may proceed, but "all resolutions are interim resolutions", which cannot be used for special or unanimous matters (s 78(1), (5)). */
  noQuorumResolutionsAreInterim: true,
  interimNotFor: ["SPECIAL", "UNANIMOUS"],
  /**
   * Interim resolutions (s 78(2) to (4)): notice and minutes to all owners
   * within 14 days; takes effect 29 days after it is made, unless notice of a
   * special general meeting is given within the 29 days. If so it needs
   * confirmation at that meeting, held within 28 days of the notice; if that
   * meeting is not held, it takes effect at the end of the 28 days. Stopped by
   * an SGM notice, not by a petition (GUIDANCE_CONFLICTS).
   */
  interimResolutions: { noticeAndMinutesWithinDays: 14, takesEffectDaysAfterMade: 29, stoppedBy: "notice of a special general meeting within the 29 days", sgmHeldWithinDaysOfNotice: 28, takesEffectIfSgmNotHeldAfterDays: 28 },
  /**
   * Manager interim resolutions (s 78(1A) to (1C)): if no lot owner is present
   * (in person or by proxy), the manager may pass interim resolutions, but not
   * on its own contract or for more than 10% of the annual budget (or the
   * previous year's). An ordinary resolution may exclude or alter the power.
   */
  managerInterimResolutions: { onlyIfNoLotOwnerPresent: true, notOnOwnContract: true, maxPercentOfAnnualBudget: 10, excludedOrAlteredBy: "ORDINARY" },
  /** In person, by teleconference (including video, reg 7A), by proxy, or as prescribed; a teleconference participant is present in person (s 80(1); s 89(6); OCR reg 7A). */
  attendance: ["in person", "teleconference, including video", "proxy", "as prescribed"],
  teleconferenceParticipantPresentInPerson: true,
  /** Minutes (s 81). */
  minutesInclude: ["date, time and place", "owners present", "owners who gave proxies", "proxies present", "voting", "text of all resolutions"],
  /** An ordinary resolution at a general meeting may reserve matters to general meetings (s 82). */
  generalMeetingOnlyMattersBy: "ORDINARY",
  source: `${OCA} ss 66, 67, 67A, 67B, 69, 70(1), 71(2), 72, 74, 76, 77, 78, 80(1), 81, 82, 89(6); ${OCR} reg 7A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// G. Resolutions
// ---------------------------------------------------------------------------

/** Resolutions (notes section G). One vote per lot; joint owners share one vote (s 87). */
export const RESOLUTIONS = {
  votesPerLot: 1,
  jointOwnersShareOneVote: true,
  /**
   * Ordinary resolution at a meeting (s 89(1) to (5); OCR reg 7B): a simple
   * majority of votes cast, by show of hands or the prescribed form. Any owner
   * may require a poll by lot entitlement, by written vote, before or after the
   * vote; the poll result replaces the show of hands.
   */
  ORDINARY: {
    basis: "a simple majority of votes cast",
    pollAvailable: true,
    pollBy: "lot entitlement",
    pollReplacesShowOfHands: true,
    source: `${OCA} s 89(1) to (5); ${OCR} reg 7B`,
  },
  /** Ordinary resolution by ballot: a majority of votes returned by the closing date; the votes returned must be at least the s 77 quorum number (s 86(2)(a)). */
  ORDINARY_BALLOT: { basis: "a majority of votes returned by the closing date", votesReturnedAtLeast: "the s 77 quorum number", source: `${OCA} s 86(2)(a)` },
  /** The chair has a casting vote if votes are equal and the chair is an owner or proxy; if not used, the resolution is not passed (s 89A). */
  castingVote: { chairHasIfOwnerOrProxy: true, notUsedMeansNotPassed: true, source: `${OCA} s 89A` },
  /** 75% of the total votes for all lots; on a ballot or poll, 75% of the total lot entitlements of all lots (s 96). */
  SPECIAL: {
    basis: "75% of the total votes for all lots; on a ballot or poll, 75% of the total lot entitlements of all lots",
    fractionOfTotalVotes: 0.75,
    fractionOfTotalLotEntitlementsOnBallotOrPoll: 0.75,
    countsTotalForAllLots: true,
    source: `${OCA} ss 86(2)(b), 96`,
  },
  /** The total votes for all lots; on a ballot or poll, the total lot entitlements (s 95). */
  UNANIMOUS: { basis: "the total votes for all lots; on a ballot or poll, the total lot entitlements", source: `${OCA} ss 86(2)(b), 95` },
  /**
   * Interim special resolution (s 97). Route 1: in favour at least 50% of the
   * total votes for all lots, and against "not more than 25%" of those votes
   * (s 97(1)). Route 2: at a general meeting with a quorum and no votes against
   * (s 97(1A)). Notice within 14 days of the meeting (with minutes) or the
   * ballot close (with the text), stating the 29-day and petition effect
   * (s 97(2) to (4)). It becomes a special resolution 29 days after it was
   * passed, unless owners holding "more than 25% of the total votes for all the
   * lots" petition the secretary (s 97(5)). CAV says "25 per cent of the total
   * lot entitlements"; the pack follows the Act (GUIDANCE_CONFLICTS).
   */
  INTERIM_SPECIAL: {
    route1: { forAtLeastFractionOfTotalVotes: 0.5, againstNotMoreThanFractionOfTotalVotes: 0.25 },
    route2: { atQuorateGeneralMeeting: true, noVotesAgainst: true },
    noticeWithinDays: 14,
    becomesSpecialAfterDays: 29,
    petitionStopsIfMoreThanFractionOfTotalVotes: 0.25,
    petitionCounts: "total votes for all the lots",
    petitionTo: "the secretary",
    source: `${OCA} s 97`,
  },
  /**
   * Ballots (ss 83 to 85): arranged by the chair or secretary, an owner
   * nominated by holders of at least 25% of lot entitlements, or the manager;
   * by post, phone, fax, internet or other electronic means; written notice at
   * least 14 days before closing; closing date 14 days after notice, or less if
   * urgent; the ballot document holds the motion and resolution text and a
   * proxy statement.
   */
  ballots: {
    arrangedBy: ["the chairperson or secretary", "an owner nominated by holders of at least 25% of lot entitlements", "the manager"],
    nominatorsLotEntitlementPercentAtLeast: 25,
    means: ["post", "phone", "fax", "internet", "other electronic means"],
    noticeDaysBeforeClosing: 14,
    closingDaysAfterNotice: 14,
    shorterIfUrgent: true,
    source: `${OCA} ss 83 to 85`,
  },
  /** For a 2-lot owners corporation, "special resolution" means a unanimous resolution (s 7A). */
  twoLotSpecialMeans: "UNANIMOUS",
  /** What some decisions need, as the notes give them. */
  requiredFor: {
    SPECIAL: [
      "special fees more than twice the current annual fees, unless urgent (s 24(4), (5))",
      "borrowing beyond the current annual fees (s 25)",
      "starting proceedings, by default (s 18(1))",
      "maintenance fund payments not under the plan (s 44)",
      "a tier 1 owners corporation opting out of appointing a manager (s 119(1), (1A), (1C))",
      "making, amending or revoking rules (or a s 97 interim special resolution)",
      "changing a shift of limited functions to the unlimited owners corporation (special resolution of each; SA s 27H(3))",
      "affirming a manager contract made in breach of the proxy conflict rule (s 89C(9))",
    ],
    UNANIMOUS: [
      "changing lot entitlement or lot liability (SA s 33)",
      "multiple single dwellings each insuring their own lot (s 61A)",
      "owners insuring themselves where there is no common property (s 63)",
    ],
    ORDINARY: [
      "proceedings for money up to twice the current annual fees, or for orders not for money (s 18(2), (2A))",
      "the amount paid into the maintenance fund (s 42(2), (3))",
      "amending the maintenance plan (s 37(1A))",
      "maintenance fund payments under the plan (s 43)",
      "a committee of up to 12 (s 103)",
      "reserving matters to general meetings (s 82)",
      "excluding or altering the manager's interim resolution power (s 78(1A) to (1C))",
    ],
    /** s 29(1) says only "a resolution at a general meeting"; the notes do not give its kind. */
    RESOLUTION_AT_GENERAL_MEETING: ["authorising interest on overdue amounts (s 29(1))"],
  },
  source: `${OCA} ss 7A, 83 to 87, 89, 89A, 95 to 97; ${OCR} reg 7B`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// H. Proxies
// ---------------------------------------------------------------------------

/** Proxies in force now (notes section H). The one-lot-owner limit is pending (PENDING_CHANGES). */
export const PROXIES = {
  /** Attend, speak and vote at meetings; vote at a ballot; represent the owner on the committee. A committee member's proxy must also be a committee member (s 89C(1), (2)). */
  capacities: ["attend, speak and vote at meetings", "vote at a ballot", "represent the owner on the committee"],
  committeeMemberProxyMustBeCommitteeMember: true,
  /** The prescribed form (OCR Sch 1), authorising an individual, delivered to the secretary; effective from the first meeting after delivery; not transferable (s 89C(3) to (5); OCR reg 8). */
  form: "OCR Sch 1",
  mustAuthoriseAnIndividual: true,
  deliveredTo: "the secretary",
  effectiveFrom: "the first meeting after delivery",
  transferable: false,
  /** Lapses 12 months after it is given, or an earlier date in the form; revocable by written notice to the secretary (ss 89C(6), 89E). */
  lapsesAfterMonths: 12,
  revocableByWrittenNoticeToSecretary: true,
  /** A non-owner proxy cannot vote on delegations (s 11) or on the manager's appointment, pay or removal; a manager contract made in breach is void unless affirmed by special resolution (s 89C(7), (9)). */
  nonOwnerProxyCannotVoteOn: ["delegations (s 11)", "the manager's appointment, pay or removal"],
  /**
   * The current limit (s 89D): one lot owner where there are 20 or fewer
   * occupiable lots; no more than 5% of lot owners where there are more than
   * 20 occupiable lots. Exceptions: family members, and the prescribed cases
   * (OCR reg 8A).
   */
  limit: {
    occupiableLotsThreshold: 20,
    maxLotOwnersWhenAtOrBelowThreshold: 1,
    maxPercentOfLotOwnersWhenAboveThreshold: 5,
    counts: "occupiable lots",
    /** How 5% is rounded is not in the notes (NOT_CONFIRMED). */
    roundingStatus: "NOT_CONFIRMED" as RuleStatus,
    exceptions: ["family members", "one owner with multiple lots (prescribed)", "owners corporations managing commercial, retail or industrial common property (prescribed)"],
    source: `${OCA} s 89D; ${OCR} reg 8A`,
  },
  /** A power of attorney has the same numeric limits, with the family exception only (s 89F). */
  powerOfAttorneySameLimitsFamilyExceptionOnly: true,
  /** Requiring or demanding a proxy or power of attorney is an offence: 60 penalty units (s 89G). */
  coercionPenaltyUnits: 60,
  /** An owner in arrears may not act as a proxy (s 89C(10)). */
  ownerInArrearsMayBeProxy: false,
  source: `${OCA} ss 89C, 89D, 89E, 89F, 89G; ${OCR} regs 8, 8A, Sch 1`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// I. Committee
// ---------------------------------------------------------------------------

/** The committee (notes section I). */
export const COMMITTEE = {
  /** Required where the owners corporation affects 10 or more lots, counting all lots (s 100; LOT_COUNT_TESTS). */
  requiredFromLots: LOT_COUNT_TESTS.committeeRequired.lotsAtLeast,
  requiredCounts: LOT_COUNT_TESTS.committeeRequired.counts,
  electedAt: "each AGM",
  /** At least 3 and no more than 7 members; an ordinary resolution may allow up to 12; members are owners or proxies, one per lot (s 103(1) to (3)). */
  minMembers: 3,
  maxMembers: 7,
  maxMembersByOrdinaryResolution: 12,
  onePerLot: true,
  /**
   * Office runs until a new committee is elected; an AGM or SGM may add or
   * remove members; a casual vacancy may be co-opted, or left unfilled if 3 or
   * more remain; absence from 25% or more of meetings in 6 months without
   * notice allows removal by committee resolution (ss 103(5), (6), 104; OCR reg 9).
   */
  termUntil: "a new committee is elected",
  casualVacancyMayBeLeftIfMembersRemainAtLeast: 3,
  absenceRemoval: { meetingsMissedPercentAtLeast: 25, inMonths: 6, withoutNotice: true, by: "committee resolution" },
  /** The committee appoints the chairperson and the secretary (a member or the manager) by majority vote; with no committee, owners must elect a chairperson and may elect a secretary (ss 98, 99, 105, 107). */
  officers: ["chairperson", "secretary"],
  secretaryMayBeManager: true,
  /** Meeting notice: at least 3 business days, or as determined by the owners corporation; time and place, agenda, previous minutes and the proxy statement (s 109). */
  meetingNoticeBusinessDays: 3,
  /** Quorum at least half of the members; without one, interim resolutions need confirmation (next quorate meeting, ballot, or rules) (s 112(1), (6), (7)). */
  quorumFractionOfMembersAtLeast: 0.5,
  /** One vote per member; a majority of those participating; the chair has a casting vote; video participation allowed (s 112(3), (8) to (10); OCR reg 9A). */
  decidedBy: "a majority of the members participating",
  chairCastingVote: true,
  /** Committee ballots (s 111): notice of the resolution and closing date (14 days, or less if urgent); passes if a majority of members are in favour before closing. */
  ballotClosingDays: 14,
  ballotPassesIf: "a majority of members are in favour before closing",
  /**
   * Default delegation (s 11(3), (5)): with no delegation made, the committee
   * holds all the owners corporation's powers except those needing a special
   * or unanimous resolution, general meeting matters, the power to delegate,
   * and s 82-reserved matters. It may delegate to the manager or a lot owner,
   * and sub-delegate to a member, by instrument (s 102).
   */
  defaultDelegationExcludes: ["powers needing a special or unanimous resolution", "general meeting matters", "the power to delegate", "s 82-reserved matters"],
  mayDelegateTo: ["the manager", "a lot owner", "a committee member (sub-delegation)"],
  /**
   * No general statutory dollar limit for committees was found in the Act or
   * Regulations (CONFIRMED). The controls: rules may set "Financial controls
   * for committees, sub-committees and delegates" (Sch 1 item 2.3); borrowing
   * beyond current annual fees needs a special resolution (s 25); urgent
   * maintenance fund spending is capped by any owners corporation limit
   * (s 45(3)); manager interim resolutions are capped at 10% of budget
   * (s 78(1B)).
   */
  spendingLimitCents: null,
  spendingControls: ["financial controls in the rules (Sch 1 item 2.3)", "borrowing beyond current annual fees by special resolution (s 25)", "any owners corporation limit on urgent maintenance fund spending (s 45(3))", "the 10% cap on manager interim resolutions (s 78(1B))"],
  /** Members must act honestly and in good faith, with due care and diligence, in the owners corporation's interests, and not misuse their position; good-faith immunity, with liability attaching to the owners corporation (ss 117, 118). */
  goodFaithImmunity: true,
  /** Committee minutes record date, time, place, members present, members voting, resolutions and votes; members of the owners corporation may inspect them (s 114). */
  minutesInclude: ["date, time and place", "members present", "members voting", "resolutions", "votes"],
  source: `${OCA} ss 11(3), (5), 25, 45(3), 78(1B), 98, 99, 100, 102 to 105, 107, 109, 111, 112, 114, 117, 118, Sch 1 item 2.3; ${OCR} regs 9, 9A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// J. Manager
// ---------------------------------------------------------------------------

/** The manager (notes section J). The education reforms and new fees are pending (PENDING_CHANGES). */
export const MANAGER = {
  /** Acting as manager "for fee or reward" requires registration under Part 12 with the Business Licensing Authority: 60 penalty units. Registration lasts until cancelled or surrendered; annual fee and statement (ss 178, 182(2), 183). */
  registrationRequiredForFeeOrReward: true,
  registeredWith: "Business Licensing Authority",
  unregisteredPenaltyUnits: 60,
  registrationLasts: "until cancelled or surrendered",
  /** Over 18, not a represented person, not insolvent or externally administered; no listed conviction in 10 years unless BLA permission (ss 179, 182A). */
  eligibility: ["over 18", "not a represented person", "not insolvent or externally administered", "no listed conviction in 10 years, unless BLA permission (s 182A)"],
  /** Professional indemnity insurance required before appointment for fee or reward and at all times, or registration is cancelled after 30 days; prescribed amount $2,000,000 "in any one year" (ss 119(5), 185A, 186(5); OCR reg 10). */
  professionalIndemnityMinCentsInAnyOneYear: 200_000_000,
  registrationCancelledDaysAfterCoverLapses: 30,
  /** Contract term at most 3 years (retirement villages up to 5) (ss 119(1D), 143E). */
  maxContractYears: 3,
  retirementVillageMaxContractYears: 5,
  /**
   * "An instrument or contract of appointment must be in the approved form"
   * (s 119(3)). The planning pass said the form was optional; that was wrong.
   */
  contractMustBeInApprovedForm: true,
  /** Banned contract terms (s 119A; s 208); notice periods by tier are in DUTIES_BY_TIER. */
  bannedContractTerms: [
    "requiring a special or unanimous resolution, or more than a simple majority, to revoke",
    "requiring a general meeting to revoke",
    "renewal at the manager's option",
    "notice periods beyond the tier limit (DUTIES_BY_TIER)",
    "auto-renewal",
    "unreasonable assignment restrictions",
  ],
  /** If the owners corporation fails to give notice of renewal, the contract is renewed but terminable on 1 month's notice. */
  unnoticedRenewalTerminableOnMonthsNotice: 1,
  /**
   * Trust money (s 122(2) to (4)): all owners corporation money is held on
   * trust; separate bank accounts per owners corporation, unless same-plan
   * owners corporations consent or it is a statutory trust account of an estate
   * agent, legal practitioner or conveyancer; interest is part of trust money;
   * bank statements for the previous 3 years on request.
   */
  trustMoney: {
    heldOnTrust: true,
    separateAccountPerOwnersCorporation: true,
    separateAccountExceptions: ["owners corporations on the same plan that consent", "a statutory trust account of an estate agent, legal practitioner or conveyancer"],
    interestIsTrustMoney: true,
    bankStatementsOnRequestYears: 3,
  },
  /** Duties (ss 122, 122A, 122B): good faith, care and diligence, no improper use of position, competitive procurement, no pressure on votes; disclose commissions and beneficial supplier relationships in writing to the chair. */
  duties: ["good faith", "care and diligence", "no improper use of position", "competitive procurement", "no pressure on votes", "written disclosure to the chair of commissions (s 122B) and beneficial supplier relationships (s 122A)"],
  /** Report to each AGM on trust money and disbursements, PI insurance and commissions or benefits (estimated if not ascertainable); to the committee as it requires (ss 126, 120(2)). */
  agmReport: ["trust money and disbursements", "professional indemnity insurance details", "commissions or benefits received (estimated if not ascertainable)"],
  /** Return records within 28 days of termination: 60 penalty units; also an infringement offence, 6 penalty units (s 127; OCR reg 23). */
  returnRecordsWithinDaysOfTermination: 28,
  returnRecordsPenaltyUnits: 60,
  returnRecordsInfringementPenaltyUnits: 6,
  /**
   * In force now (HSRA 2025 ss 111, 112, from 25 Nov 2025): transitional s 212
   * sets deadlines of 30 Jun 2027 (courses) and 1 Aug 2027 (evidence and
   * officer appointment for existing businesses). The education reforms they
   * serve are pending (PENDING_CHANGES, HSRA_2025_MANAGER_EDUCATION).
   */
  educationTransitionalDeadlines: {
    coursesBy: "2027-06-30",
    evidenceAndOfficerAppointmentForExistingBusinessesBy: "2027-08-01",
    inForceFrom: "2025-11-25",
    source: `${OCA} s 212 (inserted by ${HSRA} ss 111, 112)`,
    status: "CONFIRMED" as RuleStatus,
  },
  /** Registration fees in force now, in fee units (OCR regs 19 to 21). The SR 53/2026 fees from 25 Nov 2026 are in PENDING_CHANGES. */
  registrationFeeUnits: { application: 14.26, annual: 10.01, lateLodgement: 1 },
  source: `${OCA} ss 119(1D), (3), (5), 119A, 120(2), 122, 122A, 122B, 126, 127, 143E, 178, 179, 182(2), 182A, 183, 185A, 186(5), 208, 212; ${OCR} regs 10, 19 to 21, 23`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// K. Maintenance plan and fund
// ---------------------------------------------------------------------------

/** The maintenance plan (OCA ss 36 to 39, 206, 207; OCR reg 7). */
export const MAINTENANCE_PLAN = {
  /** Tiers 1 and 2 must prepare and approve one; tiers 3 to 5 may (s 36). */
  mustTiers: [1, 2],
  mayTiers: [3, 4, 5],
  /** Tier 1 from 12 months, and tier 2 from 24 months, after 1 Dec 2021 (s 207; s 206): CONFIRMED. The calendar dates are CAV's (GUIDANCE). */
  startMonthsAfterCommencement: { 1: 12, 2: 24 },
  commencement: "2021-12-01",
  startDates: { dates: { 1: "2022-12-01", 2: "2023-12-01" }, status: "GUIDANCE" as RuleStatus, source: CAV_TIERS },
  /** Major capital items expected to need repair or replacement "within the next 10 years": condition, timing, estimated cost and expected life; prescribed classes are common property structures, services and assets (s 37; OCR reg 7). */
  horizonYears: 10,
  coversPerItem: ["condition", "timing", "estimated cost", "expected life"],
  prescribedClasses: ["common property structures", "services", "assets"],
  /** No effect until the owners corporation approves it; amended by ordinary resolution; report on implementation at each AGM (ss 38, 37(1A), 39). */
  noEffectUntilApproved: true,
  amendedBy: "ORDINARY",
  reportAtEachAgm: true,
  source: `${OCA} ss 36 to 39, 206, 207; ${OCR} reg 7`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/** The maintenance fund and repair duties (OCA ss 4(b), 33(2), 42 to 47A). */
export const MAINTENANCE_FUND = {
  /** Payments in (s 42): designated annual fees (set by ordinary resolution, adequate to fund the plan), insurance proceeds for plan items, interest, prescribed or determined amounts. */
  paymentsIn: ["designated annual fees", "insurance proceeds for plan items", "interest", "prescribed or determined amounts"],
  separateAccounts: true,
  /** Payments out: under the plan by ordinary resolution (s 43); otherwise by special resolution (s 44); urgent matters allowed, reported as soon as possible (s 45). */
  paymentsOut: { underPlanBy: "ORDINARY", otherwiseBy: "SPECIAL", urgentAllowed: true, urgentReportedAsSoonAsPossible: true },
  /** The owners corporation repairs and maintains common property, its chattels and fittings, and services benefiting more than one lot; owners must not repair common property unless authorised (ss 4(b), 46, 47, 47A). */
  repairDuties: ["common property", "common property chattels and fittings", "services benefiting more than one lot"],
  ownersMayRepairCommonPropertyOnlyIfAuthorised: true,
  source: `${OCA} ss 4(b), 33(2), 42 to 47A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// L. Financial statements, audit and review
// ---------------------------------------------------------------------------

/** Accounts, statements, audit and review (notes section L). By tier: DUTIES_BY_TIER. */
export const FINANCIAL_STATEMENTS = {
  /** Proper accounts of all income, expenditure, assets and liabilities, giving a true and fair view (s 33(1)). */
  accountsGiveTrueAndFairView: true,
  financialStatementsByTier: DUTIES_BY_TIER.financialStatements,
  auditOrReviewByTier: DUTIES_BY_TIER.auditOrReview,
  /** The auditor or reviewer must not have a personal or financial interest; a written report is required (s 35). */
  auditorOrReviewerMustBeIndependent: true,
  writtenReportRequired: true,
  /** Tier 1 exemption: written application to the Director, who may grant it with conditions (s 35A). */
  tier1ExemptionBy: "the Director, on written application, with conditions",
  /** NOT CONFIRMED: the OCA does not define "financial year" in s 3, and no provision fixing it was found. */
  financialYear: { defined: false, status: "NOT_CONFIRMED" as RuleStatus },
  source: `${OCA} ss 3, 33(1), 34, 35, 35A`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// M. Insurance
// ---------------------------------------------------------------------------

/** Insurance (notes section M). Tiers 1 to 4; 2-lot and services only owners corporations are exempt (DUTIES_BY_TIER). */
export const INSURANCE = {
  /**
   * Reinstatement and replacement for all buildings on common property: to
   * "replace, repair or rebuild ... not better or more extensive than its
   * condition when new", plus debris removal, professional fees and the owners
   * corporation's share of shared services; mortgagees noted; the required
   * notice and non-avoidance terms (s 59).
   */
  reinstatementBasis: "replace, repair or rebuild, not better or more extensive than its condition when new",
  reinstatementIncludes: ["debris removal", "professional fees", "the owners corporation's share of shared services"],
  /** Public liability for common property of at least "$20 000 000, or if another amount is prescribed"; no other amount is prescribed in OCR Version 002 (s 60(3)). */
  publicLiabilityMinCents: 2_000_000_000,
  /** Where a building is above or below common property, a reserve or a lot, the owners corporation insures all lots as well, with exceptions (s 61). */
  multiLevelInsuresAllLots: true,
  multiLevelExceptions: ["single-storey buildings", "some older Strata and Cluster Titles plans", "separate multi-level owners corporations insure only their own building"],
  /** Opt-outs: multiple single dwellings by unanimous resolution (s 61A); with no common property, owners by unanimous resolution (s 63); insurance by another owners corporation suffices (s 64). */
  optOuts: { multipleSingleDwellingsBy: "UNANIMOUS", noCommonPropertyBy: "UNANIMOUS", insuredByAnotherOwnersCorporation: true },
  /** Valuation of all buildings it must insure every 5 years, or earlier if it decides; report presented at the next general meeting; tier 5 exempt (s 65). CAV's insurance page still says "prescribed owners corporation" (GUIDANCE_CONFLICTS). */
  valuationEveryYears: 5,
  valuationPresentedAt: "the next general meeting",
  /** VCAT may exempt for a limited period if insurance cannot be obtained on reasonable terms (ss 170(b), 171(3)). */
  vcatMayExemptForLimitedPeriod: true,
  source: `${OCA} ss 59, 60(3), 61, 61A, 63, 64, 65, 170(b), 171(3); ${OCR} (no amount prescribed)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// N. Records and fee units
// ---------------------------------------------------------------------------

/** Records and the register (notes section N). Fees are in fee units (FEES_IN_FEE_UNITS). */
export const RECORDS = {
  /** Records to keep (s 144) and OCR reg 11A. */
  kept: [
    "owner names and addresses",
    "consolidated rules",
    "minutes",
    "resolutions",
    "ballot results",
    "proxies",
    "voting papers",
    "correspondence",
    "accounts",
    "assets and liabilities",
    "financial statements",
    "tax and GST records",
    "insurance",
    "maintenance plans",
    "notices and orders served on and by the owners corporation",
    "contracts, leases and licences",
  ],
  keptUnderReg11A: [
    "owner phone and email",
    "known homicides on common property",
    "dates of gas, electrical and pool barrier checks, and open recommendations",
    "building surveyor or authority notices on defects or safety",
  ],
  /** Voting papers and ballots 12 months after the vote; proxies 12 months after expiry or revocation; all others "at least 7 years" (s 145). */
  retention: { votingPapersMonthsAfterVote: 12, proxiesMonthsAfterExpiryOrRevocation: 12, othersAtLeastYears: 7 },
  /** GUIDANCE (CAV): documents kept for the life of the building. */
  lifeOfBuilding: {
    documents: ["plan", "AGM minutes", "permits", "plans", "contract", "s 173 agreements", "builder's insurance", "occupancy permit"],
    status: "GUIDANCE" as RuleStatus,
    source: CAV_RECORDS,
  },
  /** Free inspection at any reasonable time for a lot owner, a mortgagee, a purchaser, or their representative (s 146(1)). */
  inspectionFree: true,
  inspectionBy: ["a lot owner", "a mortgagee", "a purchaser", "their representative"],
  /** Copies for a reasonable fee, capped (s 146(2), (3); OCR regs 12, 15). Fee units in FEES_IN_FEE_UNITS. */
  copiesCapped: true,
  /** Register contents (s 148). */
  registerContents: [
    "plan number and address",
    "owner names and addresses",
    "manager name, registration and contact details",
    "total and per-lot lot liability and lot entitlement, and their basis",
    "rule amendment and recording dates",
    "notices and orders",
    "contracts, leases and licences",
    "insurance details (insurer, policy number, risk, amount, due date, last paid)",
  ],
  /** "readily accessible and convertible into writing in the English language"; may be electronic (s 149). */
  registerMayBeElectronic: true,
  /** Register: free inspection for the same persons; a copy for a reasonable fee capped by reg 13; an owner may not authorise a non-owner representative to get a copy for a commercial purpose without owners corporation consent (s 150; OCR reg 13). */
  registerCommercialCopyNeedsConsent: true,
  /** VCAT may restrict access to a person's information in exceptional circumstances (s 172). */
  vcatMayRestrictAccess: true,
  source: `${OCA} ss 144 to 150, 172; ${OCR} regs 11A, 12, 13, 15`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * Fees fixed in fee units (OCR regs 12 to 14, 19 to 21), and the 20c per page
 * and $7.60 amounts the regulations give in dollars. GST may be added (reg 15).
 * The manager registration fees from 25 Nov 2026 are in PENDING_CHANGES.
 */
export const FEES_IN_FEE_UNITS = {
  /** Reg 12: the first record 1.15 fee units plus 20c per printed page; each additional record in the same request $7.60 plus 20c per page. */
  recordCopy: { firstRecordFeeUnits: 1.15, additionalRecordCents: 760, perPrintedPageCents: 20, provision: "OCR reg 12" },
  /** Reg 13: a register copy capped at 3.03 fee units plus 20c per printed page. */
  registerCopy: { feeUnits: 3.03, perPrintedPageCents: 20, provision: "OCR reg 13" },
  /**
   * Regs 14, 15: the owners corporation certificate fee cap by business days to
   * issue, and the additional certificate for the same applicant where the
   * owners corporations share a manager. The same caps apply through an
   * intermediary.
   */
  certificate: {
    withinBusinessDays: { 2: 17.35, 5: 14.46, 10: 9.64 },
    additionalWithinBusinessDays: { 2: 9.54, 5: 7.95, 10: 5.3 },
    bands: "issued within 2 business days; within 3 to 5; within 6 to 10",
    provision: "OCR regs 14, 15",
  },
  /** Regs 19 to 21, in force now. */
  managerRegistration: MANAGER.registrationFeeUnits,
  gstMayBeAdded: true,
  source: `${OCR} regs 12 to 15, 19 to 21`,
  status: "CONFIRMED" as RuleStatus,
} as const;

/**
 * The dollar value of a fee unit, by financial year (from 1 July). The
 * 2026-27 value is from the Department of Treasury and Finance notice, also
 * stated by CAV (GUIDANCE).
 */
export const FEE_UNIT_VALUES = {
  "2026-27": { centsPerFeeUnit: 1_727, from: "2026-07-01", status: "GUIDANCE" as RuleStatus, source: `${DTF_FEE_UNIT}; ${CAV_FEES}` },
} as const;

/**
 * The researcher's calculation of the dollar caps (fee units × the year's fee
 * unit value), excluding GST. NOT official figures: CAV publishes fee units
 * only, and the Monetary Units Act rounding rules were not checked. Never show
 * these to people as published amounts.
 */
export const FEE_DOLLARS_CALCULATED = {
  "2026-27": {
    recordCopyFirstRecordCents: 1_986,
    registerCopyCents: 5_233,
    certificateWithinBusinessDaysCents: { 2: 29_963, 5: 24_972, 10: 16_648 },
    additionalCertificateWithinBusinessDaysCents: { 2: 16_476, 5: 13_730, 10: 9_153 },
  },
  official: false,
  calculatedBy: "the researcher, from fee units × $17.27",
  roundingRulesChecked: false,
  excludesGst: true,
  status: "NOT_CONFIRMED" as RuleStatus,
  source: "calculated (research notes, sections N and O)",
} as const;

// ---------------------------------------------------------------------------
// O. Owners corporation certificate
// ---------------------------------------------------------------------------

/** The owners corporation certificate (OCA s 151; OCR regs 14 to 17, Sch 3). */
export const OWNERS_CORPORATION_CERTIFICATE = {
  /** "Any person", in writing (electronic allowed), with the fee the owners corporation determines, not more than the prescribed fee (s 151(1), (2)). */
  whoMayApply: "any person",
  inWriting: true,
  /** "within 10 business days after it receives an application and fee" (s 151(3)). */
  withinBusinessDays: 10,
  /** Prescribed contents (s 151(4)(a); OCR reg 16). */
  contents: [
    "current fees and the paid-to date",
    "unpaid fees",
    "special fees struck and due dates",
    "works likely to add charges",
    "insurance details (company, policy number, type, buildings, building amount, public liability amount, renewal)",
    "any s 63 own-insurance resolution date",
    "total funds held",
    "other liabilities",
    "contracts, leases, licences and agreements on common property",
    "service agreements",
    "unsatisfied notices and orders from the last 12 months",
    "legal proceedings and likely proceedings",
    "manager appointed, and their name and address",
    "any administrator, appointed or proposed",
    "minutes of the most recent AGM",
  ],
  /** Attachments (s 151(4)(b); OCR reg 17, Sch 3). */
  attachments: [
    "rules as recorded (consolidated if amended)",
    "the prescribed statement for purchasers (OCR Sch 3)",
    "all resolutions of the last AGM",
    "other prescribed documents",
    "a statement that more information is available by inspecting the register",
  ],
  /** Fee caps in FEES_IN_FEE_UNITS.certificate; calculated dollars in FEE_DOLLARS_CALCULATED (NOT_CONFIRMED). */
  feeCapFeeUnits: FEES_IN_FEE_UNITS.certificate,
  /** Charging more than the prescribed fee is an offence: 60 penalty units (s 151(5)). */
  overchargingPenaltyUnits: 60,
  /**
   * A separate certificate may be given for each owners corporation affecting
   * a lot, and an unlimited owners corporation may issue on behalf of a
   * limited one (SA s 27C(5) example): CONFIRMED. A separate fee for each
   * (CAV): GUIDANCE.
   */
  separateCertificatePerOwnersCorporation: true,
  separateFeePerOwnersCorporation: { value: true, status: "GUIDANCE" as RuleStatus, source: CAV_FEES },
  /** Services only owners corporations are exempt from Part 9 Div 3 (s 8(b)(iii)). */
  servicesOnlyExempt: true,
  /**
   * GUIDANCE (CAV): a vendor "must include an owners corporation certificate
   * and accompanying documents in the Section 32 statement". The Sale of Land
   * Act s 32 text was not read (NOT_CONFIRMED). CLAA 2026 Part 9 Div 1 is
   * pending (PENDING_CHANGES).
   */
  vendorStatement: { mustIncludeCertificate: true, status: "GUIDANCE" as RuleStatus, saleOfLandActTextStatus: "NOT_CONFIRMED" as RuleStatus, source: CAV_RECORDS },
  source: `${OCA} ss 8(b)(iii), 151; ${OCR} regs 14 to 17, Sch 3; ${SA} s 27C(5)`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// P. Disputes
// ---------------------------------------------------------------------------

/** Disputes (notes section P). */
export const DISPUTES = {
  /** An owner, occupier or manager may complain about a breach by an owner, occupier or manager, in writing in the approved form; not for personal injury or fee recovery (s 152). */
  internalComplaint: { by: ["owner", "occupier", "manager"], approvedForm: true, notFor: ["personal injury", "fee recovery"] },
  /** The owners corporation must not act or apply to VCAT on a complaint until the rules' dispute process has been followed and has not resolved it; it needs reasonable grounds to believe there was a breach (s 153(3), (4)). */
  rulesProcessFirst: true,
  /**
   * Model rule process (OCR Sch 2 rule 7): a written statement in the
   * approved form to the grievance committee or the owners corporation; the
   * parties meet "within 28 calendar days after the dispute comes to the
   * attention of all the parties" (in person or by video); they may appoint a
   * representative; expert evidence if the cost is agreed; then told of their
   * Part 10 rights. The fee notice form says 14 days (FEE_NOTICES).
   */
  modelRule: { meetWithinCalendarDays: 28, inPersonOrVideo: true, mayAppointRepresentative: true, expertEvidenceIfCostAgreed: true, provision: "OCR Sch 2 rule 7" },
  /** A decision not to act: written notice with reasons to the complainant (s 154). */
  decisionNotToActWithReasons: true,
  /** Notice to rectify (s 155): approved form; rectify within 28 days after the date of the notice; a copy to the lot owner if the person is an occupier. */
  noticeToRectifyDays: 28,
  /** Next steps (s 156): more time, a final notice, or drop the matter; notify the complainant and the person. */
  afterNoticeToRectify: ["give more time", "give a final notice", "drop the matter"],
  /** Final notice (s 157): approved form; rectify within 28 days after the date of the notice, or the owners corporation may apply to VCAT. */
  finalNoticeDays: 28,
  /** Service (s 158): post to the lot (occupier), personal delivery, the lot's letterbox, an occupier apparently over 16, or a nominated address; electronic service allowed (note). */
  service: ["post to the lot (occupier)", "personal delivery", "the lot's letterbox", "an occupier apparently over 16", "a nominated address", "electronic service"],
  /** AGM report on complaints, without identifying people (s 159). */
  agmReportWithoutIdentifyingPeople: true,
  /**
   * Short-stay conduct (ss 159A to 159F, 169A to 169H): a separate complaint
   * path; VCAT may make prohibition orders after 3 notices in 24 months
   * (s 169D), award compensation up to $2,000 per occupier per breach
   * (s 169E) and impose civil penalties up to $1,100 (s 169G).
   */
  shortStay: { prohibitionAfterNotices: 3, withinMonths: 24, compensationMaxCentsPerOccupierPerBreach: 200_000, civilPenaltyMaxCents: 110_000 },
  /** Any person may complain to the Director, who may refer a dispute for conciliation or mediation by a consumer affairs employee (ss 160, 161). */
  directorConciliation: true,
  /** GUIDANCE: DSCV is voluntary, needs all parties' agreement, and is not a prerequisite to VCAT. The Act refers to Director conciliation, not to DSCV by name. */
  dscv: { voluntary: true, needsAllParties: true, prerequisiteToVcat: false, status: "GUIDANCE" as RuleStatus, source: `${CAV_DISPUTES}; ${CAV_FORMS}` },
  /** VCAT powers (s 165, among others). */
  vcatOrders: [
    "do or refrain from doing something",
    "comply with the Act",
    "money (debt, damages including exemplary damages and interest, restitution)",
    "recovery costs",
    "vary or void contract terms",
    "declarations",
    "appoint a committee",
    "appoint or remove the chairperson, secretary or members",
    "appoint, remove or restrict a manager",
    "orders on damaged buildings and insurance money",
    "recording orders and amending the Register",
    "entry orders",
  ],
  /** Interim orders (s 165(3)); civil penalty up to $1,100 for a rule breach (s 166); administrator (ss 173 to 177); exemptions (ss 170, 171); authorising a lot owner to sue for the owners corporation (ss 169I, 169J). */
  vcatRuleBreachCivilPenaltyMaxCents: 110_000,
  source: `${OCA} ss 152 to 161, 159A to 159F, 165, 166, 169A to 169J, 170 to 177; ${OCR} Sch 2 rule 7`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// Q. Terminology and rules
// ---------------------------------------------------------------------------

/**
 * Victoria's words for the things the platform names (notes section Q). The
 * shared keys are those SharedTerminology lists; the rest are Victoria's own.
 */
export const TERMINOLOGY = {
  /** OCA s 3. CAV adds "(formerly body corporate)". */
  ownersCorporation: "owners corporation",
  committee: "committee",
  act: "Owners Corporations Act 2006",
  /** The research notes' abbreviation. */
  actShort: "OCA",
  jurisdictionShort: "Vic",
  /** Victorian Civil and Administrative Tribunal (Part 11). CAV calls its list the Owners Corporations List (GUIDANCE). */
  tribunal: "VCAT",
  /** The Act's words: "annual fees" (s 23), "special fees and charges" (s 24). It does not use "levy" as a defined term. */
  levy: "fee",
  levies: "fees",
  /** What s 29 charges on an overdue amount. */
  lateCharge: "interest",
  /** "plan of subdivision" has the meaning of "plan" in the Subdivision Act (OCA s 3). */
  planLabel: "Plan of subdivision",
  /**
   * GUIDANCE only: no statutory name format was found; CAV's example is
   * "owners corporation No 1 PS12345". `{ocNumber}` is the owners
   * corporation's number on the plan, which the shared name tokens ({plan},
   * {name}) do not cover yet (FOR_REVIEW).
   */
  bodyCorporateName: "owners corporation No {ocNumber} {plan}",
  bodyCorporateShortName: "owners corporation No {ocNumber} {plan}",
  bodyCorporateNameStatus: "GUIDANCE" as RuleStatus,
  officers: ["chairperson", "secretary"],
  manager: "manager",
  /** Registered under Part 12. */
  registeredManager: "registered manager",
  owner: "lot owner",
  occupier: "occupier",
  annualFees: "annual fees",
  specialFees: "special fees and charges",
  /** Section 31 and 32 terms; the approved form titles are "Owners corporation fee notice" and "Owners corporation final fee notice". */
  feeNotice: "fee notice",
  finalNotice: "final notice",
  feeNoticeFormTitle: "Owners corporation fee notice",
  finalNoticeFormTitle: "Owners corporation final fee notice",
  lotEntitlement: "lot entitlement",
  lotLiability: "lot liability",
  scheme: "plan of subdivision",
  /** Part 8 rules; model rules in OCR Sch 2. */
  rules: ["rules", "model rules"],
  register: "owners corporation register",
  certificate: "owners corporation certificate",
  ownersCorporationKinds: ["unlimited owners corporation", "limited owners corporation"],
  tiers: ["tier one owners corporation", "tier two owners corporation", "tier three owners corporation", "tier four owners corporation", "tier five owners corporation"],
  /** The Registrar of Titles records rules and plan changes; CAV calls it "Land Use Victoria". */
  registrar: "Registrar",
  generalMeetings: ["annual general meeting", "special general meeting"],
  source: `${OCA} ss 3, 7, 23, 24, 31, 32, 98, 99, 119, 138 to 143, 147, 151, Part 5, Part 11; ${OCR} reg 11, Sch 2; ${SA} ss 27, 33; ${CAV_WHAT_IS}`,
} as const satisfies SharedTerminology & Record<string, unknown>;

/** The owners corporation's rules (notes section Q, "Rules"). */
export const OWNERS_CORPORATION_RULES = {
  /** Made, amended or revoked by special resolution (or a s 97 interim special resolution). */
  madeBy: ["SPECIAL", "INTERIM_SPECIAL"],
  /** A rule must concern control, management, administration, use or enjoyment of common property or lots. */
  mustConcern: ["control", "management", "administration", "use or enjoyment of common property or lots"],
  /** Takes effect only when the Registrar records it (s 142(4)). */
  effectiveWhenRecordedByRegistrar: true,
  /** Oppressive rules, or rules inconsistent with law, have no effect (s 140). */
  oppressiveOrInconsistentHaveNoEffect: true,
  /** Since 1 Jan 2025, rules may prohibit short-stay use of lots, except where the provider occupies the lot as their principal place of residence (Sch 1 item 5.5). */
  mayProhibitShortStay: { from: "2025-01-01", exceptPrincipalPlaceOfResidence: true },
  /** Model rules (OCR Sch 2) apply where the owners corporation has made no rules, or fill gaps (OCR reg 11). */
  modelRulesApplyWhereNoneOrGaps: true,
  source: `${OCA} ss 138 to 143, Sch 1 item 5.5; ${OCR} reg 11, Sch 2`,
  status: "CONFIRMED" as RuleStatus,
} as const;

// ---------------------------------------------------------------------------
// R. Hardship and payment plan information on fee notices
// ---------------------------------------------------------------------------

/**
 * Hardship information on fee notices (notes section R). The Act requires only
 * the s 31(2) items; payment-plan wording becomes a statutory item only when
 * new s 31(2)(ab) commences (PENDING_CHANGES). The current approved forms
 * carry hardship and disputes sections (GUIDANCE); their text is not held here.
 */
export const HARDSHIP_ON_NOTICES = {
  statutoryItemsNow: FEE_NOTICES.feeNotice.mustState,
  paymentPlanWordingStatutoryOnlyFromPending: "CLAA_2026_PAYMENT_PLANS",
  statutoryStatus: "CONFIRMED" as RuleStatus,
  /**
   * The approved forms' section headed "Payment Plans and financial
   * hardship": contact the owners corporation and manager "as soon as
   * possible" and ask for a payment plan; the National Debt Helpline strata
   * levies guide; free financial counselling. A "Disputes" section covers
   * internal dispute resolution, DSCV and VCAT. The final fee notice has the
   * same sections.
   */
  approvedForms: {
    hardshipSectionTitle: "Payment Plans and financial hardship",
    helplineName: "National Debt Helpline",
    helplinePhone: "1800 007 007",
    helplineWeb: "ndh.org.au",
    disputesSectionCovers: ["internal dispute resolution", "DSCV", "VCAT"],
    sameSectionsOnFinalNotice: true,
    formTextHeldInPack: false,
    appliedFromStatus: FEE_NOTICES.approvedForms.appliedFrom.status,
    status: "GUIDANCE" as RuleStatus,
    source: CAV_FORMS,
  },
  source: `${OCA} s 31(2); ${CLAA} s 38; ${CAV_FORMS}`,
} as const;

// ---------------------------------------------------------------------------
// Act over guidance, changes, and the review lists
// ---------------------------------------------------------------------------

/**
 * Where official guidance differs from the Act or Regulations. The pack
 * follows the Act (or the Regulations) in each case. `kind` is CONFLICT where
 * the notes record a discrepancy, and PARAPHRASE where guidance only words the
 * rule loosely (the notes do not call it a discrepancy).
 */
export const GUIDANCE_CONFLICTS = [
  {
    key: "COMMITTEE_THRESHOLD",
    kind: "CONFLICT",
    guidance: "CAV's AGM page says \"13 or more lots\"; CAV's tiers page says \"Tier 1, 2 and 3 must\".",
    law: "An owners corporation affecting 10 or more lots must elect a committee, counting all lots (s 100).",
    packFollows: "s 100: 10 or more lots, counting all lots",
    source: `${OCA} s 100; ${CAV_AGM}; ${CAV_TIERS}`,
  },
  {
    key: "INTERIM_SPECIAL_PETITION",
    kind: "CONFLICT",
    guidance: "CAV says the petition threshold is \"25 per cent of the total lot entitlements\".",
    law: "Owners holding \"more than 25% of the total votes for all the lots\" (s 97(4), (5)).",
    packFollows: "s 97: more than 25% of the total votes",
    source: `${OCA} s 97; ${CAV_VOTING}; ${CAV_AGM}`,
  },
  {
    key: "INTERIM_ORDINARY_RESOLUTIONS",
    kind: "CONFLICT",
    guidance: "CAV describes a 25% petition against interim ordinary resolutions.",
    law: "An interim resolution is stopped by notice of a special general meeting within 29 days (s 78(2) to (4)).",
    packFollows: "s 78: notice of a special general meeting",
    source: `${OCA} s 78; ${CAV_VOTING}`,
  },
  {
    key: "QUORUM_PARAPHRASE",
    kind: "PARAPHRASE",
    guidance: "CAV paraphrases the quorum as \"50 per cent of the total votes or lot entitlements\".",
    law: "At least 50% of the total number of lots, or failing that 50% of the total lot entitlement (s 77).",
    packFollows: "s 77",
    source: `${OCA} s 77; ${CAV_AGM}`,
  },
  {
    key: "MODEL_DISPUTE_MEETING",
    kind: "CONFLICT",
    guidance: "The approved fee notice form says the meeting \"must be held within 14 days\".",
    law: "\"within 28 calendar days after the dispute comes to the attention of all the parties\" (OCR Sch 2 rule 7(5)).",
    packFollows: "OCR Sch 2 rule 7(5): 28 calendar days (which governs is NOT_CONFIRMED)",
    source: `${OCR} Sch 2 rule 7(5); ${CAV_FORMS}`,
  },
  {
    key: "PRESCRIBED_OWNERS_CORPORATION",
    kind: "CONFLICT",
    guidance: "CAV's insurance and financial management pages still use the repealed \"prescribed owners corporation\" for valuation and audit.",
    law: "Since 1 Dec 2021 these are tier-based: s 65 applies to tiers 1 to 4; s 35 audit to tier 1.",
    packFollows: "ss 35, 65 by tier",
    source: `${OCA} ss 35, 65; ${CAV_INSURANCE}; ${CAV_FINANCIAL}`,
  },
  {
    key: "MANAGER_CONTRACT_FORM",
    kind: "CONFLICT",
    guidance: "The planning pass said the approved form was optional.",
    law: "\"An instrument or contract of appointment must be in the approved form\" (s 119(3)).",
    packFollows: "s 119(3): the approved form is required",
    source: `${OCA} s 119(3)`,
  },
] as const;

/** Changes since 2024 (notes section S). Pending changes are in PENDING_CHANGES. */
export const CHANGES = [
  { instrument: "Building Legislation Amendment Act 2023 (No. 11/2023) s 55", change: "OCA s 67(1)(da): the building manual must be given at the first meeting", commenced: "2024-02-01", status: "CONFIRMED" as RuleStatus },
  { instrument: "Short Stay Levy Act 2024 (No. 40/2024) ss 24 to 30", change: "short-stay definitions and headings; new Sch 1 item 5.5 lets rules prohibit short-stay use, except a principal place of residence", commenced: "2025-01-01", status: "CONFIRMED" as RuleStatus },
  { instrument: "CAV approved fee notice and final fee notice forms", change: "added payment plan, financial hardship and disputes information", commenced: null, commencedGuidance: "April 2025 (exact date not confirmed)", status: "GUIDANCE" as RuleStatus },
  { instrument: "HSRA 2025 (No. 6/2025) ss 111, 112", change: "regulation powers for courses and CPD; new OCA Part 15 transitional ss 211 to 213 (deadlines 30 Jun 2027 and 1 Aug 2027)", commenced: "2025-11-25", status: "CONFIRMED" as RuleStatus },
  { instrument: "Consumer Legislation Amendment Act 2025 (No. 46/2025) ss 29 to 31", change: "new s 198C (BLA mandatory CPD activities); regulation power s 204(1)(eaa); \"externally administered body corporate\" wording", commenced: "2025-11-26", status: "CONFIRMED" as RuleStatus },
  { instrument: "Owners Corporations (Education) Regulations 2026 (SR 54/2026)", change: "education and CPD detail (text not read)", commenced: "2026-05-26", status: "GUIDANCE" as RuleStatus },
  { instrument: "CLAA 2026 (No. 36/2026) Part 6 Div 1 (s 32)", change: "substituted OCA s 18 (AUTHORITY_TO_SUE)", commenced: "2026-09-09", status: "CONFIRMED" as RuleStatus },
  { instrument: "CLAA 2026 Part 10 (s 114)", change: "SA s 34D(3)(ba): VCAT may consent to plan alterations with majority support plus a benefit test", commenced: "2026-09-09", status: "CONFIRMED" as RuleStatus },
  { instrument: "OCA s 210", change: "review of the 2021 amendments; the section is repealed 1 Dec 2027", commenced: null, status: "CONFIRMED" as RuleStatus },
  { instrument: "OCR sunset", change: "the Regulations sunset on 10 Oct 2028, so a remake is expected", commenced: null, sunset: "2028-10-10", status: "CONFIRMED" as RuleStatus },
  { instrument: "SA Version 084 (1 Jul 2026)", change: "not checked", commenced: "2026-07-01", status: "NOT_CONFIRMED" as RuleStatus },
] as const;

// ---------------------------------------------------------------------------
// Dated rules
// ---------------------------------------------------------------------------

type PendingChange = (typeof PENDING_CHANGES)[number];

/** A pending change, by key. */
function pendingChange<K extends PendingChange["key"]>(key: K): Extract<PendingChange, { key: K }> {
  const change = PENDING_CHANGES.find((c) => c.key === key);
  if (!change) throw new Error(`No pending change ${key}`);
  return change as Extract<PendingChange, { key: K }>;
}

/**
 * A pending change restated as a dated value, with its legal status, dates,
 * commencement, source and status copied from PENDING_CHANGES unchanged.
 */
function pendingValue<T>(change: PendingChange, value: T, source: string = change.source): DatedValue<T> {
  if (change.legalStatus === "ANNOUNCED_NO_LEGISLATION") {
    return { legalStatus: change.legalStatus, value, commencement: change.commencement, source, status: change.status, pendingChange: change.key };
  }
  return {
    legalStatus: change.legalStatus,
    value,
    commencedOn: change.commencedOn,
    fixedStartDate: change.fixedStartDate,
    latestStartDate: change.latestStartDate,
    commencement: change.commencement,
    source,
    status: change.status,
    pendingChange: change.key,
  };
}

/**
 * The rules that change on a date (VIC, ACT and WA stage 2, PR 1), read with
 * `ruleInForceOn` (src/lib/jurisdiction/dated-rules.ts). Every PENDING_CHANGES
 * entry is restated here, so the pending law check covers each one. No value
 * or status is changed: the in-force values are the ones above, and the
 * pending ones are copied from PENDING_CHANGES.
 *
 * An in-force value starts on the day the version the notes read came into
 * force (OCA Version 024, 9 Sep 2026; OCR Version 002, 1 Dec 2021), not the day
 * the rule was first made: earlier versions were not read, so a day before
 * that has no value and the reader refuses it. Where the pack records no
 * in-force value before a change (payment plans, the s 29(1A) pause), the
 * rule has none, and the reader gives none until the change is recorded as
 * commenced. The payment order records NO_STATUTORY_RULE before s 32I. Once a
 * change's fixed or latest start date passes without a recorded commencement,
 * the reader refuses the rule until the pack is checked and bumped
 * (FOR_REVIEW FIXED_DATE_COMMENCEMENT). Only PROXY_LIMIT is read so far, by the
 * proxy caps (PROXY_RULES, stage 2, PR 8b-iv), on the meeting's day.
 */
export const DATED_RULES = {
  /**
   * The s 89D proxy limit, both values in one shape: in force by occupiable
   * lots; one lot owner whatever the count once CLAA 2026 Part 6 Div 2
   * commences.
   */
  PROXY_LIMIT: {
    title: "Proxy limit",
    versions: [
      {
        legalStatus: "IN_FORCE",
        from: "2026-09-09",
        value: {
          maxLotOwners: PROXIES.limit.maxLotOwnersWhenAtOrBelowThreshold,
          aboveThreshold: {
            occupiableLotsMoreThan: PROXIES.limit.occupiableLotsThreshold,
            maxPercentOfLotOwners: PROXIES.limit.maxPercentOfLotOwnersWhenAboveThreshold,
            counts: PROXIES.limit.counts,
            roundingStatus: PROXIES.limit.roundingStatus,
          },
          exceptions: PROXIES.limit.exceptions,
          exceptionsStatus: PROXIES.status,
        },
        source: `${OCA} s 89D (Version 024, in force 9 Sep 2026); ${OCR} reg 8A`,
        status: PROXIES.status,
      },
      pendingValue(pendingChange("CLAA_2026_PROXY_LIMIT"), {
        maxLotOwners: pendingChange("CLAA_2026_PROXY_LIMIT").rules.maxLotOwners,
        aboveThreshold: null,
        // The notes say only that the s 89D(2) exceptions are not amended. They do not say which of the
        // exceptions in force (family members; the OCR reg 8A cases) sit in s 89D(2), so that each carries over is NOT_CONFIRMED.
        exceptions: PROXIES.limit.exceptions,
        exceptionsStatus: "NOT_CONFIRMED" as RuleStatus,
      }),
    ],
    note: "maxLotOwners is the limit for every meeting, or at or below the occupiable lots threshold where aboveThreshold is given.",
  },
  /** Manager registration fees in fee units: OCR regs 19 to 21 in force; SR 53/2026's from 25 Nov 2026 once recorded as commenced. */
  MANAGER_REGISTRATION_FEE_UNITS: {
    title: "Manager registration fees (fee units)",
    versions: [
      { legalStatus: "IN_FORCE", from: "2021-12-01", value: MANAGER.registrationFeeUnits, source: `${OCR} regs 19 to 21 (Version 002, in force 1 Dec 2021)`, status: MANAGER.status },
      pendingValue(pendingChange("SR_53_2026_MANAGER_FEES"), pendingChange("SR_53_2026_MANAGER_FEES").rules.feeUnits),
    ],
    note: "The officer in effective control fee (new reg 20(2), from 30 Jun 2027) stays in PENDING_CHANGES only.",
  },
  /**
   * The order a payment is applied in. Before s 32I: no statutory order, as
   * the notes record none (NOT_CONFIRMED, NOT_CONFIRMED list). Then the s 32I
   * order, for all owners corporations. The order StrataVerze applies until
   * then is PAYMENT_ALLOCATION_ORDER (a StrataVerze choice, 28 Oct 2026).
   */
  PAYMENT_ALLOCATION_ORDER: {
    title: "Order a payment is applied in",
    versions: [
      {
        legalStatus: "IN_FORCE",
        from: "2026-09-09",
        value: "NO_STATUTORY_RULE" as NoStatutoryRule,
        source: `${OCA} (Version 024, in force 9 Sep 2026, read in full): the notes record no order before s 32I commences`,
        status: "NOT_CONFIRMED" as RuleStatus,
      },
      pendingValue(
        pendingChange("CLAA_2026_PAYMENT_PLANS"),
        pendingChange("CLAA_2026_PAYMENT_PLANS").rules.paymentAllocationOrder,
        `${CLAA} ss 2(3), (6), 40 (new OCA s 32I)`,
      ),
    ],
  },
  /** The new s 29(1A) pause on interest. The pack records none in force. */
  INTEREST_PAUSE: {
    title: "No interest during a payment plan request or plan",
    versions: [pendingValue(pendingChange("CLAA_2026_INTEREST_PAUSE"), pendingChange("CLAA_2026_INTEREST_PAUSE").rules)],
  },
  PAYMENT_PLANS: {
    title: "Payment plans",
    versions: [pendingValue(pendingChange("CLAA_2026_PAYMENT_PLANS"), pendingChange("CLAA_2026_PAYMENT_PLANS").rules)],
  },
  ARREARS_CARVE_OUTS: {
    title: "Not in arrears with a payment plan request or plan",
    versions: [pendingValue(pendingChange("CLAA_2026_ARREARS_CARVE_OUTS"), pendingChange("CLAA_2026_ARREARS_CARVE_OUTS").rules)],
  },
  PRIVACY: {
    title: "Privacy of owner information",
    versions: [pendingValue(pendingChange("CLAA_2026_PRIVACY"), pendingChange("CLAA_2026_PRIVACY").rules)],
  },
  OTHER_DIV2: {
    title: "Seal witness and the Part 12 correction",
    versions: [pendingValue(pendingChange("CLAA_2026_OTHER_DIV2"), pendingChange("CLAA_2026_OTHER_DIV2").rules)],
  },
  MANAGER_EDUCATION: {
    title: "Manager education reforms",
    versions: [pendingValue(pendingChange("HSRA_2025_MANAGER_EDUCATION"), pendingChange("HSRA_2025_MANAGER_EDUCATION").rules)],
  },
  SALE_OF_LAND: {
    title: "Vendor's statements: when made available",
    versions: [pendingValue(pendingChange("CLAA_2026_SALE_OF_LAND"), pendingChange("CLAA_2026_SALE_OF_LAND").rules)],
  },
  MANAGER_LICENSING: {
    title: "Manager licensing scheme (announced)",
    versions: [pendingValue(pendingChange("MANAGER_LICENSING_ANNOUNCEMENT_2026"), pendingChange("MANAGER_LICENSING_ANNOUNCEMENT_2026").rules)],
  },
} as const satisfies DatedRules;

/**
 * Proxy caps (stage 2, PR 8b-iv, 29 Oct 2026), warned only, never refused
 * (Matthew Wrigley's decisions D15 to D17 of 29 Oct 2026, DECISIONS, kept in
 * FOR_REVIEW PROXY_CAPS). The s 89D limit is read on the meeting's day (or
 * today where the proxy has no meeting date) from DATED_RULES.PROXY_LIMIT:
 * 1 lot owner where there are 20 or fewer occupiable lots, otherwise no more
 * than 5% of the lot owners (D16: the distinct owners recorded, or the lots
 * where any lot has no owner recorded), and 1 lot owner always once CLAA 2026
 * Part 6 Div 2 is recorded as commenced. Where the reader refuses (its latest
 * start date has passed with no commencement recorded) the warning says the
 * limit cannot be told. How 5% is rounded is NOT_CONFIRMED (D15), and where
 * 5% is less than 1 proxy no floor is applied (s 89D sets none; review M2,
 * FOR_REVIEW PROXY_CAPS). An owner in
 * arrears may not act as a proxy (s 89C(10)): a holder whose email matches an
 * owner of a lot owing money on the day is warned of (D17).
 */
export const PROXY_RULES: ProxyRules = {
  datedLimit: DATED_RULES.PROXY_LIMIT,
  shareOf: "LOT_OWNERS",
  exceptWords: `to ${PROXIES.limit.exceptions.slice(0, -1).join(", ")} or ${PROXIES.limit.exceptions[PROXIES.limit.exceptions.length - 1]} (${OCR} reg 8A)`,
  roundingStatus: PROXIES.limit.roundingStatus,
  holderInArrears: {
    words: `An owner in arrears may not act as a proxy (${OCA} s 89C(10)).`,
    source: `${OCA} s 89C(10)`,
    status: "STRATAVERZE",
  },
  source: `${OCA} ss 89C(10), 89D; ${OCR} reg 8A`,
  status: "STRATAVERZE",
};

/*
 * The meeting rules in the shared shape (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026), from MEETINGS, RESOLUTIONS, ARREARS and RECORDS. Each
 * resolution rule carries its source and status; MEETING_RULES_STATUS gives
 * those of the other parts. What the count at a meeting records and refuses:
 * - an ordinary resolution: a majority of the votes cast, by lot entitlement
 *   on a poll (s 89). Whether the meeting had a quorum is the chair's answer
 *   for the item (quorumAttestation, since stage 2, PR 8a-ii, 29 Oct 2026),
 *   never worked out or assumed: not answered, the count is refused; "no",
 *   a count that carries is an interim resolution (s 78), recorded as
 *   pending since stage 2, PR 8b-i (below), and one that fails is recorded
 *   as lost; a "no" the votes counted contradict (half of all lots counted)
 *   is refused. Equal votes are refused (the casting vote of s 89A is not
 *   recorded);
 * - a special resolution: 75% of all lots for, debtors included as they may
 *   vote on it (ss 89B, 96). Where it fails it may pass as an interim special
 *   resolution (s 97), recorded as pending since stage 2, PR 8b-i (below).
 *   Its second route needs at least 1 vote for (StrataVerze's reading of
 *   s 97(1A), for review);
 * - a unanimous resolution: every lot for (s 95);
 * - a poll is taken on an ordinary resolution only (a StrataVerze choice);
 * - common property rows are not counted as lots.
 * - an item with no resolution category cannot be recorded as resolved at a
 *   general meeting, since nothing counts it (a StrataVerze choice).
 * Since stage 2, PR 8a-ii (29 Oct 2026): a tier 5 owners corporation (2-lot
 * and services only, ss 7A, 8) is not counted at all, and neither is one
 * whose tier cannot be worked out (countingRefusedWhen, which fails closed):
 * every outcome but a deferral is refused, whatever the item. With 2 lots or
 * fewer a failed special resolution is still never tested as an interim
 * special resolution (a second line of defence). The arrears rule (s 89B)
 * applies to tiers 1 to 4 only (debtorRuleAppliesWhen; s 7A), and where the
 * tier cannot be worked out it applies (it fails closed).
 * Since stage 2, PR 8b-i (29 Oct 2026, Matthew Wrigley's decisions D1 to D4,
 * D7 and D10, DECISIONS): an interim special resolution (s 97) and an interim
 * resolution of a meeting without a quorum (s 78) are recorded at the meeting
 * as pending (pendingResolutions), the item stored as INTERIM, and decided
 * later. Each is made on the later of the meeting's day and the day it is
 * recorded, in the building's time zone; a petition or notice may arrive up
 * to and including 29 days after that, and it takes effect the next day, as
 * a special resolution for s 97, once its 14-day notice to the owners is
 * recorded as given (a late notice is flagged, not moved). A petition
 * (s 97(5)) signed for more than 25% of all lots stops an interim special
 * resolution, recorded as lost. Notice of a special general meeting within
 * the 29 days (s 78(4)) stops an interim resolution taking effect: the
 * meeting must be held within 28 days of the notice and its decision
 * recorded (confirmed: carried; not confirmed: lost); if it is not held by
 * then, the resolution takes effect the next day; if it was held and its
 * decision is not recorded, it never takes effect on its own. A pending item
 * cannot be recorded again, deferred or deleted. Matthew Wrigley's decision
 * of 29 Oct 2026 (review M1, DECISIONS): the daily run records it as having
 * taken effect only 7 days after the period (or the day the special general
 * meeting must be held by) ends (settleAfterGraceDays), so a petition or
 * notice received in time can still be recorded; the day it takes effect does
 * not move.
 * Since stage 2, PR 8b-iii (29 Oct 2026, Matthew Wrigley's decisions D12 and
 * D14, DECISIONS): a committee meeting's notice (at least 3 business days, or
 * as the owners corporation decides, s 109) is not checked, because
 * "business day" and a public holiday source are not decided: counting
 * Monday to Friday would overstate the business days around a public
 * holiday, which is the unsafe direction. Such a notice is stored as not
 * compliant with no period (noticeNotCheckedFor) and shown as "Notice period
 * not checked", never as met. The 4 business days of s 89B (a payment other
 * than cash) stay not applied for the same reason.
 * Since stage 2, PR 8b-iv (29 Oct 2026, Matthew Wrigley's decision D18,
 * DECISIONS): the minutes give the votes counted at each item from the count
 * recorded at the meeting (s 81: "voting"), and for an item decided later
 * what it is, the day its period ends, the day it took or may take effect and
 * where it stands (minutesContents). The attendance parts of s 81 (owners
 * present, owners who gave proxies, proxies present) wait for attendance to
 * be recorded (Stage C).
 */

/** Days of grace before the daily run records a period's end (Matthew Wrigley's decision of 29 Oct 2026, review M1). */
const PENDING_SETTLE_GRACE_DAYS = 7;

const VIC_TIE =
  `The votes are equal. A chair who is a lot owner or a proxy has a casting vote, and without it the resolution is not passed (${OCA} s 89A). StrataVerze does not record who chaired or a casting vote yet, so the count cannot decide it`;

const VIC_TWO_LOT_INTERIM =
  `An owners corporation of 2 lots cannot pass an interim special resolution, and its special resolution means a unanimous one (${OCA} s 7A). StrataVerze does not apply the rules for 2-lot owners corporations yet, so the count cannot decide it`;

const VIC_TIER_5 =
  `This owners corporation is tier 5 (a 2-lot subdivision or services only). It is exempt from many of the meeting and resolution rules (${OCA} ss 7A, 8), and for it a special resolution means a unanimous one. StrataVerze does not apply the rules for tier 5 owners corporations yet, so its votes cannot be counted`;

const VIC_GENERAL_QUORUM = {
  basis: "PERCENT_OF_LOTS_ELSE_ENTITLEMENT",
  percent: MEETINGS.quorum.percentOfTotalLots,
  otherwisePercentOfEntitlement: MEETINGS.quorum.otherwisePercentOfTotalLotEntitlement,
  source: `${OCA} s 77`,
  status: "CONFIRMED",
} as const;

export const MEETING_RULES: MeetingRuleSet = {
  state: "VIC",
  version: "VIC-2026.1",
  effectiveFrom: "2026-10-28",
  // Whole days only: the committee's 3 business days (s 109) are not held. Since stage 2, PR 8b-iii its notice is
  // recorded as not checked (noticeNotCheckedFor, decisions D12 and D14).
  noticePeriods: { AGM: MEETINGS.agmNoticeDays, FIRST_AGM: MEETINGS.agmNoticeDays, EGM: MEETINGS.sgmNoticeDays },
  // No deadline for ordinary minutes was found (NOT_CONFIRMED); only interim resolutions have one (s 78), 8b.
  minutesDeadlines: {},
  quorumRules: {
    AGM: VIC_GENERAL_QUORUM,
    EGM: VIC_GENERAL_QUORUM,
    FIRST_AGM: VIC_GENERAL_QUORUM,
    COMMITTEE: { basis: "HALF_MEMBERS", source: `${OCA} s 112(1)`, status: "CONFIRMED" },
  },
  resolutionCategories: {
    ORDINARY: {
      basis: "COUNT_MAJORITY",
      tieRefusedBecause: VIC_TIE,
      withoutQuorum: "INTERIM",
      source: `${OCA} ss 78(1), 89(1) to (5), 89A`,
      status: "CONFIRMED",
    },
    SPECIAL: {
      basis: "SHARE_OF_ALL_LOTS",
      forAtLeastFractionOfAllLots: RESOLUTIONS.SPECIAL.fractionOfTotalVotes,
      pollForAtLeastFractionOfAllEntitlement: RESOLUTIONS.SPECIAL.fractionOfTotalLotEntitlementsOnBallotOrPoll,
      entitlementUse: "SPECIAL_RESOLUTION",
      interimCategory: "INTERIM_SPECIAL",
      source: `${OCA} ss 96, 97`,
      status: "CONFIRMED",
    },
    UNANIMOUS: {
      basis: "SHARE_OF_ALL_LOTS",
      forAtLeastFractionOfAllLots: 1,
      pollForAtLeastFractionOfAllEntitlement: 1,
      entitlementUse: "UNANIMOUS_RESOLUTION",
      source: `${OCA} s 95`,
      status: "CONFIRMED",
    },
    // Never on an agenda: a special resolution that fails may pass as one. On a poll its first route is NOT_CONFIRMED,
    // so it has no poll test and is refused on a poll (FOR_REVIEW MEETING_RULES_INTERIM). A 2-lot owners corporation
    // is exempt from s 97 (s 7A), so with 2 lots or fewer it is refused, never reported as interim. Since stage 2,
    // PR 8a-ii (29 Oct 2026) a tier 5 owners corporation is not counted at all (countingRefusedWhen); this variant
    // stays as a second line of defence (FOR_REVIEW MEETING_RULES_TIER_5).
    INTERIM_SPECIAL: {
      basis: "BY_VARIANT",
      variants: [
        {
          when: { lotsAtMost: 2 },
          rule: { basis: "SHARE_OF_ALL_LOTS", refusedBecause: VIC_TWO_LOT_INTERIM },
          source: `${OCA} s 7A`,
          status: "CONFIRMED",
        },
        {
          when: { lotsAtLeast: 3 },
          rule: {
            basis: "SHARE_OF_ALL_LOTS",
            forAtLeastFractionOfAllLots: RESOLUTIONS.INTERIM_SPECIAL.route1.forAtLeastFractionOfTotalVotes,
            againstNotMoreThanFractionOfAllLots: RESOLUTIONS.INTERIM_SPECIAL.route1.againstNotMoreThanFractionOfTotalVotes,
            orNoneAgainstAtQuorateMeeting: RESOLUTIONS.INTERIM_SPECIAL.route2.noVotesAgainst,
          },
          source: `${OCA} s 97(1), (1A)`,
          status: "CONFIRMED",
        },
      ],
      source: `${OCA} ss 7A, 97(1), (1A)`,
      status: "CONFIRMED",
    },
  },
  retention: { generalYears: RECORDS.retention.othersAtLeastYears, secretBallotMonths: RECORDS.retention.votingPapersMonthsAfterVote },
  preMeetingEvoting: null,
  resolutionLabels: {
    ORDINARY: { short: "Ordinary", full: "Ordinary Resolution" },
    SPECIAL: { short: "Special", full: "Special Resolution" },
    UNANIMOUS: { short: "Unanimous", full: "Unanimous Resolution" },
    INTERIM_SPECIAL: { short: "Interim special", full: "Interim Special Resolution" },
  },
  generalMeetingCategories: ["ORDINARY", "SPECIAL", "UNANIMOUS"],
  committeeCategories: ["ORDINARY"],
  committeeCategoryRefusal:
    "Only an ordinary resolution can go on a committee meeting agenda. Put this motion on a general meeting agenda instead.",
  motionCategories: ["ORDINARY", "SPECIAL", "UNANIMOUS"],
  debtorsMayVoteOn: ARREARS.mayStillVoteOn,
  pollCategories: ["ORDINARY"],
  excludeCommonPropertyRows: true,
  // Every outcome at a general meeting comes from the count, so an item with no category cannot be recorded as resolved there.
  categoryRequiredAtGeneralMeetings: true,
  // Stage 2, PR 8a-ii (29 Oct 2026): a tier 5 owners corporation, or one whose tier cannot be worked out, is not counted.
  countingRefusedWhen: [
    {
      when: tierIn([TIER_5.tier]),
      refusal: VIC_TIER_5,
      undecided: "StrataVerze cannot tell whether this owners corporation is tier 5 (a 2-lot subdivision or services only), whose votes it does not count yet",
      source: `${OCA} ss 7(6), 7A, 8`,
      status: "CONFIRMED",
    },
  ],
  // The arrears rule (s 89B) does not apply to tier 5 (s 7A). Where the tier cannot be worked out, it applies.
  debtorRuleAppliesWhen: tierIn([TIER_1.tier, TIER_2.tier, TIER_3.tier, TIER_4.tier]),
  // The chair's answer for each item (Matthew Wrigley's decision of 29 Oct 2026, DECISIONS): never worked out or assumed.
  quorumAttestation: {
    label: "Quorum present for this item",
    help: `Yes if at least ${MEETINGS.quorum.percentOfTotalLots}% of the lots were present in person or by proxy when this item was decided, or, if that many lots is not available, lots holding at least ${MEETINGS.quorum.otherwisePercentOfTotalLotEntitlement}% of the total lot entitlement. Without a quorum a resolution that carries is an interim resolution, which is recorded as decided later and takes effect after ${MEETINGS.interimResolutions.takesEffectDaysAfterMade} days unless a special general meeting is called.`,
    source: `${OCA} ss 77, 78(1)`,
    status: "STRATAVERZE",
  },
  // Stage 2, PR 8b-i (29 Oct 2026, Matthew Wrigley's decisions D1 to D4, D7 and D10): interim resolutions are recorded as pending and decided later.
  pendingResolutions: {
    INTERIM_SPECIAL: {
      label: "Interim special resolution",
      windowDays: RESOLUTIONS.INTERIM_SPECIAL.becomesSpecialAfterDays,
      takesEffectAs: "SPECIAL",
      noticeWithinDays: RESOLUTIONS.INTERIM_SPECIAL.noticeWithinDays,
      noticeRequiredBeforeEffect: true,
      settleAfterGraceDays: PENDING_SETTLE_GRACE_DAYS,
      petition: {
        moreThanFractionOf: RESOLUTIONS.INTERIM_SPECIAL.petitionStopsIfMoreThanFractionOfTotalVotes,
        of: "ALL_LOTS",
        words: `A petition to the secretary signed by owners holding more than ${RESOLUTIONS.INTERIM_SPECIAL.petitionStopsIfMoreThanFractionOfTotalVotes * 100}% of the total votes for all the lots`,
      },
      help: `It becomes a special resolution ${RESOLUTIONS.INTERIM_SPECIAL.becomesSpecialAfterDays} days after it was passed, unless owners holding more than ${RESOLUTIONS.INTERIM_SPECIAL.petitionStopsIfMoreThanFractionOfTotalVotes * 100}% of the total votes for all the lots petition the secretary within that time. Notice of it must be given to the lot owners within ${RESOLUTIONS.INTERIM_SPECIAL.noticeWithinDays} days, with the minutes. StrataVerze takes it to have effect the day after the ${RESOLUTIONS.INTERIM_SPECIAL.becomesSpecialAfterDays} days end, once the notice is recorded as given, and records that ${PENDING_SETTLE_GRACE_DAYS} days later, so a petition received in time can still be recorded.`,
      source: `${OCA} s 97(2) to (5)`,
      status: "STRATAVERZE",
    },
    INTERIM_NO_QUORUM: {
      label: "Interim resolution",
      windowDays: MEETINGS.interimResolutions.takesEffectDaysAfterMade,
      takesEffectAs: "SAME",
      noticeWithinDays: MEETINGS.interimResolutions.noticeAndMinutesWithinDays,
      noticeRequiredBeforeEffect: true,
      settleAfterGraceDays: PENDING_SETTLE_GRACE_DAYS,
      meetingNotice: {
        meetingHeldWithinDays: MEETINGS.interimResolutions.sgmHeldWithinDaysOfNotice,
        words: `Notice of a special general meeting given within the ${MEETINGS.interimResolutions.takesEffectDaysAfterMade} days`,
      },
      help: `It takes effect ${MEETINGS.interimResolutions.takesEffectDaysAfterMade} days after it was made, unless notice of a special general meeting is given within that time. Then it must be confirmed at that meeting, held within ${MEETINGS.interimResolutions.sgmHeldWithinDaysOfNotice} days of the notice, and if that meeting is not held it takes effect at the end of the ${MEETINGS.interimResolutions.sgmHeldWithinDaysOfNotice} days. Notice of it must be given to the lot owners within ${MEETINGS.interimResolutions.noticeAndMinutesWithinDays} days, with the minutes. StrataVerze takes it to have effect the day after, once the notice is recorded as given, and records that ${PENDING_SETTLE_GRACE_DAYS} days later, so a notice or meeting in time can still be recorded.`,
      source: `${OCA} s 78(2) to (4)`,
      status: "STRATAVERZE",
    },
  },
  // Stage 2, PR 8b-iii (29 Oct 2026, Matthew Wrigley's decisions D12 and D14): a committee meeting's notice is not checked.
  noticeNotCheckedFor: {
    COMMITTEE: `A committee meeting needs at least ${COMMITTEE.meetingNoticeBusinessDays} business days' notice, or the notice the owners corporation decides (${OCA} s 109), and StrataVerze does not count business days yet`,
  },
  // Stage 2, PR 8b-iv (29 Oct 2026, Matthew Wrigley's decision D18): the votes per item and the later effect in the minutes.
  minutesContents: {
    voting: true,
    laterEffect: true,
    source: `${OCA} ss 78(2), 81, 97(2)`,
    status: "STRATAVERZE",
  },
  notes:
    "Draft, from the Victorian pack (not signed off), VIC, ACT and WA stage 2, PR 8a-i, 8a-ii, 8b-i, 8b-iii and 8b-iv. Quorum is the chair's answer for each item; tier 5 is not counted. Interim resolutions are recorded as pending and decided later. A committee meeting's notice period is not checked. The minutes give the votes per item and the later effect of an interim resolution; attendance waits for Stage C. Ballots and the minutes deadline are not applied yet.",
};

/** How far each part of MEETING_RULES not carrying its own status is checked. */
export const MEETING_RULES_STATUS = {
  noticePeriods: {
    status: "CONFIRMED" as RuleStatus,
    source: `${OCA} ss 72, 76`,
    note: "14 days for an AGM, the first AGM and a special general meeting. The committee's 3 business days (s 109) are not held, as the shape holds whole days only, so committee notice is not checked.",
  },
  noticeNotCheckedFor: {
    status: "STRATAVERZE" as RuleStatus,
    source: `${OCA} ss 89B, 109`,
    note: "The 3 business days (s 109) is CONFIRMED. Since stage 2, PR 8b-iii a committee meeting's notice is stored as not compliant with no period and shown as \"Notice period not checked\" (Matthew Wrigley's decision D12 of 29 Oct 2026), and business days stay not checked until \"business day\" and a public holiday source are decided (decision D14), as is the 4 business days of s 89B (FOR_REVIEW MEETING_RULES_NOTICE_AND_MINUTES).",
  },
  minutesDeadlines: {
    status: "NOT_CONFIRMED" as RuleStatus,
    source: `${OCA} ss 78, 81, 97`,
    note: "No deadline for sending ordinary minutes was found. Interim resolutions have one (14 days, ss 78(2), 97(2)): since stage 2, PR 8b-i it is held on each pending resolution (pendingResolutions.noticeWithinDays) and its notice must be recorded as given before it takes effect. The minutes themselves are not checked against it.",
  },
  minutesContents: {
    status: "STRATAVERZE" as RuleStatus,
    source: `${OCA} ss 78(2), 81, 97(2)`,
    note: "What the minutes contain (s 81) is CONFIRMED. Since stage 2, PR 8b-iv the votes counted at each item come from the count recorded at the meeting (Matthew Wrigley's decision D18 of 29 Oct 2026), and an interim resolution's later effect is given as at the day the minutes are assembled. The attendance parts wait for attendance to be recorded (Stage C, FOR_REVIEW MINUTES_CONTENTS).",
  },
  pendingResolutions: {
    status: "STRATAVERZE" as RuleStatus,
    source: `${OCA} ss 78(2) to (4), 97(2) to (5)`,
    note: "The periods (29 days, 14 days' notice, 28 days to hold the special general meeting) and the 25% petition are CONFIRMED. How they are applied is StrataVerze's reading, by Matthew Wrigley's decisions of 29 Oct 2026 (D1 to D4, D7 and D10, DECISIONS): the day counting, the day it is made, notice before effect, a petition recorded as lost, and a special general meeting held with no decision recorded never taking effect on its own (FOR_REVIEW MEETING_RULES_PENDING). The 7 days of grace before the daily run records its end (settleAfterGraceDays) are a StrataVerze value (Matthew Wrigley's decision of 29 Oct 2026, review M1).",
  },
  retention: {
    status: "CONFIRMED" as RuleStatus,
    source: `${OCA} s 145`,
    note: "At least 7 years; voting papers and ballots 12 months after the vote, held as the secret ballot period (a StrataVerze mapping).",
  },
  debtorsMayVoteOn: {
    status: "CONFIRMED" as RuleStatus,
    source: ARREARS.source,
    note: "An owner in arrears may vote only on special and unanimous resolutions (s 89B), except in a tier 5 owners corporation, which is exempt from s 89B (s 7A): debtorRuleAppliesWhen reads the tier, and where it cannot be worked out the rule applies (a StrataVerze choice, it fails closed). Arrears are read as an overdue fee notice (FOR_REVIEW MEETING_RULES_ARREARS).",
  },
  quorumAttestation: {
    status: "STRATAVERZE" as RuleStatus,
    source: `${OCA} ss 77, 78(1)`,
    note: "Whether the meeting had a quorum is the chair's answer for each item, never worked out or assumed, until attendance is recorded (Matthew Wrigley's decision of 29 Oct 2026, DECISIONS). A \"no\" the votes counted contradict is refused. Whether quorum is judged once or for each item is NOT_CONFIRMED (FOR_REVIEW MEETING_RULES_QUORUM).",
  },
  countingRefusedWhen: {
    status: "CONFIRMED" as RuleStatus,
    source: `${OCA} ss 7(6), 7A, 8`,
    note: "A tier 5 owners corporation is exempt from many of the meeting and resolution rules, and StrataVerze does not apply its own rules yet, so its votes are not counted. Refusing a building whose tier cannot be worked out is a StrataVerze choice (it fails closed). FOR_REVIEW MEETING_RULES_TIER_5.",
  },
  labelsAndLists: { status: "STRATAVERZE" as RuleStatus, source: "StrataVerze", note: "The names, the categories each meeting and the motions list offer, the poll categories, pre-meeting voting not offered and common property rows not counted are StrataVerze choices (FOR_REVIEW MEETING_RULES)." },
} as const;

/** Shared shapes this draft does not give yet, and why. None since stage 2, PR 8a-i (MEETING_RULES). */
export const DEFERRED_SHARED_SHAPES: readonly { shape: string; reason: string }[] = [];

/** What was not confirmed on 27 Oct 2026, for the review. */
export const NOT_CONFIRMED = [
  // From the research notes' "Not confirmed" list.
  "The penalty interest rate: 10% since 1 Feb 2017 is from the Supreme Court page (published Feb 2020); the DJCS page returned \"no longer exists\" and the Government Gazette notice was not checked.",
  "The \"28 April 2025\" start date for the approved fee notice forms: found in no official source (the media release is dated 24 Apr 2025 and the form metadata is from April 2025).",
  "The 2026-27 dollar values of the owners corporation certificate, register and record caps: calculated from fee units × $17.27; CAV publishes fee units only, and the Monetary Units Act rounding rules were not checked.",
  "The financial year: the OCA does not define one, and no rule fixing it was found.",
  "Whether a committee can give s 18 authority by delegation (ss 11(3), (5)): needs legal review.",
  "VCAT Act costs (s 109) and any VCAT monetary limits: the VCAT Act was not read.",
  "Sale of Land Act s 32 text: the requirement to attach the owners corporation certificate rests on CAV guidance.",
  "The text of SR 54/2026 (Owners Corporations (Education) Regulations 2026): not read.",
  "Tier assessment for plans with more than one owners corporation: no statutory rule found; the CAV example implies the whole development is assessed together.",
  "Whether the owners corporation must set annual fees at the AGM: the Act requires the budget at the AGM, but no express rule was found.",
  "The owners corporation name format: no statutory format, only CAV examples (\"owners corporation No 1 PS12345\").",
  "What Subdivision Act Version 084 (1 Jul 2026) changed: not checked.",
  "Later proclamations: as at 27 Oct 2026 the OCA version list ended at 024; no Gazette search was done for a proclamation of CLAA 2026 Part 6 Div 2 or HSRA 2025 Part 4 Div 1.",
  // Gaps found while writing the pack: the notes record nothing on these.
  "Which of the 14-day (approved form text) and 28-day (OCR Sch 2 rule 7(5)) dispute meeting periods governs a fee dispute.",
  "How the 5% proxy limit (s 89D) is rounded: the notes do not say.",
  "The tier of an owners corporation with 1 occupiable lot that s 7(7) and (8) do not reach: the notes record none.",
  "The approved form for a manager's contract of appointment (s 119(3)): the notes do not identify or describe it.",
  "The order a payment is applied to fees, interest and recovery costs before s 32I commences: the notes record none. PAYMENT_ALLOCATION_ORDER is a StrataVerze choice (DECISIONS, 28 Oct 2026).",
  "How interest accrues (daily, simple or otherwise) beyond the final notice's daily amount, and how a day's share of a yearly rate is worked out: the notes do not say.",
  "How days are counted for the Act's periods (calendar or clear days), and when a posted or emailed notice is taken to be given: the notes do not say.",
  "What \"business day\" means for s 151 (certificate within 10 business days) and s 89B (payment 4 business days before a vote): the notes give no definition.",
  "Whether there is any deadline for sending ordinary AGM minutes: the notes give one only for interim resolutions (s 78) and interim special resolutions (s 97), each within 14 days.",
] as const;

/**
 * Points StrataVerze must settle before the pack is signed off, or before the
 * work named in `before` relies on it.
 */
export const FOR_REVIEW = [
  {
    key: "S18_COMMITTEE_DELEGATION",
    point: "Whether a committee may authorise proceedings under s 18(2) or (2A) by its default delegation (s 11(5)), given s 11(3). Until settled, authority to sue needs a recorded general meeting resolution of the right kind.",
    before: "any debt workflow that automates authority to sue",
    kind: "LEGAL",
  },
  {
    key: "PENALTY_INTEREST_RATE",
    point: "Check the current Penalty Interest Rates Act maximum against the Government Gazette notice; the 10% figure is guidance only.",
    before: "the rate is used as a default cap or shown as the maximum",
    kind: "LEGAL",
  },
  {
    key: "DISPUTE_MEETING_PERIOD",
    point: "Which of 14 days (approved form text) and 28 calendar days (OCR Sch 2 rule 7(5)) applies to the fee dispute meeting. The pack uses 28.",
    before: "dispute workflows or notice text use the period",
    kind: "LEGAL",
  },
  {
    key: "APPROVED_FORMS_DATE",
    point: "The date the current approved fee notice forms applied from (the 28 April 2025 date is not confirmed). NOTICE_RULES.checked.form.appliedFrom has no value until it is (stage 2, PR 6a).",
    before: "historical notices are checked against the form",
    kind: "LEGAL",
  },
  {
    key: "APPROVED_FORMS_USE",
    point: "How the platform reproduces the approved fee and final fee notice forms, changing only layout and adding only reference numbers, manager details and web or email details. Since stage 2, PR 6a this blocks every fee notice: NOTICE_RULES requires the approved form (s 31(1)) and StrataVerze has no renderer for it, so each Victorian fee notice is refused with that reason.",
    before: "Victorian fee notices are generated",
    kind: "STRATAVERZE",
  },
  {
    key: "MANAGER_CONTRACT_FORM",
    point: "Obtain the approved form for a manager's contract of appointment (s 119(3)).",
    before: "any manager contract feature for Victorian buildings",
    kind: "LEGAL",
  },
  {
    key: "OWNERS_CORPORATION_TYPE_SUPPORTED",
    point: "`supported: true` on the unlimited owners corporation option is a StrataVerze choice for this draft, not a rule of law. Limited owners corporations are listed but blocked.",
    before: "sign-off",
    kind: "STRATAVERZE",
  },
  {
    key: "ADMINISTRATIVE_FUND",
    point: "The administrative fund is a StrataVerze ledger choice (status STRATAVERZE): the Act names no such fund. Confirm the name owners see, or another. Since stage 2 PR 3 it is also marked required, as a ledger choice and not a rule of law, so every Victorian building is given it and has a ledger for its annual fees (the chart of accounts needs at least one fund). The screens show it as required with the note that this is a StrataVerze choice. Confirm.",
    before: "sign-off",
    kind: "STRATAVERZE",
  },
  {
    key: "MAINTENANCE_FUND_REQUIRED",
    point:
      "The maintenance fund's `requiredWhen` (stage 2, PR 3) reads the tier and whether a maintenance plan is approved (MAINTENANCE_PLAN_APPROVED, recorded by the adviser). (1) Tiers 1 and 2: required, whether or not a plan is approved yet. The notes say these tiers must prepare and approve a plan (s 36) and that the fund is required where a plan is approved (s 40), so requiring it from the start is a StrataVerze reading, chosen so a building is never given fewer funds than the law requires. (2) Tier 5: not required even with an approved plan, because 2-lot and services only owners corporations are exempt from the maintenance plan and maintenance fund provisions (s 7A(1)(b); s 8). (3) Tiers 3 and 4: required where a plan is approved, and not required otherwise. Whether a tier 3 or 4 owners corporation may keep the fund without an approved plan is not in the notes, so the screens say only that it is not required. (4) Where the tier cannot be worked out, or at tier 3 or 4 no plan answer is recorded, the fund is not worked out and the building is flagged. Confirm each choice.",
    before: "Victorian buildings are set up",
    kind: "STRATAVERZE",
  },
  {
    key: "BODY_CORPORATE_NAME",
    point: "The name format is CAV's example only, and needs the owners corporation's number on the plan, which the shared name tokens do not cover. Also settle the capital letter at the start of a heading.",
    before: "notices, minutes or PDFs carry the name",
    kind: "STRATAVERZE",
  },
  {
    key: "PENDING_COMMENCEMENT",
    point: "Check the Government Gazette for proclamations of CLAA 2026 Part 6 Div 2 and HSRA 2025 Part 4 Div 1 before each pack release. SR 53/2026 commences on 25 Nov 2026 and needs a new pack version to switch on.",
    before: "each pack release, and 25 Nov 2026",
    kind: "LEGAL",
  },
  {
    key: "DATED_RULES",
    point: "Each pending change is restated in DATED_RULES. An enacted or made change stays off, even after its fixed or latest start date, until a pack version records the day it commenced; once that date passes the reader refuses the rule and the pending law check lists it (SR 53/2026 from 25 Nov 2026). In-force values start on the day the version read came into force (OCA Version 024, OCR Version 002), so earlier days have no value. Before s 32I the payment order is recorded as no statutory rule, NOT_CONFIRMED. The pending proxy limit carries the exceptions in force, NOT_CONFIRMED (the notes say only that the s 89D(2) exceptions are not amended). Confirm these choices.",
    before: "any code reads a dated rule",
    kind: "STRATAVERZE",
  },
  {
    key: "FIXED_DATE_COMMENCEMENT",
    point: "Whether an instrument that fixes its own start date (SR 53/2026, 25 Nov 2026) should count as commenced on that date without a new pack version recording it. Until decided, it does not: from 25 Nov 2026 the reader refuses the manager registration fees until a pack version records commencedOn.",
    before: "25 Nov 2026",
    kind: "STRATAVERZE",
  },
  {
    key: "PAYMENT_PLAN_WORKFLOW",
    point: "FEATURES.statutoryPaymentPlans is false: Victoria's payment plans are not in force, and the enacted scheme (owner-occupier refusal grounds, deemed acceptance, tiers 1 to 4) differs from the NSW workflow.",
    before: "CLAA 2026 Part 6 Div 2 commences (1 Dec 2027 at the latest)",
    kind: "STRATAVERZE",
  },
  {
    key: "CALCULATED_DOLLARS",
    point: "The fee dollar table is the researcher's calculation. Check the Monetary Units Act rounding rules before any amount is charged or shown, and never show it as an official figure.",
    before: "any fee in dollars is charged or shown",
    kind: "LEGAL",
  },
  {
    key: "DEFERRED_SHARED_SHAPES",
    point: "No shared shape is deferred: LATE_CHARGE and PAYMENT_ALLOCATION_ORDER are given since stage 2, PR 5, NOTICE_RULES since stage 2, PR 6a, and MEETING_RULES since stage 2, PR 8a-i (DEFERRED_SHARED_SHAPES is empty).",
    before: "the pack moves to RULE_PACKS",
    kind: "STRATAVERZE",
  },
  {
    key: "MEETING_RULES",
    point:
      "MEETING_RULES (stage 2, PR 8a-i) is StrataVerze's mapping of MEETINGS, RESOLUTIONS, ARREARS and RECORDS to the shared shape. StrataVerze choices: the names (Ordinary, Special, Unanimous and Interim Special Resolution); a general meeting and the motions list offer ordinary, special and unanimous resolutions, and a committee ordinary resolutions only; an interim special resolution is never put on an agenda; pre-meeting electronic voting is not offered; common property rows are not counted as lots; voting papers are kept 12 months as the secret ballot period; an item with no resolution category (such as an election) cannot be recorded as resolved at a general meeting, because every outcome there comes from the count and such an item has no test to count it by (it can be recorded as lost, or deferred). Confirm each.",
    before: "Victorian meetings are run",
    kind: "STRATAVERZE",
  },
  {
    key: "MEETING_RULES_SPECIAL",
    point:
      "A special resolution counted at a meeting (a show of hands) needs 75% of all lots for, not of the votes cast (s 96). An owner in arrears may vote on it (s 89B), so the lots in arrears are counted for and in the total like any other. A poll is taken on an ordinary resolution only, so a special or unanimous resolution is never counted by lot entitlement at a meeting (s 96 counts it by lot entitlement \"on a ballot or poll\"; who may ask for a poll on it is not in the notes). A unanimous resolution needs every lot for (s 95). Confirm.",
    before: "Victorian meetings are run",
    kind: "LEGAL",
  },
  {
    key: "MEETING_RULES_INTERIM",
    point:
      "A special resolution that fails may pass as an interim special resolution (s 97): at least 50% of all lots for and not more than 25% of all lots against, or no vote against at a meeting with a quorum. Since stage 2, PR 8b-i (29 Oct 2026) it is recorded at the meeting as pending (the item stored as INTERIM) and decided later (MEETING_RULES_PENDING). It is tested only from a special resolution item. How the first route is counted on a poll is NOT_CONFIRMED, so it is refused on a poll. StrataVerze reads the second route (s 97(1A), no vote against at a meeting with a quorum) as needing at least 1 vote for, so a meeting where nobody votes passes nothing (to confirm). Confirm.",
    before: "Victorian meetings are run",
    kind: "LEGAL",
  },
  {
    key: "MEETING_RULES_ORDINARY",
    point:
      "An ordinary resolution counted at a meeting (since stage 2, PR 8a-ii, 29 Oct 2026) needs the chair's answer whether the meeting had a quorum for the item (MEETING_RULES_QUORUM). With \"yes\" it is recorded as carried or lost by the votes cast (by lot entitlement on a poll). With \"no\" a count that carries is an interim resolution (s 78), recorded as pending since stage 2, PR 8b-i (MEETING_RULES_PENDING), and one that fails is recorded as lost. Not answered, it is refused. Equal votes are refused too: a chair who is a lot owner or a proxy has a casting vote and without it the resolution is not passed (s 89A), and StrataVerze does not record who chaired or a casting vote. A carried ordinary resolution can now authorise interest (LATE_CHARGE: any resolution carried at a general meeting, s 29(1)). A resolution recorded as carried from the count can also be relied on wherever a carried general meeting motion is asked for: budget adoption, capital works plan approval and statutory pack adoption, as for any carried motion. Confirm.",
    before: "Victorian meetings are run",
    kind: "STRATAVERZE",
  },
  {
    key: "MEETING_RULES_TIER_5",
    point:
      "Tier 5 owners corporations (2-lot subdivisions and services only) are exempt from the meeting and resolution rules in ss 7A and 8, and for a 2-lot owners corporation a special resolution means a unanimous one. Since stage 2, PR 8a-ii (29 Oct 2026) their votes are not counted at all: at a general meeting every outcome other than a deferral is refused for a tier 5 owners corporation, whatever the item (countingRefusedWhen, read from TIER), so the chair can only defer. Where the tier cannot be worked out (one of several owners corporations, mostly or only non-occupiable lots, 2 occupiable lots with other lots, a lot with no occupiable answer, the lots not matching the total, or the services only answer missing) every count is refused too, with what the building rules are missing: this tightens PR 8a-i, which recorded special and unanimous resolutions for such buildings. Counting a 2-lot special resolution as a unanimous one is not done (a StrataVerze choice, until the tier 5 rules are applied). With 2 lots or fewer a special resolution is still never tested as an interim special resolution (a second line of defence). Confirm.",
    before: "Victorian meetings are run",
    kind: "LEGAL",
  },
  {
    key: "MEETING_RULES_ARREARS",
    point:
      "An owner in arrears is read as a lot with a fee notice issued, past its due date and not paid in full on the meeting's date, as for Queensland. The rule that a payment other than cash counts only if made at least 4 business days before the vote (s 89B) is not applied: business days stay not checked until \"business day\" and a public holiday source are decided (Matthew Wrigley's decision D14 of 29 Oct 2026, DECISIONS). Since stage 2, PR 8a-ii (29 Oct 2026) the rule applies to tiers 1 to 4 only, as tier 5 is exempt from s 89B (s 7A): an owner of a tier 5 owners corporation is not barred from voting online on a motion. Where the tier cannot be worked out, the owner is barred as in tiers 1 to 4 (a StrataVerze choice: it fails closed). At a meeting both are moot, as neither is counted. Confirm.",
    before: "Victorian meetings are run",
    kind: "LEGAL",
  },
  {
    key: "MEETING_RULES_QUORUM",
    point:
      "Whether the meeting had a quorum (s 77: at least 50% of the lots, or if that is not available 50% of the total lot entitlement) is the chair's answer for each item, kept with the outcome in the meeting record with who recorded it (Matthew Wrigley's decision of 29 Oct 2026, DECISIONS). It is never filled in for the chair, and an item not answered is refused. StrataVerze does not record attendance yet, so it does not work the quorum out. It refuses a \"no quorum\" answer only where the lots whose votes are counted already make up half of all lots. Whether s 78 judges quorum once for the meeting or for each item is not in the notes (asked for each item, to confirm). When attendance is recorded (meeting management, Stage C) the quorum will be worked out from it instead. Confirm.",
    before: "Victorian meetings are run",
    kind: "LEGAL",
  },
  {
    key: "MEETING_RULES_BALLOTS",
    point: "Pre-meeting electronic voting is not offered for this draft (preMeetingEvoting is null). Before it is, closing a ballot must apply what the count at the meeting applies: the debtor condition (debtorRuleAppliesWhen), judged lot by lot as an owner's own vote is (debtorVoteCheck), the quorum answer, and any refusal of the whole count (Victoria's tier 5, Western Australia's 2-lot quorum). closeBallotAction applies none of these yet (stage 2, PR 8a-ii review). Confirm.",
    before: "a Victorian ballot is offered",
    kind: "STRATAVERZE",
  },
  {
    key: "MEETING_RULES_PENDING",
    point:
      "Interim resolutions (stage 2, PR 8b-i, 29 Oct 2026), by Matthew Wrigley's StrataVerze decisions of 29 Oct 2026 (DECISIONS), each kept here for legal confirmation. (D1) A petition, notice or special general meeting notice may arrive up to and including the 29th day after the resolution was made, and it takes effect the next day: the Interpretation of Legislation Act 1984 was not read, so whether \"29 days after\" counts this way is NOT_CONFIRMED. (D2) It is made on the later of the meeting's day and the day the chair records it, in the building's time zone. (D3) It takes effect only once its 14-day notice (ss 78(2), 97(2)) is recorded as given; a notice given late is flagged, not moved, and a notice given after the period ends makes it take effect on that day, not before. (D4) A valid s 97(5) petition, signed for more than 25% of all lots (the lots entered, common property left out, refused where they do not match the building's number of lots), means the motion did not become a special resolution, recorded as lost; what follows a petition is not in the notes. (D7) Where notice of a special general meeting is given within the 29 days (s 78(4)), the meeting must be linked when the notice is recorded; it takes effect if that meeting was not opened within the 28 days, and never on its own if it was held but its decision is not recorded. A confirmation needs that meeting's item recorded as carried (confirmed) or lost (not confirmed), with the resolution's notice recorded. For both, the meeting is held on the day it was opened in StrataVerze, on or after the day its notice was given and by the day it must be held by (since the review of 29 Oct 2026), and a confirmation takes effect on that day. (D10) A pending item cannot be recorded again, deferred or deleted. (Review M1, Matthew Wrigley's decision of 29 Oct 2026) The daily run records it as having taken effect at the end of its period only after 7 days of grace (settleAfterGraceDays), counted from the last day of the 29 days, or, after a special general meeting notice, from the day that meeting must be held by: during the grace a petition or special general meeting notice received within the 29 days can still be recorded, and the day it takes effect does not move. A confirmation or a petition decides it at once. Whether 7 days is long enough for the secretary to pass a petition on is NOT_CONFIRMED. Manager interim resolutions (s 78(1A) to (1C)) and committee interim resolutions (s 112(6), (7)) are not handled. Since stage 2, PR 8b-iv the minutes state each interim resolution's later effect as at the day they are assembled, and name an item stored as INTERIM \"Decided later\" (MINUTES_CONTENTS). Confirm each.",
    before: "Victorian meetings are run",
    kind: "LEGAL",
  },
  {
    key: "MEETING_RULES_NOTICE_AND_MINUTES",
    point:
      "Committee meeting notice (at least 3 business days, or as the owners corporation decides, s 109) is not checked, and no deadline for ordinary minutes is checked, as none was found. Since stage 2, PR 8b-iii (29 Oct 2026), by Matthew Wrigley's StrataVerze decisions of 29 Oct 2026 (DECISIONS), each kept here for confirmation: (D12) a notice whose period StrataVerze cannot check is stored as not compliant with no period, with no database change (a notice with no period was always stored as compliant before), and shown as \"Notice period not checked\", never as met; the notice can still be issued. (D14) Business days (the s 109 committee notice and the 4 business days of s 89B) stay not checked until what \"business day\" means and a source of Victorian public holidays are decided: the notes do not define it, and counting Monday to Friday would overstate the business days around a public holiday, which is the unsafe direction. Whether a notice determined by the owners corporation (s 109) should be recorded per building is for the same decision. Confirm each.",
    before: "Victorian meetings are run",
    kind: "STRATAVERZE",
  },
  {
    key: "MINUTES_CONTENTS",
    point:
      "The minutes (s 81, stage 2, PR 8b-iv, 29 Oct 2026), by Matthew Wrigley's StrataVerze decision D18 of 29 Oct 2026 (DECISIONS), kept here for confirmation. The minutes give the text of each resolution and, for each item, the votes counted at the meeting from the latest count recorded for it (for, against and abstaining, the lot entitlement on a poll, and the votes not counted for money owed); an item with no count recorded (such as one deferred, or one with no resolution category) shows none. An item decided later (s 78 or s 97) is named \"Decided later\" and its later effect is given as at the day the minutes are assembled: what it is, the day its period ends, the day it took effect or the earliest day it may, and where it stands. Minutes assembled before it is decided are not changed when it is, so a later version must be assembled to show it. The attendance parts of s 81 (the owners present, the owners who gave proxies and the proxies present) wait for attendance to be recorded (meeting management, Stage C). Confirm.",
    before: "Victorian meetings are run",
    kind: "STRATAVERZE",
  },
  {
    key: "PROXY_CAPS",
    point:
      "Proxy caps (s 89D, stage 2, PR 8b-iv, 29 Oct 2026), by Matthew Wrigley's StrataVerze decisions of 29 Oct 2026 (DECISIONS), each kept here for confirmation. (D15) Every cap warns only and never stops a proxy being saved, the 1 lot owner cap at 20 or fewer occupiable lots included, as the exceptions (family members and the OCR reg 8A cases) cannot be told from the records. Where the 5% share is not a whole number, a holder above it rounded down is warned that it \"may be over\" and above it rounded up that it is over, and the warning says the rounding is not confirmed. Where not every lot's occupiable answer is recorded, more than 1 proxy is warned of as perhaps over. The limit is read on the meeting's day (today where the proxy has no meeting date) from DATED_RULES.PROXY_LIMIT, so the CLAA 2026 limit of 1 lot owner applies only once a pack version records its commencement; where the reader refuses (its latest start date, 1 Dec 2027, has passed with no commencement recorded) the warning says the limit cannot be told. (D16) The 5% is of the distinct lot owners recorded on the building's lots; where any lot has no owner recorded the lots are counted instead and the warning says so. A holder is matched by email (any case), or by name where there is no email, and a proxy belongs to the meeting on its meeting date; one with no meeting date is counted for every meeting. Proxies are counted by the lots they are for, so one owner's several lots count separately (which reg 8A exempts). (D17) An owner in arrears may not act as a proxy (s 89C(10)): a holder whose email matches an owner of a lot owing money on the day is warned of, warn only. The warnings show on the meeting page of a general meeting, in its proxy limits panel. An action that checks a proxy before it is saved (checkProxyCapsAction) exists for a proxy form, which no screen has yet, and saving a proxy itself is unchanged and checks nothing. Where 5% of the lot owners is less than 1 proxy (more than 20 occupiable lots, fewer than 20 owners recorded), no floor is applied, as s 89D sets none: any proxy is warned of as \"may be over\", and the warning says whether at least 1 is allowed is not confirmed (if Matthew Wrigley decides at least 1 is allowed, the limit can be the larger of 1 and the share rounded down). Joint owners of a lot are each counted as a lot owner, which raises the 5% and so may warn less than it should; whether joint owners count as one lot owner is not confirmed. The in-force limit is read from 9 Sep 2026 only, the start of the OCA version the notes read (Version 024): the notes give no earlier start for s 89D in its current form, so a meeting before then is warned that the limit cannot be told; an earlier start can be recorded once it is confirmed. Confirm each.",
    before: "Victorian meetings are run",
    kind: "STRATAVERZE",
  },
  {
    key: "GUIDANCE_CONFLICTS",
    point: "Confirm that the pack follows the Act wherever CAV guidance differs (GUIDANCE_CONFLICTS).",
    before: "sign-off",
    kind: "LEGAL",
  },
  {
    key: "FINANCIAL_YEAR_AND_MULTI_OC_TIERS",
    point: "The financial year (no statutory definition found) and the tier of an owners corporation on a plan with several.",
    before: "Victorian buildings are set up",
    kind: "LEGAL",
  },
  {
    key: "BUILDING_SELECTORS_TIER",
    point:
      "How TIER is worked out. (1) An owners corporation recorded as one of several on its plan is refused: the notes do not confirm how its tier is assessed (FINANCIAL_YEAR_AND_MULTI_OC_TIERS). (2) A services only owners corporation is tier 5 before s 7(7) and (8) are read, because tiers 1 to 4 exclude services only and s 7(7) applies tiers 1 and 2 only; that order is a StrataVerze reading. (3) Where s 7(7) or (8) applies (mostly or only non-occupiable lots) the tier is refused, because the notes do not say how the non-occupiable lots are counted with the occupiable ones. (4) A plan with 2 occupiable lots and no other lots is tier 5 (a 2-lot subdivision, \"comprising of 2 occupiable lots\"); with 2 occupiable lots and other lots it is refused until decided, because the notes do not say whether the other lots count. (5) Every tier is marked supported as a StrataVerze proposal.",
    before: "any rule reads the tier",
    kind: "LEGAL",
  },
  {
    key: "BUILDING_FACTS_RECORDED_BY",
    point:
      "Who records each lot's occupiable answer, the services only answer, whether the owners corporation is the only one on its plan and whether a maintenance plan is approved: the adviser or StrataVerze, in the Building rules section, outside the locked building record. The maintenance plan answer is flagged only where the maintenance fund depends on it (tiers 3 and 4). The lot form and the data import do not ask for them yet, so a new lot is flagged until it is answered. A lot of StrataVerze's PARKING or STORAGE type answered occupiable is flagged and the tier refused, reading those types as the car park and storage locker of s 3 (a StrataVerze choice).",
    before: "Victorian buildings are set up",
  },
  {
    key: "ENTITLEMENT_DECIDES",
    point:
      "Which schedule decides each use (ENTITLEMENT_SCHEDULES `decides`, stage 2 PR 4), read from the notes: lot liability decides CONTRIBUTIONS (annual, special and upgrading fees, ss 23(3), 24(2), 53(1A)); lot entitlement decides POLL_VOTE (s 89(3)), SPECIAL_RESOLUTION and UNANIMOUS_RESOLUTION on a ballot or poll (ss 95, 96), QUORUM_FALLBACK only where 50% of the lots is not available (s 77: lots are counted first), COMMON_PROPERTY_SHARE (SA s 30) and INSURANCE_PREMIUM_FEE (s 23A, read by nothing until CONTRIBUTION_INSURANCE_S23A is decided). The cap on contributions (s 28(2)), administrator costs (s 175), the nomination by owners holding at least 25% of lot entitlements of the person who convenes a special general meeting or arranges a ballot (ss 74, 83 to 85) and VCAT consent (SA s 34D(3)(ba)) stay in `usedFor` with no key, as no feature reads them. A \"benefits more pays more\" fee (ss 23(3A), 24(2A)) is not shared by either schedule and is not offered. Confirm the mapping.",
    before: "sign-off",
    kind: "LEGAL",
  },
  {
    key: "SECOND_SCHEDULE_HELD",
    point:
      "Each lot's lot entitlement is held in lots.lot_entitlement and its lot liability in lots.entitlement, each as a whole number of at least 1 (the shape of the columns). The notes do not say either is a whole number, so a register with fractions would need the columns changed. Lot entitlement is locked like lot liability: StrataVerze enters and changes it, on the lot form, the CSV lot import or the Add Property wizard. A lot without it is flagged in Building data missing, and anything that needs it is refused, never worked out from lot liability. Whether a 2-lot owners corporation, whose initial allocation needs no surveyor (SA s 27EA), always has a lot entitlement is not in the notes: it is flagged like any other. A change of the building's state clears each lot's lot entitlement. Confirm.",
    before: "Victorian buildings are set up",
    kind: "STRATAVERZE",
  },
  {
    key: "LATE_CHARGE",
    point:
      "LATE_CHARGE (stage 2, PR 5). No interest until a resolution at a general meeting authorises it, with its rate (s 29(1)), so a building starts with none. No rate can be recorded yet: the cap (the Penalty Interest Rates Act maximum, s 29(2)) has no value until PENALTY_INTEREST_RATE is checked, and 10% is never used as a default cap. Even with a rate, nothing is charged until a pack version records how interest accrues (simple or otherwise) and the days a year's rate is shared over (365, or another basis): the notes give neither. Interest runs on amounts outstanding after the due date with no grace period (s 29(1)). The lowest rate, 0, is a StrataVerze choice. Rounding (once, half up, to the cent, on the sum of the days, as NSW interest) and applying each payment to the fee first are StrataVerze choices. Once checked, the cap may need to be a dated rule (DATED_RULES), as the rate is fixed by notice. Confirm each.",
    before: "Victorian interest is charged",
    kind: "LEGAL",
  },
  {
    key: "INTEREST_WAIVER",
    point:
      "The waiver in a particular case (s 29(3)), recorded for one notice. Proposed, not decided: (1) who decides: the notes do not say, so decidedBy is NOT_CONFIRMED and no waiver can be recorded until it is decided; a general meeting resolution (the meeting and motion) is proposed, as the committee's power is not in the notes; (2) what may be waived: only all of the interest on the notice is offered (WHOLE); whether s 29(3) allows waiving part (an amount or the days of a period, which the engine and the table support) is not in the notes. The reasons are required, because decisions to waive or not, with reasons, are reported to the AGM (s 29(4)); the AGM report itself is not produced yet, and a decision not to waive is not recorded. A waiver cannot be changed or removed once recorded. A waiver is refused on a notice that already has interest charged, until a way to reverse a charge exists. Decide each.",
    before: "Victorian interest is charged",
    kind: "LEGAL",
  },
  {
    key: "PAYMENT_ALLOCATION_ORDER",
    point: "PAYMENT_ALLOCATION_ORDER: fees, then interest, then recovery costs, as NSW. Decided by Matthew Wrigley on 28 Oct 2026 as a StrataVerze choice (DECISIONS), since the notes record no order in force before s 32I. DATED_RULES.PAYMENT_ALLOCATION_ORDER still records no statutory order before s 32I; switching to s 32I by date is stage 2, PR 7.",
    before: "sign-off",
    kind: "STRATAVERZE",
  },
  {
    key: "CONTRIBUTION_INSURANCE_S23A",
    point:
      "The s 23A insurance premium fee is NOT applied yet: the pack has no CONTRIBUTION_INSURANCE, so the whole of every Victorian fee, insurance included, is shared by lot liability (s 23(3), CONFIRMED). The notes limit s 23A to the reinstatement and replacement premium (the s 59 cover), shared by lot entitlement. Public liability (s 60) and any other policy stay in annual fees by lot liability. To apply it, decide: (1) whether an owners corporation must raise the reinstatement premium as the s 23A fee, or may keep it in annual fees by lot liability (not in the notes); (2) whether the s 23A fee may be on the annual fee notice or needs a fee notice of its own (not in the notes); (3) how the reinstatement premium is held apart from the other policies, since the budget's Insurance account holds them together; (4) the StrataVerze choices that would come with it: insurance paid from the administrative fund, a budget with no reinstatement premium not refused (2-lot and services only owners corporations need not insure, ss 7A, 8, and others may insure another way, ss 61A, 63, 64), a special fee shared by lot liability only (s 24(2)), and no recovery from a culpable owner (s 23A) offered yet. The shared engine (src/lib/levies/contribution-shares.ts) is ready for INSURANCE_PREMIUM_FEE once these are decided.",
    before: "the s 23A fee is applied to Victorian fees",
    kind: "LEGAL",
  },
  {
    key: "NOTICE_RULES",
    point:
      "NOTICE_RULES (stage 2, PR 6a). Every Victorian fee notice is refused today, each with its reason: the approved form (s 31(1); APPROVED_FORMS_USE), the obligation to pay within 28 days (s 31(2)(a)), the interest rate (s 31(2)(b): notices cannot state an annual-rate interest yet) and the dispute resolution process (s 31(2)(c)) are not on StrataVerze notices, and the most notice a fee notice may give is not confirmed. The 35-day lead is Matthew Wrigley's decision of 28 Oct 2026 (DECISIONS). Recorded here so it is visible at sign-off.",
    before: "Victorian fee notices are generated",
    kind: "STRATAVERZE",
  },
  {
    key: "NOTICE_MINIMUM",
    point: "The 28-day least notice is StrataVerze's reading of s 31(2)(a) (the obligation to pay within 28 days after the date of the notice), recorded as CONFIRMED and kept as the legal rule by Matthew Wrigley's decision of 28 Oct 2026. Confirm the reading.",
    before: "Victorian fee notices are generated",
    kind: "LEGAL",
  },
  {
    key: "NOTICE_MAXIMUM",
    point: "Whether a fee notice may give more than 28 days to pay: the approved form says \"within 28 days of the date of this notice or by the due date specified below\" (guidance only), so NOTICE_RULES records no maximum and refuses every notice until one is checked (a number, or none).",
    before: "Victorian fee notices are generated",
    kind: "LEGAL",
  },
  {
    key: "NOTICE_DISPUTE_PROCESS",
    point: "The fee notice must describe the dispute resolution process under the owners corporation's rules (s 31(2)(c)). That needs each building's own dispute rule, or the model rule where it has made none (OCR Sch 2 rule 7; DISPUTE_MEETING_PERIOD), which StrataVerze does not hold yet.",
    before: "Victorian fee notices are generated",
    kind: "STRATAVERZE",
  },
  {
    key: "NOTICE_DUE_DATE_MOVE",
    point: "A fee notice that goes out late falls due 28 days after it is given (StrataVerze's reading of s 31(2)(a)), and each fee notice is given for one instalment (CAV guidance allows one notice with several due dates). Both are StrataVerze choices, not decided. Confirm.",
    before: "Victorian fee notices are generated",
    kind: "STRATAVERZE",
  },
  {
    key: "NOTICE_TIER_5",
    point: "Tier 5 owners corporations (2-lot subdivisions and services only) are exempt from ss 31 and 32 (ss 7A(1)(a), 8). The exemption is not applied yet: their notices are refused like every other Victorian fee notice.",
    before: "Victorian fee notices are generated",
    kind: "LEGAL",
  },
  {
    key: "FINAL_FEE_NOTICE",
    point: "The final fee notice (s 32) is a later PR (stage 2, PR 9). Its rules stay in FEE_NOTICES.finalNotice.",
    before: "Victorian fee recovery is offered",
    kind: "STRATAVERZE",
  },
] as const;

/**
 * StrataVerze choices this draft proposes. Matthew Wrigley has not reviewed
 * the draft, so `decidedBy` and `decidedOn` stay null on each, except the
 * payment order and the notice timing he decided on 28 Oct 2026, and the
 * quorum answer, interim resolutions, their grace before settling and the
 * committee notice not checked he decided on 29 Oct 2026.
 */
export const DECISIONS: readonly { decision: string; proposedOn: string; decidedBy: string | null; decidedOn: string | null }[] = [
  { decision: "Support unlimited owners corporations first; limited owners corporations are listed but blocked (OWNERS_CORPORATION_TYPE).", proposedOn: "2026-10-27", decidedBy: null, decidedOn: null },
  { decision: "Hold annual fees and other money not paid into the maintenance fund in the ledger's administrative fund, and the maintenance fund in the ledger's capital works fund.", proposedOn: "2026-10-27", decidedBy: null, decidedOn: null },
  { decision: "Hold fees in fee units, with a dollar table for each financial year marked as calculated, never as official.", proposedOn: "2026-10-27", decidedBy: null, decidedOn: null },
  { decision: "Follow the Act where CAV guidance differs, and record the difference (GUIDANCE_CONFLICTS).", proposedOn: "2026-10-27", decidedBy: null, decidedOn: null },
  { decision: "Keep each pending change off until its commencement is confirmed and a new pack version records it.", proposedOn: "2026-10-27", decidedBy: null, decidedOn: null },
  { decision: "Charge no interest until a building records the general meeting resolution that authorises it, with the rate.", proposedOn: "2026-10-27", decidedBy: null, decidedOn: null },
  { decision: "Show owners \"fees\", \"fee notice\" and \"final notice\", never \"levy\".", proposedOn: "2026-10-27", decidedBy: null, decidedOn: null },
  {
    decision: "Apply a payment to fees first, then interest, then recovery costs, as NSW (PAYMENT_ALLOCATION_ORDER). A StrataVerze choice: the notes record no order in force before s 32I.",
    proposedOn: "2026-10-28",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-28",
  },
  {
    decision:
      "Notice timing (NOTICE_RULES): each fee notice goes out 35 days before it falls due, a StrataVerze choice, and never with less than 28 days' notice, StrataVerze's reading of s 31(2)(a) kept as the legal rule. Matthew Wrigley's StrataVerze decision of 28 Oct 2026.",
    proposedOn: "2026-10-28",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-28",
  },
  {
    decision:
      "Quorum (MEETING_RULES.quorumAttestation): the chair's answer for each item, \"quorum present: yes or no\", is accepted until attendance is recorded. It is never filled in for the chair, an item not answered is refused, and the answer is kept in the meeting record with who recorded it. When attendance is recorded the quorum is to be worked out from it instead. Matthew Wrigley's StrataVerze decision of 29 Oct 2026.",
    proposedOn: "2026-10-29",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
  {
    decision:
      "Interim resolutions (MEETING_RULES.pendingResolutions, stage 2, PR 8b-i): (D1) a petition or notice can arrive up to and including the day 29 days after the resolution is made, and it takes effect the next day; (D2) it is made on the later of the meeting's day and the day it is recorded, in the building's time zone; (D3) it does not take effect until its 14-day notice is recorded as given, and a late notice is flagged, not moved; (D4) a valid s 97 petition (more than 25% of all lots) means the motion did not become a special resolution, recorded as lost; (D7) where the special general meeting of s 78 was held but its decision is not recorded, the resolution never takes effect on its own; (D10) a pending item cannot be recorded again, deferred or deleted; (D11) a separate daily run decides them; (D19) migration 20261124_pending_resolutions is approved in principle, applied before the code deploys, after a rehearsal and a further approval; (D20) a late charge waiver relying on one is decided on the day it took effect. Matthew Wrigley's StrataVerze decisions of 29 Oct 2026, kept for legal confirmation (FOR_REVIEW MEETING_RULES_PENDING).",
    proposedOn: "2026-10-29",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
  {
    decision:
      "Interim resolutions settle after a grace (MEETING_RULES.pendingResolutions.settleAfterGraceDays, stage 2, PR 8b-i review M1): the daily run records an interim resolution as having taken effect at the end of its period (PERIOD_ENDED, or MEETING_NOT_HELD under s 78) only once 7 days have passed after the last day of the 29 days, or after the day the special general meeting must be held by. During those 7 days a petition or a special general meeting notice received within the 29 days can still be recorded (its day is still checked against the 29 days). The day it takes effect stays the day after the period ends. A confirmation or a petition is not delayed. Matthew Wrigley's StrataVerze decision of 29 Oct 2026, kept for legal confirmation (FOR_REVIEW MEETING_RULES_PENDING).",
    proposedOn: "2026-10-29",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
  {
    decision:
      "Notice not checked (MEETING_RULES.noticeNotCheckedFor, stage 2, PR 8b-iii): (D12) a notice whose period StrataVerze cannot check, a committee meeting's, is stored as not compliant with no period, with no database change, and shown as \"Notice period not checked\", never as met; (D14) business days (the s 109 committee notice of at least 3 business days and the 4 business days of s 89B for a payment other than cash) stay not checked until what \"business day\" means and a public holiday source are decided. Matthew Wrigley's StrataVerze decisions of 29 Oct 2026, kept for confirmation (FOR_REVIEW MEETING_RULES_NOTICE_AND_MINUTES).",
    proposedOn: "2026-10-29",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
  {
    decision:
      "Proxy caps and minutes (PROXY_RULES and MEETING_RULES.minutesContents, stage 2, PR 8b-iv): (D15) every proxy cap warns only and never stops a proxy being saved, including the 1 lot owner cap at 20 or fewer occupiable lots (the exceptions, family members and the OCR reg 8A cases, cannot be told from the records); where the 5% share is not whole, a holder above it rounded down \"may be over\" and above it rounded up is over, and the warning says the rounding is not confirmed; (D16) the 5% is of the distinct lot owners recorded, falling back to the number of lots, with a note, where any lot has no owner recorded; (D17) a proxy holder in arrears (s 89C(10)) is matched by email to an owner of a lot owing money on the day, warn only; (D18) the minutes show the votes counted for each item, and the attendance parts wait for attendance to be recorded (Stage C). Matthew Wrigley's StrataVerze decisions of 29 Oct 2026, kept for confirmation (FOR_REVIEW PROXY_CAPS and MINUTES_CONTENTS).",
    proposedOn: "2026-10-29",
    decidedBy: "Matthew Wrigley",
    decidedOn: "2026-10-29",
  },
];

/**
 * None of the NSW workflows is switched on for Victoria in this draft. Where
 * Victoria has its own rules (the owners corporation certificate, records and
 * the register, fee recovery) they differ from the NSW workflows and are held
 * above as data. Victoria has no basis for some at all: no committee training
 * duty, Strata Hub report, NSW capital works fund plan or key financial
 * information form was found in the notes. Payment plans are enacted but not
 * in force (PENDING_CHANGES).
 */
export const FEATURES: PackFeatures = {
  /** Enacted (ss 32A to 32J) but not in force; a different scheme from NSW (FOR_REVIEW). */
  statutoryPaymentPlans: false,
  /** No Victorian basis found in the notes. */
  committeeTraining: false,
  /** No Victorian basis: a NSW register. */
  strataHubAnnualReport: false,
  /** No Victorian basis; Victoria's maintenance plan is its own (MAINTENANCE_PLAN). */
  capitalWorksFundPlan: false,
  /** No Victorian basis found in the notes. */
  keyFinancialInformation: false,
  /** Victoria's owners corporation certificate is its own (OWNERS_CORPORATION_CERTIFICATE). */
  strataInformationCertificate: false,
  /** Victoria's records and register rules are their own (RECORDS). */
  recordsInspections: false,
  /** Victoria's fee recovery is its own (FEE_RECOVERY, AUTHORITY_TO_SUE). */
  debtRecoverySteps: false,
};
