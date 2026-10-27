/**
 * Statutory rules for New South Wales strata schemes (Strata Schemes
 * Management Act 2015 and Regulation 2016), kept in one place so they can be
 * updated without touching business logic. Each value cites its source.
 * Check the in-force provision on legislation.nsw.gov.au before relying on a
 * value, and update it here if the law changes.
 *
 * Import these through `@/config/statutory`, the index of jurisdictions,
 * rather than from this file directly. Moved here unchanged on 26 Oct 2026
 * (multi-jurisdiction plan, phase 0). `nsw.golden.test.ts` records the
 * outputs these rules produce.
 */

import type { MeetingRuleSet } from "@/lib/meetings/rules";
import type { EntitlementScheduleDefinition, FundDefinition, PackFeatures } from "./types";

/**
 * Interest on unpaid contributions.
 *
 * Strata Schemes Management Act 2015 (NSW) s 85, as consolidated on AustLII
 * and summarised by the NSW Government (Strata levies page, updated 27 Oct 2025):
 * - s 85(1): an unpaid contribution bears simple interest at 10% a year until
 *   paid (or another rate prescribed by the regulations).
 * - s 85(2): no interest is payable if the contribution is paid within one
 *   month after it becomes due.
 * - s 85(3): the owners corporation may resolve that a contribution bears no
 *   interest, generally or in a particular case. It cannot set a different rate.
 *   The platform accepts only a general meeting resolution for this, not a
 *   committee decision (confirmed by StrataVerze, 23 October 2026).
 * - s 85(5): payment plans may be agreed for overdue contributions. Entering a
 *   payment plan does not stop interest. It keeps accruing at the statutory
 *   rate unless the owners corporation resolves to waive it (confirmed by
 *   StrataVerze, 23 October 2026).
 */
export const STATUTORY_INTEREST = {
  annualRatePercent: 10,
  graceMonths: 1,
  simple: true,
  source: "Strata Schemes Management Act 2015 (NSW) s 85",
} as const;

/**
 * Levy notices.
 *
 * - At least 30 days' written notice to pay a levy; at least 14 days for an
 *   urgent special levy for emergency repairs (NSW Government, Strata levies).
 * - From 27 October 2025 every levy notice must include the Financial Hardship
 *   Information Statement, or its information, including National Debt
 *   Helpline details (NSW Government, Strata levy notices; Strata Schemes
 *   Legislation Amendment Act 2025). The other items are the NSW Government's
 *   recommended contents.
 */
export const LEVY_NOTICE_RULES = {
  minimumNoticeDays: 30,
  /**
   * StrataVerze practice, stricter than the Act: each instalment's notice goes
   * out 5 weeks (35 days) before it falls due. Levies are paid in advance, so
   * an ordinary levy instalment falls due on the first day of the period it
   * covers. A notice that cannot be given 5 weeks may still go out with at
   * least the statutory 30 days, once the Adviser confirms (24 Oct 2026).
   */
  issueDaysBeforeDue: 35,
  urgentSpecialLevyNoticeDays: 14,
  hardshipStatementRequiredFrom: "2025-10-27",
  source: "NSW Government, Strata levies and Strata levy notices guidance (2025)",
} as const;

/**
 * Order in which an owner's payment is applied to what they owe: levies first,
 * then interest, then recovery costs (Strata Schemes Legislation Amendment Act
 * 2025, as described in practitioner commentary; order confirmed by
 * StrataVerze, 23 October 2026; section reference still to be added).
 */
export const PAYMENT_ALLOCATION_ORDER = ["LEVY", "INTEREST", "RECOVERY_COSTS"] as const;

/**
 * Capital works fund plan.
 *
 * SSMA 2015 s 80 requires a plan of anticipated major expenditure from the
 * capital works fund for at least the next 10 years, reviewed at least once
 * every 5 years. From 1 April 2026 a new or reviewed plan must use the
 * standard form (Strata Schemes Legislation Amendment Act 2025, as described
 * by PBL Legal). Section numbers for the review period and the standard form
 * were not confirmed against the in-force Act: check legislation.nsw.gov.au.
 */
export const CAPITAL_WORKS_PLAN = {
  horizonYears: 10,
  reviewEveryYears: 5,
  standardFormFrom: "2026-04-01",
  source: "Strata Schemes Management Act 2015 (NSW) s 80; Strata Schemes Legislation Amendment Act 2025",
} as const;

