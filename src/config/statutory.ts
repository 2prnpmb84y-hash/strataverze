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
