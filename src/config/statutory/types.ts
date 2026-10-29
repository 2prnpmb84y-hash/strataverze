/**
 * Shapes shared by every jurisdiction's rule pack (multi-jurisdiction plan,
 * phase 2 foundation, 27 Oct 2026). A pack describes its funds, entitlement
 * schedules and scheme selectors as data, so the shared code can work from
 * the pack instead of from NSW names.
 */

/**
 * How far a rule has been checked:
 * - CONFIRMED: read in the in-force provision;
 * - GUIDANCE: stated in official government guidance, provision not read;
 * - STRATAVERZE: a choice StrataVerze made where the law leaves one;
 * - NOT_CONFIRMED: not verified; shown to advisers as not confirmed.
 */
export type RuleStatus = "CONFIRMED" | "GUIDANCE" | "STRATAVERZE" | "NOT_CONFIRMED";

/**
 * A fund the law requires or allows. `ledgerFund` is the fund type the ledger
 * already uses for it, so the accounts, reports and levies keep working; the
 * name and purpose shown to people come from here.
 */
export interface FundDefinition {
  key: string;
  /** As named in the jurisdiction's law, lower case: "capital works fund". */
  name: string;
  /**
   * The name in title case, as fund lists, forms and reports head it, and as
   * a new building's fund is named: "Capital Works Fund". Ends in " Fund".
   */
  label: string;
  /**
   * The short form account names, report columns and summary cards use:
   * "Admin" ("Levies Receivable - Admin"), "Capital Works" ("Capital Works
   * Expenditure").
   */
  shortLabel: string;
  ledgerFund: "ADMINISTRATIVE" | "CAPITAL_WORKS";
  purpose: string;
  /**
   * Whether every scheme in the jurisdiction must have the fund; a new
   * building is given each required fund. Where the law's answer depends on
   * the scheme, this is false and `requiredWhen` says when.
   */
  required: boolean;
  /**
   * When the law requires the fund, where that depends on the scheme (VIC,
   * ACT and WA stage 2, PR 3). Where present it decides, and `required` is
   * false. Absent means `required` alone answers it (NSW, Queensland).
   */
  requiredWhen?: FundRequiredWhen;
  source: string;
  status: RuleStatus;
}

/**
 * Whether a scheme of one size class must have a fund (or perform a
 * function), from its size and its by-laws:
 * - ALWAYS: it must;
 * - UNLESS_BY_LAWS_EXEMPT: it must, unless its by-laws exempt it;
 * - OPTIONAL: it may, but need not;
 * - ONLY_IF_BY_LAWS_REQUIRE: it must not, unless its by-laws require it.
 */
export type SizeClassRequirement = "ALWAYS" | "UNLESS_BY_LAWS_EXEMPT" | "OPTIONAL" | "ONLY_IF_BY_LAWS_REQUIRE";

/**
 * What a fund condition says of a building whose facts meet a rule's test
 * (VIC, ACT and WA stage 2, PR 3, 28 Oct 2026):
 * - REQUIRED: the building must have the fund;
 * - OPTIONAL: the law does not require it. The rule's `reason` says whether
 *   the notes also say it may keep one;
 * - NOT_ALLOWED: the building may not have it.
 */
export type FundNeed = "REQUIRED" | "OPTIONAL" | "NOT_ALLOWED";

/**
 * One rule of a fund condition. `when` is written against the pack's building
 * selectors (`selector`: a recorded one, a derived one, or Queensland's
 * column selectors, read by `selectorValue`) and the building's facts
 * (`number`, `flag`). `reason` is the pack's words for why, as fund screens
 * show them.
 */
export interface FundConditionRule {
  need: FundNeed;
  when: SelectorCondition;
  reason: string;
  provision: string;
  status: RuleStatus;
}

/**
 * When a fund is required, where that depends on the building (VIC, ACT and
 * WA stage 2, PR 3, 28 Oct 2026). The rules are read in order and the first
 * whose test holds decides, as a derived selector's are. A rule that cannot
 * be decided because a fact or selector is missing leaves the fund
 * undecided: a later rule never decides in its place (it fails closed), and
 * the building is flagged with what to record. `noRuleFits` is shown when
 * every fact is known but no rule holds, and the fund is undecided then too.
 *
 * This replaces the WA pack's first forms (PR #107) with no change in
 * meaning: "DESIGNATED_ONLY" is a rule on the designated status selector, and
 * `{ bySchemeSize }` rules on the scheme size selector and the by-laws.
 */
export interface FundRequiredWhen {
  rules: readonly FundConditionRule[];
  noRuleFits: string;
}

/**
 * What a lot's entitlement decides, so code can take the right schedule
 * (stage 2, step 10, 27 Oct 2026):
 * - CONTRIBUTIONS: the lot's share of levies or contributions;
 * - POLL_VOTE: the value of the lot's vote on a poll;
 * - SPECIAL_RESOLUTION: the entitlement test in a special resolution;
 * - COMMON_PROPERTY_SHARE: the lot's share of the common property;
 * - INSURANCE_COMMON_PROPERTY: the lot's share of the premium for insuring
 *   common property and assets;
 * - INSURANCE_BUILDINGS: the lot's share of the premium for insuring the
 *   buildings (in Queensland by the interest schedule for building and
 *   volumetric format plans only, a ConditionalEntitlementUse on the
 *   building's plan format; no schedule decides it for a standard format plan);
 * - TERMINATION_INTEREST: the lot's interest on termination of the scheme (in
 *   Queensland only on termination by resolution without dissent or court
 *   order);
 * - VALUE_BASED_RATES: value-based local government and State charges, rates
 *   and taxes.
 *
 * Added for Victoria (VIC, ACT and WA stage 2, PR 4, 28 Oct 2026):
 * - UNANIMOUS_RESOLUTION: the entitlement test in a unanimous resolution (in
 *   Victoria on a ballot or poll);
 * - QUORUM_FALLBACK: the entitlement test a quorum falls back to only where
 *   its own first test cannot be met (in Victoria, where 50% of the lots is
 *   not available, s 77). It is never the first test: a quorum is counted by
 *   lots first;
 * - INSURANCE_PREMIUM_FEE: the lot's share of the separate fee for the
 *   reinstatement and replacement insurance premium (Victoria, s 23A). No
 *   code reads it yet: Victoria has no CONTRIBUTION_INSURANCE until its
 *   FOR_REVIEW point is decided.
 * A pack that lists none of them has no schedule for them, so a reader asking
 * for one is refused (EntitlementRuleError), never given another schedule.
 */