/**
 * Audit of the accounts and financial statements (SSMA 2015 s 95), as
 * confirmed by StrataVerze on 26 October 2026:
 * - compulsory for a large strata scheme, one of more than 100 lots, not
 *   counting parking or utility lots;
 * - compulsory when the annual budget is more than $250,000 (the prescribed
 *   amount; Strata Schemes Management Regulation 2016 cl 21, whose heading
 *   "Calculation of annual budget" was seen in the AustLII table of contents
 *   on 26 Oct 2026; its text was not read);
 * - done before the accounts and financial statements are presented to the
 *   annual general meeting, in accordance with the Australian Auditing
 *   Standards.
 * Other schemes consider an audit at each AGM.
 *
 * Lots counted: every lot on the strata roll except those recorded as
 * PARKING or STORAGE (StrataVerze's lot types for parking and utility lots)
 * and COMMON (a common property row, not a lot; decided by StrataVerze on
 * 26 Oct 2026). A utility lot recorded as RESIDENTIAL is counted until its
 * type is corrected. When the
 * roll has fewer lots than the building's recorded total (it is not fully
 * loaded), the lots not yet on the roll are counted too.
 *
 * The amount tested is the total levies raised for the financial year
 * (administrative and capital works fund contributions, and any special
 * levies), as confirmed by StrataVerze on 23 October 2026. Other income and
 * money already held are not counted. If cl 21's definition of the annual
 * budget is found to differ, change `leviesRaisedForYear`.
 */
export const AUDIT_THRESHOLD = {
  lotsMoreThan: 100,
  /** Lot types not counted towards the lots test (parking and utility lots). */
  excludedLotTypes: ["PARKING", "STORAGE", "COMMON"],
  /** How the platform names the lots left out. */
  excludedLotsLabel: "parking, utility or common property lots",
  leviesRaisedMoreThanCents: 25_000_000,
  measure: "total levies raised for the financial year",
  timing: "before the accounts and financial statements are presented to the annual general meeting",
  standard: "the Australian Auditing Standards",
  source: "Strata Schemes Management Act 2015 (NSW) s 95; Strata Schemes Management Regulation 2016 cl 21",
} as const;

/**
 * Statement of key financial information: the approved form under SSMA 2015
 * s 94(2), one for the administrative and capital works funds (NSW
 * Government). Rows follow the approved form as described by StrataMax's
 * guide; check them against the current NSW Government form before relying
 * on the layout.
 */
export const KEY_FINANCIAL_INFORMATION = {
  source: "Strata Schemes Management Act 2015 (NSW) s 94(2), approved form (NSW Government)",
  rows: [
    "Balance carried forward",
    "Total income received",
    "Total interest earned",
    "Total contributions paid",
    "Total unpaid contributions",
    "Total expenditure for maintenance",
    "Total expenditure for administration",
    "Balance at the end of the period",
    "Principal items of expenditure for the next period",
  ],
} as const;

/**
 * Default accounting basis per fund type (Financial Management Requirements):
 * the administrative fund on a cash basis, the capital works fund on an
 * accrual basis. The basis changes how reports recognise income and
 * expenditure, never how entries are posted.
 */
export const DEFAULT_ACCOUNTING_BASIS: Record<string, "CASH" | "ACCRUAL"> = {
  ADMINISTRATIVE: "CASH",
  CAPITAL_WORKS: "ACCRUAL",
};

/** The default basis for a fund type, including the older ADMIN and SINKING names. */
export function defaultAccountingBasis(fundType: string): "CASH" | "ACCRUAL" {
  return fundType === "CAPITAL_WORKS" || fundType === "SINKING" ? "ACCRUAL" : "CASH";
}

/**
 * Works spending rules under SSMA 2015 s 102 (applied to works approvals,
 * 25 Oct 2026). Matthew confirmed the two-quote rule applies to every
 * building; urgent works are exempt (s 102(5) per PBL Legal, Oct 2025; not
 * yet checked against the in-force Act text).
 */
export const WORKS_SPENDING_RULES = {
  /** At least this many independent quotes for one item over the threshold. */
  minimumQuotes: 2,
  /** In dollars, GST inclusive as quoted. */
  twoQuoteThreshold: 30_000,
  urgentWorksExempt: true,
  source: "SSMA 2015 s 102; PBL Legal, Strata scheme spending limits (Oct 2025); confirmed by Matthew 25 Oct 2026",
} as const;

/**
 * Meetings: the NSW rule set (moved here from src/lib/meetings/rules.ts on
 * 26 Oct 2026, unchanged). It seeds the `meeting_rule_sets` table. Notice and minutes periods confirmed by the product owner
 * (AGM 14 notice / 7 minutes, EGM 7 / 7, committee 3 / 7). The clause citations
 * behind these periods are to be re-pinned to the live consolidation; the
 * numbers here are the operative build figures. See strategy doc section 4.
 */
