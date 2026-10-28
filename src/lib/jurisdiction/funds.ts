/**
 * Fund names from the building's rule pack (QLD stage 2, step 4, 27 Oct 2026).
 *
 * The funds people see are named from the pack's FUND_CATALOGUE, so a
 * Queensland building shows its sinking fund where an NSW building shows its
 * capital works fund, though both are kept in the ledger's CAPITAL_WORKS
 * fund type. Pure, with type imports only, so client components can use it
 * with the catalogue their server parent passes them.
 *
 * Which funds a building must have (VIC, ACT and WA stage 2, PR 3, 28 Oct
 * 2026) is read from each fund's condition (`requiredWhen`) and the
 * building's selectors and facts, failing closed where one is missing:
 * requiredFunds, defaultFunds, fundProblems and fundRequirementsView below.
 */
import type { StatutoryRules } from "@/config/statutory";
import { conditionHolds, missingWords, underlyingMissing, type FactRef, type SelectorBuilding } from "./building-selectors";

/** A pack's funds (`rules.FUND_CATALOGUE`), plain data a server page can pass to the browser. */
export type FundCatalogue = StatutoryRules["FUND_CATALOGUE"];
export type FundEntry = FundCatalogue[number];
export type LedgerFund = FundEntry["ledgerFund"];

type CatalogueSource = FundCatalogue | Pick<StatutoryRules, "FUND_CATALOGUE">;

const catalogueOf = (source: CatalogueSource): FundCatalogue => ("FUND_CATALOGUE" in source ? source.FUND_CATALOGUE : source);

/**
 * The ledger fund each stored fund type is kept in. Legacy ADMIN is the
 * administrative fund and legacy SINKING an NSW capital works fund. SPECIAL
 * (and anything else) is not in the catalogue.
 */
const LEDGER_FUND: Readonly<Record<string, LedgerFund>> = {
  ADMINISTRATIVE: "ADMINISTRATIVE",
  ADMIN: "ADMINISTRATIVE",
  CAPITAL_WORKS: "CAPITAL_WORKS",
  SINKING: "CAPITAL_WORKS",
};

/** The ledger fund a stored fund type is kept in, or null (SPECIAL, or unknown). */
export function ledgerFundOf(fundType: string | null | undefined): LedgerFund | null {
  return LEDGER_FUND[String(fundType ?? "")] ?? null;
}

/**
 * The catalogue's fund for a stored fund type: ADMINISTRATIVE or ADMIN gives
 * the fund kept in ADMINISTRATIVE, CAPITAL_WORKS or SINKING the one kept in
 * CAPITAL_WORKS. Null for SPECIAL, an unknown type, or a pack without it.
 */
export function fundDefinition(source: CatalogueSource, fundType: string | null | undefined): FundEntry | null {
  const ledger = ledgerFundOf(fundType);
  return ledger ? (catalogueOf(source).find((f) => f.ledgerFund === ledger) ?? null) : null;
}

/** The catalogue's fund kept in a ledger fund. Throws if the pack has none. */
export function ledgerFundDefinition(source: CatalogueSource, ledger: LedgerFund): FundEntry {
  const fund = fundDefinition(source, ledger);
  if (!fund) throw new Error(`The rule pack has no fund kept in ${ledger}.`);
  return fund;
}

/** "Capital Works Fund", "Sinking Fund", or null when the type is not in the catalogue. */
export function fundLabel(source: CatalogueSource, fundType: string | null | undefined): string | null {
  return fundDefinition(source, fundType)?.label ?? null;
}

/** "Admin", "Capital Works", "Sinking Fund", or null when the type is not in the catalogue. */
export function fundShortLabel(source: CatalogueSource, fundType: string | null | undefined): string | null {
  return fundDefinition(source, fundType)?.shortLabel ?? null;
}

/** The label without its last word, as a fund's type is shown beside its name: "Administrative", "Capital Works", "Sinking". */
export function fundTypeWords(fund: Pick<FundEntry, "label">): string {
  return fund.label.replace(/ Fund$/, "");
}

/** The law's name without "fund", for a sentence naming funds together: "administrative", "capital works", "sinking". */
export function fundNameWords(fund: Pick<FundEntry, "name">): string {
  return fund.name.replace(/ fund$/, "");
}

