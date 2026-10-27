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

import type { MeetingRuleSet, QuorumRule } from "@/lib/meetings/rules";
import type {
  CertificateRules,
  DebtRecoveryStepRule,
  DocumentRetentionRules,
  EntitlementScheduleDefinition,
  FeeVariant,
  FundDefinition,
  InspectionRules,
  LateChargeRules,
  NoticeRules,
  PackFeatures,
  RuleStatus,
  SchemeSelector,
  WorksQuoteRules,
} from "./types";

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
    label: "Administrative Fund",
    shortLabel: "Admin",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Everything not paid from the sinking fund, for example insurance and recurrent costs.",
    required: true,
    source: `${SM} ss 167(1), (2), 169(2)`,
    status: "CONFIRMED",
  },
  {
    key: "SINKING",
    name: "sinking fund",
    label: "Sinking Fund",
    // "Sinking" alone does not read as a fund ("Sinking Expenditure"), so the short form keeps "Fund".
    shortLabel: "Sinking Fund",
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
 * it); the interest schedule is held separately, in
 * lots.interest_schedule_entitlement (stage 2, step 10).
 *
 * `decides` (stage 2, step 10, 27 Oct 2026) lists the same uses as `usedFor`,
 * for code: the contribution schedule for contributions (Act s 47(2)(a);
 * SM s 162(5)), a poll on an ordinary resolution (Act ss 47(2)(b), 110(3)) and
 * the entitlement test in a special resolution (Act s 106(3)(c)); the interest
 * schedule for the share of common property, interest on termination by
 * resolution without dissent or court order, and value-based charges, rates
 * and taxes (Act s 47(3)(a) to (c)), and the insurance premium for common
 * property and assets (SM s 197(4)).
 * The buildings premium (INSURANCE_BUILDINGS) is in neither list on purpose:
 * SM s 201(1) shares it by the interest schedule only for building and
 * volumetric format lots, standard format lots share it by the cost of
 * reinstating the buildings on the lot, and s 201(2) allows adjustments. The
 * plan format is not held, so `scheduleFor` refuses it (GO-LIVE GAP below).
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "CONTRIBUTION",
    name: "contribution schedule lot entitlement",
    label: "Contribution Schedule Lot Entitlement",
    help: "From the contribution schedule in the community management statement. A whole number, not 0.",
    onLot: true,
    usedFor: [
      "each lot's share of contributions, except insurance and other amounts worked out another way",
      "the value of a lot's vote on a poll for an ordinary resolution",
      "the contribution test in a special resolution (lots against may hold no more than 25% of the total)",
    ],
    decides: ["CONTRIBUTIONS", "POLL_VOTE", "SPECIAL_RESOLUTION"],
    source: `${ACT} ss 46, 47(2), 106(3), 110(3); ${SM} s 162(5)`,
    status: "CONFIRMED",
  },
  {
    key: "INTEREST",
    name: "interest schedule lot entitlement",
    label: "Interest Schedule Lot Entitlement",
    help: "From the interest schedule in the community management statement. A whole number, not 0.",
    onLot: false,
    usedFor: [
      "each lot's share of common property",
      "each lot's share of the insurance premium for common property and, for building and volumetric format lots, the buildings",
      "each lot's interest on termination by resolution without dissent or court order",
      "value-based local government and State charges, rates and taxes",
    ],
    decides: ["COMMON_PROPERTY_SHARE", "INSURANCE_COMMON_PROPERTY", "TERMINATION_INTEREST", "VALUE_BASED_RATES"],
    source: `${ACT} s 47(3); ${SM} ss 197(4), 201(1)`,
    status: "CONFIRMED",
  },
];

/*
 * GO-LIVE GAP (stage 2, step 10, 27 Oct 2026): what holds and uses the
 * building's module and the interest schedule.
 * - Held: schemes.regulation_module (adviser building settings, Standard
 *   Module only) and lots.interest_schedule_entitlement (lot edit, lot create
 *   and the CSV lot import). A Queensland building with no module, an
 *   unsupported module or a lot without the entitlement is flagged to the
 *   adviser on the building and lot pages (src/lib/jurisdiction/building-data.ts).
 *   No page offers lot create yet (createLotAction is ready), and the CSV lot
 *   import sends its columns under keys the server does not read (lot_number,
 *   unit_number, floor_area, lot_type), so lot files fail for every building
 *   until that is fixed (its own change, not this step). The interest schedule
 *   column is sent and read under the server's key, interestScheduleEntitlement
 *   (migration-client.tsx targetFieldsFor, data-migration.ts validateLots and
 *   importLots): keep that key when the others are mapped.
 * - Read: the body corporate certificate draft fills the module and both lot
 *   entitlements (SM s 233AA(1)). Contributions, polls, the special resolution
 *   test and the penalty keep using lots.entitlement, the contribution
 *   schedule.
 * - Not applied yet: the insurance part of contributions is apportioned by
 *   the contribution schedule with everything else. SM s 162(5) excepts
 *   insurance: the common property and assets premium goes by the interest
 *   schedule (s 197(4)), and the buildings premium by the interest schedule
 *   for building and volumetric format lots and by reinstatement cost for
 *   standard format lots (s 201(1)), with adjustments allowed (s 201(2)). The
 *   levy engine has no separate insurance apportionment and each lot's plan
 *   format (building, volumetric or standard) is not held. Until it is,
 *   INSURANCE_BUILDINGS is decided by no schedule and scheduleFor refuses it.
 *   This must be designed before Queensland contributions are raised. No feature apportions common
 *   property, termination or rates, so nothing else reads the interest
 *   schedule yet (entitlementFor and scheduleFor are ready for them).
 * - The onboarding wizard asks for neither the module nor the interest
 *   schedule, and still names NSW funds and "unit entitlement". A Queensland
 *   building created by it is flagged until the module is chosen in its
 *   settings and each lot's interest schedule entitlement is entered
 *   (StrataVerze only, as for unit entitlement). The strata roll table, the
 *   lots card, the building form's total, the owner lot pages and the meeting
 *   screens still say unit entitlement; the interest schedule has no total on
 *   the building.
 */

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

