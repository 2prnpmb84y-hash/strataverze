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
   * When the law requires the fund, where that depends on the scheme. Absent
   * means `required` alone answers it (NSW, Queensland).
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
 * When a fund is required (WA pack, 27 Oct 2026):
 * - "ALWAYS": every scheme must have it;
 * - "DESIGNATED_ONLY": required only where the scheme meets the pack's
 *   designated test (Western Australia: a designated strata company); any
 *   other scheme may establish it;
 * - `{ bySchemeSize }`: by size class, keyed by the values of the pack's
 *   scheme size selector.
 */
export type FundRequiredWhen = "ALWAYS" | "DESIGNATED_ONLY" | { readonly bySchemeSize: Readonly<Record<string, SizeClassRequirement>> };

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
 */
export type EntitlementUse =
  | "CONTRIBUTIONS"
  | "POLL_VOTE"
  | "SPECIAL_RESOLUTION"
  | "COMMON_PROPERTY_SHARE"
  | "INSURANCE_COMMON_PROPERTY"
  | "INSURANCE_BUILDINGS"
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
 * (Queensland, SM s 162(5); QLD go-live gap, 27 Oct 2026). A pack without it
 * shares the whole levy by the schedule that decides CONTRIBUTIONS.
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
 * - STATUTORY: the rate the law fixes (NSW);
 * - NO_INTEREST: none, because a recorded resolution says so (NSW);
 * - NONE: none, because none has been resolved (Queensland's default);
 * - RESOLVED_RATE: at the rate a recorded resolution set (Queensland).
 */
export type LateChargeMode = "STATUTORY" | "NO_INTEREST" | "NONE" | "RESOLVED_RATE";

/**
 * How the late charge on an overdue levy is worked out:
 * - DAILY_SIMPLE_ANNUAL: simple interest at an annual rate, day by day from
 *   the due date, after a grace period (NSW);
 * - MONTHLY_SIMPLE_WHOLE_MONTHS: simple interest at a monthly rate for each
 *   whole month in arrears after the date for payment (Queensland).
 */
export type LateChargeMethod = "DAILY_SIMPLE_ANNUAL" | "MONTHLY_SIMPLE_WHOLE_MONTHS";

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
  source: string;
}

/** A StrataVerze fee (price book code and variant). */
export interface FeeVariant {
  code: string;
  variant: string;
}