export type EntitlementUse =
  | "CONTRIBUTIONS"
  | "POLL_VOTE"
  | "SPECIAL_RESOLUTION"
  | "UNANIMOUS_RESOLUTION"
  | "QUORUM_FALLBACK"
  | "COMMON_PROPERTY_SHARE"
  | "INSURANCE_COMMON_PROPERTY"
  | "INSURANCE_BUILDINGS"
  | "INSURANCE_PREMIUM_FEE"
  | "TERMINATION_INTEREST"
  | "VALUE_BASED_RATES";

/**
 * A schedule of lot entitlements. `onLot` marks the schedule held in each
 * lot's `entitlement` (the one levies are worked out from); any other
 * schedule is held separately for each lot.
 */
export interface EntitlementScheduleDefinition {
  key: string;
  name: string;
  /**
   * The name in title case, as forms and lot pages head it (stage 2,
   * step 10). Absent: the screens keep the words they already show.
   */
  label?: string;
  /** The help shown under the field where it is entered (stage 2, step 10). */
  help?: string;
  /**
   * The column heading the CSV lot import gives the schedule held on each
   * lot, also matched as a header (stage 2, PR 4). Absent: the import keeps
   * its own word, "Entitlement" (NSW and Queensland).
   */
  importLabel?: string;
  onLot: boolean;
  /** What the schedule decides, in plain words. */
  usedFor: readonly string[];
  /**
   * What the schedule decides, for code (stage 2, step 10). A pack with one
   * schedule may leave it out: that schedule decides everything. Where a
   * pack has two, each use is listed under exactly one of them.
   */
  decides?: readonly (EntitlementUse | ConditionalEntitlementUse)[];
  source: string;
  status: RuleStatus;
}

/**
 * A use a schedule decides only for a building whose plan format (the pack's
 * PLAN_FORMAT selector, held in `schemes.plan_format`) is one of
 * `planFormats` (QLD go-live gap, 27 Oct 2026). For any other building, or one
 * with no plan format recorded, the schedule does not decide it.
 */
export interface ConditionalEntitlementUse {
  use: EntitlementUse;
  planFormats: readonly string[];
}

/**
 * The part of a contribution that pays for insurance, shared between the
 * lots by its own schedule rather than with the rest of the contribution
 * (Queensland, SM s 162(5); QLD go-live gap, 27 Oct 2026; Victoria's
 * insurance premium fee, OCA s 23A, stage 2 PR 4). A pack without it shares
 * the whole levy by the schedule that decides CONTRIBUTIONS.
 */
export interface ContributionInsuranceRules {
  /**
   * The fund insurance is paid from. An insurance line in any other fund's
   * budget is refused, never shared as insurance.
   */
  paidFrom: "ADMINISTRATIVE" | "CAPITAL_WORKS";
  /**
   * Whether an ordinary contribution to `paidFrom` is refused when its adopted
   * budget has no insurance line, with the status of that choice (Queensland:
   * a StrataVerze choice, FOR_REVIEW). An insurance line in another fund's
   * budget is always refused.
   */
  insuranceLineRequired: { value: boolean; status: RuleStatus };
  /**
   * The uses whose schedule shares the insurance part. Each must be decided
   * by the same schedule for the building, since the budget holds insurance
   * as one amount.
   */
  uses: readonly EntitlementUse[];
  source: string;
  status: RuleStatus;
}

/** One choice of a scheme selector (for example a Queensland regulation module). */
export interface SelectorOption {
  value: string;
  label: string;
  /** Whether StrataVerze applies this option's rules yet. */
  supported: boolean;
  note?: string;
}

/** A setting chosen for each building that decides which rules apply. */
export interface SchemeSelector {
  key: string;
  label: string;
  help: string;
  options: readonly SelectorOption[];
  source: string;
  status: RuleStatus;
}

/*
 * Building selectors (VIC, ACT and WA stage 2, PR 2, 28 Oct 2026). A pack
 * lists in BUILDING_SELECTORS the settings that decide which of its rules
 * apply to a building, and says how each is held:
 * - RECORDED: an adviser records it, and it is kept in the shared store
 *   (`scheme_selector_values`), checked against the selector's options;
 * - DERIVED: it is worked out from the building's facts (BuildingFactKey) by
 *   `deriveSelector` (src/lib/jurisdiction/building-selectors.ts), never
 *   stored, and refused where a fact it needs is missing.
 * Queensland's REGULATION_MODULE and PLAN_FORMAT keep their own columns and
 * forms; the general reader reads them from those columns.
 */

/**
 * A fact about a building that a derived selector is worked out from:
 * - LOT_COUNT: the building's lots, not counting common property rows. Read
 *   only where it matches the building's recorded total lots;
 * - OCCUPIABLE_LOT_COUNT and NON_OCCUPIABLE_LOT_COUNT: the lots recorded as
 *   occupiable and as not occupiable (`lots.occupiable`). Read only where
 *   every lot has an answer;
 * - SERVICES_ONLY: whether the building is recorded as services only
 *   (`schemes.services_only`);
 * - REPLACEMENT_COST_CENTS: the replacement cost recorded for the building
 *   (`schemes.replacement_cost`), in cents.
 */
