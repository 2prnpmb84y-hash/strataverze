/**
 * Levy notice content check (pure). Lists what a NSW levy notice is missing
 * before it can be issued. The Financial Hardship Information Statement is
 * mandatory from 27 October 2025; the other items are the NSW Government's
 * recommended contents for levy notices, which this platform treats as
 * required so every notice is complete. Sources in src/config/statutory.ts.
 * A pack with checked notice rules (VIC, ACT and WA stage 2, PR 6a) also has
 * its most notice checked and its gate applied (noticeRuleProblems in
 * src/lib/levies/notice-rule-check.ts); NSW and Queensland have neither.
 */
import type { StatutoryRules } from "@/config/statutory";
import { noticeRuleProblems, noticeTimingFor, type NoticeContentKey, type NoticeLedgerFund } from "@/lib/levies/notice-rule-check";

/** The notice rules of a building's rule pack (`rules.NOTICE_RULES`). */
export type NoticeRules = StatutoryRules["NOTICE_RULES"];

/** The hardship information a notice carries (`rules.NOTICE_RULES.hardship.information`). */
export type HardshipInformation = NonNullable<NoticeRules["hardship"]>["information"];

export interface LevyNoticeContentInput {
  scheme: { name: string | null; planNumber: string | null };
  lotNumber: string | null;
  ownerNames: string[];
  noticeDate: string; // YYYY-MM-DD the notice is issued
  dueDate: string; // YYYY-MM-DD
  fundName: string | null;
  amountCents: number;
  isUrgentSpecialLevy?: boolean;
  payment: {
    accountName: string | null;
    bsb: string | null;
    accountNumber: string | null;
    /** Customer reference number. Required once the payment provider issues one. */
    reference: string | null;
  };
  contact: { name: string | null; emailOrPhone: string | null };
  /** The notice states the late charge (NSW interest, Queensland penalty). */
  includesInterestWarning: boolean;
  /**
   * Whether the notice must state a late charge: false where none applies to
   * the building (a Queensland building with no penalty resolved), whose
   * notice states none. Unset, it must.
   */
  lateChargeApplies?: boolean;
  includesHardshipStatement: boolean;
  includesLedgerAccess: boolean;
  /**
   * The ledger fund the notice's fund is kept in (`ledgerFundOf(fund.fundType)`),
   * for a pack's checked notice rules (VIC, ACT and WA stage 2, PR 6a). A pack
   * without them does not read it.
   */
  ledgerFund?: NoticeLedgerFund | null;
  /**
   * What the notice states beyond the items above, by content key, for a
   * pack's checked notice rules. A key not true is not stated, so a pack that
   * requires it refuses the notice.
   */
  states?: Partial<Record<NoticeContentKey, boolean>>;
}

export interface MissingItem {
  code: string;
  message: string;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/**
 * `terms` are the building's words (`rules.TERMINOLOGY`), and `funds` its two
 * funds without the word "fund" ("administrative", "capital works"); without
 * them each item is worded as it always was ("interest", "levy", "strata plan").
 */
export function validateLevyNoticeContent(
  n: LevyNoticeContentInput,
  rule: NoticeRules,
  terms?: Pick<StatutoryRules["TERMINOLOGY"], "lateCharge"> & Partial<Pick<StatutoryRules["TERMINOLOGY"], "levy" | "planLabel">>,
  funds?: { admin: string; capitalWorks: string },
): MissingItem[] {
  const missing: MissingItem[] = [];
  const levy = terms?.levy ?? "levy";
  const plan = (terms?.planLabel ?? "Strata Plan").toLowerCase();
  const fundKinds = funds ?? { admin: "administrative", capitalWorks: "capital works" };
  const need = (ok: unknown, code: string, message: string) => {
    if (!ok) missing.push({ code, message });
  };

  need(n.scheme.planNumber?.trim(), "PLAN_NUMBER", `The ${plan} number.`);
  need(n.scheme.name?.trim(), "SCHEME_NAME", "The scheme name.");
  need(n.lotNumber?.trim(), "LOT", "The lot number.");
  need(n.ownerNames.some((x) => x.trim()), "OWNER", "The owner's name. Record the lot owner on the strata roll.");
  need(/^\d{4}-\d{2}-\d{2}$/.test(n.noticeDate), "NOTICE_DATE", "The date of the notice.");
  need(/^\d{4}-\d{2}-\d{2}$/.test(n.dueDate), "DUE_DATE", "The due date.");
  need(n.fundName?.trim(), "FUND", `The fund the ${levy} is for (${fundKinds.admin} or ${fundKinds.capitalWorks}).`);
  need(n.amountCents > 0, "AMOUNT", "The amount payable.");
  need(
    n.payment.accountName?.trim() && n.payment.bsb?.trim() && n.payment.accountNumber?.trim(),
    "PAYMENT_DETAILS",
    "How to pay: the scheme's bank account name, BSB and account number. Add the operating bank account in Finance.",
  );
  need(n.payment.reference?.trim(), "PAYMENT_REFERENCE", "A payment reference for the owner to quote.");
  need(n.contact.name?.trim() && n.contact.emailOrPhone?.trim(), "CONTACT", "Who to contact with questions (name and email or phone).");
  // A late charge is stated only where one applies (Queensland: once a penalty is resolved).
  if (n.lateChargeApplies ?? true) {
    need(n.includesInterestWarning, "INTEREST_WARNING", `A warning that ${terms?.lateCharge ?? "interest"} is charged on overdue amounts.`);
  }
  need(n.includesLedgerAccess, "LEDGER_ACCESS", `How the owner can check their ${levy} ledger.`);
  // A pack with no hardship statement (Queensland) does not require one.
  if (rule.hardship && n.noticeDate >= rule.hardship.requiredFrom) {
    need(n.includesHardshipStatement, "HARDSHIP_STATEMENT", "The Financial Hardship Information Statement.");
  }

  // The building's timing: its own numbers, or its checked rules (VIC, ACT and WA).
  const timing = noticeTimingFor(rule);
  if (/^\d{4}-\d{2}-\d{2}$/.test(n.noticeDate) && /^\d{4}-\d{2}-\d{2}$/.test(n.dueDate)) {
    // Without a shorter urgent notice in the pack, an urgent levy needs the usual notice.
    const minimum = n.isUrgentSpecialLevy && timing.urgentDays != null ? timing.urgentDays : timing.minimumDays;
    if (daysBetween(n.noticeDate, n.dueDate) < minimum) {
      missing.push({
        code: "NOTICE_PERIOD",
        message: `At least ${minimum} days' notice to pay. The due date is ${daysBetween(n.noticeDate, n.dueDate)} days after the notice date.`,
      });
    }
    // Where the law sets the most notice (the ACT's 28 days), never more.
    const maximum = timing.maximumDays;
    if (maximum != null && daysBetween(n.noticeDate, n.dueDate) > maximum) {
      missing.push({
        code: "NOTICE_PERIOD_MAX",
        message: `The due date must be no later than ${maximum} days after the date of the notice (${rule.checked?.maximumNoticeDays?.source ?? rule.source}). The due date is ${daysBetween(n.noticeDate, n.dueDate)} days after the notice date.`,
      });
    }
  }
  // A pack's checked notice rules: anything not confirmed, or not yet stated, refuses the notice.
  for (const p of noticeRuleProblems(rule, { ledgerFund: n.ledgerFund ?? null, states: n.states })) missing.push({ code: p.code, message: p.message });
  return missing;
}