/**
 * The contribution notice rules in the shape every pack shares (stage 2,
 * step 5, 27 Oct 2026), from CONTRIBUTION_NOTICE_RULES.
 */
export const NOTICE_RULES: NoticeRules = {
  minimumNoticeDays: CONTRIBUTION_NOTICE_RULES.minimumNoticeDays,
  // A StrataVerze choice, not the SM's: each notice goes out 35 days before it
  // falls due, as for NSW buildings. The SM requires at least 30 (s 163).
  issueDaysBeforeDue: 35,
  // No shorter notice for an urgent contribution was found in the SM, so the
  // urgent option is not offered.
  urgentNoticeDays: null,
  // No hardship statement is required (CONFIRMED absent, see above).
  hardship: null,
  contents: CONTRIBUTION_NOTICE_RULES.contents,
  source: CONTRIBUTION_NOTICE_RULES.source,
};

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
/*
 * GO-LIVE GAP (stage 2, step 6, 27 Oct 2026): this order is applied only by
 * the penalty engine (monthlyPenalty, which works the penalty out with
 * payments applied to it first) and by lotArrears (src/lib/debt-recovery,
 * which splits a notice's amount paid between posted interestCharged and the
 * levy). Receipting (levy-receipts.ts, levy-schedules.ts recordLevyPayment),
 * notice balances and status, owner credits (owner-credits.ts), reversals
 * (levy-reversal.ts) and the receivable journals still treat a payment as
 * against the notice total, levy first, and lotArrears works from the posted
 * penalty while the engine works from the calculated one. Receipting and
 * notice balances must apply this order before Queensland is switched on.
 * NSW receipting is not to change.
 */

/**
 * The late payment penalty in the shape every pack shares (stage 2, step 6,
 * 27 Oct 2026), from LATE_PAYMENT_PENALTY: simple interest at the monthly rate
 * the body corporate resolved (at most 2.5%), for each whole month the
 * contribution is in arrears after the date for payment, with no grace period
 * (SM s 165). None applies until the building records the ordinary resolution
 * that sets the rate (NONE, the default; decided 27 Oct 2026). Payments go to
 * the penalty first (PAYMENT_ALLOCATION_ORDER, s 166(5)).
 */
export const LATE_CHARGE: LateChargeRules = {
  method: "MONTHLY_SIMPLE_WHOLE_MONTHS",
  modes: ["NONE", "RESOLVED_RATE"],
  defaultMode: "NONE",
  resolutionRequiredFor: ["RESOLVED_RATE"],
  annualRatePercent: null,
  maxMonthlyRatePercent: LATE_PAYMENT_PENALTY.maxMonthlyPercent,
  graceMonths: 0,
  source: `${SM} s 165`,
};

