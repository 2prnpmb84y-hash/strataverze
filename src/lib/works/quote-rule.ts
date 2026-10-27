/**
 * When works need more than one quote, from the building's pack
 * (`rules.WORKS_QUOTES`, stage 2, step 9). Pure.
 */
import type { StatutoryRules } from "@/config/statutory";

export type WorksQuoteRule = NonNullable<StatutoryRules["WORKS_QUOTES"]>;

/** The building's quote rule as the screens and approvals use it. Dollars. */
export interface QuoteRule {
  threshold: number;
  minimumQuotes: number;
  citation: string;
  /**
   * The threshold depends on the number of lots and the building has none
   * recorded: the threshold is then 0, so every quote needs `minimumQuotes`,
   * and the screens say the number of lots is missing.
   */
  lotsMissing: boolean;
}

/** Whether the threshold depends on the building's number of lots (Queensland's major spending limit). */
export function quoteRuleNeedsLots(rule: WorksQuoteRule): boolean {
  return rule.threshold.basis === "PER_LOT_CAPPED";
}

/**
 * The amount over which `minimumQuotes` are needed: the fixed amount, or the
 * lesser of the amount for each lot times `lots` and the cap.
 */
export function quoteRuleFor(rule: WorksQuoteRule, lots: number | null): QuoteRule {
  const t = rule.threshold;
  const base = { minimumQuotes: rule.minimumQuotes, citation: rule.citation };
  if (t.basis === "FIXED") return { threshold: t.dollars, ...base, lotsMissing: false };
  if (!(lots != null && lots > 0)) return { threshold: 0, ...base, lotsMissing: true };
  return { threshold: Math.min(t.perLotDollars * lots, t.capDollars), ...base, lotsMissing: false };
}

/** The rule in a sentence, as the quotes panel states it. */
export function quoteRuleSentence(rule: QuoteRule): string {
  if (rule.lotsMissing) return `The building's number of lots is not recorded, so at least ${rule.minimumQuotes} quotes are needed before one is approved (${rule.citation}).`;
  return `Over $${rule.threshold.toLocaleString("en-AU")}, at least ${rule.minimumQuotes} quotes are needed before one is approved (${rule.citation}).`;
}

/** Why a quote cannot be approved yet under the rule, or null. */
export function quotesProblem(rule: QuoteRule, quoteTotal: number, quotesObtained: number): string | null {
  if (quoteTotal > rule.threshold && quotesObtained < rule.minimumQuotes) {
    if (rule.lotsMissing) return `${quoteRuleSentence(rule)} Record the number of lots for the building, or invite more contractors.`;
    return `${quoteRuleSentence(rule)} Invite more contractors, or extend the deadline.`;
  }
  return null;
}