export type BuildingFactKey = "LOT_COUNT" | "OCCUPIABLE_LOT_COUNT" | "NON_OCCUPIABLE_LOT_COUNT" | "SERVICES_ONLY" | "REPLACEMENT_COST_CENTS";

/** The facts an adviser records, and where each is held. */
export type RecordedFactKey = "LOT_OCCUPIABLE" | "SERVICES_ONLY" | "REPLACEMENT_COST";

/**
 * How a pack names a fact it asks advisers to record: LOT_OCCUPIABLE is
 * answered for each lot, SERVICES_ONLY once for the building (yes or no), and
 * REPLACEMENT_COST once for the building, in dollars.
 */
export interface BuildingFactDefinition {
  label: string;
  help: string;
  /** For a yes or no fact: the words for each answer. */
  yesLabel?: string;
  noLabel?: string;
  /**
   * LOT_OCCUPIABLE only: StrataVerze lot types that are never occupiable
   * (Victoria: a car park or a storage locker, OCA s 3). A lot of one of these
   * types answered "yes" is flagged, and nothing that reads the answer is
   * worked out until it is corrected. `status` is the status of mapping the
   * law's words to the lot types.
   */
  neverForLotTypes?: { lotTypes: readonly string[]; status: RuleStatus };
  source: string;
  status: RuleStatus;
}

/**
 * A test of a building's facts in a derived selector's rule. Number tests are
 * inclusive (`atLeast`, `atMost`) or strict (`moreThan`, `lessThan`), exactly
 * as the provision words them. `selector` tests a recorded selector's value.
 * A test needing a fact that is missing is neither true nor false, so the
 * rule cannot be decided and the selector is refused (it fails closed).
 */
export type SelectorCondition =
  | {
      readonly number: Exclude<BuildingFactKey, "SERVICES_ONLY">;
      readonly atLeast?: number;
      readonly atMost?: number;
      readonly moreThan?: number;
      readonly lessThan?: number;
    }
  | { readonly flag: "SERVICES_ONLY"; readonly is: boolean }
  | { readonly selector: string; readonly in: readonly string[] }
  | { readonly all: readonly SelectorCondition[] }
  | { readonly any: readonly SelectorCondition[] };

/**
 * One rule of a derived selector. Rules are read in order and the first whose
 * test holds decides. `value` is one of the selector's options, or null where
 * the pack does not let StrataVerze work the value out (`refusal` says why,
 * for the adviser).
 */
export interface DerivedSelectorRule {
  value: string | null;
  when: SelectorCondition;
  refusal?: string;
  provision: string;
  status: RuleStatus;
}

/** A building selector an adviser records. */
export interface RecordedBuildingSelector extends SchemeSelector {
  held: "RECORDED";
  /**
   * Where a building with no value recorded is flagged (stage 2, PR 3).
   * Absent: always, in "Building data missing". "FUND_CONDITIONS": only where
   * a fund condition needs the value to decide a fund, for a fact only some
   * buildings need (a Western Australian scheme's by-laws on the
   * administrative fund matter for 2 to 5 lots only). A value StrataVerze
   * does not know or support is always flagged.
   */
  flagMissing?: "FUND_CONDITIONS";
}

/** A building selector worked out from the building's facts. */
export interface DerivedBuildingSelector extends SchemeSelector {
  held: "DERIVED";
  rules: readonly DerivedSelectorRule[];
  /** Shown when every fact is known but no rule holds. */
  noRuleFits: string;
}

export type BuildingSelector = RecordedBuildingSelector | DerivedBuildingSelector;

/**
 * The words every pack gives for the things the platform names. A pack may
 * add more (Queensland adds "contribution", "community titles scheme").
 */
export interface SharedTerminology {
  /** The body that owns the common property: "owners corporation", "body corporate". */
  ownersCorporation: string;
  /** The elected committee: "strata committee", "committee". */
  committee: string;
  /** The governing Act, in full. */
  act: string;
  /** The governing Act, short form used in citations. */
  actShort: string;
  /** The jurisdiction, as it follows the Act's name: "NSW", "Qld". */
  jurisdictionShort: string;
  /**
   * The strata disputes tribunal: "NCAT", "QCAT", "SAT". Whether it also
   * hears levy claims differs by jurisdiction (in Western Australia it does
   * not); see the pack's debt recovery rules.
   */
  tribunal: string;
  /** One amount owners pay towards the funds, lower case: "levy", "contribution". */
  levy: string;
  /** The same, plural: "levies", "contributions". */
  levies: string;
  /** What is charged on an overdue amount, lower case: "interest", "penalty". */
  lateCharge: string;
  /** How the plan is named before its number on notices and PDFs: "Strata Plan", "Community titles scheme". */
  planLabel: string;
  /**
   * The legal entity's name, with `{plan}` for the plan or scheme number and
   * `{name}` for the building's name: "The Owners - Strata Plan No. {plan}".
   */
  bodyCorporateName: string;
  /**
   * The legal entity's name as meeting notices, minutes and examples head it,
   * with the same tokens. NSW leaves out "No." here ("The Owners - Strata Plan
   * {plan}"); a pack with no short form gives its full name.
   */
  bodyCorporateShortName: string;
  /**
   * What an agreed arrangement to pay overdue amounts is called, as a debt
   * recovery case's status, the owner's card and the lot's debt collection
   * section head it (QLD wording go-live, 27 Oct 2026): "Payment
   * Arrangement" (Queensland, which has no statutory payment plan).
   * Optional: a pack without it (NSW, whose statutory payment plan the
   * screens have always called "Payment Plan") keeps the screens' label.
   */
  paymentPlan?: string;
  /**
   * What a charge on an overdue amount is called in general, where buildings
   * with different words for it are shown together (an owner with NSW and
   * Queensland lots): "late payment charge". Optional: the first pack shown
   * that gives one is used, and where none does the buildings' own words are
   * joined. NSW gives none, so its pack is unchanged.
   */
  lateChargeGeneral?: string;
  /**
   * The body that owns the common property, plural, where a page lists
   * several (the schemes list, the adviser home): "bodies corporate" (QLD
   * finance wording go-live, 28 Oct 2026). Optional: a pack without it (NSW)
   * adds an "s" to ownersCorporation ("owners corporations"), as the screens
   * have always said, so its pack is unchanged.
   */
  ownersCorporations?: string;
  /**
   * What a scheme is called, lower case: "community titles scheme" (QLD
   * finance wording review, 28 Oct 2026). Optional: a pack without it (NSW)
   * keeps the screens' "strata scheme".
   */
  scheme?: string;
  /**
   * What the platform calls a lot, lower case, where the pack's law uses
   * another word (the ACT's "unit"), with its plural. Optional: a pack
   * without them keeps "lot" and "lots" (NSW and Queensland are unchanged).
   */
  lot?: string;
  lots?: string;
}

