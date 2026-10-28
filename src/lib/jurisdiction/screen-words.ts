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

// ─── The pack's words in every form a screen, report or PDF needs ──────────

/**
 * A building's words, in the forms the finance screens, reports and PDFs
 * show them (QLD finance wording go-live, 28 Oct 2026): lower case for the
 * middle of a sentence, a capital first letter for the start of one or a
 * label, and title case for headings and column headers. Plain data, so a
 * server page can pass it to the browser. NSW gives exactly the words its
 * screens have always shown ("Levy Register", "Overdue Levies", "Interest").
 */
export interface PackWords {
  /** "levy", "contribution" */
  levy: string;
  /** "levies", "contributions" */
  levies: string;
  /** "Levy", "Contribution" */
  Levy: string;
  /** "Levies", "Contributions" */
  Levies: string;
  /** "interest", "penalty" */
  lateCharge: string;
  /** "Interest", "Penalty" */
  LateCharge: string;
  /** "Interest", "Penalty", "Late Payment Charge": as a column or card heads it. */
  LateChargeTitle: string;
  /** "owners corporation", "body corporate" */
  ownersCorporation: string;
  /** "Owners corporation", "Body corporate" */
  OwnersCorporation: string;
  /** "Owners Corporation", "Body Corporate" */
  OwnersCorporationTitle: string;
  /** The short form, as the screens write it: "OC", "BC". */
  OC: string;
  /** The plural: "owners corporations", "bodies corporate". */
  ownersCorporations: string;
  /** The same, in title case: "Owners Corporations", "Bodies Corporate". */
  OwnersCorporationsTitle: string;
  /** "strata committee", "committee" */
  committee: string;
  /** "Strata committee", "Committee" */
  Committee: string;
  /** "Strata Committee", "Committee" */
  CommitteeTitle: string;
  /** The entitlement on each lot: "unit entitlement", "contribution schedule lot entitlement". */
  entitlement: string;
  /** The same, as a field label: "Unit entitlement". */
  Entitlement: string;
  /** The same, as a column heads it: "Unit Entitlement", "Contribution Schedule Lot Entitlement". */
  EntitlementTitle: string;
  /**
   * What owners pay, as a sentence starts it: "Levy contributions" (NSW, as
   * the screens have always said) or "Contributions" where the pack's word
   * is already "contribution".
   */
  OwnerContributions: string;
  /** The jurisdiction, as it follows the Act's name: "NSW", "Qld". */
  jurisdiction: string;
}

type WordRules = Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES" | "TERMINOLOGY">;

export function packWordsFor(rules: WordRules): PackWords {
  const t = rules.TERMINOLOGY;
  const schedule = onLotSchedule(rules);
  return {
    levy: t.levy,
    levies: t.levies,
    Levy: sentenceCase(t.levy),
    Levies: sentenceCase(t.levies),
    lateCharge: t.lateCharge,
    LateCharge: sentenceCase(t.lateCharge),
    LateChargeTitle: titleCase(t.lateCharge),
    ownersCorporation: t.ownersCorporation,
    OwnersCorporation: sentenceCase(t.ownersCorporation),
    OwnersCorporationTitle: titleCase(t.ownersCorporation),
    OC: t.ownersCorporation.split(/\s+/).map((part) => part[0]?.toUpperCase() ?? "").join(""),
    ownersCorporations: t.ownersCorporations ?? `${t.ownersCorporation}s`,
    OwnersCorporationsTitle: titleCase(t.ownersCorporations ?? `${t.ownersCorporation}s`),
    committee: t.committee,
    Committee: sentenceCase(t.committee),
    CommitteeTitle: titleCase(t.committee),
    entitlement: schedule.name,
    Entitlement: sentenceCase(schedule.name),
    EntitlementTitle: schedule.label ?? titleCase(schedule.name),
    OwnerContributions: /contribution/i.test(t.levy) ? sentenceCase(t.levies) : `${sentenceCase(t.levy)} contributions`,
    jurisdiction: t.jurisdictionShort,
  };
}

