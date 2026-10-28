/**
 * The words lot, roll, levy and debt recovery screens show, from a building's
 * rule pack (QLD wording go-live, 27 Oct 2026). Server pages make them and
 * pass them to the screens as props, so a Queensland building shows
 * "contribution", "penalty" and "contribution schedule lot entitlement" where
 * an NSW building shows "levy", "interest" and "unit entitlement". Plain data
 * and pure, with type imports only from the packs.
 */
import type { StatutoryRules } from "@/config/statutory";
import { EntitlementRuleError, onLotSchedule, scheduleFor } from "./building-data";

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A lot's words: its entitlement, its levies and its late charge. */
export interface LotWords {
  /** The entitlement on each lot, as a column heads it: "Unit Entitlement". */
  entitlement: string;
  /** The same, as a field label: "Unit entitlement". */
  entitlementLabel: string;
  /** "Levies" */
  levies: string;
  /** "Interest" */
  lateCharge: string;
}

export function lotWordsFor(rules: Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES" | "TERMINOLOGY">): LotWords {
  const schedule = onLotSchedule(rules);
  return {
    entitlement: schedule.label ?? titleCase(schedule.name),
    entitlementLabel: sentenceCase(schedule.name),
    levies: sentenceCase(rules.TERMINOLOGY.levies),
    lateCharge: sentenceCase(rules.TERMINOLOGY.lateCharge),
  };
}

/** The words a levy page or form shows, lower case, from the building's rule pack. */
export interface LevyFormWords {
  /** "levy", "contribution" */
  levy: string;
  /** "levies", "contributions" */
  levies: string;
  /** The entitlement a levy is shared by, as the pack names it: "unit entitlement". */
  entitlement: string;
  /** The plan, as a sentence names it: "strata plan", "community titles scheme". */
  plan: string;
}

export function levyFormWords(rules: Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES" | "TERMINOLOGY">): LevyFormWords {
  const t = rules.TERMINOLOGY;
  return { levy: t.levy, levies: t.levies, entitlement: onLotSchedule(rules).name, plan: t.planLabel.toLowerCase() };
}

/**
 * How a levy is shared between the lots, after "shared by" or "in proportion
 * to": the entitlement on each lot ("unit entitlement"). Where the pack
 * shares the insurance in a fund by another schedule (CONTRIBUTION_INSURANCE,
 * Queensland since #117) it says so: "contribution schedule lot entitlement
 * (the insurance in the administrative fund by interest schedule lot
 * entitlement)".
 */
export function levySharedBy(
  rules: Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES" | "FUND_CATALOGUE"> & Partial<Pick<StatutoryRules, "PLAN_FORMAT" | "CONTRIBUTION_INSURANCE">>,
): string {
  const onLot = onLotSchedule(rules).name;
  const insurance = rules.CONTRIBUTION_INSURANCE;
  if (!insurance) return onLot;
  const fund = rules.FUND_CATALOGUE.find((f) => f.ledgerFund === insurance.paidFrom)?.name;
  // The schedule that decides an insurance use for every building (a use that depends on the plan format is skipped).
  const schedule = insurance.uses
    .map((use) => {
      try {
        return scheduleFor(rules, use).name;
      } catch (err) {
        if (err instanceof EntitlementRuleError) return null;
        throw err;
      }
    })
    .find((name) => name && name !== onLot);
  return schedule && fund ? `${onLot} (the insurance in the ${fund} by ${schedule})` : onLot;
}

/** What owners pay and what is charged when it is late, lower case: "levy", "levies", "interest". */
export interface LevyWords {
  levy: string;
  levies: string;
  lateCharge: string;
  /** False when the buildings use different words, and these are the words for both. */
  shared: boolean;
}

/**
 * The levy words for a page that shows several buildings: their own where
 * every building uses the same, else words that cover both ("levy or
 * contribution", "levies and contributions", and the packs' general word for
 * a late charge, TERMINOLOGY.lateChargeGeneral: "late payment charge").
 */
export function sharedLevyWords(rules: readonly Pick<StatutoryRules, "TERMINOLOGY">[], fallback: Pick<StatutoryRules, "TERMINOLOGY">): LevyWords {
  const terms = (rules.length ? rules : [fallback]).map((r) => r.TERMINOLOGY);
  // The fallback's word first, so the words read the same whatever order the buildings come in.
  const one = <K extends "levy" | "levies" | "lateCharge">(k: K) =>
    [...new Set(terms.map((t) => t[k]))].sort((a, b) => Number(b === fallback.TERMINOLOGY[k]) - Number(a === fallback.TERMINOLOGY[k]) || a.localeCompare(b));
  const [levy, levies, lateCharge] = [one("levy"), one("levies"), one("lateCharge")];
  if (levy.length === 1 && levies.length === 1 && lateCharge.length === 1) return { levy: levy[0], levies: levies[0], lateCharge: lateCharge[0], shared: true };
  return {
    levy: levy.join(" or "),
    levies: levies.join(" and "),
    lateCharge: lateCharge.length === 1 ? lateCharge[0] : (generalLateCharge(terms, fallback) ?? lateCharge.join(" or ")),
    shared: false,
  };
}

/** The packs' general word for a late charge (the fallback pack's first, then any shown), or undefined where none gives one. */
function generalLateCharge(terms: readonly StatutoryRules["TERMINOLOGY"][], fallback: Pick<StatutoryRules, "TERMINOLOGY">): string | undefined {
  return fallback.TERMINOLOGY.lateChargeGeneral ?? terms.find((t) => t.lateChargeGeneral)?.lateChargeGeneral;
}

/** The words a debt recovery case shows that depend on the building's pack. */
export interface CaseWords {
  /** The badge for a case with a hardship or waiver request: "Hardship Request", "Waiver Request". */
  hardshipRequest: string;
  /** The PAYMENT_PLAN status and the plan card's heading: "Payment Plan", "Payment Arrangement". */
  paymentPlan: string;
}

/**
 * NSW has a statutory hardship request and payment plan. A pack without a
 * hardship statement (Queensland: NOTICE_RULES.hardship null) names the
 * request after its own step for it (DEBT_RECOVERY_STEP_LABELS.HARDSHIP_REVIEW,
 * "Waiver Request"). An agreed plan is named as the pack names it
 * (TERMINOLOGY.paymentPlan, "Payment Arrangement"). A pack that names none
 * (NSW) keeps the label the screens have always shown for its statutory plan.
 */
export function caseWordsFor(rules: Pick<StatutoryRules, "NOTICE_RULES" | "DEBT_RECOVERY_STEP_LABELS" | "TERMINOLOGY">): CaseWords {
  const step = rules.DEBT_RECOVERY_STEP_LABELS?.HARDSHIP_REVIEW;
  return {
    hardshipRequest: rules.NOTICE_RULES.hardship || !step ? "Hardship Request" : step,
    paymentPlan: rules.TERMINOLOGY.paymentPlan ?? "Payment Plan",
  };
}