export const MEETING_RULES: MeetingRuleSet = {
  state: "NSW",
  version: "NSW-2025.1",
  effectiveFrom: "2025-01-01",
  noticePeriods: { AGM: 14, EGM: 7, COMMITTEE: 3, FIRST_AGM: 14 },
  minutesDeadlines: { AGM: 7, EGM: 7, COMMITTEE: 7, FIRST_AGM: 7 },
  quorumRules: {
    AGM: { basis: "PERCENT_PRESENT_OR_UE", percent: 0.25, minPersons: 2 },
    EGM: { basis: "PERCENT_PRESENT_OR_UE", percent: 0.25, minPersons: 2 },
    FIRST_AGM: { basis: "PERCENT_PRESENT_OR_UE", percent: 0.25, minPersons: 2 },
    COMMITTEE: { basis: "HALF_MEMBERS" },
  },
  resolutionCategories: {
    ORDINARY: { basis: "COUNT_MAJORITY" },
    SPECIAL: { basis: "UE_AGAINST_THRESHOLD", againstThreshold: 0.25 },
    UNANIMOUS: { basis: "NO_AGAINST" },
    SUSTAINABILITY_INFRASTRUCTURE: {
      basis: "UE_AGAINST_THRESHOLD",
      againstThreshold: 0.5,
    },
  },
  retention: { generalYears: 7, secretBallotMonths: 13 },
  preMeetingEvoting: {
    ballotOpenDaysBefore: 7,
    ballotCloseHoursBefore: { AGM: 24, EGM: 24, FIRST_AGM: 24, COMMITTEE: 0 },
  },
  notes:
    "Seed rule set for NSW. Clause citations to be re-pinned to the live in-force consolidation before deadline logic is relied upon.",
};

/**
 * Debt recovery: the steps a recovery case goes through, in order. Each case
 * is given these steps when it is opened; a case keeps the steps it was
 * opened with.
 *
 * REDRAFTED FROM SOURCES on 26 Oct 2026, FOR STRATAVERZE TO REVIEW. The step
 * types and order are unchanged (cases, labels and fees use them); the
 * actions, legal bases and triggers are rewritten from:
 * - NSW Government, "Guide to strata law changes" (changes from 27 Oct 2025
 *   and 23 Oct 2026): at least 30 days' notice before action against an
 *   owner; no action on levies covered by a payment plan that is being
 *   followed; payment plans up to 12 months on the standard form, a written
 *   reply within 28 days, no fee, written reasons for a refusal; from
 *   23 Oct 2026 a plan can cover current levies and interest too.
 * - NSW Government, "Assessing a payment plan for unpaid strata levies" and
 *   "How to arrange a payment plan": the decision is a majority vote at an
 *   owners corporation or strata committee meeting, recorded in the minutes,
 *   and cannot be delegated to the strata managing agent; an interest waiver
 *   is a separate decision made the same way; a request may be refused if
 *   the plan would leave the capital works or administrative fund short;
 *   payments apply to overdue levies oldest first, then interest, then
 *   recovery costs, unless a court or tribunal order or the owner says
 *   otherwise.
 * - NSW Fair Trading Form 1 (FT6648, November 2025), prescribed under SSMR
 *   cl 17K(1).
 * - SSMA 2015 ss 83, 85, 86 (numbers from the Act as made; current wording
 *   not read).
 * Owners see each step's `actionRequired` and `legalBasis`, so those hold no
 * review caveats; the points not confirmed are in DEBT_RECOVERY_GUIDANCE,
 * which only advisers see: the prescribed content of the 30-day notice and
 * the clause that requires it, who must authorise proceedings (s 103), the
 * court or tribunal and its limits, which recovery costs an owner can be
 * made to pay, enforcement options, and the current wording of ss 83 to 86.
 * Showing levies, interest and costs separately, and the reminder, are
 * StrataVerze practice, not a legal requirement.
 * The previous 14 and 21 day periods and the $500 NCAT and Local Court split
 * had no source and are removed.
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
}

export const DEBT_RECOVERY_STEPS: readonly DebtRecoveryStepRule[] = [
  {
    stepType: "LEDGER_VERIFICATION",
    stepOrder: 1,
    actionRequired:
      "Check each overdue levy was validly raised and its notice served with the hardship information, and that payments were applied to the oldest levies first, then interest, then costs (unless the owner or a court or tribunal order directed otherwise)",
    legalBasis: "SSMA 2015 ss 83, 85; payment order: NSW Government guidance (from 27 Oct 2025)",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Case opened",
  },
  {
    stepType: "INITIAL_CONTACT",
    stepOrder: 2,
    actionRequired:
      "Contact the owner about the overdue levies: the amount owing, and that they can ask for a payment plan on the standard form",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Ledger verified",
    noticeType: "REMINDER",
  },
  {
    stepType: "REMINDER_NOTICE",
    stepOrder: 3,
    actionRequired:
      "Send a written reminder showing levies, interest and any costs separately, with the hardship information and how to ask for a payment plan",
    legalBasis: "Interest: SSMA 2015 s 85",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "No payment or payment plan request after initial contact (period set by the building)",
    noticeType: "DEMAND",
  },
  {
    stepType: "FINAL_NOTICE",
    stepOrder: 4,
    actionRequired:
      "Give the owner written notice at least 30 days before any recovery action. No action can be taken for levies covered by a payment plan that is being followed",
    legalBasis: "NSW Government guidance on the changes from 27 Oct 2025",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Reminder unpaid and no payment plan being followed",
    noticeType: "FINAL_DEMAND",
  },
  {
    stepType: "HARDSHIP_REVIEW",
    stepOrder: 5,
    actionRequired:
      "Decide any payment plan request (and any request to waive interest) by majority vote at an owners corporation or strata committee meeting, recorded in the minutes, and reply in writing within 28 days. A refusal must give reasons. No fee can be charged. A request can arrive at any step",
    legalBasis: "Strata Schemes Management Regulation 2016 cl 17K (Form 1); NSW Government guidance",
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "Owner asks for a payment plan on the standard form",
  },
  {
    stepType: "COMMITTEE_REVIEW",
    stepOrder: 6,
    actionRequired:
      "Decide whether to start recovery proceedings, after the 30-day notice has expired and with no payment plan being followed",
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "30-day notice expired with no payment and no payment plan being followed",
  },
  {
    stepType: "LEGAL_REFERRAL",
    stepOrder: 7,
    actionRequired: "Refer the matter to a solicitor with the ledger, notices, evidence of service and the authorising decision",
    legalBasis: "SSMA 2015 s 86",
    responsibleParty: "ADVISER",
    approvalRequired: true,
    triggerCondition: "Recovery proceedings authorised",
  },
  {
    stepType: "PROCEEDINGS",
    stepOrder: 8,
    actionRequired:
      "Solicitor starts proceedings to recover the unpaid levies as a debt",
    legalBasis: "SSMA 2015 s 86",
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Legal referral accepted",
  },
  {
    stepType: "ENFORCEMENT",
    stepOrder: 9,
    actionRequired: "Solicitor enforces the judgment or order",
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Judgment or order obtained and unpaid",
  },
  {
    stepType: "CLOSED",
    stepOrder: 10,
    actionRequired: "Close the case and reconcile the lot ledger",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Debt paid, settled or written off",
  },
];

/**
 * The words the law uses, for text the platform shows or sends for a
 * building (multi-jurisdiction plan, phase 1d). Each value is exactly what
 * the platform said before phase 1d, so NSW output is unchanged. Other
 * jurisdictions' packs give their own terms (for example body corporate), to
 * be confirmed when their packs are written; none is assumed here.
 */