/**
 * The jurisdiction's own workflows a pack switches on (stage 2, 27 Oct 2026).
 * Pages, links and daily reminders for a workflow show only for buildings
 * whose pack has it.
 */
export interface PackFeatures {
  /** The NSW payment plan workflow (Form 1 request, 28-day reply). */
  statutoryPaymentPlans: boolean;
  /** NSW committee training tracking and reminders. */
  committeeTraining: boolean;
  /** The NSW Strata Hub annual report and reminders. */
  strataHubAnnualReport: boolean;
  /** The NSW 10-year capital works fund plan. */
  capitalWorksFundPlan: boolean;
  /** The NSW statement of key financial information (approved form). */
  keyFinancialInformation: boolean;
  /** The NSW s 184 strata information certificate. */
  strataInformationCertificate: boolean;
  /**
   * Records inspections, under the pack's INSPECTIONS rules: NSW s 182 (3 and
   * 10 day deadlines, hourly fees), Queensland Act s 205 (within 7 days, fees
   * in fee units).
   */
  recordsInspections: boolean;
  /** The NSW debt recovery step sequence. */
  debtRecoverySteps: boolean;
  /**
   * The Queensland body corporate certificate (stage 2, step 9). A pack
   * without the key does not have it, so the NSW pack's FEATURES stay as
   * recorded.
   */
  bodyCorporateCertificate?: boolean;
}

/**
 * A fee table that changes each financial year: dollar amounts by year,
 * keyed "2026-27", for the year starting on `yearStartsOn` (MM-DD).
 */
export interface FeeYearTable<T> {
  yearStartsOn: string;
  byYear: Readonly<Record<string, T>>;
}

/**
 * The certificate a buyer or other interested person can ask for, in one
 * shape for every pack (stage 2, step 9, 27 Oct 2026): NSW the s 184 strata
 * information certificate, Queensland the body corporate certificate.
 * `items` are the headings StrataVerze drafts, in order. `agentType` is the
 * requester type who acts for one of the others; that person is recorded too.
 */
export interface CertificateRules {
  title: string;
  /** How the lot page's button names it. */
  buttonLabel: string;
  section: string;
  form: string;
  requesterTypes: Readonly<Record<string, string>>;
  agentType: string;
  items: ReadonlyArray<readonly [string, string]>;
  /** How the PDF labels the plan or scheme number. */
  planRowLabel: string;
  execution: string;
  /** The lines in the PDF's execution box after `execution`. */
  executionLines: readonly string[];
  /** What StrataVerze's layout follows, after "following": "the items of the Approved form: ...". */
  follows: string;
  conclusiveNote: string;
  helpUrl: string | null;
  /** Business days after the written request to give it, or null where the law sets none. */
  giveWithinBusinessDays: number | null;
  fee:
    | { basis: "CENTS"; feeCents: number; repeatFeeCents: number; repeatWithinMonths: number; repeatSamePersonOnly: false; source: string }
    | {
        basis: "FEE_UNITS";
        feeUnits: number;
        repeatFeeUnits: number;
        repeatWithinMonths: number;
        /** The repeat fee is for the same person asking about the same lot. */
        repeatSamePersonOnly: true;
        dollars: FeeYearTable<{ feeCents: number; repeatFeeCents: number }>;
        source: string;
      };
}

/**
 * Inspecting a body's records, in one shape for every pack (stage 2,
 * step 9): who may ask (`requesterTypes`, with `agentType` acting for
 * another), the deadline, and the fees. NSW (`basis` HOURLY): a time agreed
 * within some days, or set by notice within more, and fees by the hour.
 * Queensland (`basis` FEE_UNITS): access within some days of the request, a
 * fee for an owner or anyone else to inspect, and a fee for each page copied.
 */
export type InspectionRules =
  | {
      basis: "HOURLY";
      section: string;
      whoMayAsk: string;
      requesterTypes: Readonly<Record<string, string>>;
      agentType: string;
      agreeWithinDays: number;
      setWithinDays: number;
      fees: Readonly<Record<string, { firstHourCents: number; extraHalfHourCents: number }>>;
      feesIncludeGst: boolean;
      paidInto: string;
      partHalfHour: string;
      source: string;
    }
  | {
      basis: "FEE_UNITS";
      section: string;
      whoMayAsk: string;
      requesterTypes: Readonly<Record<string, string>>;
      agentType: string;
      accessWithinDays: number;
      /** The requester types charged the owner's fee; every other type pays the other fee. */
      ownerFeeTypes: readonly string[];
      feeUnits: { owner: number; other: number; copyPerPage: number };
      dollars: FeeYearTable<{ ownerCents: number; otherCents: number; copyPerPageCents: number }>;
      feesIncludeGst: boolean;
      source: string;
    };

