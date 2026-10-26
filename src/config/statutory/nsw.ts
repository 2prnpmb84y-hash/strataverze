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
 * Audit of the accounts and financial statements.
 *
 * SSMA 2015 s 95: required for a scheme of more than 100 lots, or with an
 * annual budget of more than the prescribed amount, $250,000 (Strata Schemes
 * Management Regulation 2016 cl 21). Other schemes consider an audit at each
 * AGM. Thresholds confirmed by StrataVerze, 23 October 2026.
 *
 * The amount tested is the total levies raised for the financial year
 * (administrative and capital works fund contributions, and any special
 * levies), as confirmed by StrataVerze on 23 October 2026: "all buildings over
 * 100 lots or raise more than 250K require an audit". Other income and money
 * already held are not counted. If the Regulation's own definition of the
 * annual budget is later found to include them, change `leviesRaisedForYear`.
 */
export const AUDIT_THRESHOLD = {
  lotsMoreThan: 100,
  leviesRaisedMoreThanCents: 25_000_000,
  measure: "total levies raised for the financial year",
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
 * Debt recovery: the steps a recovery case goes through, in order (moved here
 * from src/lib/queries/debt-recovery.ts on 26 Oct 2026, unchanged). Each case
 * is given these steps when it is opened.
 *
 * NOT YET REVIEWED against the current Act. These were written before the
 * multi-jurisdiction plan. In particular the NCAT and Local Court split at
 * $500, the 14 and 21 day periods, and the citations (s 83, 85, 86, 103, 229)
 * have not been checked against the in-force SSMA or the 2025 reforms
 * (prescribed payment plans, the order of payment allocation). The NSW pack
 * reviewer should confirm or correct them.
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
    actionRequired: "Verify all levy notices, payments, and outstanding balances on the lot ledger",
    legalBasis: "s 83 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Case opened",
  },
  {
    stepType: "INITIAL_CONTACT",
    stepOrder: 2,
    actionRequired: "Make initial contact with the lot owner regarding overdue levies",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Ledger verified",
    noticeType: "REMINDER",
  },
  {
    stepType: "REMINDER_NOTICE",
    stepOrder: 3,
    actionRequired: "Issue formal reminder notice with 14-day payment deadline",
    legalBasis: "s 85 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "14 days after initial contact with no payment",
    noticeType: "DEMAND",
  },
  {
    stepType: "FINAL_NOTICE",
    stepOrder: 4,
    actionRequired: "Issue final demand notice warning of legal action if payment is not received within 21 days",
    legalBasis: "s 85 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "14 days after reminder notice",
    noticeType: "FINAL_DEMAND",
  },
  {
    stepType: "HARDSHIP_REVIEW",
    stepOrder: 5,
    actionRequired: "Review any hardship application or payment plan request from the owner",
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "Owner submits hardship application or payment plan request",
  },
  {
    stepType: "COMMITTEE_REVIEW",
    stepOrder: 6,
    actionRequired: "Committee review and resolution to approve legal referral (ordinary resolution required)",
    legalBasis: "s 103 SSMA 2015",
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "Final notice period expired with no payment or payment plan",
  },
  {
    stepType: "LEGAL_REFERRAL",
    stepOrder: 7,
    actionRequired: "Refer matter to solicitor for recovery proceedings",
    legalBasis: "s 86 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: true,
    triggerCondition: "Committee approval granted",
  },
  {
    stepType: "PROCEEDINGS",
    stepOrder: 8,
    actionRequired: "Solicitor files claim in NCAT or Local Court (amounts under $500 to NCAT; over $500 to Local Court)",
    legalBasis: "s 86, s 229 SSMA 2015; Civil & Administrative Tribunal Act 2013",
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Legal referral accepted",
  },
  {
    stepType: "ENFORCEMENT",
    stepOrder: 9,
    actionRequired: "Enforce judgment via garnishee order, writ of execution, or interest registration on lot",
    legalBasis: "s 86(4) SSMA 2015",
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Judgment obtained",
  },
  {
    stepType: "CLOSED",
    stepOrder: 10,
    actionRequired: "Close recovery case and update ledger",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Debt fully recovered, written off, or settled",
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
 * Guidance shown for each debt recovery step (moved here from the case
 * screen in phase 1d, unchanged). Like DEBT_RECOVERY_STEPS, not yet reviewed
 * against the current Act; the NSW pack reviewer should confirm or correct it.
 */
export const DEBT_RECOVERY_GUIDANCE: Readonly<Record<string, string>> = {
  LEDGER_VERIFICATION:
    "Verify the accuracy of all levy charges, payments received and the outstanding balance. Ensure the ledger is reconciled before proceeding.",
  INITIAL_CONTACT:
    "Make initial contact with the lot owner to advise them of the overdue levy and request payment. This is an informal reminder before formal notices.",
  REMINDER_NOTICE:
    "Issue a formal reminder notice under s.83(1) of the Strata Schemes Management Act 2015. The notice must specify the amount owing and due date.",
  FINAL_NOTICE:
    "Issue a final notice of the overdue contribution, warning that further recovery action will be taken if payment is not received within 14 days.",
  HARDSHIP_REVIEW:
    "Review any hardship application from the lot owner. Consider whether a payment plan or alternative arrangement is appropriate before escalating.",
  COMMITTEE_REVIEW:
    "Present the case to the strata committee for review and decision on next steps. The committee must resolve to proceed with legal recovery.",
  LEGAL_REFERRAL:
    "Refer the matter to the scheme's solicitor for formal debt recovery proceedings. Provide all supporting documentation and correspondence.",
  PROCEEDINGS:
    "Commence formal legal proceedings. This may include an application to NCAT or the Local Court for recovery of the outstanding levy debt.",
  ENFORCEMENT:
    "Enforce the court order or NCAT decision. This may include registration of a judgment, garnishee orders, or other enforcement mechanisms.",
  CLOSED:
    "Finalise and close the debt recovery case. Record the outcome and any relevant notes for future reference.",
};
