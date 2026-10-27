/** A building's quote rule (server side, stage 2, step 9). The number of lots is read only where the rule needs it. */
import { db } from "@/prisma/db";
import { needRule, type StatutoryRules } from "@/config/statutory";
import { quoteRuleFor, quoteRuleNeedsLots, type QuoteRule } from "./quote-rule";

export async function buildingQuoteRule(schemeId: string, rules: StatutoryRules): Promise<QuoteRule> {
  const rule = needRule(rules, "WORKS_QUOTES");
  if (!quoteRuleNeedsLots(rule)) return quoteRuleFor(rule, null);
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  return quoteRuleFor(rule, scheme?.totalLots == null ? null : Number(scheme.totalLots));
}