/**
 * How long the document library shows each record must be kept (stage 2,
 * step 9): years by library category, `generalYears` for a category not
 * listed, and null for no limit (`unlimited` says how).
 */
export interface DocumentRetentionRules {
  byCategory: Readonly<Record<string, number | null>>;
  generalYears: number | null;
  /** Shown for a record with no limit: "kept for the life of the scheme". */
  unlimited: string;
  /** Shown under the list: records the categories do not capture. */
  note: string;
  source: string;
}

/**
 * When works need more than one quote (stage 2, step 9): over a fixed amount
 * (NSW), or over the lesser of an amount for each lot and a cap (Queensland's
 * major spending limit). Dollars, compared with the quoted total.
 */
export interface WorksQuoteRules {
  minimumQuotes: number;
  threshold: { basis: "FIXED"; dollars: number } | { basis: "PER_LOT_CAPPED"; perLotDollars: number; capDollars: number };
  /** How the screens cite the rule: "SSMA s 102". */
  citation: string;
  source: string;
}

/**
 * The hardship information a notice carries, where the jurisdiction requires
 * one (NSW: the Financial Hardship Information Statement).
 */
export interface HardshipInformation {
  title: string;
  summary: string;
  helplineName: string;
  helplinePhone: string;
  helplineWeb: string;
  moreInformationUrl: string;
}

/**
 * A building's late charge setting (`schemes.interest_mode`):
 * - STATUTORY: the rate the law fixes (NSW; the ACT and WA default rates);
 * - NO_INTEREST: none, because a recorded resolution says so (NSW);
 * - NONE: none, because none has been resolved (Queensland's default);
 * - RESOLVED_RATE: at the monthly rate a recorded resolution set (Queensland);
 * - RESOLVED_ANNUAL_RATE: at the annual rate a recorded resolution set, within
 *   the pack's range (`annual.resolvedRate`; VIC, ACT and WA stage 2, PR 5),
 *   held in `schemes.late_charge_annual_rate_percent`.
 */
export type LateChargeMode = "STATUTORY" | "NO_INTEREST" | "NONE" | "RESOLVED_RATE" | "RESOLVED_ANNUAL_RATE";

/**
 * How the late charge on an overdue levy is worked out:
 * - DAILY_SIMPLE_ANNUAL: simple interest at an annual rate, day by day from
 *   the due date, after a grace period (NSW);
 * - MONTHLY_SIMPLE_WHOLE_MONTHS: simple interest at a monthly rate for each
 *   whole month in arrears after the date for payment (Queensland);
 * - ANNUAL_RATE: interest at an annual rate, the statutory one or one a
 *   resolution set within a range, worked out day by day exactly as `annual`
 *   records (VIC, ACT and WA stage 2, PR 5). Every detail of it is a
 *   CheckedValue, and one with no value stops the charge (fails closed).
 */
export type LateChargeMethod = "DAILY_SIMPLE_ANNUAL" | "MONTHLY_SIMPLE_WHOLE_MONTHS" | "ANNUAL_RATE";

/**
 * A value of a rule that the late charge engine may rely on only when it is
 * checked (VIC, ACT and WA stage 2, PR 5, 28 Oct 2026): read in the
 * in-force text (CONFIRMED) or a StrataVerze choice (STRATAVERZE). Anything
 * else has no value, so the engine refuses to charge rather than guess:
 * NOT_CONFIRMED where the notes do not give it, GUIDANCE where only
 * guidance does (the figure is kept in `guidance` for the review, never used).
 */
export type CheckedValue<T> =
  | { value: T; status: "CONFIRMED" | "STRATAVERZE"; source: string; note?: string }
  | { value: null; status: "NOT_CONFIRMED" | "GUIDANCE"; source: string; note: string; guidance?: T };

/**
 * The kind of resolution that sets an annual rate or decides a waiver:
 * - GENERAL_MEETING: any resolution carried at a general meeting;
 * - ORDINARY, SPECIAL: a motion carried at a general meeting and recorded as
 *   that category (`agenda_items.resolution_category`).
 */
export type LateChargeResolutionKind = "GENERAL_MEETING" | "ORDINARY" | "SPECIAL";

/** Who decides, with the words the screens use for it ("a special resolution"). */
export interface LateChargeResolution {
  kind: LateChargeResolutionKind;
  words: string;
}

/**
 * The annual rate a resolution may set instead of the statutory one, and by
 * what kind of resolution. Each part is checked: where the notes do not say
 * who decides, or a bound is not confirmed, no rate can be recorded.
 */
export interface ResolvedAnnualRateRule {
  resolution: CheckedValue<LateChargeResolution>;
  /** The lowest rate, % a year, inclusive. */
  minPercent: CheckedValue<number>;
  /** The highest rate, % a year. */
  maxPercent: CheckedValue<number>;
  /** Whether the highest rate itself may be set ("up to 20%"), or only a rate below it ("a lesser rate"). */
  maxInclusive: boolean;
}

/** What a waiver in a particular case may do: the whole late charge on a notice, an amount of it, or the days in a period. */
export type LateChargeWaiverKind = "WHOLE" | "AMOUNT" | "PERIOD";

/** A pack's one-case waiver: what it may waive, who decides, and whether decisions go to the AGM. */
export interface LateChargeWaiverRule {
  kinds: readonly LateChargeWaiverKind[];
  /** Who decides; with no value, who may decide is not confirmed and no waiver can be recorded. */
  decidedBy: CheckedValue<LateChargeResolution>;
  /** Decisions to waive or not, with reasons, are reported to the annual general meeting. */
  reportedToAgm: boolean;
  /** The waiver form's words for the meeting and the motion that decided it ("General meeting", "Motion carried"). */
  formWords: { meeting: string; motion: string };
  source: string;
  status: RuleStatus;
}