/**
 * A fund's type as a fund list or fund page shows it: the page's own label
 * for a stored legacy type (ADMIN, SINKING, RESERVE, kept as those pages have
 * always shown them), else the pack's label ("Capital Works Fund", "Sinking
 * Fund"), else the type as stored (decided 27 Oct 2026, so no page shows
 * "CAPITAL_WORKS").
 */
export function fundTypeLabel(source: CatalogueSource, fundType: string, legacyLabels: Readonly<Record<string, string>>): string {
  return legacyLabels[fundType] ?? fundLabel(source, fundType) ?? fundType;
}

// ---------------------------------------------------------------------------
// Which funds a building must have (VIC, ACT and WA stage 2, PR 3, 28 Oct 2026)
// ---------------------------------------------------------------------------

/** A fund's condition (`requiredWhen`), where the pack sets one. */
export type FundCondition = NonNullable<FundEntry["requiredWhen"]>;
/** What a fund condition says of a building: REQUIRED, OPTIONAL (not required) or NOT_ALLOWED. */
export type FundNeed = FundCondition["rules"][number]["need"];
type RuleStatus = FundEntry["status"];

/** The parts of a pack the fund conditions read: its funds, and the selectors and facts their tests name. */
export type FundRules = Pick<StatutoryRules, "FUND_CATALOGUE"> &
  Partial<Pick<StatutoryRules, "BUILDING_SELECTORS" | "BUILDING_FACTS" | "REGULATION_MODULE" | "PLAN_FORMAT" | "TERMINOLOGY">>;
type FundsSource = FundCatalogue | FundRules;

const rulesOf = (source: FundsSource): FundRules => ("FUND_CATALOGUE" in source ? source : { FUND_CATALOGUE: source });

/** A building with nothing recorded, so every fact a condition reads is missing. */
const NO_BUILDING: SelectorBuilding = { scheme: {}, lots: [], recorded: {} };

/** Whether any of the pack's funds has a condition (VIC, ACT, WA). NSW and Queensland have `required` only. */
export function hasFundConditions(source: FundsSource): boolean {
  return catalogueOf(source).some((f) => f.requiredWhen != null);
}

/** What the pack says about one fund for one building. */
export interface FundRequirement {
  fund: FundEntry;
  /** REQUIRED, OPTIONAL or NOT_ALLOWED, or null when it cannot be worked out. */
  need: FundNeed | null;
  /** Whether the pack sets a condition for the fund (`requiredWhen`). */
  conditional: boolean;
  /** The pack's words for why, from the rule that decided (null for a fund without a condition). */
  reason: string | null;
  /** The provision the rule cites, or the fund's own source for a fund without a condition. */
  provision: string;
  /** How far that rule has been checked. */
  status: RuleStatus;
  /** What is missing when `need` is null because a fact or selector is not known. */
  missing: FactRef[];
  /** Why it cannot be worked out, for the adviser, when `need` is null. */
  problem: string | null;
}

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : (items[0] ?? ""));
const withArticle = (name: string) => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;

/**
 * What the pack says about a fund for a building. A fund without a condition
 * is REQUIRED or OPTIONAL by `required`, whatever the building (NSW,
 * Queensland). A fund with one is decided by its rules, read in order: the
 * first whose test holds decides, and a rule that cannot be decided because
 * something is missing leaves the fund undecided (it fails closed), with what
 * to record. Without a building, every fact is missing.
 */
export function fundRequirement(source: FundsSource, fund: FundEntry, building: SelectorBuilding = NO_BUILDING): FundRequirement {
  const condition = fund.requiredWhen;
  if (!condition) {
    return { fund, need: fund.required ? "REQUIRED" : "OPTIONAL", conditional: false, reason: null, provision: fund.source, status: fund.status, missing: [], problem: null };
  }
  const rules = rulesOf(source);
  const undecided = (missing: FactRef[], problem: string): FundRequirement => ({ fund, need: null, conditional: true, reason: null, provision: fund.source, status: fund.status, missing, problem });
  const whether = `Whether this building must have ${withArticle(fund.name)} cannot be worked out`;
  for (const rule of condition.rules) {
    const t = conditionHolds(rules, rule.when, building);
    if (t.holds === null) {
      const missing = underlyingMissing(rules, t.missing, building);
      const reasons = [...new Set(missing.map((m) => missingWords(rules, m, building)))];
      return undecided(missing, `${whether} because ${list(reasons)}. Record what is missing in the building rules.`);
    }
    if (t.holds) return { fund, need: rule.need, conditional: true, reason: rule.reason, provision: rule.provision, status: rule.status, missing: [], problem: null };
  }
  return undecided([], `${whether}. ${condition.noRuleFits}`);
}