export const TERMINOLOGY = {
  /** The body that owns the common property. */
  ownersCorporation: "owners corporation",
  /** The elected committee. */
  committee: "strata committee",
  /** The governing Act, in full. */
  act: "Strata Schemes Management Act 2015",
  /** The governing Act, short form used in citations. */
  actShort: "SSMA 2015",
  /** The jurisdiction, as it follows the Act's name. */
  jurisdictionShort: "NSW",
  /** The tribunal that hears strata disputes and levy claims. */
  tribunal: "NCAT",
  /** One amount owners pay, lower case. */
  levy: "levy",
  /** The same, plural. */
  levies: "levies",
  /** What is charged on an overdue levy (s 85). */
  lateCharge: "interest",
  /** How the plan is named before its number. */
  planLabel: "Strata Plan",
  /** The owners corporation's name, as the platform's invoices have always given it. */
  bodyCorporateName: "The Owners - Strata Plan No. {plan}",
  /** The same name as meeting notices and minutes have always headed it. */
  bodyCorporateShortName: "The Owners - Strata Plan {plan}",
  source: "Strata Schemes Management Act 2015 (NSW); NSW Civil and Administrative Tribunal",
} as const;

/**
 * Citations shown next to a rule in the platform's text (phase 1d). Each is
 * exactly the wording used before, so NSW output is unchanged. Section numbers
 * are as made in 2015 and are to be re-checked against the in-force Act with
 * the rest of the pack.
 */
export const CITATIONS = {
  /** Interest on unpaid contributions. */
  interest: "SSMA 2015 s 85",
  /** The same section, after the Act's full name. */
  interestSection: "s 85",
  /** A resolution that contributions bear no interest. */
  noInterestResolution: "SSMA 2015 s 85(3)",
  /** The same section, where the Act is already named. */
  noInterestSection: "s 85(3)",
  /** The resolution adopting pre-meeting electronic voting. */
  evotingAdoption: "Reg cl 14",
  /** Two quotes for works over the threshold. */
  worksTwoQuotes: "SSMA s 102",
  /** A committee member who stops being an owner leaves the committee. */
  committeeSeatEndsOnSale: "s 35(1)(a) SSMA 2015",
  /** The formal reminder notice before recovery. */
  recoveryReminderNotice: "s.83(1) of the Strata Schemes Management Act 2015",
  source: "Strata Schemes Management Act 2015 (NSW), as made",
} as const;

/**
 * The hardship information included with every levy notice (moved here from
 * src/lib/finance/levy-notice-content.ts in phase 1d, unchanged). Confirm
 * against the current NSW Government statement.
 */