/**
 * An annual-rate late charge (method ANNUAL_RATE; VIC, ACT and WA stage 2,
 * PR 5, 28 Oct 2026). The interest on a day is the unpaid levy times the
 * rate divided by `daysInYear`, summed and rounded once to the cent.
 */
export interface AnnualLateChargeRules {
  /**
   * The rate the law fixes when no resolution has varied it (STATUTORY), % a
   * year, or null where the law fixes none (Victoria: interest only if a
   * resolution authorises it). With no value, it is not confirmed.
   */
  statutoryRatePercent: CheckedValue<number> | null;
  /** The rate a resolution may set instead (RESOLVED_ANNUAL_RATE), or null where none may be set. */
  resolvedRate: ResolvedAnnualRateRule | null;
  accrual: {
    /** The first day interest runs for: the due date, so a levy unpaid on its due date bears one day for each day after. */
    from: CheckedValue<"DUE_DATE">;
    /** Whole months after the due date within which a levy paid in full bears none. */
    graceMonths: CheckedValue<number>;
    /** Simple interest on the unpaid levy, never on interest. */
    simple: CheckedValue<true>;
    /** The days a year's rate is shared over, day by day. */
    daysInYear: CheckedValue<number>;
  };
  /** The one-case waiver, or null where the pack gives none. */
  waiver: LateChargeWaiverRule | null;
  source: string;
}

/**
 * The late charge on overdue levies (NSW interest, Queensland penalty), in
 * one shape for every pack (stage 2, step 6, 27 Oct 2026).
 */
export interface LateChargeRules {
  method: LateChargeMethod;
  /** The settings a building may choose. */
  modes: readonly LateChargeMode[];
  /** The setting a new building starts with. */
  defaultMode: LateChargeMode;
  /** The settings that need the recorded general meeting resolution that decided them. */
  resolutionRequiredFor: readonly LateChargeMode[];
  /** The fixed annual rate (STATUTORY), or null where the law fixes none. */
  annualRatePercent: number | null;
  /** The highest monthly rate a resolution may set (RESOLVED_RATE), or null where none can be set. */
  maxMonthlyRatePercent: number | null;
  /** Whole months after the due date within which a levy paid in full bears no charge. */
  graceMonths: number;
  source: string;
  /**
   * The annual-rate rule (method ANNUAL_RATE), with every value checked (VIC,
   * ACT and WA stage 2, PR 5). Absent for NSW and Queensland, whose rules are
   * the fields above. Where present, `annualRatePercent` and
   * `maxMonthlyRatePercent` are null and `graceMonths` is 0, so a reader that
   * knows only those fields charges nothing rather than the wrong rate.
   */
  annual?: AnnualLateChargeRules;
}

/** The order a payment is applied to what an owner owes ("INTEREST" is the late charge, Queensland's penalty). */
export type PaymentAllocationPart = "LEVY" | "INTEREST" | "RECOVERY_COSTS";

/**
 * The rules for the notice that asks an owner to pay a levy (NSW) or a
 * contribution (Queensland), in one shape for every pack (stage 2, step 5,
 * 27 Oct 2026).
 */
export interface NoticeRules {
  /** The least notice the law allows between the notice and the due date, in days. */
  minimumNoticeDays: number;
  /**
   * StrataVerze practice: how many days before it falls due each notice goes
   * out. At least `minimumNoticeDays`.
   */
  issueDaysBeforeDue: number;
  /**
   * The shorter minimum notice for an urgent special levy, in days, or null
   * where the law gives none (the urgent option is then not offered).
   */
  urgentNoticeDays: number | null;
  /**
   * The hardship statement every notice must carry from `requiredFrom`
   * (YYYY-MM-DD), or null where none is required (the notice then has none).
   */
  hardship: { requiredFrom: string; information: HardshipInformation } | null;
  /** What a notice states, in plain words. */
  contents: readonly string[];
  source: string;
  /**
   * The notice rules with every value checked (VIC, ACT and WA stage 2,
   * PR 6a, 28 Oct 2026). Absent for NSW and Queensland, whose rules are the
   * fields above. Where present it decides (read it with `noticeTimingFor`
   * and `noticeRuleProblems`, src/lib/levies/notice-rule-check.ts), and the
   * fields above hold the safest values for a reader that knows only them:
   * `minimumNoticeDays` the floor, `issueDaysBeforeDue` no more than the
   * maximum. A value with no value refuses every notice (fails closed).
   */
  checked?: CheckedNoticeRules;
}

/** The ledger fund a notice is for (FundDefinition.ledgerFund). */
export type NoticeLedgerFund = FundDefinition["ledgerFund"];

/**
 * What a pack may require a notice to state beyond the items every notice
 * carries (the plan, the lot, the owner, the dates, the fund, the amount,
 * how to pay, who to contact and the ledger), stage 2 PR 6a:
 * - EVERY_LOT_CONTRIBUTION: the contribution payable for each other lot;
 * - FUND_TOTAL: the fund or funds, the split between them and the totals;
 * - PROPORTION_AND_METHOD: the lot's proportion and how it is worked out;
 * - INSTALMENT_DATES: the instalment dates, if any;
 * - EARLY_PAYMENT_DISCOUNT: any discount for paying early;
 * - LATE_CHARGE_STATEMENT: the late charge (interest) for paying late;
 * - PAY_WITHIN_DAYS_STATEMENT: the obligation to pay within a number of days after the date of the notice;
 * - DISPUTE_PROCESS: how a disputed amount is resolved under the building's rules.
 */
export type NoticeContentKey =
  | "EVERY_LOT_CONTRIBUTION"
  | "FUND_TOTAL"
  | "PROPORTION_AND_METHOD"
  | "INSTALMENT_DATES"
  | "EARLY_PAYMENT_DISCOUNT"
  | "LATE_CHARGE_STATEMENT"
  | "PAY_WITHIN_DAYS_STATEMENT"
  | "DISPUTE_PROCESS";