/** The pack's funds for a building, sorted by what the law says of each. */
export interface RequiredFunds {
  required: FundEntry[];
  /** Not required: the building may set them up. */
  optional: FundEntry[];
  /** The building may not have them. */
  notAllowed: FundEntry[];
  /** Cannot be worked out yet, with what is missing. Never given to a building until they can. */
  undecided: { fund: FundEntry; missing: FactRef[]; problem: string }[];
  /** Every fund, in the catalogue's order. */
  each: FundRequirement[];
}

/**
 * Which of the pack's funds a building must have, may have, may not have, and
 * which cannot be worked out yet, from its fund conditions and the building's
 * selectors and facts. Pure.
 */
export function requiredFunds(source: FundsSource, building: SelectorBuilding = NO_BUILDING): RequiredFunds {
  const each = catalogueOf(source).map((f) => fundRequirement(source, f, building));
  return {
    required: each.filter((r) => r.need === "REQUIRED").map((r) => r.fund),
    optional: each.filter((r) => r.need === "OPTIONAL").map((r) => r.fund),
    notAllowed: each.filter((r) => r.need === "NOT_ALLOWED").map((r) => r.fund),
    undecided: each.filter((r) => r.need === null).map((r) => ({ fund: r.fund, missing: r.missing, problem: r.problem ?? "" })),
    each,
  };
}

/**
 * The funds every new building is given: the catalogue's required funds, in
 * its order, named by their label. A fund with a condition is given only
 * where the building's facts show the law requires it. One that cannot be
 * worked out is not given, and the building is flagged (fundProblems), so
 * StrataVerze never guesses. NSW and Queensland funds have no condition, so
 * the building does not change them.
 */
export function defaultFunds(source: FundsSource, building: SelectorBuilding = NO_BUILDING): { name: string; fundType: LedgerFund }[] {
  return requiredFunds(source, building).required.map((f) => ({ name: f.label, fundType: f.ledgerFund }));
}

/**
 * Why a new building would have no ledger, or null (stage 2, PR 3 review).
 * For a pack with fund conditions, the funds a new building is given
 * (defaultFunds) may be none: none can be worked out from what onboarding
 * knows, or the law requires none (a 2-lot WA scheme whose by-laws do not
 * require an administrative fund and that is not designated). The chart of
 * accounts needs at least one fund, so such a building is refused rather than
 * created without a ledger. Null for NSW and Queensland, whose funds are
 * always required.
 */
export function noLedgerProblem(source: FundsSource, building: SelectorBuilding = NO_BUILDING): string | null {
  if (!hasFundConditions(source)) return null;
  const funds = requiredFunds(source, building);
  if (funds.required.length) return null;
  return funds.undecided.length
    ? "StrataVerze cannot set up this building yet. None of its funds can be worked out from the lots entered, so it would have no ledger."
    : "StrataVerze cannot set up this building yet. Its rules require none of its funds, so it would have no ledger.";
}

/** A rule's status as a sentence after its reason, where it is not confirmed in the law. */
const statusSentence = (status: RuleStatus) => (STATUS_NOTES[status] ? ` ${STATUS_NOTES[status]}.` : "");

/**
 * What a building's funds are missing or should not have, for the "Building
 * data missing" notice, for a pack with fund conditions only (none for NSW and
 * Queensland, so their notice is unchanged): each fund that cannot be worked
 * out, with what to record; with the building's funds, each required fund it
 * does not hold, each it holds that it may not have, and a building that holds
 * no fund and so has no ledger. A fund is held where a fund of its ledger fund
 * type (or the legacy type kept in it) is set up. A reason is followed by its
 * status where the rule is not confirmed in the law, so a StrataVerze reading
 * never reads as law.
 */