/** Recovering unpaid contributions. */
export const DEBT_RECOVERY = {
  /** Recoverable as a debt once unpaid by the date for payment, with the penalty and recovery costs reasonably incurred (SM s 166(1)). */
  mayStartAfterDueDate: true,
  recoveryCostsRecoverable: true,
  /** A debt outstanding for 2 years: proceedings must start within 2 months after the 2-year period (SM s 166(2)). */
  mustStartProceedings: { overdueYears: 2, withinMonths: 2, citation: "Standard Module s 166(2)" },
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

/*
 * GO-LIVE GAP (stage 2, step 8, 27 Oct 2026): the 2 year rule (SM s 166(2))
 * is shown as a warning on the adviser debt recovery page only
 * (src/lib/debt-recovery/proceedings-deadline.ts). No daily reminder is sent:
 * each daily reminder is claimed in a column of its own row so a retried run
 * sends it once, and there is no such column for this. TODO before go-live:
 * add a daily reminder with a claim column (a database change).
 * The debt recovery screens take the step labels, the late charge heading
 * (TERMINOLOGY.lateCharge) and the levy words from the pack, and hide the
 * payment plan panel without FEATURES.statutoryPaymentPlans. Still NSW words,
 * to change before go-live:
 * - the owner case page's "Hardship Request" badge (from the case's
 *   hasHardshipRequest flag, case-detail-owner-client.tsx);
 * - "Payment Plan" as a case status label and the owner case page's payment
 *   plan card (only shown with a plan; a Queensland case never starts in
 *   PAYMENT_PLAN, and has no statutory plan);
 * - the owner debt recovery list page ("Manage levy debt recovery cases",
 *   "Back to Levies"), which lists cases from several buildings, and the
 *   owner levies section it sits in;
 * - fee explanations other than the recovery fees, which say "levy".
 */

/** How the owner-facing step text cites the Act and the SM. */
const ACT_SHORT = "BCCMA";
const SM_SHORT = "Standard Module";

/** The QCAT minor civil dispute limit, in dollars, for the step text ("$25,000"). */
const TRIBUNAL_LIMIT = `$${(DEBT_RECOVERY.tribunalLimitCents / 100).toLocaleString("en-AU")}`;
const { overdueYears: PROCEEDINGS_YEARS, withinMonths: PROCEEDINGS_MONTHS } = DEBT_RECOVERY.mustStartProceedings;

/**
 * DRAFT, FOR STRATAVERZE TO REVIEW (stage 2, step 8, 27 Oct 2026): the
 * Queensland debt recovery steps, drafted from DEBT_RECOVERY,
 * LATE_PAYMENT_PENALTY, PAYMENT_ALLOCATION_ORDER and the research notes
 * (section D) only. The step types are the NSW ones where the meaning matches,
 * so the case engine, the StrataVerze fees and the screens work unchanged.
 * Each step has a `status`: CONFIRMED where the step is the law, STRATAVERZE
 * where it is StrataVerze practice (its legalBasis says so), NOT_CONFIRMED
 * where the law was not read. Owners see `actionRequired` and `legalBasis`,
 * which say "contribution" and "penalty", never the NSW words. There is no
 * hardship statement or statutory payment plan in Queensland: the waiver step
 * (HARDSHIP_REVIEW, s 166(6)) is StrataVerze practice around a power the SM
 * gives. The points not confirmed are in DEBT_RECOVERY_GUIDANCE (advisers only).
 */
export const DEBT_RECOVERY_STEPS: readonly DebtRecoveryStepRule[] = [
  {
    stepType: "LEDGER_VERIFICATION",
    stepOrder: 1,
    actionRequired: `Check each unpaid contribution was fixed and its contribution notice given at least ${CONTRIBUTION_NOTICE_RULES.minimumNoticeDays} days before the date for payment, and that payments were applied first to the penalty, then to the contribution, then to recovery costs`,
    legalBasis: `StrataVerze practice. Contribution notice: ${SM_SHORT} s 163. Payment order: ${SM_SHORT} s 166(5)`,
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Case opened",
    status: "STRATAVERZE",
  },
  {
    stepType: "INITIAL_CONTACT",
    stepOrder: 2,
    actionRequired: "Contact the owner about the unpaid contributions and the amount owing, including any penalty",
    legalBasis: "StrataVerze practice",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Ledger verified",
    noticeType: "REMINDER",
    status: "STRATAVERZE",
  },
  {
    stepType: "REMINDER_NOTICE",
    stepOrder: 3,
    actionRequired: "Send a written reminder showing the unpaid contributions, any penalty and any recovery costs separately",
    legalBasis: `StrataVerze practice. Penalty: ${SM_SHORT} s 165`,
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "No payment after initial contact (period set by the building)",
    noticeType: "DEMAND",
    status: "STRATAVERZE",
  },
  {
    stepType: "FINAL_NOTICE",
    stepOrder: 4,
    actionRequired:
      "Tell the owner in writing that the body corporate may start proceedings to recover the unpaid contributions, the penalty and recovery costs reasonably incurred",
    legalBasis: `StrataVerze practice. Recovery as a debt: ${SM_SHORT} s 166(1)`,
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Reminder unpaid",
    noticeType: "FINAL_DEMAND",
    status: "STRATAVERZE",
  },
  {
    stepType: "HARDSHIP_REVIEW",
    stepOrder: 5,
    actionRequired:
      "If the owner asks, decide whether there are special reasons to waive the penalty or recovery costs, in whole or in part. A request can arrive at any step",
    legalBasis: `StrataVerze practice. Waiver for special reasons: ${SM_SHORT} s 166(6)`,
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "Owner asks for the penalty or recovery costs to be waived",
    status: "STRATAVERZE",
  },
  {
    stepType: "COMMITTEE_REVIEW",
    stepOrder: 6,
    actionRequired: `Decide whether to start proceedings to recover the debt. If a contribution has been unpaid for ${PROCEEDINGS_YEARS} years, proceedings must start within ${PROCEEDINGS_MONTHS} months after the end of the ${PROCEEDINGS_YEARS} years`,
    legalBasis: `${SM_SHORT} ss 52(1)(e)(i), 166(2)`,
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "Final notice unpaid",
    status: "CONFIRMED",
  },
  {
    stepType: "LEGAL_REFERRAL",
    stepOrder: 7,
    actionRequired: "Refer the matter to a solicitor, or prepare the claim, with the ledger, the contribution notices and the committee's decision",
    legalBasis: `StrataVerze practice. Recovery costs reasonably incurred: ${SM_SHORT} s 166(1)(c)`,
    responsibleParty: "ADVISER",
    approvalRequired: true,
    triggerCondition: "Proceedings decided by the committee",
    status: "STRATAVERZE",
  },
  {
    stepType: "PROCEEDINGS",
    stepOrder: 8,
    actionRequired: `Start proceedings to recover the debt: a claim in ${DEBT_RECOVERY.tribunal} as a minor civil dispute for up to ${TRIBUNAL_LIMIT}, or a claim in a court. An adjudicator cannot decide a debt dispute`,
    legalBasis: `${ACT_SHORT} s 229A. ${DEBT_RECOVERY.tribunal} Act sch 3`,
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Legal referral accepted",
    status: "CONFIRMED",
  },
  {
    stepType: "ENFORCEMENT",
    stepOrder: 9,
    actionRequired: "Enforce the order or judgment",
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Order or judgment obtained and unpaid",
    status: "NOT_CONFIRMED",
  },
  {
    stepType: "CLOSED",
    stepOrder: 10,
    actionRequired: "Close the case and reconcile the lot ledger",
    legalBasis: "StrataVerze practice",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Debt paid, settled or written off",
    status: "STRATAVERZE",
  },
];

/** DRAFT, FOR STRATAVERZE TO REVIEW: the name the screens show for each step type. */
export const DEBT_RECOVERY_STEP_LABELS: Readonly<Record<string, string>> = {
  LEDGER_VERIFICATION: "Ledger Verification",
  INITIAL_CONTACT: "Initial Contact",
  REMINDER_NOTICE: "Reminder Notice",
  FINAL_NOTICE: "Final Notice",
  HARDSHIP_REVIEW: "Waiver Request",
  COMMITTEE_REVIEW: "Committee Review",
  LEGAL_REFERRAL: "Legal Referral",
  PROCEEDINGS: "Proceedings",
  ENFORCEMENT: "Enforcement",
  CLOSED: "Closed",
};

/**
 * DRAFT, FOR STRATAVERZE TO REVIEW: guidance for each step, shown to advisers
 * only, with the points not confirmed.
 */
export const DEBT_RECOVERY_GUIDANCE: Readonly<Record<string, string>> = {
  LEDGER_VERIFICATION: `Check each unpaid contribution was validly fixed: by ordinary resolution of the body corporate (${SM_SHORT} s 162(1), (2)), or for an interim contribution by the committee (${SM_SHORT} s 162(3), (4)). Check its contribution notice was given at least ${CONTRIBUTION_NOTICE_RULES.minimumNoticeDays} days before the date for payment. Check payments were applied first to the penalty, then to the contribution, then to recovery costs (${SM_SHORT} s 166(5)). This check, and showing contributions, penalty and costs separately, is StrataVerze practice.`,
  INITIAL_CONTACT:
    "Contact the owner informally about the unpaid contributions and the amount owing. Queensland law has no statutory payment plan and no hardship statement. The owner can ask the body corporate to waive the penalty or recovery costs for special reasons. While the lot owes the body corporate money, it can vote only on a resolution without dissent or a committee election, and its owner cannot be on the committee. This contact is StrataVerze practice.",
  REMINDER_NOTICE:
    "Send a written reminder showing the unpaid contributions, any penalty and any recovery costs separately. Owners are shown penalty, never interest. No period for a reminder is set by law, so the building sets its own. This reminder is StrataVerze practice.",
  FINAL_NOTICE:
    "Tell the owner in writing that the body corporate may start proceedings to recover the unpaid contributions, the penalty and recovery costs reasonably incurred. Recovery may start once a contribution is unpaid by the date for payment. The research notes record no notice that must be given before proceedings, so this notice is StrataVerze practice.",
  HARDSHIP_REVIEW: `If satisfied there are special reasons, the body corporate may waive the penalty or recovery costs, in whole or in part, or allow the discount for paying on time (${SM_SHORT} s 166(6)). There is no hardship statement and no statutory payment plan in Queensland. Treating a request as a step is StrataVerze practice. Not confirmed: whether the committee can decide a waiver or a general meeting resolution is needed.`,
  COMMITTEE_REVIEW: `The committee can decide to start proceedings to recover a liquidated debt from a lot owner (${SM_SHORT} s 52(1)(e)(i)). If a contribution has been outstanding for ${PROCEEDINGS_YEARS} years, the body corporate must start proceedings within ${PROCEEDINGS_MONTHS} months after the end of the ${PROCEEDINGS_YEARS} years (${SM_SHORT} s 166(2)). The debt recovery page warns when a lot reaches this point. How the ${PROCEEDINGS_YEARS} years is counted is StrataVerze's reading: from the date for payment of the oldest unpaid contribution.`,
  LEGAL_REFERRAL: `Refer the matter to a solicitor, or prepare the claim, with the ledger, the contribution notices and the committee's decision. The owner when the debt became payable and a later owner, including a mortgagee in possession, are jointly and severally liable (${SM_SHORT} s 166(3), (4)). Recovery costs reasonably incurred are recoverable (${SM_SHORT} s 166(1)(c)). Government guidance gives legal fees and body corporate manager arrears notice fees as examples. Not confirmed: whether any particular cost beyond that, including a StrataVerze fee, is recoverable from the owner.`,
  PROCEEDINGS: `A claim to recover a debt of up to ${TRIBUNAL_LIMIT} is a minor civil dispute in ${DEBT_RECOVERY.tribunal}. The body corporate may instead claim in a court. An adjudicator cannot decide a debt dispute (${ACT_SHORT} s 229A). Once ${DEBT_RECOVERY.tribunal} or court proceedings start, any dispute resolution process for the debt ends. Not confirmed: the Magistrates Court limit for debts over ${TRIBUNAL_LIMIT}. Rely on the solicitor's advice.`,
  ENFORCEMENT: "Enforce the order or judgment. Not confirmed: the enforcement options. Rely on the solicitor's advice.",
  CLOSED: "Close the case once the debt is paid, settled or written off, and reconcile the lot ledger.",
};

/**
 * How the fee disclosure says a recovery fee can be passed to the owner: only
 * recovery costs reasonably incurred are recoverable (SM s 166(1)(c)), so it
 * may be, not that it is.
 */
export const RECOVERY_COSTS_RECOVERABLE = `may be recoverable from the owner if reasonably incurred (${SM_SHORT} s 166(1)(c))`;

/**
 * No statutory list of fees that cannot be passed to an owner is recorded,
 * and there is no statutory payment plan, so none is listed: a fee follows
 * the price book. Recovery costs reasonably incurred are recoverable
 * (SM s 166(1)(c)). Whether a StrataVerze fee is such a cost is not confirmed
 * (FOR_REVIEW).
 */
export const NEVER_RECOVERABLE_FEE_VARIANTS: readonly FeeVariant[] = [];

/**
 * General meetings and committee meetings, as signed off. The meeting engine
 * applies them through MEETING_RULES (below, stage 2, step 7).
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
  /**
   * The statutory motions on the AGM agenda (SM sch 1 definition of "statutory
   * motion", s 93(3)): the accounts, the auditor, the budgets, the
   * contributions and the insurance review. `resolution` is the type the SM
   * states for the decision, or null where none was recorded.
   */
  statutoryMotions: {
    motions: [
      { key: "ACCOUNTS", subject: "the statement of accounts", resolution: null, source: `${SM} sch 1 "statutory motion", ss 93(3), 175(6)` },
      { key: "AUDITOR", subject: "the auditor (agreed by ordinary resolution)", resolution: "ORDINARY", source: `${SM} sch 1 "statutory motion", ss 93(3), 176(2)` },
      { key: "BUDGETS", subject: "the administrative fund and sinking fund budgets (adopted by ordinary resolution)", resolution: "ORDINARY", source: `${SM} sch 1 "statutory motion", ss 93(3), 160(1)` },
      { key: "CONTRIBUTIONS", subject: "the contributions for the financial year, the number of instalments and the due dates (fixed by ordinary resolution)", resolution: "ORDINARY", source: `${SM} sch 1 "statutory motion", ss 93(3), 162(1)` },
      { key: "INSURANCE", subject: "the review of insurance", resolution: null, source: `${SM} sch 1 "statutory motion", ss 93(3), 196` },
    ],
    source: `${SM} sch 1 "statutory motion", s 93(3)`,
    status: "CONFIRMED" as RuleStatus,
  },
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
  /** Chosen at each AGM, with the election items as the last business of the meeting (SM ss 13(1), 31(1)). */
  electionIsLastBusiness: true,
  electionIsLastBusinessSource: `${SM} ss 13(1), 31(1)`,
  /** Committee spending limit: $200 times the number of lots, unless an ordinary resolution sets another amount (SM s 172; sch 1). */
  spendingLimitPerLotCents: 20_000,
  /** Major spending limit: the lesser of $1,100 times the number of lots and $10,000, unless set by ordinary resolution (sch 1). */
  majorSpendingPerLotCents: 110_000,
  majorSpendingCapCents: 1_000_000,
  /** Above the major spending limit, at least 2 quotes (SM ss 173, 174). */
  quotesAboveMajorSpending: 2,
  source: `${SM} ss 7, 9, 13, 15, 31, 172 to 174, sch 1; ${ACT} s 98`,
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

/** The quorum at a general meeting (SM s 99), from MEETINGS.quorum. */
const GENERAL_MEETING_QUORUM: QuorumRule = {
  basis: "PERCENT_VOTERS_WITH_MIN_PRESENT",
  percent: MEETINGS.quorum.percentOfVoters / 100,
  minPersons: MEETINGS.quorum.presentPersonallyWhenAtLeast3Voters,
  minPersonsFromVoters: 3,
  minPersonsBelow: MEETINGS.quorum.presentPersonallyWhenFewerThan3Voters,
};

/**
 * The meeting rules in the shape every pack shares (stage 2, step 7,
 * 27 Oct 2026), built from MEETINGS, RESOLUTIONS, CONTRIBUTIONS.debtorMayVote
 * and RECORD_RETENTION as signed off. Not confirmed: how the 21 days' notice
 * is counted and when a posted or emailed notice is taken to be given
 * (MEETINGS.noticeCountingConfirmed), so the engine counts plain whole days as
 * it does for NSW.
 * - ORDINARY is a majority of the votes cast, one vote per lot, or on a poll
 *   by contribution schedule lot entitlement (the lot entitlement the engine
 *   already holds as unit entitlement).
 * - SPECIAL passes only if 3 times the votes for is at least 2 times the
 *   votes cast, the votes against are not more than 25% of the lots, and the
 *   lots against hold not more than 25% of the contribution entitlement.
 * - WITHOUT_DISSENT fails on any vote against.
 * - MAJORITY needs votes for from more than 50% of the lots entitled to vote.
 * - Quorum is held as data only (the engine does not count it yet).
 * - Minutes and the other meeting records are kept without a limit (DECISIONS),
 *   and no period for secret ballot papers was found.
 * - There is no pre-meeting ballot like the NSW one: electronic voting is by
 *   ordinary resolution under the SM, and is not offered for Queensland
 *   buildings until it is designed.
 * - A lot owing a body corporate debt votes only on a resolution without
 *   dissent (SM s 102(2)). The other exception, a committee election, is not a
 *   resolution category here.
 */
/*
 * GO-LIVE GAP (stage 2, step 7, 27 Oct 2026): the engine cannot count a
 * Queensland special or majority resolution yet. Conduct never passes a tally
 * (conduct-actions.ts recordAgendaOutcomeAction calls resolveOutcome without
 * one), and nothing supplies totalLots, totalEntitlement or eligibleLots, so
 * the chair's recorded outcome is stored unchecked. The two tests evaluate
 * correctly once a tally with those totals is passed. The debtor voting check
 * (debtorsMayVoteOn) runs only when an owner casts a vote online, not on votes
 * the chair records at the meeting.
 */
export const MEETING_RULES: MeetingRuleSet = {
  state: "QLD",
  version: "QLD-2026.1",
  effectiveFrom: "2026-10-27",
  noticePeriods: {
    AGM: MEETINGS.generalMeetingNoticeDays,
    EGM: MEETINGS.generalMeetingNoticeDays,
    FIRST_AGM: MEETINGS.generalMeetingNoticeDays,
    COMMITTEE: MEETINGS.committee.noticeDays,
  },
  minutesDeadlines: {
    AGM: MEETINGS.generalMeetingMinutesDays,
    EGM: MEETINGS.generalMeetingMinutesDays,
    FIRST_AGM: MEETINGS.generalMeetingMinutesDays,
    COMMITTEE: MEETINGS.committee.minutesDays,
  },
  quorumRules: {
    AGM: GENERAL_MEETING_QUORUM,
    EGM: GENERAL_MEETING_QUORUM,
    FIRST_AGM: GENERAL_MEETING_QUORUM,
    COMMITTEE: { basis: "HALF_MEMBERS" },
  },
  resolutionCategories: {
    ORDINARY: { basis: "COUNT_MAJORITY" },
    SPECIAL: {
      basis: "TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS",
      forAtLeastFractionOfVotesCast: RESOLUTIONS.SPECIAL.forAtLeastFractionOfVotesCast,
      againstMaxFractionOfLots: RESOLUTIONS.SPECIAL.againstMaxFractionOfLots,
      againstMaxFractionOfEntitlement: RESOLUTIONS.SPECIAL.againstMaxFractionOfContributionEntitlement,
    },
    WITHOUT_DISSENT: { basis: "NO_AGAINST" },
    MAJORITY: { basis: "MORE_THAN_HALF_OF_LOTS" },
  },
  retention: { generalYears: null, secretBallotMonths: null },
  preMeetingEvoting: null,
  resolutionLabels: {
    ORDINARY: { short: "Ordinary", full: "Ordinary Resolution" },
    SPECIAL: { short: "Special", full: "Special Resolution" },
    WITHOUT_DISSENT: { short: "Without dissent", full: "Resolution without Dissent" },
    MAJORITY: { short: "Majority", full: "Majority Resolution" },
  },
  generalMeetingCategories: ["ORDINARY", "SPECIAL", "WITHOUT_DISSENT", "MAJORITY"],
  committeeCategories: ["ORDINARY"],
  committeeCategoryRefusal:
    "Only an ordinary resolution can go on a committee meeting agenda. Put this motion on a general meeting agenda instead.",
  // A majority resolution is in writing with no proxies (Act s 107), which the
  // motions list does not record, so it is offered on the agenda only.
  motionCategories: ["ORDINARY", "SPECIAL", "WITHOUT_DISSENT"],
  debtorsMayVoteOn: ["WITHOUT_DISSENT"],
  notes:
    "From the Queensland pack signed off on 27 Oct 2026 (Standard Module). How the 21 days' notice is counted is not confirmed.",
};

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

/*
 * The certificate, inspections, record keeping and works quotes in the shapes
 * every pack shares (stage 2, step 9, 27 Oct 2026), from
 * BODY_CORPORATE_CERTIFICATE, RECORDS_INSPECTION, FEE_UNIT_DOLLARS,
 * RECORD_RETENTION and COMMITTEE as signed off. Fees are held in fee units,
 * with each year's dollar amounts from FEE_UNIT_DOLLARS (decided 27 Oct 2026):
 * add a year there and in FEE_YEARS each 1 July.
 */

/** The financial years whose dollar amounts are held, each from 1 July. */
const FEE_YEARS = (["2026-27"] as const).map((year) => [year, FEE_UNIT_DOLLARS[year]] as const);

/** Who may ask for a certificate or for access to the records: an "interested person" (Act s 205(13)). */
const INTERESTED_PERSONS: Readonly<Record<string, string>> = {
  OWNER: "Owner",
  MORTGAGEE: "Mortgagee",
  BUYER: "Buyer",
  DISCLOSURE_RECIPIENT: "Person given a seller's disclosure statement",
  PROPER_INTEREST: "Person with a proper interest",
  // An agent of any of the others; who they act for is recorded with them.
  AGENT: "Agent",
};

/**
 * DRAFT, FOR STRATAVERZE TO REVIEW (stage 2, step 9): the headings StrataVerze
 * drafts a body corporate certificate under. They follow the contents of
 * SM s 233AA(1) as summarised in the research notes, which end "and more", so
 * the last heading asks for anything else in the approved form. The approved
 * form itself was not read.
 */
const CERTIFICATE_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["1", "Lot and plan type"],
  ["2", "Scheme name and regulation module"],
  ["3", "Body corporate manager and the person who keeps the records"],
  ["4", "Contributions, discounts and penalties"],
  ["5", "Lot entitlements (contribution schedule and interest schedule)"],
  ["6", "Amounts owing for the lot"],
  ["7", "Sinking fund balance"],
  ["8", "Insurance"],
  ["9", "Caretaking service contractor and letting agent"],
  ["10", "Building management statement"],
  ["11", "Improvements"],
  ["12", "Body corporate assets"],
  ["13", "Embedded electricity network"],
  ["14", "Layered arrangement of community titles schemes"],
  ["15", "Latest statement of accounts"],
  ["16", "Other matters in the approved form"],
];

