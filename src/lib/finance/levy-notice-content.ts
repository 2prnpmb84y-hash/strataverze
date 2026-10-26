/**
 * Levy notice content check (pure). Lists what a NSW levy notice is missing
 * before it can be issued. The Financial Hardship Information Statement is
 * mandatory from 27 October 2025; the other items are the NSW Government's
 * recommended contents for levy notices, which this platform treats as
 * required so every notice is complete. Sources in src/config/statutory.ts.
 */
import type { StatutoryRules } from "@/config/statutory";

/** The levy notice rules of a building's rule pack (`rules.LEVY_NOTICE_RULES`). */
export type LevyNoticeRule = StatutoryRules["LEVY_NOTICE_RULES"];

/** The hardship information included with every notice. Confirm against the current NSW Government statement. */
export const HARDSHIP_INFORMATION = {
  title: "Financial Hardship Information Statement",
  summary:
    "If you are having trouble paying your levies, contact the owners corporation as soon as possible. You can ask for a payment plan, and the owners corporation must consider your request. Free, confidential financial counselling is available from the National Debt Helpline.",
  helplineName: "National Debt Helpline",
  helplinePhone: "1800 007 007",
  helplineWeb: "ndh.org.au",
  moreInformationUrl: "https://www.nsw.gov.au/strata-levies-help",
} as const;

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
  includesInterestWarning: boolean;
  includesHardshipStatement: boolean;
  includesLedgerAccess: boolean;
}

export interface MissingItem {
  code: string;
  message: string;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

export function validateLevyNoticeContent(n: LevyNoticeContentInput, rule: LevyNoticeRule): MissingItem[] {
  const missing: MissingItem[] = [];
  const need = (ok: unknown, code: string, message: string) => {
    if (!ok) missing.push({ code, message });
  };

  need(n.scheme.planNumber?.trim(), "PLAN_NUMBER", "The strata plan number.");
  need(n.scheme.name?.trim(), "SCHEME_NAME", "The scheme name.");
  need(n.lotNumber?.trim(), "LOT", "The lot number.");
  need(n.ownerNames.some((x) => x.trim()), "OWNER", "The owner's name. Record the lot owner on the strata roll.");
  need(/^\d{4}-\d{2}-\d{2}$/.test(n.noticeDate), "NOTICE_DATE", "The date of the notice.");
  need(/^\d{4}-\d{2}-\d{2}$/.test(n.dueDate), "DUE_DATE", "The due date.");
  need(n.fundName?.trim(), "FUND", "The fund the levy is for (administrative or capital works).");
  need(n.amountCents > 0, "AMOUNT", "The amount payable.");
  need(
    n.payment.accountName?.trim() && n.payment.bsb?.trim() && n.payment.accountNumber?.trim(),
    "PAYMENT_DETAILS",
    "How to pay: the scheme's bank account name, BSB and account number. Add the operating bank account in Finance.",
  );
  need(n.payment.reference?.trim(), "PAYMENT_REFERENCE", "A payment reference for the owner to quote.");
  need(n.contact.name?.trim() && n.contact.emailOrPhone?.trim(), "CONTACT", "Who to contact with questions (name and email or phone).");
  need(n.includesInterestWarning, "INTEREST_WARNING", "A warning that interest is charged on overdue amounts.");
  need(n.includesLedgerAccess, "LEDGER_ACCESS", "How the owner can check their levy ledger.");
  if (n.noticeDate >= rule.hardshipStatementRequiredFrom) {
    need(n.includesHardshipStatement, "HARDSHIP_STATEMENT", "The Financial Hardship Information Statement.");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(n.noticeDate) && /^\d{4}-\d{2}-\d{2}$/.test(n.dueDate)) {
    const minimum = n.isUrgentSpecialLevy ? rule.urgentSpecialLevyNoticeDays : rule.minimumNoticeDays;
    if (daysBetween(n.noticeDate, n.dueDate) < minimum) {
      missing.push({
        code: "NOTICE_PERIOD",
        message: `At least ${minimum} days' notice to pay. The due date is ${daysBetween(n.noticeDate, n.dueDate)} days after the notice date.`,
      });
    }
  }
  return missing;
}
