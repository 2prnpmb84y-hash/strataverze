/**
 * Statutory defaults for NSW strata schemes, kept in one place so they can be
 * updated without touching business logic. Each value cites its source.
 * Check the in-force provision on legislation.nsw.gov.au before relying on a
 * value, and update it here if the law changes.
 */

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