export const HARDSHIP_INFORMATION = {
  title: "Financial Hardship Information Statement",
  summary:
    "If you are having trouble paying your levies, contact the owners corporation as soon as possible. You can ask for a payment plan, and the owners corporation must consider your request. Free, confidential financial counselling is available from the National Debt Helpline.",
  helplineName: "National Debt Helpline",
  helplinePhone: "1800 007 007",
  helplineWeb: "ndh.org.au",
  moreInformationUrl: "https://www.nsw.gov.au/strata-levies-help",
} as const;

/**
 * Guidance shown for each debt recovery step. Redrafted from sources with
 * DEBT_RECOVERY_STEPS on 26 Oct 2026, for StrataVerze to review; the
 * sources and the points not confirmed are listed there.
 */
export const DEBT_RECOVERY_GUIDANCE: Readonly<Record<string, string>> = {
  LEDGER_VERIFICATION:
    "Check each overdue levy was validly raised and the levy notice was served with the hardship information. Check payments were applied to the oldest overdue levies first, then interest, then recovery costs, unless the owner or a court or tribunal order said otherwise. Showing levies, interest and costs separately is StrataVerze practice.",
  INITIAL_CONTACT:
    "Contact the owner informally about the overdue levies and the amount owing. Tell them they can ask for a payment plan of up to 12 months on the standard form, and that the owners corporation cannot charge a fee for it.",
  REMINDER_NOTICE:
    "Send a written reminder showing levies, interest and any costs separately, with the hardship information and how to ask for a payment plan. No statutory period for a reminder is confirmed; the building sets its own.",
  FINAL_NOTICE:
    "Before any recovery action, give the owner written notice at least 30 days ahead. No action can be taken for levies covered by a payment plan that is being followed. Not confirmed: the prescribed content of this notice and the clause that requires it. Check both before issuing.",
  HARDSHIP_REVIEW:
    "A payment plan request (and any request to waive interest) is decided by majority vote at an owners corporation or strata committee meeting and recorded in the minutes. The strata managing agent cannot decide it. Reply in writing within 28 days. A plan can run up to 12 months. A refusal must give reasons; the guidance says a request may be refused if the plan would leave a fund short. No fee can be charged. From 23 Oct 2026 a plan can cover current levies and interest as well as overdue levies. While a plan is followed, no recovery action can be taken for the levies it covers.",
  COMMITTEE_REVIEW:
    "Decide whether to start proceedings once the 30-day notice has expired and no payment plan is being followed. Not confirmed: whether the strata committee can decide this or a general meeting resolution is needed (s 103). Check before acting.",
  LEGAL_REFERRAL:
    "Refer the matter to a solicitor with the ledger, the levy notices, the 30-day notice, evidence of service and the decision authorising proceedings.",
  PROCEEDINGS:
    "The solicitor starts proceedings to recover the unpaid levies as a debt (s 86; current wording not read). Not confirmed: the court or tribunal, its monetary limits and which recovery costs can be claimed. Rely on the solicitor's advice.",
  ENFORCEMENT:
    "The solicitor enforces the judgment or order. Not confirmed: the enforcement options. Rely on the solicitor's advice.",
  CLOSED:
    "Close the case once the debt is paid, settled or written off, and reconcile the lot ledger.",
};

/**
 * Payment plans for overdue levies (26 Oct 2026, for StrataVerze to review).
 * Sources, all checked on 26 Oct 2026:
 * - NSW Fair Trading Form 1 "Request for payment plan for overdue
 *   contributions" (FT6648, November 2025), prescribed under cl 17K(1) of the
 *   Strata Schemes Management Regulation 2016: its fields, the 28-day written
 *   response to a complete request, reasons for a refusal, and that a plan
 *   and an interest waiver each need a resolution.
 * - NSW Government, "Assessing a payment plan for unpaid strata levies" and
 *   "How to arrange a payment plan": majority vote at an owners corporation
 *   or strata committee meeting, recorded in the minutes, not delegable to
 *   the strata managing agent; up to 12 months; no information beyond the
 *   form; refusal grounds (a fund left short, as listed in `refusalGrounds`);
 *   the contents of the payment plan statement; no recovery action for
 *   levies covered by a plan being followed; after a refusal, Fair Trading's
 *   free mediation, then an application to NCAT for an order that the
 *   refusal was unreasonable (`mediation`).
 * - NSW Government, "Guide to strata law changes": no fee for a request (from
 *   27 Oct 2025); from 23 Oct 2026 a plan can cover current levies and
 *   interest, not only overdue levies (the standard form is still the one
 *   for overdue levies).
 * `pausedSteps` is StrataVerze's reading of "no recovery action": the 30-day
 * notice and every later step wait while a plan is being followed.
 */
