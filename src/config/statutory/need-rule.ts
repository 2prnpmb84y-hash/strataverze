/**
 * Getting one of a building's NSW-shaped rules (stage 2, 27 Oct 2026).
 *
 * Kept apart from the rule pack index, with type imports only, so code that
 * runs in the browser can use it without bundling the packs. Re-exported
 * from `@/config/statutory`.
 */
import type { NswRules, SharedRules, StatutoryRules } from "../statutory";

/** A rule the building's pack does not have: the feature is not available there. */
export class RuleNotInPackError extends Error {
  constructor(
    readonly rule: string,
    readonly jurisdiction: string,
  ) {
    super(`StrataVerze does not apply this to buildings in ${jurisdiction} yet.`);
    this.name = "RuleNotInPackError";
  }
}

/** One of a building's rules in the NSW shape, or RuleNotInPackError when its pack does not have it. */
export function needRule<K extends Exclude<keyof NswRules, keyof SharedRules>>(rules: StatutoryRules, key: K): NswRules[K] {
  const value = (rules as Partial<NswRules>)[key];
  if (value == null) throw new RuleNotInPackError(String(key), rules.TERMINOLOGY.jurisdictionShort);
  return value as NswRules[K];
}
