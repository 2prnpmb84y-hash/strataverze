/**
 * A building's rule pack, from its state (multi-jurisdiction plan, phase 1).
 *
 * Every statutory rule used for a building comes from here or from
 * `statutoryRulesFor(state)`, so a building is never given another
 * jurisdiction's rules. A building in a state with no pack is refused with
 * UnsupportedJurisdictionError rather than run on the NSW rules.
 */
import { db } from "@/prisma/db";
import { RULE_PACKS, rulePackForScheme, rulePackLabel, type RulePack, type StatutoryRules } from "@/config/statutory";

export interface SchemeRules {
  pack: RulePack;
  rules: StatutoryRules;
  /** What to record on a notice, charge or case, for example "AU-NSW 2026.10.1". */
  label: string;
}

export class SchemeNotFoundError extends Error {
  constructor() {
    super("Building not found.");
    this.name = "SchemeNotFoundError";
  }
}

/** The rule pack for a building's state. Pure: use when the state is already loaded. */
export function rulesForState(state: string | null | undefined): SchemeRules {
  const pack = rulePackForScheme(state);
  return { pack, rules: pack.rules, label: rulePackLabel(pack) };
}

/**
 * Every pack buildings can have (RULE_PACKS, never a pending one), as
 * `rulesForState` gives it. Pure. A daily run uses it to read only the
 * buildings whose pack has a rule, so a state whose pack lacks it is never
 * queried.
 */
export function liveSchemeRules(): SchemeRules[] {
  return Object.values(RULE_PACKS).map((pack) => ({ pack, rules: pack.rules, label: rulePackLabel(pack) }));
}

/**
 * The rule pack for a building. Pass a transaction's `tx.orm` to read inside
 * the transaction. Throws SchemeNotFoundError or UnsupportedJurisdictionError.
 */
export async function rulesForScheme(schemeId: string, orm: typeof db.orm = db.orm): Promise<SchemeRules> {
  const scheme = await orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) throw new SchemeNotFoundError();
  return rulesForState(scheme.state);
}

/** Whether a building's rule pack has one of the workflows in FEATURES. Throws as rulesForScheme does. */
export async function schemeHasFeature(schemeId: string, feature: keyof StatutoryRules["FEATURES"], orm: typeof db.orm = db.orm): Promise<boolean> {
  return (await rulesForScheme(schemeId, orm)).rules.FEATURES[feature] === true;
}
