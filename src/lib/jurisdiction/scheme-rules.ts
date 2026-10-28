/**
 * A building's rule pack, from its state (multi-jurisdiction plan, phase 1).
 *
 * Every statutory rule used for a building comes from here or from
 * `statutoryRulesFor(state)`, so a building is never given another
 * jurisdiction's rules. A building in a state with no pack is refused with
 * UnsupportedJurisdictionError rather than run on the NSW rules.
 */
import { db } from "@/prisma/db";
import { RULE_PACKS, rulePackFor, rulePackForScheme, rulePackLabel, type RulePack, type StatutoryRules } from "@/config/statutory";
import { DEFAULT_SCHEME_STATE } from "@/config/jurisdictions";

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

/**
 * The building's words, for a message that names a levy or a late charge
 * (QLD finance wording, 28 Oct 2026). Never throws: where the building cannot
 * be read (the message is then about that), the default state's words are
 * used, as the pages that show several buildings do. Only for words: a rule is
 * never taken from here.
 */
export async function messageTermsFor(schemeId: string, orm: typeof db.orm = db.orm): Promise<StatutoryRules["TERMINOLOGY"]> {
  try {
    return (await rulesForScheme(schemeId, orm)).rules.TERMINOLOGY;
  } catch {
    return rulesForState(DEFAULT_SCHEME_STATE).rules.TERMINOLOGY;
  }
}

/**
 * One building's pack, for the words a page or message shows for it (QLD
 * finance wording review, 28 Oct 2026). Pure and never throws: a building in
 * a state with no live pack (a draft pack, such as Victoria's) gets the
 * default state's words, so one such building never fails a page that lists
 * several. Only for words: a rule is never taken from here.
 */
export function rulesForWords(state: string | null | undefined): StatutoryRules {
  return rulePackFor(state)?.rules ?? rulesForState(DEFAULT_SCHEME_STATE).rules;
}

/**
 * The rules of the packs of the buildings a page lists, once per state, for
 * the words the page shows for them all (sharedPackWords). A state with no
 * pack is left out, so a list never fails on one building.
 */
export function rulesForListedStates(states: Iterable<string | null | undefined>): StatutoryRules[] {
  const out = new Map<string, StatutoryRules>();
  for (const state of states) {
    const pack = rulePackFor(state);
    if (pack) out.set(pack.state, pack.rules);
  }
  return [...out.values()];
}