/**
 * The words for a page that shows several buildings (the schemes list, the
 * adviser home, an owner with lots in two states): the buildings' own where
 * they all use the same, else each word for both, the fallback pack's first
 * ("owners corporation or body corporate", "levies and contributions"), and
 * the packs' general word for a late charge (sharedLevyWords).
 */
/** Plural words, joined with "and" where the buildings use different ones. */
const PLURAL_KEYS = new Set<keyof PackWords>(["levies", "Levies", "ownersCorporations", "OwnersCorporationsTitle", "OwnerContributions"]);

export function sharedPackWords(rules: readonly WordRules[], fallback: WordRules): PackWords {
  const all = (rules.length ? rules : [fallback]).map(packWordsFor);
  const first = packWordsFor(fallback);
  const levy = sharedLevyWords(rules, fallback);
  const keys = Object.keys(first) as (keyof PackWords)[];
  const out = {} as PackWords;
  for (const k of keys) {
    const values = [...new Set(all.map((w) => w[k]))].sort((a, b) => Number(b === first[k]) - Number(a === first[k]) || a.localeCompare(b));
    out[k] = values.length === 1 ? values[0] : values.join(PLURAL_KEYS.has(k) ? " and " : " or ");
  }
  // Where the buildings name a late charge differently, the packs' general word for it ("late payment charge").
  if (!levy.shared && levy.lateCharge !== out.lateCharge) {
    out.lateCharge = levy.lateCharge;
    out.LateCharge = sentenceCase(levy.lateCharge);
    out.LateChargeTitle = titleCase(levy.lateCharge);
  }
  // What owners pay, where the buildings name it differently: "Levies and contributions".
  if (out.OwnerContributions.includes(" and ")) out.OwnerContributions = sentenceCase(out.levies);
  return out;
}

/**
 * A journal entry's type or source type as the screens show it. The code is
 * stored as it is ("INTEREST", "LEVY_RAISED"); its levy and late charge parts
 * are shown in the building's words, in capitals as the screens show every
 * code ("PENALTY", "CONTRIBUTION_RAISED"). NSW codes show as they are.
 */
export function entryTypeLabel(code: string, w: Pick<PackWords, "levy" | "levies" | "lateCharge">): string {
  const up = (s: string) => s.toUpperCase().replace(/\s+/g, "_");
  return code
    .split("_")
    .map((part) => (part === "LEVY" ? up(w.levy) : part === "LEVIES" ? up(w.levies) : part === "INTEREST" ? up(w.lateCharge) : part))
    .join("_");
}

/** The lot form's label and help for each lot's entitlement: "Unit Entitlement" and the pack's help, or none. */
export function lotFormEntitlementWords(rules: WordRules): { label: string; help: string | null } {
  return { label: packWordsFor(rules).EntitlementTitle, help: onLotSchedule(rules).help ?? null };
}

/**
 * What owners pay, as the owner's levies page describes it: "Levies and
 * contributions" (NSW, as the page has always said), or the building's word
 * alone where it is already "contributions".
 */
export function leviesAndContributions(levies: string): string {
  return /contribution/i.test(levies) ? sentenceCase(levies) : `${sentenceCase(levies)} and contributions`;
}

/**
 * The building's kind of scheme, plural, after its jurisdiction: "NSW strata
 * schemes", "Qld community titles schemes" (QLD finance wording review).
 */
export function schemesLabel(t: Pick<StatutoryRules["TERMINOLOGY"], "jurisdictionShort" | "scheme">): string {
  return `${t.jurisdictionShort} ${t.scheme ?? "strata scheme"}s`;
}

/**
 * The audit trail's words: the levy and late charge words, and the capital
 * works fund's short label ("Capital Works", "Sinking Fund"), so an action
 * such as CAPITAL_WORKS_LEVY_GENERATED reads in the building's words.
 */
export function auditLabelWords(rules: WordRules & Pick<StatutoryRules, "FUND_CATALOGUE">): PackWords & { capitalWorks?: string } {
  const fund = rules.FUND_CATALOGUE.find((f) => f.ledgerFund === "CAPITAL_WORKS");
  return { ...packWordsFor(rules), ...(fund ? { capitalWorks: fund.shortLabel ?? fund.label } : {}) };
}