/**
 * The body corporate certificate in the shared shape: within 5 business days
 * after the written request, the fee in fee units (76.75, or 65.24 for the
 * same person and lot within 3 months), conclusive evidence against the body
 * corporate except for a reasonably apparent error (Act s 205(4) to (7);
 * SM s 233). How the approved form is signed was not read, so the execution
 * box is StrataVerze's (FOR_REVIEW). The 24 hour priority request is not
 * offered yet (GO-LIVE GAP below).
 */
export const CERTIFICATE: CertificateRules = {
  title: "Body corporate certificate",
  buttonLabel: "Body Corporate Certificate",
  section: `${ACT} s 205(4)`,
  form: `Approved form: ${BODY_CORPORATE_CERTIFICATE.form} (form number from Queensland Government guidance)`,
  requesterTypes: INTERESTED_PERSONS,
  agentType: "AGENT",
  items: CERTIFICATE_ITEMS,
  planRowLabel: "Community titles scheme",
  execution: "Given by the body corporate",
  executionLines: ["Signature: ____________   Name: ____________", "Date: ____________"],
  follows: `the contents listed in ${SM_SHORT} s 233AA(1)`,
  conclusiveNote: `A body corporate certificate is conclusive evidence against the body corporate of the matters it states, except for a reasonably apparent error (${ACT_SHORT} s 205).`,
  helpUrl: null,
  giveWithinBusinessDays: BODY_CORPORATE_CERTIFICATE.withinBusinessDays,
  fee: {
    basis: "FEE_UNITS",
    feeUnits: BODY_CORPORATE_CERTIFICATE.feeUnits,
    repeatFeeUnits: BODY_CORPORATE_CERTIFICATE.repeatFeeUnits,
    repeatWithinMonths: BODY_CORPORATE_CERTIFICATE.repeatWithinMonths,
    repeatSamePersonOnly: BODY_CORPORATE_CERTIFICATE.repeatOnlyForSamePersonAndLot,
    dollars: {
      yearStartsOn: "07-01",
      byYear: Object.fromEntries(FEE_YEARS.map(([year, d]) => [year, { feeCents: d.certificateCents, repeatFeeCents: d.certificateRepeatCents }])),
    },
    source: `${SM} s 233, in fee units. Dollar amounts: ${FEE_UNIT_DOLLARS.source}`,
  },
};