/** One thing a notice must state, in the pack's words, for the funds listed (every fund where absent). */
export interface NoticeContentRequirement {
  key: NoticeContentKey;
  words: string;
  ledgerFunds?: readonly NoticeLedgerFund[];
  status: RuleStatus;
  source: string;
}

/** The approved form a notice must be in, where the law sets one. */
export interface NoticeFormRule {
  /** Whether the notice must be in the form; with no value, whether it must is not confirmed. */
  required: CheckedValue<boolean>;
  /** The form's own title. */
  title: string;
  /** Where the form is published. */
  reference: string;
  /** The day the current form applied from (YYYY-MM-DD). */
  appliedFrom: CheckedValue<string>;
  source: string;
}

/**
 * How notices for a fund are given: one for each instalment as it falls due
 * (PER_INSTALMENT), or one a year within a number of months after the annual
 * general meeting (the ACT sinking fund, UTMA s 90(1)).
 */
export type NoticeMode = "PER_INSTALMENT" | { annualWithinMonthsAfterAgm: number };

/**
 * The checked notice rules (VIC, ACT and WA stage 2, PR 6a). Every value is a
 * CheckedValue: read in the in-force text (CONFIRMED) or a StrataVerze choice
 * (STRATAVERZE). One with no value (NOT_CONFIRMED, GUIDANCE) refuses every
 * notice until a pack version records it.
 */
export interface CheckedNoticeRules {
  /** The least notice between the notice and the due date, in days. */
  minimumNoticeDays: CheckedValue<number>;
  /** The most notice the law allows, in days, or null where the law sets none. */
  maximumNoticeDays: CheckedValue<number> | null;
  /** How many days before it falls due each notice goes out: at least the minimum and at most the maximum. */
  issueDaysBeforeDue: CheckedValue<number>;
  /** Whether a notice that cannot be given the minimum notice may fall due later (the minimum after the day it goes out). */
  dueDateMayMove: CheckedValue<boolean>;
  /** How notices for each ledger fund are given; a fund not listed has no notice rule, so its notices are refused. */
  noticeMode: Readonly<Partial<Record<NoticeLedgerFund, CheckedValue<NoticeMode>>>>;
  /** What a notice must state beyond the items every notice carries. */
  requiredContents: readonly NoticeContentRequirement[];
  /** The approved form the notice must be in, or null where the law sets none. */
  form: NoticeFormRule | null;
  source: string;
}

/**
 * One step of a pack's debt recovery sequence, copied onto each new case
 * (stage 2, step 8, 27 Oct 2026; moved here from nsw.ts unchanged). Owners
 * see `actionRequired` and `legalBasis`. `status` says how far the step has
 * been checked (a step that is StrataVerze practice, not law, is STRATAVERZE).
 * It is pack data only, never copied onto a case. NSW leaves it out.
 */
export interface DebtRecoveryStepRule {
  stepType: string;
  stepOrder: number;
  actionRequired: string;
  legalBasis?: string;
  responsibleParty: string;
  approvalRequired: boolean;
  triggerCondition: string;
  noticeType?: string;
  status?: RuleStatus;
}

/**
 * A pack's rules for recovering unpaid levies or contributions that shared
 * code reads (stage 2, step 8). `mustStartProceedings`: where the law
 * requires proceedings for a debt outstanding `overdueYears`, they must start
 * within `withinMonths` after (Queensland, SM s 166(2)). NSW has no such rule.
 */
export interface DebtRecoveryRules {
  /** `citation` is how the warning cites the provision ("Standard Module s 166(2)"). */
  mustStartProceedings?: { readonly overdueYears: number; readonly withinMonths: number; readonly citation: string };
  /**
   * The subject and heading of the daily reminder for `mustStartProceedings`
   * (QLD go-live gap, 27 Oct 2026), StrataVerze wording for the pack review.
   * `{lot}`, `{date}` (the deadline) and `{scheme}` are filled in. A pack with
   * the rule but without these sends no reminder.
   */
  proceedingsReminder?: {
    readonly subject: string;
    readonly subjectPassed: string;
    readonly heading: string;
    readonly headingPassed: string;
  };
  source: string;
}

/*
 * Dated rules (VIC, ACT and WA stage 2, PR 1, 28 Oct 2026). A rule whose
 * value changes on a date holds every value it has had or will have, each
 * with where it stands in law. Code reads the value in force on a day with
 * `ruleInForceOn` (src/lib/jurisdiction/dated-rules.ts). A value that is
 * only enacted or made is never applied until a pack version records the day
 * it commenced, and a Bill or an announcement is never applied.
 */

/**
 * Where a dated value stands in law:
 * - IN_FORCE: read in the in-force text, applying from `from`;
 * - ENACTED_NOT_COMMENCED: in an Act that has passed, not yet commenced;
 * - MADE_NOT_COMMENCED: in a regulation that has been made, not yet commenced;
 * - ANNOUNCED_NO_LEGISLATION: announced, with no Bill or Act;
 * - NOT_LAW: in a Bill. Never law until it passes.
 */
export type DatedLegalStatus = "IN_FORCE" | "ENACTED_NOT_COMMENCED" | "MADE_NOT_COMMENCED" | "ANNOUNCED_NO_LEGISLATION" | "NOT_LAW";

/**
 * The value recorded where the law has no statutory rule on the point (for
 * example no statutory order for applying a payment). It is a value, so code
 * can tell "no statutory rule" from "no value recorded" (the reader refuses
 * the second). Its `status` says how far the absence was checked.
 */
export type NoStatutoryRule = "NO_STATUTORY_RULE";

interface DatedValueBase<T> {
  value: T;
  source: string;
  /** The pack's own record of the change this value comes from (VIC PENDING_CHANGES, ACT PENDING_REFORMS), by key. */
  pendingChange?: string;
  note?: string;
}

