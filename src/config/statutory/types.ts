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
  required: boolean;
  source: string;
  status: RuleStatus;
}

/**
 * A schedule of lot entitlements. `onLot` marks the schedule held in each
 * lot's `entitlement` (the one levies are worked out from); any other
 * schedule is held separately for each lot.
 */
export interface EntitlementScheduleDefinition {
  key: string;
  name: string;
  onLot: boolean;
  /** What the schedule decides, in plain words. */
  usedFor: readonly string[];
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
  /** The tribunal that hears levy claims. */
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
  /** NSW s 182 records inspections (3 and 10 day deadlines, hourly fees). */
  recordsInspections: boolean;
  /** The NSW debt recovery step sequence. */
  debtRecoverySteps: boolean;
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
