/**
 * Which states and territories a building can be set up in.
 *
 * A building can only be in a jurisdiction whose strata rules have been
 * added (`RULE_PACKS` in `@/config/statutory`). Today that is New South Wales
 * and Queensland (Queensland switched on 28 Oct 2026, QLD stage 2, step 11).
 * The database holds the same line (`schemes_state_has_rule_pack_check`,
 * migration 20261106_jurisdiction_rule_packs.sql, widened to NSW and QLD by
 * 20261121_qld_switch_on.sql): adding a pack means changing that constraint
 * in the same release. Addresses of suppliers and businesses are not limited
 * by this.
 *
 * Plan numbers are unique within each state, not across the platform
 * (decided 27 Oct 2026): an NSW and a Queensland building may have the same
 * plan number. Look a building up by its state and plan number together
 * (`schemes_state_plan_number_key`, migration 20261121).
 *
 * Plan: https://claude.ai/artifact/4mgrKi2E7VeBdSqTSgZhyc
 */

/** Australian state and territory codes, as stored in `state` columns. */
export const AUSTRALIAN_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;
export type AustralianState = (typeof AUSTRALIAN_STATES)[number];

export const STATE_NAMES: Record<AustralianState, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
  NT: "Northern Territory",
  ACT: "Australian Capital Territory",
};

/**
 * States whose strata law the platform applies today: exactly the states with
 * a rule pack (`RULE_PACKS` in `@/config/statutory`, checked by
 * src/config/statutory.test.ts). Kept as a plain list so the browser forms
 * do not load the rules themselves.
 */
export const SUPPORTED_SCHEME_STATES: readonly AustralianState[] = ["NSW", "QLD"];

/** The state a new building starts with in forms. */
export const DEFAULT_SCHEME_STATE: AustralianState = "NSW";

/** Options for a building's state field: only the supported states. */
export const SCHEME_STATE_OPTIONS = SUPPORTED_SCHEME_STATES.map((s) => ({ value: s, label: STATE_NAMES[s] }));

/** The supported states' names, as a list in a sentence ("New South Wales and Queensland"). */
const SUPPORTED_NAMES = listInWords(SUPPORTED_SCHEME_STATES.map((s) => STATE_NAMES[s]));

export const SCHEME_STATE_HELP = `Only ${SUPPORTED_NAMES} buildings can be set up for now.`;

function listInWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Why a building cannot be set up in `state`, or null if it can. */
export function schemeStateProblem(state: string | null | undefined): string | null {
  const s = (state ?? "").trim().toUpperCase();
  if (!s) return "Select the state.";
  if (!(AUSTRALIAN_STATES as readonly string[]).includes(s)) return "Select a valid state.";
  if (!SUPPORTED_SCHEME_STATES.includes(s as AustralianState)) {
    return `StrataVerze supports ${SUPPORTED_NAMES} buildings only for now, so a building in ${STATE_NAMES[s as AustralianState]} cannot be set up yet. Its strata law is different and has not been added.`;
  }
  return null;
}

/**
 * Postcode ranges for a building's state (decided 27 Oct 2026). The source is
 * Wikipedia's list of Australian postcodes, NOT YET VERIFIED against Australia
 * Post: check these ranges against Australia Post before relying on them, and
 * add any border locality found then.
 *
 * - New South Wales: 1000 to 2599, 2619 to 2899 and 2921 to 2999 (2600 to
 *   2618 and 2900 to 2920 are the ACT), with 2406 (Mungindi, shared with
 *   Queensland, already in the range) and four border localities with a
 *   Queensland postcode: 4377 (Maryland), 4380 (Mingoola), 4383 (Jennings)
 *   and 4385 (Texas).
 * - Queensland: 4000 to 4999 and 9000 to 9999, with 2406 (Mungindi, shared
 *   with New South Wales).
 */
const POSTCODES: Partial<Record<AustralianState, { ranges: readonly (readonly [number, number])[]; also: readonly number[] }>> = {
  NSW: { ranges: [[1000, 2599], [2619, 2899], [2921, 2999]], also: [2406, 4377, 4380, 4383, 4385] },
  QLD: { ranges: [[4000, 4999], [9000, 9999]], also: [2406] },
};

/** Whether a postcode (four digits) can be an address in `state`. False for a state with no ranges listed. */
export function isPostcodeInState(state: AustralianState, postcode: string): boolean {
  const table = Object.prototype.hasOwnProperty.call(POSTCODES, state) ? POSTCODES[state] : undefined;
  if (!table ||!/^\d{4}$/.test(postcode)) return false;
  const n = Number(postcode);
  return table.also.includes(n) || table.ranges.some(([from, to]) => n >= from && n <= to);
}

/** Whether a postcode can be a New South Wales address (see POSTCODES). */
export function isNswPostcode(postcode: string): boolean {
  return isPostcodeInState("NSW", postcode);
}

/** Whether a postcode can be a Queensland address (see POSTCODES). */
export function isQldPostcode(postcode: string): boolean {
  return isPostcodeInState("QLD", postcode);
}

/**
 * Why a building's state and postcode cannot be saved, or null if they can.
 * When editing a building, pass what is stored: an unchanged state or postcode
 * is not checked again, so an older record can still be edited.
 */
export function schemeLocationProblems(
  next: { state: string | null | undefined; postcode: string | null | undefined },
  stored?: { state: string | null; postcode: string | null } | null,
): { state?: string; postcode?: string } {
  const out: { state?: string; postcode?: string } = {};
  const state = (next.state ?? "").trim().toUpperCase();
  const postcode = (next.postcode ?? "").trim();
  const stateChanged = !stored || state !== (stored.state ?? "").trim().toUpperCase();
  const postcodeChanged = !stored || postcode !== (stored.postcode ?? "").trim();
  if (stateChanged) {
    const p = schemeStateProblem(state);
    if (p) out.state = p;
  }
  const checked = Object.prototype.hasOwnProperty.call(POSTCODES, state) ? (state as AustralianState) : null;
  if ((stateChanged || postcodeChanged) && !out.state && checked && /^\d{4}$/.test(postcode) && !isPostcodeInState(checked, postcode)) {
    const name = STATE_NAMES[checked];
    out.postcode = `${postcode} is not a ${name} postcode. Only ${SUPPORTED_NAMES} buildings can be set up for now. If this building is in ${name}, check the postcode with StrataVerze.`;
  }
  return out;
}
