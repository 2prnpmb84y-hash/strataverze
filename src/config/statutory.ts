/**
 * Statutory rules, by jurisdiction.
 *
 * Each jurisdiction has its own file in `src/config/statutory/` (decided
 * 26 Oct 2026, multi-jurisdiction plan). This file is the index: code imports
 * statutory rules from `@/config/statutory`, never from a jurisdiction file.
 *
 * `RULE_PACKS` lists the jurisdictions whose rules have been added and
 * reviewed. Only those can have buildings (see `@/config/jurisdictions`).
 * `statutoryRulesFor(state)` gives a building's rules and refuses a
 * jurisdiction without a pack, rather than falling back to NSW.
 *
 * The NSW rules are also exported under their existing names, for tests and
 * for `src/config`. Application code gets a building's rules from
 * `statutoryRulesFor(state)` or `rulesForScheme(schemeId)` instead
 * (`statutory.imports.test.ts` checks this), so no building is silently given
 * the NSW rules.
 *
 * Plan: https://claude.ai/artifact/4mgrKi2E7VeBdSqTSgZhyc
 */
import * as NSW from "./statutory/nsw";

export * from "./statutory/nsw";

/** The rules every jurisdiction's pack provides. */
export type StatutoryRules = typeof NSW;

export interface RulePack {
  /** Jurisdiction code, for example AU-NSW. */
  code: string;
  /** The `state` value stored on a building. */
  state: string;
  name: string;
  /**
   * The pack's version, recorded on every levy notice, interest charge and
   * debt recovery case it is used for. Change it whenever any rule in the
   * pack changes (`statutory.version.test.ts` checks this).
   */
  version: string;
  /** Who signs off the pack (multi-jurisdiction plan, section 8). */
  reviewer: string;
  /** When the reviewer signed off the pack as a whole, or null if not yet. */
  reviewedOn: string | null;
  rules: StatutoryRules;
}

export const RULE_PACKS: Readonly<Record<string, RulePack>> = {
  NSW: {
    code: "AU-NSW",
    state: "NSW",
    name: "New South Wales",
    version: "2026.10.1",
    reviewer: "Matthew Wrigley",
    // The NSW rules were in use before the plan. Several were confirmed one by
    // one (dates noted on each in nsw.ts), but the pack as a whole has not
    // yet been signed off.
    reviewedOn: null,
    rules: NSW,
  },
};

/** How a pack is recorded on a notice, charge or case, for example "AU-NSW 2026.10.1". */
export function rulePackLabel(pack: Pick<RulePack, "code" | "version">): string {
  return `${pack.code} ${pack.version}`;
}

/** A building is in a jurisdiction whose rules have not been added. */
export class UnsupportedJurisdictionError extends Error {
  constructor(readonly state: string) {
    const supported = Object.values(RULE_PACKS).map((p) => p.name).join(", ");
    super(
      `StrataVerze has no strata rules for ${state || "this state"} yet, so this building cannot be managed here. Buildings can be in: ${supported}.`,
    );
    this.name = "UnsupportedJurisdictionError";
  }
}

/** The rule pack for a building's state, or null when there is none. */
export function rulePackFor(state: string | null | undefined): RulePack | null {
  const key = (state ?? "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(RULE_PACKS, key) ? RULE_PACKS[key] : null;
}

/** A building's rule pack. Throws UnsupportedJurisdictionError when its state has no pack. */
export function rulePackForScheme(state: string | null | undefined): RulePack {
  const pack = rulePackFor(state);
  if (!pack) throw new UnsupportedJurisdictionError((state ?? "").trim().toUpperCase());
  return pack;
}

/** A building's statutory rules. Throws UnsupportedJurisdictionError when its state has no pack. */
export function statutoryRulesFor(state: string | null | undefined): StatutoryRules {
  return rulePackForScheme(state).rules;
}