/**
 * Access to the records in the shared shape (Act s 205(2), (3); SM s 233):
 * inspection or copies within 7 days after the written request, an owner
 * paying 18.25 fee units to inspect and anyone else 35.10, and 0.65 for each
 * page copied, with no inspection fee for copies alone and no GST (guidance).
 */
export const INSPECTIONS: InspectionRules = {
  basis: "FEE_UNITS",
  section: `${ACT} s 205(2), (3)`,
  whoMayAsk: "An owner, a mortgagee, a buyer or another interested person may ask in writing to inspect the records or to get copies.",
  requesterTypes: INTERESTED_PERSONS,
  agentType: "AGENT",
  accessWithinDays: RECORDS_INSPECTION.withinDaysOfRequest,
  ownerFeeTypes: ["OWNER"],
  feeUnits: { owner: RECORDS_INSPECTION.feeUnits.OWNER, other: RECORDS_INSPECTION.feeUnits.OTHER, copyPerPage: RECORDS_INSPECTION.feeUnits.copyPerPage },
  dollars: {
    yearStartsOn: "07-01",
    byYear: Object.fromEntries(FEE_YEARS.map(([year, d]) => [year, { ownerCents: d.inspectionOwnerCents, otherCents: d.inspectionOtherCents, copyPerPageCents: d.copyPerPageCents }])),
  },
  feesIncludeGst: FEE_UNIT_DOLLARS.gstApplies,
  source: `${RECORDS_INSPECTION.source}. Dollar amounts: ${FEE_UNIT_DOLLARS.source}`,
};