export const PAYMENT_PLANS = {
  maxMonths: 12,
  replyWithinDays: 28,
  /** No fee or charge to the owner for asking for or entering a plan. */
  ownerFeeAllowed: false,
  requestForm: "Form 1 Request for payment plan for overdue contributions (NSW Fair Trading FT6648, November 2025)",
  requestFormSource: "Strata Schemes Management Regulation 2016 cl 17K(1)",
  decidedBy: "a majority vote at a meeting of the owners corporation or the strata committee, recorded in the minutes",
  notDecidedBy: "the strata managing agent",
  /** Plans may cover current levies and interest from this date. */
  currentLeviesFrom: "2026-10-23",
  /** Recovery steps that wait while a plan is being followed. */
  pausedSteps: ["FINAL_NOTICE", "COMMITTEE_REVIEW", "LEGAL_REFERRAL", "PROCEEDINGS", "ENFORCEMENT"],
  refusalGrounds: [
    "the capital works fund would not be enough to meet the duty to repair and maintain common property",
    "the administrative fund would not be enough to pay its expenses",
    "the funds would not be enough to comply with an enforceable undertaking, a compliance notice or another order under an Act",
  ],
  /** What the payment plan statement must contain. */
  statementContents: [
    "the lot owner's name, address and lot number",
    "the levies owing",
    "the interest payable and how it is calculated",
    "the payment schedule and payment methods",
    "the amount paid to date",
    "contact details for the strata managing agent or strata committee",
    "the owner's right to ask for an extension (the owners corporation need not agree)",
    "the date the plan was agreed",
  ],
  extensionStatement:
    "You may ask the owners corporation to extend this payment plan. The owners corporation does not have to agree.",
  helpUrl: "https://www.nsw.gov.au/housing-and-construction/strata/living/arrange-a-payment-plan",
  mediation: "If the request is refused, the owner can apply to NSW Fair Trading's free mediation service, then to NCAT for an order that the refusal was unreasonable.",
  source: "Strata Schemes Management Regulation 2016 cl 17K; NSW Government guidance (27 Oct 2025 and 23 Oct 2026 changes)",
} as const;

/**
 * Strata committee training (26 Oct 2026, for StrataVerze to review).
 * Source: NSW Government, "Strata committee training" (checked 26 Oct 2026),
 * and "Guide to strata law changes" (1 Oct 2026 changes):
 * - from 1 Oct 2026 new and returning committee members, and members
 *   appointed to a vacancy for more than 3 months, complete NSW Fair
 *   Trading's free online training within 3 months of being appointed;
 * - members appointed before 1 Oct 2026 need not train until they are next
 *   appointed;
 * - a member who has not completed it within 3 months automatically stops
 *   being a committee member;
 * - exempt: two-lot schemes, members of the Australian College of Strata
 *   Lawyers, NSW strata managing agents, casual vacancies under 3 months;
 * - recommended (not required): a copy of the certificate to the secretary.
 * NOT CONFIRMED: whether a member who has completed it must repeat it each
 * year. The guide says "each year"; the training page says a member who has
 * completed it will not need to complete the same training again, and that
 * further details will be published in 2027. The platform counts any
 * recorded completion until that is settled (`repeatsEachYear: null`).
 */
export const COMMITTEE_TRAINING = {
  startsOn: "2026-10-01",
  withinMonths: 3,
  /** The course for appointments from 1 Oct 2026 to 30 Sep 2027 (NSW Government training page). */
  course: "NSW Fair Trading's free online training, Introduction to Strata Committee Rights and Responsibilities (on Strata Hub)",
  /** Schemes with this many lots are exempt (two-lot schemes). */
  exemptLotCount: 2,
  exemptions: {
    ACSL_MEMBER: "member of the Australian College of Strata Lawyers",
    STRATA_MANAGING_AGENT: "NSW strata managing agent",
    CASUAL_VACANCY_SHORT: "appointed to a casual vacancy for less than 3 months",
  },
  consequence: "A member who has not completed the training within 3 months of appointment automatically stops being a committee member.",
  recommendation: "It is recommended that each member gives a copy of their certificate of completion to the secretary.",
  repeatsEachYear: null,
  repeatNote: "Whether the training must be repeated each year is not yet confirmed. The training page says further details will be published in 2027.",
  helpUrl: "https://www.nsw.gov.au/housing-and-construction/strata/serving-on-a-committee/strata-committee-training",
  source: "NSW Government, Strata committee training (from 1 Oct 2026)",
} as const;

/**
 * Strata Hub annual reporting (26 Oct 2026, for StrataVerze to review).
 * Source: NSW Government, "Strata annual reporting" (checked 26 Oct 2026),
 * citing Strata Schemes Management Regulation 2016, Part 7, Division 2
 * (cl 43 to 43C): every strata scheme reports each year within 3 months of
 * its AGM; from 1 Oct 2026 two-lot schemes do not; changes (secretary,
 * chairperson, strata managing agent, building manager, emergency contacts,
 * incorrect information) are updated within 28 days of becoming aware;
 * the reporter pays $3 a lot; fines of up to $5,500 for not reporting on
 * time, and up to $2,200 for not updating.
 */
