/**
 * The Add Property wizard's words for a building, from its rule pack (QLD
 * wording and onboarding go-live, 27 Oct 2026). The server page makes them
 * for each state a building can be set up in, and the wizard uses the set for
 * the state chosen, so a Queensland building is asked for its regulation
 * module, its plan format and each lot's interest schedule lot entitlement, and is shown its
 * own funds, entitlement, plan and body corporate words. Plain data, so the
 * page can pass it to the browser. Pure, with type imports only from the packs.
 */
import type { StatutoryRules } from "@/config/statutory";
import {
  onLotSchedule,
  planFormatChoices,
  regulationModuleChoices,
  separateEntitlement,
  type PlanFormatChoices,
  type RegulationModuleChoices,
} from "@/lib/jurisdiction/building-data";
import { hasFundConditions, ledgerFundDefinition, type FundRules } from "@/lib/jurisdiction/funds";
import type { OnboardingCheckWords } from "./property-onboarding";

/** One fund as the wizard names it. */
export interface OnboardingFundWords {
  /** As the law names it: "capital works fund", "sinking fund". */
  name: string;
  /** In title case: "Capital Works Fund", "Sinking Fund". */
  label: string;
  /** Short, in title case: "Capital Works", "Sinking Fund". */
  shortLabel: string;
}

export interface OnboardingWords extends OnboardingCheckWords {
  /** The building's state ("NSW"). */
  state: string;
  /** "owners corporation", "body corporate" */
  ownersCorporation: string;
  /** How the plan is named before its number: "Strata Plan", "Community titles scheme". */
  planLabel: string;
  /** The legal entity's name, with {name} and {plan} (TERMINOLOGY.bodyCorporateName). */
  bodyCorporateName: string;
  /** "levy" */
  levy: string;
  /** The entitlement held on each lot, in title case: "Unit Entitlement", "Contribution Schedule Lot Entitlement". */
  entitlementLabel: string;
  /** The help the pack gives for it, or null. */
  entitlementHelp: string | null;
  /** A second entitlement each lot holds, or null (NSW). */
  separate: { name: string; label: string; help: string | null } | null;
  /** The funds every new building is given, as the pack names them. */
  fundWords: { admin: OnboardingFundWords; capitalWorks: OnboardingFundWords };
  /** The module to choose, or null where the pack has none (NSW). Only supported options can be chosen. */
  regulationModule: RegulationModuleChoices | null;
  /**
   * The plan format to choose, or null where the pack has none (NSW). Any
   * listed format can be chosen, as in the building settings; one StrataVerze
   * does not support yet is marked, with its note.
   */
  planFormat: PlanFormatChoices | null;
  /**
   * For a pack whose funds have conditions (VIC, ACT and WA stage 2, PR 3):
   * the pack's funds and the selectors and facts their conditions read, so
   * the wizard can show which funds the building will be given and why.
   * Absent for NSW and Queensland, whose words are unchanged.
   */
  fundRules?: FundRules;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The plan number field's name: "Plan Number" where the pack names a plan
 * ("Strata Plan"), else the pack's name for it ("Community Titles Scheme Number").
 */
export function planNumberLabel(w: { planLabel: string }): string {
  return /\bplan$/i.test(w.planLabel) ? "Plan Number" : `${titleCase(w.planLabel)} Number`;
}

function fundWords(rules: Pick<StatutoryRules, "FUND_CATALOGUE">, ledger: "ADMINISTRATIVE" | "CAPITAL_WORKS"): OnboardingFundWords {
  const fund = ledgerFundDefinition(rules, ledger);
  return { name: fund.name, label: fund.label, shortLabel: fund.shortLabel };
}

/** The wizard's words for a building under `rules`. */
export function onboardingWordsFor(state: string, rules: StatutoryRules): OnboardingWords {
  const t = rules.TERMINOLOGY;
  const onLot = onLotSchedule(rules);
  const second = separateEntitlement(rules);
  // A second schedule StrataVerze cannot hold yet cannot be asked for.
  if (second && !second.field) throw new Error(`StrataVerze does not hold each lot's ${second.name} yet, so a building with it cannot be set up.`);
  const admin = fundWords(rules, "ADMINISTRATIVE");
  const capitalWorks = fundWords(rules, "CAPITAL_WORKS");
  return {
    state,
    ownersCorporation: t.ownersCorporation,
    planLabel: t.planLabel,
    bodyCorporateName: t.bodyCorporateName,
    levy: t.levy,
    levies: t.levies,
    lateCharge: t.lateCharge,
    entitlement: onLot.name,
    entitlementLabel: onLot.label ?? titleCase(onLot.name),
    entitlementHelp: onLot.help ?? null,
    separate: second ? { name: second.name, label: second.label, help: second.help } : null,
    funds: { admin: admin.name, capitalWorks: capitalWorks.name },
    fundWords: { admin, capitalWorks },
    regulationModule: regulationModuleChoices(rules),
    planFormat: planFormatChoices(rules),
    ...(hasFundConditions(rules)
      ? {
          fundRules: {
            FUND_CATALOGUE: rules.FUND_CATALOGUE,
            BUILDING_SELECTORS: rules.BUILDING_SELECTORS,
            BUILDING_FACTS: rules.BUILDING_FACTS,
            TERMINOLOGY: rules.TERMINOLOGY,
          },
        }
      : {}),
  };
}

/** The words for each state a building can be set up in, with each state's rules from `rulesFor` (rulesForState). */
export function onboardingWordsByState(states: readonly string[], rulesFor: (state: string) => StatutoryRules): Record<string, OnboardingWords> {
  return Object.fromEntries(states.map((s) => [s, onboardingWordsFor(s, rulesFor(s))]));
}