/**
 * Record keeping in the document library, from RECORD_RETENTION and the
 * decision to keep minutes, the roll, registers and insurance policies
 * without a limit (MINUTES, INSURANCE). Every other category is shown with the
 * longer disposal period of SM s 231(3) to (5), 6 years: statements of account
 * (FINANCIAL), orders, authority notices and written agreements (COMPLIANCE,
 * OTHER) may be disposed of after 6 years, and some records in those
 * categories, such as reconciliation statements and insignificant
 * correspondence, after 2. A category not listed is shown with 6 years too.
 * By-laws in force are a record of current relevance, which is never disposed
 * of, so BYLAW is shown without a limit (FOR_REVIEW).
 */
export const DOCUMENT_RETENTION: DocumentRetentionRules = {
  byCategory: { MINUTES: null, INSURANCE: null, BYLAW: null, FINANCIAL: 6, COMPLIANCE: 6, OTHER: 6 },
  generalYears: 6,
  unlimited: "kept without a limit",
  note: `Records the law lets the body corporate dispose of sooner, such as reconciliation statements after ${Math.min(...Object.keys(RECORD_RETENTION.disposableAfterYears).map(Number))} years, are shown with the longer period. A record still of current relevance is kept.`,
  source: RECORD_RETENTION.source,
};