/**
 * A value read in the in-force text. It applies from `from` (YYYY-MM-DD, a
 * day in the building's time zone). Where the notes read only the current
 * version of the law, `from` is that version's start, not the day the rule
 * was first made: a day before it has no value recorded.
 */
export interface InForceDatedValue<T> extends DatedValueBase<T> {
  legalStatus: "IN_FORCE";
  from: string;
  status: RuleStatus;
}

/**
 * A value enacted or made but not yet commenced. It applies only from
 * `commencedOn`, which stays null until a pack version records the day it
 * commenced (after checking the Government Gazette or the legislation
 * register). `fixedStartDate` is the day the instrument itself fixes, or null
 * where it commences on proclamation; `latestStartDate` is the day it
 * commences at the latest. Neither switches the value on: once one has
 * passed, the pending law check lists the value so a person checks.
 */
export interface PendingDatedValue<T> extends DatedValueBase<T> {
  legalStatus: "ENACTED_NOT_COMMENCED" | "MADE_NOT_COMMENCED";
  commencedOn: string | null;
  fixedStartDate: string | null;
  latestStartDate: string | null;
  /** How it commences, in plain words. */
  commencement: string;
  /** How far the enacted or made text was checked (not that it is in force). */
  status: RuleStatus;
}

/** A change announced with no legislation. Never applied. */
export interface AnnouncedDatedValue<T> extends DatedValueBase<T> {
  legalStatus: "ANNOUNCED_NO_LEGISLATION";
  commencement: string;
  status: RuleStatus;
}

/**
 * A value in a Bill. Never applied: when the Bill passes, a pack version
 * restates it as enacted, with its commencement. A Bill's text is not a
 * RuleStatus (CONFIRMED means read in the in-force text), so it has
 * `textStatus` instead.
 */
export interface BillDatedValue<T> extends DatedValueBase<T> {
  legalStatus: "NOT_LAW";
  /** The day the Bill was presented. */
  presentedOn: string;
  commencement: string;
  textStatus: "READ_IN_BILL_TEXT";
}

export type DatedValue<T> = InForceDatedValue<T> | PendingDatedValue<T> | AnnouncedDatedValue<T> | BillDatedValue<T>;

/**
 * A rule that changes on a date: every value it has had or will have, oldest
 * first. A pack holds its dated rules in DATED_RULES, by key.
 */
export interface DatedRule<T> {
  /** What the rule is, in plain words. */
  title: string;
  versions: readonly DatedValue<T>[];
  note?: string;
}

/** A pack's dated rules, by key. */
export type DatedRules = Readonly<Record<string, DatedRule<unknown>>>;

/*
 * Proxy caps (VIC, ACT and WA stage 2, PR 8b-iv, 29 Oct 2026). Every cap
 * warns only and never stops a proxy being saved (Matthew Wrigley's decision
 * D15 of 29 Oct 2026): a proxy is held as free text on a lot, with no holder
 * identity, so the count can only be StrataVerze's best match.
 */

/** A proxy limit as a pack holds it on a day (Victoria's s 89D, DATED_RULES.PROXY_LIMIT). */
export interface ProxyLimitValue {
  /** The most lot owners a person may hold proxies for, where `aboveThreshold` does not apply. */
  maxLotOwners: number;
  /** Where the limit depends on the building's size: above this many occupiable lots, a share of the lot owners. Null where it does not. */
  aboveThreshold: {
    occupiableLotsMoreThan: number;
    maxPercentOfLotOwners: number;
    counts: string;
    roundingStatus: RuleStatus;
  } | null;
  /** Who the limit does not apply to. */
  exceptions: readonly string[];
  exceptionsStatus: RuleStatus;
}

/** A band of the building (the ACT's PROXY_LIMIT_BAND option) and the proxies a holder may have in it. */
export interface ProxyBandLimit {
  /** The option of the band selector. */
  value: string;
  /** A fixed number of proxies, or a share (percent) of the units. */
  max: { proxies: number } | { percentOfUnits: number };
}

/**
 * How many proxies one person may hold for a meeting, where the pack limits
 * it. Read by `proxyCapWarnings` (src/lib/meetings/proxy-caps.ts) for the
 * warnings shown when a proxy is checked and on the meeting page. A pack
 * without PROXY_RULES has no cap checked (NSW, Queensland, Western
 * Australia).
 */
export interface ProxyRules {
  /** Victoria: the limit, read on the meeting's day (or today) with ruleInForceOn. Where the reader refuses, the warning says the limit cannot be told. */
  datedLimit?: DatedRule<ProxyLimitValue>;
  /** The ACT: the derived band of the building and each band's limit. Where the band cannot be worked out, the warning says so. */
  band?: { selector: DerivedBuildingSelector; limits: readonly ProxyBandLimit[] };
  /**
   * What the share is of: LOT_OWNERS, the distinct owners recorded on the
   * building's lots (Victoria, decision D16: the lot count where any lot has
   * no owner recorded, and the warning says the owners may be incomplete),
   * or UNITS, the building's units (the ACT).
   */
  shareOf: "LOT_OWNERS" | "UNITS";
  /** Who the limit does not apply to, in plain words to follow "unless the holder is", with no full stop. */
  exceptWords: string;
  /** Whether the pack says how a share is rounded. Where it does not, a holder above the share rounded down "may be over" and above it rounded up "is over" (decision D15). */
  roundingStatus: RuleStatus;
  /**
   * Victoria s 89C(10): an owner in arrears may not act as a proxy. Warned
   * where the holder's email matches an owner of a lot owing money on the
   * day (decision D17). `words` ends the warning, a sentence.
   */
  holderInArrears?: { words: string; source: string; status: RuleStatus };
  source: string;
  status: RuleStatus;
}

/** A StrataVerze fee (price book code and variant). */
export interface FeeVariant {
  code: string;
  variant: string;
}