export function fundProblems(source: FundsSource, building: SelectorBuilding, held?: readonly { fundType: string }[]): string[] {
  if (!hasFundConditions(source)) return [];
  const { each } = requiredFunds(source, building);
  const ledgers = held ? new Set(held.map((f) => ledgerFundOf(f.fundType)).filter(Boolean)) : null;
  const problems: string[] = [];
  for (const r of each) {
    const why = `${r.reason ? ` ${r.reason}` : ""}${statusSentence(r.status)}`;
    if (r.need === null) problems.push(r.problem ?? "");
    else if (ledgers && r.need === "REQUIRED" && !ledgers.has(r.fund.ledgerFund)) {
      problems.push(`This building must have ${withArticle(r.fund.name)} but none is set up.${why} Add it under Manage Funds.`);
    } else if (ledgers && r.need === "NOT_ALLOWED" && ledgers.has(r.fund.ledgerFund)) {
      problems.push(`This building has ${withArticle(r.fund.name)}, which it may not have.${why}`);
    }
  }
  if (ledgers && !ledgers.size) {
    const [admin, capital] = [ledgerFundDefinition(source, "ADMINISTRATIVE"), ledgerFundDefinition(source, "CAPITAL_WORKS")];
    const noneRequired = each.every((r) => r.need !== null && r.need !== "REQUIRED");
    problems.push(
      `This building has no ${admin.name} and no ${capital.name}, so StrataVerze cannot keep its ledger.${noneRequired ? " Its rules require neither, and StrataVerze does not handle such a building yet." : ""}`,
    );
  }
  return problems.filter(Boolean);
}

/** One fund as the fund screens show what the law says of it. Plain data a server page can pass to the browser. */
export interface FundRequirementView {
  key: string;
  label: string;
  need: FundNeed | "UNDECIDED";
  /** "Required", "Not required", "Not allowed", "Not worked out yet". */
  needLabel: string;
  /** The pack's words for why, or null. */
  reason: string | null;
  provision: string;
  /** How far the rule has been checked, where it is not confirmed in the law. */
  statusNote: string | null;
  /** Why it cannot be worked out, or null. */
  problem: string | null;
}

const NEED_LABELS: Readonly<Record<FundNeed | "UNDECIDED", string>> = {
  REQUIRED: "Required",
  OPTIONAL: "Not required",
  NOT_ALLOWED: "Not allowed",
  UNDECIDED: "Not worked out yet",
};
const STATUS_NOTES: Readonly<Record<RuleStatus, string | null>> = {
  CONFIRMED: null,
  GUIDANCE: "From official guidance",
  STRATAVERZE: "A StrataVerze choice",
  NOT_CONFIRMED: "Not confirmed",
};

/**
 * Which funds the building must have and why, in the pack's words, for the
 * fund screens and onboarding. Null for a pack whose funds have no condition
 * (NSW, Queensland), so their screens show nothing new.
 */
export function fundRequirementsView(source: FundsSource, building: SelectorBuilding = NO_BUILDING): FundRequirementView[] | null {
  if (!hasFundConditions(source)) return null;
  return requiredFunds(source, building).each.map((r) => {
    const need = r.need ?? "UNDECIDED";
    return {
      key: r.fund.key,
      label: r.fund.label,
      need,
      needLabel: NEED_LABELS[need],
      reason: r.reason,
      provision: r.provision,
      statusNote: r.need === null ? null : STATUS_NOTES[r.status],
      problem: r.problem,
    };
  });
}

/** The selectors a pack's fund conditions read, by key (for tests and review). */
export function fundConditionSelectors(source: FundsSource): string[] {
  const keys = new Set<string>();
  const walk = (c: FundCondition["rules"][number]["when"]) => {
    if ("all" in c) c.all.forEach(walk);
    else if ("any" in c) c.any.forEach(walk);
    else if ("selector" in c) keys.add(c.selector);
  };
  for (const f of catalogueOf(source)) f.requiredWhen?.rules.forEach((r) => walk(r.when));
  return [...keys].sort();
}
