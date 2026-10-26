/**
 * Which states and territories a building can be set up in.
 *
 * StrataVerze applies New South Wales strata law (see `@/config/statutory`).
 * Until another jurisdiction's rules are added and reviewed (multi-jurisdiction
 * plan, 26 Oct 2026), a building outside NSW would get NSW rules, so only NSW
 * buildings can be created. Addresses of suppliers and businesses are not
 * limited by this.
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

/** States whose strata law the platform applies today. */
export const SUPPORTED_SCHEME_STATES: readonly AustralianState[] = ["NSW"];

/** The state a new building starts with in forms. */
export const DEFAULT_SCHEME_STATE: AustralianState = "NSW";

/** Options for a building's state field: only the supported states. */
export const SCHEME_STATE_OPTIONS = SUPPORTED_SCHEME_STATES.map((s) => ({ value: s, label: STATE_NAMES[s] }));

export const SCHEME_STATE_HELP = "StrataVerze supports New South Wales buildings for now. Other states and territories are coming.";

/** Why a building cannot be set up in `state`, or null if it can. */
export function schemeStateProblem(state: string | null | undefined): string | null {
  const s = (state ?? "").trim().toUpperCase();
  if (!s) return "Select the state.";
  if (!(AUSTRALIAN_STATES as readonly string[]).includes(s)) return "Select a valid state.";
  if (!SUPPORTED_SCHEME_STATES.includes(s as AustralianState)) {
    return `StrataVerze supports New South Wales buildings only for now, so a building in ${STATE_NAMES[s as AustralianState]} cannot be set up yet. Its strata law is different and has not been added.`;
  }
  return null;
}