export const ANNUAL_REPORTING = {
  withinMonthsOfAgm: 3,
  exemptLotCount: 2,
  exemptFrom: "2026-10-01",
  updateWithinDays: 28,
  feePerLotCents: 300,
  information: [
    "Strata plan number, address and number of lots",
    "Secretary and chairperson contact details",
    "Date of the last AGM (or why none has been held)",
    "Building insurance replacement value",
    "Capital works fund balance",
    "Strata managing agent and building manager, if any",
    "Occupation certificate and annual fire safety statement dates, and NABERS rating, if any",
    "Lots by use, number of storeys, and strata renewal committee date, if any",
    "Up to four emergency contacts, in order",
  ],
  penalty: "Fines of up to $5,500 may apply if a scheme does not report on time, and up to $2,200 if it does not update its information within 28 days.",
  portal: "NSW Strata Hub",
  noAgmNote: "A scheme that has not yet reported should start as soon as possible, even without a recent AGM; it gives the reason no AGM has been held.",
  helpUrl: "https://www.nsw.gov.au/housing-and-construction/strata/strata-annual-reporting",
  source: "Strata Schemes Management Regulation 2016, Part 7, Division 2; NSW Government, Strata annual reporting",
} as const;

/**
 * How long the owners corporation's records are kept (26 Oct 2026, for
 * StrataVerze to review). Sources, checked 26 Oct 2026: NSW Government,
 * "Record keeping requirements" (records 7 years; the strata roll for the
 * life of the scheme, its change records 7 years; secret ballot records 13
 * months; records made from 11 Jun 2024 kept electronically) and "Guide to
 * strata law changes" (minor renovations approved: a record kept for 10
 * years, from 1 Jul 2025). StrataVerze never destroys a record: removing a
 * document hides it from the library and keeps it.
 */
export const RECORD_RETENTION = {
  generalYears: 7,
  generalRecords: "financial records, meeting records, notices and correspondence",
  strataRoll: "for the life of the scheme",
  minorRenovationYears: 10,
  minorRenovationFrom: "2025-07-01",
  secretBallotMonths: 13,
  electronicFrom: "2024-06-11",
  /** Library categories and how long each is kept: years, or null for the life of the scheme (by-laws are part of the strata roll). */
  byCategory: { MINUTES: 7, INSURANCE: 7, BYLAW: null, FINANCIAL: 7, COMPLIANCE: 7, OTHER: 7 } as Readonly<Record<string, number | null>>,
  source: "NSW Government, Record keeping requirements; Guide to strata law changes (1 Jul 2025)",
} as const;

/**
 * Section 184 strata information certificate (26 Oct 2026, for StrataVerze
 * to review). Sources, checked 26 Oct 2026:
 * - NSW Fair Trading, "Section 184 certificate – strata schemes", the
 *   approved form (PDF last updated 19 Mar 2026, "version March 2026"); its
 *   items are listed in `items`, as read from the form. StrataVerze lays the
 *   certificate out itself (decided by StrataVerze, 26 Oct 2026), so check
 *   it against the current approved form before relying on the layout.
 * - NSW Government, "Guide to strata law changes" (1 Apr 2026): the
 *   certificate also covers utilities supplied by an exclusive supply
 *   network, certain orders and compliance actions, and meetings held in the
 *   past year and upcoming meetings.
 * - Fees: $109, or $94 for a further certificate for the same lot within 3
 *   months, from the price book's source (SSMR 2016 Sch 4 item 3, as
 *   consolidated on AustLII). The in-force amount is NOT CONFIRMED.
 *   StrataVerze records the fee due; it is collected outside StrataVerze
 *   (decided 26 Oct 2026).
 */
export const SALE_CERTIFICATE = {
  title: "Strata information certificate",
  section: "Strata Schemes Management Act 2015 (NSW) s 184",
  form: "Approved form: Section 184 certificate – strata schemes (NSW Fair Trading, version March 2026)",
  requesterTypes: { OWNER: "Owner", MORTGAGEE: "Mortgagee", COVENANT_CHARGEE: "Covenant chargee", AUTHORISED_PERSON: "Person authorised by the owner, mortgagee or covenant chargee" },
  items: [
    ["1", "Strata renewal committee"],
    ["2", "Exclusive supply network (s 184(8))"],
    ["3", "Administrative fund contributions (s 73)"],
    ["4", "Capital works fund contributions (s 74)"],
    ["5", "Amounts for additional amenities or services (s 117)"],
    ["6", "Special contributions to the administrative or capital works fund (s 81(4))"],
    ["7", "Money unpaid under a by-law conferring a right or privilege"],
    ["8", "Proposals for funding matters in the 10-year capital works fund plan"],
    ["9", "Contributions towards legal proceedings (s 90)"],
    ["10", "Amount recoverable for work carried out by the owners corporation (s 120)"],
    ["11", "Interest on contributions (s 85)"],
    ["12", "Unpaid contributions and penalties"],
    ["12A", "Outstanding orders and compliance action"],
    ["13", "General and strata committee meetings held in the 12 months before the date of this certificate"],
    ["14", "Meetings notified but not yet held"],
    ["15", "Strata roll for the lot"],
    ["16", "Strata managing agent (s 49) and building manager (s 67)"],
    ["17", "Strata committee"],
    ["18", "By-laws made in the previous six months not yet lodged with the Registrar-General (s 141)"],
    ["19", "Insurance policies"],
    ["20", "Community association administrative fund contributions (community schemes only)"],
    ["21", "Community association sinking fund contributions (community schemes only)"],
    ["22", "Building management committee contributions (members only)"],
    ["23", "Amounts payable to any other person or body not connected to maintenance or insurance of common property"],
  ] as ReadonlyArray<readonly [string, string]>,
  execution: "Common seal of the owners corporation, affixed in the presence of the persons authorised by s 273",
  conclusiveNote: "A strata information certificate is conclusive evidence, as at its date, of the matters it certifies, for a purchaser or lessee for valuable consideration (s 185).",
  feeCents: 10_900,
  repeatFeeCents: 9_400,
  repeatWithinMonths: 3,
  feeSource: "Strata Schemes Management Regulation 2016 Sch 4 item 3, as consolidated on AustLII (in-force amount not confirmed)",
  helpUrl: "https://www.nsw.gov.au/housing-and-construction/strata/factsheets-forms-resources/section-184-certificate-strata-schemes",
} as const;