/**
 * Quotes above the major spending limit (SM ss 173, 174; sch 1): at least 2,
 * where the limit is the lesser of $1,100 for each lot and $10,000. A limit a
 * building sets by ordinary resolution is not held yet (GO-LIVE GAP below).
 */
export const WORKS_QUOTES: WorksQuoteRules = {
  minimumQuotes: COMMITTEE.quotesAboveMajorSpending,
  threshold: { basis: "PER_LOT_CAPPED", perLotDollars: COMMITTEE.majorSpendingPerLotCents / 100, capDollars: COMMITTEE.majorSpendingCapCents / 100 },
  citation: `${SM_SHORT} ss 173, 174`,
  source: `${SM} ss 173, 174, sch 1 "relevant limit for major spending"`,
};

/*
 * GO-LIVE GAP (stage 2, step 9, 27 Oct 2026):
 * - The 24 hour priority certificate (SM s 233, 27.35 fee units, refunded if
 *   late) is not offered: nothing records a priority request or its refund.
 * - The 5 business days skip weekends only. Queensland public holidays are not
 *   held, and the days are counted from the day the request was received, as
 *   if the fee came with it.
 * - A fee is refused for a date whose financial year has no dollar table in
 *   FEE_UNIT_DOLLARS. Add each year's amounts before 1 July.
 * - The request for financial information only (Act s 205(8) to (11)) is not
 *   offered.
 * - The audit (AUDIT, SM s 176) is not applied: the audit test is shown only in
 *   the NSW statutory statements, which Queensland buildings do not have
 *   (FEATURES.keyFinancialInformation). Queensland's statements, with the audit
 *   waiver by special resolution for a basic scheme, are still to be designed.
 * - Works approvals apply the 2 quote rule only. A major spending limit or a
 *   committee spending limit a building sets by ordinary resolution is not
 *   held, the committee spending limit (SM s 172) is not checked, and a single
 *   quote for exceptional reasons (SM ss 173, 174) is not offered.
 * - The price book's S184_CERTIFICATE and S182_INSPECTION rows are the NSW
 *   prescribed fees, switched off and read by no workflow. Certificate and
 *   inspection fees come from the pack. Remove or scope those rows before any
 *   workflow reads them.
 */

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
  levies: "contributions",
  /** Decision of 27 Oct 2026 (DECISIONS): owners see "penalty", never "interest" (SM s 165). */
  lateCharge: "penalty",
  planLabel: "Community titles scheme",
  /**
   * "Body corporate for" and the scheme's name (Act s 33(1)), which is its
   * identifying name in the community management statement, "community titles
   * scheme" and its number (Act s 22). This assumes the building's `name`
   * holds the CMS identifying name only: not confirmed against real data.
   */
  bodyCorporateName: "Body corporate for {name} community titles scheme {plan}",
  /** Queensland has no short form: the full name. */
  bodyCorporateShortName: "Body corporate for {name} community titles scheme {plan}",
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

/**
 * StrataVerze design choices made after the sign-off (stage 2, step 7,
 * 27 Oct 2026) that are not in the signed-off data, for Matthew Wrigley to
 * confirm. Each is applied as stated until then.
 */
