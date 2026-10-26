/**
 * Which states and territories a building can be set up in.
 *
 * A building can only be in a jurisdiction whose strata rules have been
 * added (`RULE_PACKS` in `@/config/statutory`). Today that is New South Wales
 * only (multi-jurisdiction plan, 26 Oct 2026). The database holds the same
 * line (`schemes_state_has_rule_pack_check`, migration
 * 20261106_jurisdiction_rule_packs.sql): adding a pack means changing that
 * constraint in the same release. Addresses of suppliers and businesses are
 * not limited by this.
 *
 * Plan: https://claude.ai/artifact/4mgrKi2E7VeBdSqTSgZhyc
 */
import { rulePackFor } from "@/config/statutory";

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

/** States whose strata law the platform applies today: those with a rule pack. */
export const SUPPORTED_SCHEME_STATES: readonly AustralianState[] = AUSTRALIAN_STATES.filter((s) => rulePackFor(s) !== null);

/** The state a new building starts with in forms. */
export const DEFAULT_SCHEME_STATE: AustralianState = "NSW";

/** Options for a building's state field: only the supported states. */
export const SCHEME_STATE_OPTIONS = SUPPORTED_SCHEME_STATES.map((s) => ({ value: s, label: STATE_NAMES[s] }));

export const SCHEME_STATE_HELP = "Only New South Wales buildings can be set up for now.";

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

/**
 * Whether a postcode can be a New South Wales address. Australia Post ranges
 * for NSW are 1000 to 2599, 2619 to 2899 and 2921 to 2999; 2600 to 2618 and
 * 2900 to 2920 are the ACT (ranges as generally published, not checked
 * against Australia Post on 26 Oct 2026). A few NSW border localities may use
 * a postcode from another state's range: none is allowed for yet.
 */
export function isNswPostcode(postcode: string): boolean {
  if (!/^\d{4}$/.test(postcode)) return false;
  const n = Number(postcode);
  if (n >= 1000 && n <= 2599) return true;
  if (n >= 2619 && n <= 2899) return true;
  if (n >= 2921 && n <= 2999) return true;
  return false;
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
  if ((stateChanged || postcodeChanged) && !out.state && state === "NSW" && /^\d{4}$/.test(postcode) && !isNswPostcode(postcode)) {
    out.postcode = `${postcode} is not a New South Wales postcode. Only New South Wales buildings can be set up for now. If this building is in New South Wales, check the postcode with StrataVerze.`;
  }
  return out;
}