/**
 * Inspection of the owners corporation's records (s 182) (26 Oct 2026, for
 * StrataVerze to review). Source: NSW Government, "Record keeping
 * requirements" (checked 26 Oct 2026): owners may inspect; others need the
 * owner's authority; if a time and place cannot be agreed within 3 days, the
 * owners corporation may set a date within 10 days of the request, a place
 * and a time by written notice; fees, the same however the inspection is
 * made and paid into the administrative fund, including GST: an owner $31
 * for the first hour and $16 for each further half hour; another authorised
 * person $60 and $30. How a part of a half hour is charged is NOT
 * CONFIRMED: StrataVerze charges each part as a whole half hour.
 */
export const RECORDS_INSPECTION = {
  section: "Strata Schemes Management Act 2015 (NSW) s 182",
  agreeWithinDays: 3,
  setWithinDays: 10,
  fees: {
    OWNER: { firstHourCents: 3_100, extraHalfHourCents: 1_600 },
    AUTHORISED_PERSON: { firstHourCents: 6_000, extraHalfHourCents: 3_000 },
  },
  feesIncludeGst: true,
  paidInto: "the administrative fund",
  partHalfHour: "Each part of a further half hour is charged as a whole half hour (not confirmed).",
  source: "NSW Government, Record keeping requirements",
} as const;

/**
 * The funds an NSW owners corporation keeps (phase 2 foundation, 27 Oct 2026):
 * the administrative fund and the capital works fund, the same two the
 * platform already uses. Sections 73 and 74 are those the approved s 184
 * certificate form gives for each fund's contributions (SALE_CERTIFICATE
 * items 3 and 4); s 80 is the capital works fund plan (CAPITAL_WORKS_PLAN).
 * The Act's text for them was not read.
 */
export const FUND_CATALOGUE: readonly FundDefinition[] = [
  {
    key: "ADMINISTRATIVE",
    name: "administrative fund",
    label: "Administrative Fund",
    shortLabel: "Admin",
    ledgerFund: "ADMINISTRATIVE",
    purpose: "Day-to-day running costs of the owners corporation.",
    required: true,
    source: "Strata Schemes Management Act 2015 (NSW) s 73, as given in the approved s 184 certificate form",
    status: "GUIDANCE",
  },
  {
    key: "CAPITAL_WORKS",
    name: "capital works fund",
    label: "Capital Works Fund",
    shortLabel: "Capital Works",
    ledgerFund: "CAPITAL_WORKS",
    purpose: "Major and long-term works on common property, following the 10-year capital works fund plan.",
    required: true,
    source: "Strata Schemes Management Act 2015 (NSW) ss 74 (as given in the approved s 184 certificate form), 80",
    status: "GUIDANCE",
  },
];

/**
 * NSW has one schedule: unit entitlement, held on each lot. It decides each
 * lot's share of levies and the value of its vote on a poll and in special
 * resolutions (MEETING_RULES), as the platform uses it today.
 */
export const ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[] = [
  {
    key: "UNIT_ENTITLEMENT",
    name: "unit entitlement",
    onLot: true,
    usedFor: ["each lot's share of levies", "the value of a lot's vote on a poll and in special resolutions"],
    source: "Strata Schemes Management Act 2015 (NSW), as the platform applies it; the schedule of unit entitlement on the strata plan (sections not checked)",
    status: "NOT_CONFIRMED",
  },
];

/** The NSW workflows, all on (stage 2, 27 Oct 2026). */
export const FEATURES: PackFeatures = {
  statutoryPaymentPlans: true,
  committeeTraining: true,
  strataHubAnnualReport: true,
  capitalWorksFundPlan: true,
  keyFinancialInformation: true,
  strataInformationCertificate: true,
  recordsInspections: true,
  debtRecoverySteps: true,
};