export const FOR_REVIEW = [
  {
    point: "A committee may decide ordinary resolutions only, and any other category is refused on a committee agenda with the words in MEETING_RULES.committeeCategoryRefusal.",
    where: "MEETING_RULES.committeeCategories, committeeCategoryRefusal",
  },
  {
    point: "For voting, a lot owes the body corporate money when it has an issued contribution notice past its due date and not paid in full, on the building's today.",
    where: "src/lib/meetings/debtor-voting-repo.ts",
  },
  {
    point: "An owner of several lots is refused a vote only if every one of their lots owes money.",
    where: "src/lib/meetings/debtor-voting-repo.ts",
  },
  {
    point: "The draft AGM template and motion library: their wording, and putting the accounts and insurance review motions as ordinary resolutions (no type is recorded for those two).",
    where: "src/lib/meetings/templates.ts QLD_AGM_TEMPLATE, QLD_MOTION_LIBRARY",
  },
  {
    point: "Pre-meeting electronic voting is not offered for Queensland buildings until it is designed.",
    where: "MEETING_RULES.preMeetingEvoting",
  },
  {
    point: "A majority resolution is offered on the agenda but not in the motions list, which does not record written votes without proxies.",
    where: "MEETING_RULES.motionCategories",
  },
  {
    point:
      "The draft Queensland debt recovery steps, their labels and their guidance: the step types and order, the wording, who acts, and which steps are StrataVerze practice (ledger check, contact, reminder, final notice, waiver request, referral and closing).",
    where: "DEBT_RECOVERY_STEPS, DEBT_RECOVERY_STEP_LABELS, DEBT_RECOVERY_GUIDANCE",
  },
  {
    point:
      "The 2 year warning: a lot is flagged once its oldest unpaid contribution has been outstanding for 2 years from its date for payment and no proceedings are recorded (no case with the proceedings step completed or a court file number), with the deadline shown as that date plus 2 years and 2 months. It is a warning on the adviser debt recovery page only, with no daily reminder yet.",
    where: "src/lib/debt-recovery/proceedings-deadline.ts, adviser debt recovery page",
  },
  {
    point:
      "No StrataVerze fee is marked never recoverable from the owner for Queensland: a recovery step fee follows the price book, and owners are told it may be recoverable if reasonably incurred (SM s 166(1)(c)). Whether a StrataVerze fee is such a cost is not confirmed.",
    where: "NEVER_RECOVERABLE_FEE_VARIANTS, RECOVERY_COSTS_RECOVERABLE",
  },
  {
    point:
      "The waiver request step (HARDSHIP_REVIEW) is assigned to the committee, with approval required, although whether the committee can decide a waiver (SM s 166(6)) or a general meeting resolution is needed is not confirmed.",
    where: "DEBT_RECOVERY_STEPS HARDSHIP_REVIEW",
  },
  {
    point:
      "The body corporate certificate headings StrataVerze drafts (from the SM s 233AA(1) contents as summarised in the research notes, ending with anything else in the approved form), their order, the wording of each draft and the execution box. BCCM Form 33 itself was not read.",
    where: "CERTIFICATE.items, execution, executionLines; src/lib/records/certificate-draft.ts",
  },
  {
    point:
      "The repeat certificate fee applies when a certificate for the same lot was issued within the previous 3 months to a requester with the same name (letter case and spaces ignored).",
    where: "src/lib/records/fees.ts certificateFeeFor",
  },
  {
    point:
      "The 5 business days for a certificate and the 7 days for access to the records are counted from the day the written request was received, as if the fee came with it. Business days skip weekends only.",
    where: "CERTIFICATE.giveWithinBusinessDays, INSPECTIONS.accessWithinDays",
  },
  {
    point:
      "For access to the records, only an owner pays the owner's fee. An agent, even an owner's agent, pays the fee for anyone else. Copies are charged per page at the year's dollar amount, and the fee is worked out when the access is recorded as given.",
    where: "INSPECTIONS.ownerFeeTypes; src/lib/records/fees.ts accessFee",
  },
  {
    point:
      "The document library shows minutes and insurance policies as kept without a limit (as decided), by-laws without a limit as a record of current relevance, and financial, compliance, other and unlisted categories as kept for at least 6 years, the longer disposal period, although some records in them (reconciliation statements, insignificant correspondence) may be disposed of after 2.",
    where: "DOCUMENT_RETENTION",
  },
  {
    point:
      "Copies are charged at the guidance's dollar amount per page (75 cents in 2026-27) times the pages. SM s 233(7) rounds a fee to the nearest 5 cents: if the fee is 0.65 fee units times the pages, rounded once on the total, a large copy job can differ by a few cents from the per page amount.",
    where: "src/lib/records/fees.ts accessFee",
  },
  {
    point:
      "The dollar amounts for a Queensland certificate or records access are those for the financial year in which the written request was received (SM s 233 ties the fee to the request), not the day it is issued or given.",
    where: "src/lib/records/records-store.ts issueCertificate, completeInspection",
  },
  {
    point:
      "Works approvals compare the quoted total (including any GST) with the major spending limit, worked out from the building's recorded number of lots.",
    where: "WORKS_QUOTES; src/lib/works/quote-rule.ts",
  },
  {
    point:
      "The regulation module is a building setting the adviser (or StrataVerze) saves, like the building's name, not part of the locked building record. Only the Standard Module can be saved. The other modules are listed but cannot be chosen.",
    where: "REGULATION_MODULE; src/app/(portal)/adviser/schemes/actions.ts saveRegulationModuleAction",
  },
  {
    point:
      "Each lot's interest schedule lot entitlement is part of the locked building record, as unit entitlement is: once the lot exists only StrataVerze enters or changes it. It is required when a lot is created or imported, and an existing lot may be saved without it (the lot stays flagged).",
    where: "src/lib/auth/building-lock.ts LOCKED_LOT_FIELDS; src/app/(portal)/adviser/schemes/[id]/lots/actions.ts",
  },
  {
    point:
      "The share of the buildings insurance premium is not given a schedule. SM s 201(1) shares it by the interest schedule for building and volumetric format lots and by reinstatement cost for standard format lots, with adjustments allowed (s 201(2)). StrataVerze does not hold each lot's plan format, so it refuses to work the share out rather than assume the interest schedule.",
    where: "ENTITLEMENT_SCHEDULES INTEREST decides; src/lib/jurisdiction/building-data.ts scheduleFor",
  },
  {
    point:
      "A Queensland building with no module recorded, or with a lot that has no interest schedule lot entitlement, is flagged to the adviser on the building and lot pages and in the certificate draft, but nothing is refused: contributions and meetings run on the contribution schedule, which every lot holds.",
    where: "src/lib/jurisdiction/building-data.ts",
  },
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
 * None of the other NSW workflows applies in Queensland: there is no
 * statutory payment plan, committee training, Strata Hub report, capital works
 * fund plan, key financial information form or s 184 certificate. The debt
 * recovery steps are Queensland's own draft sequence (stage 2, step 8); the
 * body corporate certificate and records inspections are Queensland's own
 * (CERTIFICATE, INSPECTIONS, stage 2, step 9). Nothing is live: the pack is
 * still pending.
 */
export const FEATURES: PackFeatures = {
  statutoryPaymentPlans: false,
  committeeTraining: false,
  strataHubAnnualReport: false,
  capitalWorksFundPlan: false,
  keyFinancialInformation: false,
  strataInformationCertificate: false,
  recordsInspections: true,
  debtRecoverySteps: true,
  bodyCorporateCertificate: true,
};
