/**
 * Building selectors in one shape for every pack (VIC, ACT and WA stage 2,
 * PR 2, 28 Oct 2026). A pack lists in BUILDING_SELECTORS the settings that
 * decide which of its rules apply to a building. Each is either recorded by
 * an adviser (held in `scheme_selector_values`, checked here against the
 * pack's options) or derived from the building's facts by `deriveSelector`,
 * one pure function, and never stored.
 *
 * Derived values fail closed: a fact a rule needs that is missing leaves the
 * rule undecided, and an undecided rule refuses the selector rather than
 * skipping to the next one. The adviser is told what to record.
 *
 * Queensland's REGULATION_MODULE and PLAN_FORMAT keep their columns, forms and
 * readers (building-data.ts). `selectorValue` reads them from those columns,
 * so every selector can be read in one way. Pure, with type imports only.
 */
import type {
  BuildingFactKey,
  BuildingSelector,
  DerivedBuildingSelector,
  RecordedFactKey,
  SelectorCondition,
  StatutoryRules,
} from "@/config/statutory";

type SelectorRules = Partial<Pick<StatutoryRules, "BUILDING_SELECTORS" | "BUILDING_FACTS" | "REGULATION_MODULE" | "PLAN_FORMAT" | "TERMINOLOGY">>;

/** What the pack calls a lot, lower case: "lot" unless its TERMINOLOGY says otherwise (the ACT's "unit"). */
export function lotNouns(rules: SelectorRules): { lot: string; lots: string } {
  return { lot: rules.TERMINOLOGY?.lot ?? "lot", lots: rules.TERMINOLOGY?.lots ?? "lots" };
}
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The records a building's facts are read from. */
export interface BuildingFactRecords {
  scheme: { totalLots?: number | null; servicesOnly?: boolean | null; replacementCost?: unknown };
  lots: readonly { id?: string; lotNumber?: string | null; lotType?: string | null; occupiable?: boolean | null }[];
}

/** Why a fact is not known. */
export type FactGap =
  | { kind: "NO_LOTS" }
  | { kind: "LOT_COUNT_MISMATCH"; recorded: number; total: number }
  | { kind: "LOTS_UNANSWERED"; lotNumbers: string[] }
  /** Lots of a type the pack says is never occupiable, answered occupiable. */
  | { kind: "LOTS_CONFLICT"; lotNumbers: string[]; lotTypes: string[] }
  | { kind: "NOT_RECORDED" };

export interface BuildingFacts {
  values: Readonly<Record<BuildingFactKey, number | boolean | null>>;
  gaps: Readonly<Partial<Record<BuildingFactKey, FactGap>>>;
}

/** A common property row is not a lot (as the NSW audit and annual report counts read it). */
const isLot = (l: { lotType?: string | null }) => String(l.lotType ?? "").toUpperCase() !== "COMMON";

/** Dollars as stored (numeric(14,2), read as text or a number) to whole cents, or null when not a valid amount. */
export function dollarsToCents(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, part = ""] = text.split(".");
  return Number(whole) * 100 + Number(part.padEnd(2, "0"));
}

/**
 * The building's facts, from its records. The lot count is read only where
 * the lots recorded (other than common property) match the building's total
 * lots, and the occupiable counts only where every lot has an answer too and
 * no lot of a type the pack says is never occupiable is answered occupiable.
 */
export function buildingFacts(records: BuildingFactRecords, rules: SelectorRules = {}): BuildingFacts {
  const lots = records.lots.filter(isLot);
  const total = records.scheme.totalLots;
  const gaps: Partial<Record<BuildingFactKey, FactGap>> = {};
  let lotCount: number | null = lots.length;
  if (!lots.length) {
    lotCount = null;
    gaps.LOT_COUNT = { kind: "NO_LOTS" };
  } else if (total != null && total !== lots.length) {
    lotCount = null;
    gaps.LOT_COUNT = { kind: "LOT_COUNT_MISMATCH", recorded: lots.length, total };
  }
  let occupiable: number | null = null;
  let nonOccupiable: number | null = null;
  const unanswered = lots.filter((l) => l.occupiable == null).map((l) => String(l.lotNumber ?? ""));
  const never = rules.BUILDING_FACTS?.LOT_OCCUPIABLE?.neverForLotTypes?.lotTypes ?? [];
  const conflicting = lots.filter((l) => l.occupiable === true && never.includes(String(l.lotType ?? "").toUpperCase()));
  if (lotCount == null) {
    gaps.OCCUPIABLE_LOT_COUNT = gaps.NON_OCCUPIABLE_LOT_COUNT = gaps.LOT_COUNT;
  } else if (conflicting.length) {
    gaps.OCCUPIABLE_LOT_COUNT = gaps.NON_OCCUPIABLE_LOT_COUNT = {
      kind: "LOTS_CONFLICT",
      lotNumbers: conflicting.map((l) => String(l.lotNumber ?? "")),
      lotTypes: [...new Set(conflicting.map((l) => String(l.lotType ?? "").toLowerCase()))],
    };
  } else if (unanswered.length) {
    gaps.OCCUPIABLE_LOT_COUNT = gaps.NON_OCCUPIABLE_LOT_COUNT = { kind: "LOTS_UNANSWERED", lotNumbers: unanswered };
  } else {
    occupiable = lots.filter((l) => l.occupiable === true).length;
    nonOccupiable = lots.length - occupiable;
  }
  const servicesOnly = typeof records.scheme.servicesOnly === "boolean" ? records.scheme.servicesOnly : null;
  if (servicesOnly == null) gaps.SERVICES_ONLY = { kind: "NOT_RECORDED" };
  const cost = dollarsToCents(records.scheme.replacementCost);
  if (cost == null) gaps.REPLACEMENT_COST_CENTS = { kind: "NOT_RECORDED" };
  return {
    values: { LOT_COUNT: lotCount, OCCUPIABLE_LOT_COUNT: occupiable, NON_OCCUPIABLE_LOT_COUNT: nonOccupiable, SERVICES_ONLY: servicesOnly, REPLACEMENT_COST_CENTS: cost },
    gaps,
  };
}

/** A fact or a recorded selector a test reads: `selector:<key>` for a selector. */
export type FactRef = BuildingFactKey | `selector:${string}`;

/** The recorded selector values, by key. */
export type RecordedValues = Readonly<Record<string, string | null | undefined>>;

/** A test's answer: true, false, or null with what is missing. */
export type Truth = { holds: boolean | null; missing: FactRef[] };

/** A selector's value as a test reads it, or null when it has none. */
type SelectorLookup = (key: string) => string | null;

const recordedLookup = (recorded: RecordedValues): SelectorLookup => (key) => (recorded[key] ?? "").trim() || null;

/** Three-valued: a test needing a missing fact neither holds nor fails. */
function test(cond: SelectorCondition, facts: BuildingFacts["values"], lookup: SelectorLookup): Truth {
  if ("all" in cond || "any" in cond) {
    const parts = ("all" in cond ? cond.all : cond.any).map((c) => test(c, facts, lookup));
    const decisive = "all" in cond ? false : true;
    if (parts.some((p) => p.holds === decisive)) return { holds: decisive, missing: [] };
    const missing = parts.flatMap((p) => p.missing);
    return parts.some((p) => p.holds === null) ? { holds: null, missing } : { holds: !decisive, missing: [] };
  }
  if ("selector" in cond) {
    const value = lookup(cond.selector);
    if (!value) return { holds: null, missing: [`selector:${cond.selector}`] };
    return { holds: cond.in.includes(value), missing: [] };
  }
  if ("flag" in cond) {
    const value = facts[cond.flag];
    if (typeof value !== "boolean") return { holds: null, missing: [cond.flag] };
    return { holds: value === cond.is, missing: [] };
  }
  const n = facts[cond.number];
  if (typeof n !== "number") return { holds: null, missing: [cond.number] };
  const holds =
    (cond.atLeast == null || n >= cond.atLeast) &&
    (cond.atMost == null || n <= cond.atMost) &&
    (cond.moreThan == null || n > cond.moreThan) &&
    (cond.lessThan == null || n < cond.lessThan);
  return { holds, missing: [] };
}

export type DerivedResult =
  | { ok: true; value: string; label: string; provision: string }
  | { ok: false; kind: "MISSING"; missing: FactRef[] }
  | { ok: false; kind: "REFUSED"; message: string; provision: string }
  | { ok: false; kind: "NO_RULE"; message: string };

/**
 * A derived selector's value, from the building's facts and recorded
 * selectors. The rules are read in order and the first that holds decides.
 * A rule that cannot be decided because a fact is missing refuses the
 * selector (MISSING), so a later rule never decides in its place. A rule
 * with no value refuses it with the pack's reason (REFUSED). A value the
 * selector does not list is refused too.
 */
export function deriveSelector(selector: DerivedBuildingSelector, facts: BuildingFacts["values"], recorded: RecordedValues = {}): DerivedResult {
  for (const rule of selector.rules) {
    const t = test(rule.when, facts, recordedLookup(recorded));
    if (t.holds === null) return { ok: false, kind: "MISSING", missing: [...new Set(t.missing)] };
    if (!t.holds) continue;
    if (rule.value == null) return { ok: false, kind: "REFUSED", message: rule.refusal ?? selector.noRuleFits, provision: rule.provision };
    const option = selector.options.find((o) => o.value === rule.value);
    if (!option) return { ok: false, kind: "NO_RULE", message: selector.noRuleFits };
    return { ok: true, value: option.value, label: option.label, provision: rule.provision };
  }
  return { ok: false, kind: "NO_RULE", message: selector.noRuleFits };
}

/** The facts and recorded selectors a derived selector reads, in the order its rules name them. */
export function factsRead(selector: DerivedBuildingSelector): FactRef[] {
  const out: FactRef[] = [];
  const walk = (c: SelectorCondition) => {
    if ("all" in c) c.all.forEach(walk);
    else if ("any" in c) c.any.forEach(walk);
    else {
      const ref: FactRef = "selector" in c ? `selector:${c.selector}` : "flag" in c ? c.flag : c.number;
      if (!out.includes(ref)) out.push(ref);
    }
  };
  selector.rules.forEach((r) => walk(r.when));
  return out;
}

/** The building selectors a pack lists (none for NSW and Queensland). */
export function buildingSelectors(rules: SelectorRules): readonly BuildingSelector[] {
  return rules.BUILDING_SELECTORS ?? [];
}

/**
 * Why a value cannot be recorded for a building's selector, or null when it
 * can. Only a recorded selector the building's pack lists, and only one of
 * its options. Any listed option may be recorded, since each is a fact about
 * the building: one StrataVerze does not support yet is flagged to the adviser.
 */
export function selectorValueProblem(rules: SelectorRules, key: string, value: string): string | null {
  const selector = buildingSelectors(rules).find((s) => s.key === key);
  if (!selector) return "This building has no such setting.";
  const name = selector.label.toLowerCase();
  if (selector.held === "DERIVED") return `The ${name} is worked out from the building's facts, so it cannot be chosen.`;
  if (!value) return `Choose the ${name}.`;
  if (!selector.options.some((o) => o.value === value)) return `Choose a valid ${name}.`;
  return null;
}

/** Where a selector's value comes from, as the general reader sees it. */
export type SelectorHolding = "COLUMN" | "RECORDED" | "DERIVED";

/**
 * The recorded selector values as the rules read them (VIC, ACT and WA
 * stage 2, PR 8a-ii review, 29 Oct 2026): a value recorded for one of the
 * pack's recorded selectors that is not one of its options is read as not
 * recorded, so a test on it cannot be decided and fails closed (a band of
 * members not known never lifts the debtor rule, an owners corporation answer
 * not known never lets the tier be worked out). Values for keys the pack does
 * not list as recorded selectors are kept as they are.
 */
export function knownRecorded(rules: SelectorRules, recorded: RecordedValues): RecordedValues {
  const out: Record<string, string | null | undefined> = { ...recorded };
  for (const selector of buildingSelectors(rules)) {
    if (selector.held !== "RECORDED") continue;
    const value = (recorded[selector.key] ?? "").trim();
    if (value && !selector.options.some((o) => o.value === value)) out[selector.key] = null;
  }
  return out;
}

/** A building's data the general reader reads every selector from. */
export interface SelectorBuilding extends BuildingFactRecords {
  scheme: BuildingFactRecords["scheme"] & { regulationModule?: string | null; planFormat?: string | null };
  recorded: RecordedValues;
}

/**
 * The value of any selector a building's pack has, by key: Queensland's
 * regulation module and plan format from their own columns, a recorded
 * selector from the shared store, and a derived one worked out from the
 * building's facts. Null when the pack has no such selector. A recorded
 * value that is not one of the selector's options reads as none
 * (knownRecorded), there and in what a derived selector reads.
 */
export function selectorValue(
  rules: SelectorRules,
  key: string,
  building: SelectorBuilding,
): { holding: SelectorHolding; value: string | null; derived?: DerivedResult } | null {
  for (const legacy of [rules.REGULATION_MODULE, rules.PLAN_FORMAT]) {
    if (legacy?.key === key) {
      const stored = key === "regulationModule" ? building.scheme.regulationModule : key === "planFormat" ? building.scheme.planFormat : null;
      return { holding: "COLUMN", value: (stored ?? "").trim() || null };
    }
  }
  const selector = buildingSelectors(rules).find((s) => s.key === key);
  if (!selector) return null;
  const recorded = knownRecorded(rules, building.recorded);
  if (selector.held === "RECORDED") return { holding: "RECORDED", value: (recorded[key] ?? "").trim() || null };
  const derived = deriveSelector(selector, buildingFacts(building, rules).values, recorded);
  return { holding: "DERIVED", value: derived.ok ? derived.value : null, derived };
}

/**
 * Whether a building meets a test written against its pack's selectors and
 * its facts (fund conditions, stage 2, PR 3). A `selector` test reads the
 * selector's value as `selectorValue` gives it: Queensland's columns, a
 * recorded value, or a derived value worked out from the building's facts. A
 * derived selector that cannot be worked out counts as missing, as does a
 * selector the pack does not have. Three-valued: null, with what is missing,
 * when the test cannot be decided.
 */
export function conditionHolds(rules: SelectorRules, cond: SelectorCondition, building: SelectorBuilding): Truth {
  const facts = buildingFacts(building, rules).values;
  return test(cond, facts, (key) => selectorValue(rules, key, building)?.value ?? null);
}

// ---------------------------------------------------------------------------
// Words for the adviser
// ---------------------------------------------------------------------------

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : (items[0] ?? ""));
const lotList = (numbers: string[]) => {
  const shown = numbers.slice(0, 10);
  const more = numbers.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : list(shown);
};
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const factWord = (rules: SelectorRules, key: RecordedFactKey, fallback: string) => lower(rules.BUILDING_FACTS?.[key]?.label ?? fallback);

/** Why a fact is missing, in a clause after "because". */
function gapWords(rules: SelectorRules, ref: FactRef, facts: BuildingFacts): string {
  if (ref.startsWith("selector:")) {
    const key = ref.slice("selector:".length);
    const selector = buildingSelectors(rules).find((s) => s.key === key);
    return `no ${lower(selector?.label ?? key)} is recorded`;
  }
  const gap = facts.gaps[ref as BuildingFactKey];
  const { lot, lots } = lotNouns(rules);
  if (gap?.kind === "NO_LOTS") return `no ${lots} are recorded`;
  if (gap?.kind === "LOT_COUNT_MISMATCH") return `${gap.recorded} ${gap.recorded === 1 ? lot : lots} ${gap.recorded === 1 ? "is" : "are"} recorded but the building's total is ${gap.total}`;
  if (gap?.kind === "LOTS_CONFLICT") {
    const word = factWord(rules, "LOT_OCCUPIABLE", "occupiable");
    const types = list(gap.lotTypes);
    return gap.lotNumbers.length === 1
      ? `${lot} ${gap.lotNumbers[0]} is a ${types} ${lot} but is answered yes for ${word}`
      : `${gap.lotNumbers.length} ${types} ${lots} are answered yes for ${word} (${lots} ${lotList(gap.lotNumbers)})`;
  }
  if (gap?.kind === "LOTS_UNANSWERED") {
    const word = factWord(rules, "LOT_OCCUPIABLE", "lot answer");
    return gap.lotNumbers.length === 1 ? `${lot} ${gap.lotNumbers[0]} has no answer for ${word}` : `${gap.lotNumbers.length} ${lots} have no answer for ${word} (${lots} ${lotList(gap.lotNumbers)})`;
  }
  if (ref === "SERVICES_ONLY") return `no answer is recorded for ${factWord(rules, "SERVICES_ONLY", "services only")}`;
  if (ref === "REPLACEMENT_COST_CENTS") return `no ${factWord(rules, "REPLACEMENT_COST", "replacement cost")} is recorded`;
  return "a fact is missing";
}

/**
 * What a test's missing parts come down to (stage 2, PR 3): a derived
 * selector that is missing facts is replaced by those facts (and the recorded
 * selectors it reads), so the adviser is told what to record. A derived
 * selector refused for another reason stays as it is.
 */
export function underlyingMissing(rules: SelectorRules, refs: readonly FactRef[], building: SelectorBuilding): FactRef[] {
  const out: FactRef[] = [];
  for (const ref of refs) {
    const key = ref.startsWith("selector:") ? ref.slice("selector:".length) : null;
    const derived = key ? selectorValue(rules, key, building)?.derived : undefined;
    const expanded = derived && !derived.ok && derived.kind === "MISSING" ? derived.missing : [ref];
    for (const r of expanded) if (!out.includes(r)) out.push(r);
  }
  return out;
}

/**
 * Why something a fund condition reads is not known, in a clause after
 * "because" (stage 2, PR 3): a derived selector refused for a reason other
 * than a missing fact (its own problem is listed beside it), a recorded one
 * with no answer, or a fact, as the selectors' problems word it.
 */
export function missingWords(rules: SelectorRules, ref: FactRef, building: SelectorBuilding): string {
  if (ref.startsWith("selector:")) {
    const key = ref.slice("selector:".length);
    const selector = buildingSelectors(rules).find((s) => s.key === key);
    if (selector?.held === "DERIVED") return `the ${lower(selector.label)} cannot be worked out`;
    const stored = (building.recorded[key] ?? "").trim();
    if (selector && stored && !(knownRecorded(rules, building.recorded)[key] ?? "").trim()) return `the ${lower(selector.label)} recorded is not one StrataVerze knows`;
    const label = selector?.label ?? [rules.REGULATION_MODULE, rules.PLAN_FORMAT].find((c) => c?.key === key)?.label;
    return label ? `no answer is recorded for ${lower(label)}` : "a building setting the pack reads is missing";
  }
  return gapWords(rules, ref, buildingFacts(building, rules));
}

/** Why a derived selector has no value, for the adviser, or null when it has one. */
export function derivedProblem(rules: SelectorRules, selector: DerivedBuildingSelector, result: DerivedResult, facts: BuildingFacts): string | null {
  if (result.ok) return null;
  const name = lower(selector.label);
  if (result.kind === "MISSING") {
    const reasons = [...new Set(result.missing.map((m) => gapWords(rules, m, facts)))];
    return `The ${name} cannot be worked out because ${list(reasons)}. Record what is missing in the building rules.`;
  }
  return `The ${name} cannot be worked out. ${result.message}`;
}

/** Why a recorded selector's stored value does not let StrataVerze apply its rules, or null. */
export function recordedProblem(selector: BuildingSelector, stored: string | null | undefined): string | null {
  const name = lower(selector.label);
  const value = (stored ?? "").trim();
  if (!value) return `No ${name} is recorded for this building. Choose it in the building rules.`;
  const option = selector.options.find((o) => o.value === value);
  if (!option) return `The building's ${name} is not one StrataVerze knows. Choose it again in the building rules.`;
  if (!option.supported) return `The building's ${name} is recorded as ${lower(option.label)}, which StrataVerze does not support yet.${option.note ? ` ${option.note}` : ""}`;
  return null;
}

/**
 * What the building rules are missing, for the "Building data missing"
 * notice: each recorded selector with no value, one StrataVerze does not
 * know or support, and each derived selector that cannot be worked out, with
 * the facts to record. Empty for a pack with no building selectors (NSW,
 * Queensland).
 */
export function buildingSelectorProblems(rules: SelectorRules, building: SelectorBuilding): string[] {
  const selectors = buildingSelectors(rules);
  if (!selectors.length) return [];
  const facts = buildingFacts(building, rules);
  const problems: string[] = [];
  for (const selector of selectors) {
    // A value only fund conditions need is flagged by them where it decides a fund (fundProblems in funds.ts).
    if (selector.held === "RECORDED" && selector.flagMissing === "FUND_CONDITIONS" && !(building.recorded[selector.key] ?? "").trim()) continue;
    const problem =
      selector.held === "RECORDED"
        ? recordedProblem(selector, building.recorded[selector.key])
        : derivedProblem(rules, selector, deriveSelector(selector, facts.values, knownRecorded(rules, building.recorded)), facts);
    if (problem && !problems.includes(problem)) problems.push(problem);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The Building rules section: plain data a server page passes to the browser
// ---------------------------------------------------------------------------

export interface RecordedSelectorView {
  key: string;
  label: string;
  help: string;
  options: { value: string; label: string; supported: boolean; note: string | null }[];
  current: string | null;
}

export interface DerivedSelectorView {
  key: string;
  label: string;
  help: string;
  /** The value worked out, or null with `problem`. */
  value: string | null;
  note: string | null;
  problem: string | null;
  /** The facts it was worked out from, as the adviser reads them. */
  facts: { label: string; value: string }[];
}

export interface FactFieldView {
  key: RecordedFactKey;
  label: string;
  help: string;
  yesLabel: string;
  noLabel: string;
}

export interface BuildingRulesView {
  /** What the pack calls a lot, as a label starts it: "Lot", "Unit". */
  lotWord: string;
  /** The plural, lower case: "lots", "units". */
  lotsWord: string;
  recorded: RecordedSelectorView[];
  derived: DerivedSelectorView[];
  servicesOnly: (FactFieldView & { current: boolean | null }) | null;
  replacementCost: (FactFieldView & { current: string | null }) | null;
  lotOccupiable: (FactFieldView & { lots: { id: string; lotNumber: string; current: boolean | null }[] }) | null;
}

const centsToDollars = (cents: number) => `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function factView(rules: SelectorRules, key: RecordedFactKey): FactFieldView | null {
  const def = rules.BUILDING_FACTS?.[key];
  if (!def) return null;
  return { key, label: def.label, help: def.help, yesLabel: def.yesLabel ?? "Yes", noLabel: def.noLabel ?? "No" };
}

/** How a fact or recorded selector a derived selector read is shown beside its value. */
function factShown(rules: SelectorRules, ref: FactRef, facts: BuildingFacts, recorded: RecordedValues): { label: string; value: string } {
  const notRecorded = "Not recorded";
  if (ref.startsWith("selector:")) {
    const key = ref.slice("selector:".length);
    const selector = buildingSelectors(rules).find((s) => s.key === key);
    const stored = (recorded[key] ?? "").trim();
    return { label: selector?.label ?? key, value: selector?.options.find((o) => o.value === stored)?.label ?? notRecorded };
  }
  const v = facts.values[ref as BuildingFactKey];
  const occupiable = rules.BUILDING_FACTS?.LOT_OCCUPIABLE;
  switch (ref) {
    case "LOT_COUNT":
      return { label: upper(lotNouns(rules).lots), value: v == null ? notRecorded : String(v) };
    case "OCCUPIABLE_LOT_COUNT":
      return { label: `${occupiable?.yesLabel ?? "Occupiable"} ${lotNouns(rules).lots}`, value: v == null ? notRecorded : String(v) };
    case "NON_OCCUPIABLE_LOT_COUNT":
      return { label: `${occupiable?.noLabel ?? "Not occupiable"} ${lotNouns(rules).lots}`, value: v == null ? notRecorded : String(v) };
    case "SERVICES_ONLY": {
      const def = rules.BUILDING_FACTS?.SERVICES_ONLY;
      return { label: def?.label ?? "Services only", value: v == null ? notRecorded : v ? (def?.yesLabel ?? "Yes") : (def?.noLabel ?? "No") };
    }
    default:
      return { label: rules.BUILDING_FACTS?.REPLACEMENT_COST?.label ?? "Replacement cost", value: typeof v === "number" ? centsToDollars(v) : notRecorded };
  }
}

/**
 * The Building rules section for a building, or null when its pack lists no
 * building selectors (NSW, Queensland). Labels, help, options and fact words
 * all come from the pack.
 */
export function buildingRulesView(rules: SelectorRules, building: SelectorBuilding): BuildingRulesView | null {
  const selectors = buildingSelectors(rules);
  if (!selectors.length) return null;
  const facts = buildingFacts(building, rules);
  const nouns = lotNouns(rules);
  const view: BuildingRulesView = { lotWord: upper(nouns.lot), lotsWord: nouns.lots, recorded: [], derived: [], servicesOnly: null, replacementCost: null, lotOccupiable: null };
  for (const s of selectors) {
    if (s.held === "RECORDED") {
      view.recorded.push({
        key: s.key,
        label: s.label,
        help: s.help,
        options: s.options.map((o) => ({ value: o.value, label: o.label, supported: o.supported, note: o.note ?? null })),
        current: (building.recorded[s.key] ?? "").trim() || null,
      });
      continue;
    }
    const result = deriveSelector(s, facts.values, knownRecorded(rules, building.recorded));
    const option = result.ok ? s.options.find((o) => o.value === result.value) : undefined;
    view.derived.push({
      key: s.key,
      label: s.label,
      help: s.help,
      value: result.ok ? result.label : null,
      note: option?.note ?? null,
      problem: derivedProblem(rules, s, result, facts),
      facts: factsRead(s).map((ref) => factShown(rules, ref, facts, building.recorded)),
    });
  }
  const services = factView(rules, "SERVICES_ONLY");
  if (services) view.servicesOnly = { ...services, current: typeof building.scheme.servicesOnly === "boolean" ? building.scheme.servicesOnly : null };
  const cost = factView(rules, "REPLACEMENT_COST");
  if (cost) {
    const cents = dollarsToCents(building.scheme.replacementCost);
    view.replacementCost = { ...cost, current: cents == null ? null : (cents / 100).toFixed(2) };
  }
  const occupiable = factView(rules, "LOT_OCCUPIABLE");
  if (occupiable)
    view.lotOccupiable = {
      ...occupiable,
      lots: building.lots.filter(isLot).map((l) => ({ id: String(l.id ?? ""), lotNumber: String(l.lotNumber ?? ""), current: typeof l.occupiable === "boolean" ? l.occupiable : null })),
    };
  return view;
}

// ---------------------------------------------------------------------------
// Reading the form
// ---------------------------------------------------------------------------

/** The largest replacement cost numeric(14,2) holds, in cents. */
const MAX_COST_CENTS = 99_999_999_999_999;

/** A replacement cost typed in dollars ("6,000,000", "$5000000.50"), as cents. Empty gives null. */
export function parseDollars(text: unknown): { ok: true; cents: number | null } | { ok: false } {
  const s = String(text ?? "").trim().replace(/[$,\s]/g, "");
  if (!s) return { ok: true, cents: null };
  const cents = dollarsToCents(s);
  return cents == null || cents > MAX_COST_CENTS ? { ok: false } : { ok: true, cents };
}

/** A yes or no answer from the form: "YES", "NO" or empty (not recorded). */
export function parseYesNo(text: unknown): { ok: true; value: boolean | null } | { ok: false } {
  const s = String(text ?? "").trim();
  if (!s) return { ok: true, value: null };
  if (s === "YES") return { ok: true, value: true };
  if (s === "NO") return { ok: true, value: false };
  return { ok: false };
}

/** What the Building rules form asks to save, checked against the pack. */
export interface BuildingRulesInput {
  /** Recorded selector values by key; null clears the value. */
  selectors: Record<string, string | null>;
  servicesOnly?: boolean | null;
  /** Dollars as stored (numeric text), or null. */
  replacementCost?: string | null;
  /** Each lot's occupiable answer by lot id; null clears it. */
  occupiable?: Record<string, boolean | null>;
}

/**
 * Reads the Building rules form for a building's pack: `selector:<key>` for
 * each recorded selector, `servicesOnly`, `replacementCost` and
 * `occupiable:<lot id>`, each only where the pack asks for it. A field for a
 * selector the pack does not list, or a value it does not allow, is refused
 * with the reason, and nothing is saved.
 */
export function readBuildingRulesForm(rules: SelectorRules, form: FormData): { ok: true; input: BuildingRulesInput } | { ok: false; error: string } {
  const input: BuildingRulesInput = { selectors: {} };
  for (const [name, raw] of form.entries()) {
    if (!name.startsWith("selector:")) continue;
    const key = name.slice("selector:".length);
    const value = String(raw ?? "").trim();
    const selector = buildingSelectors(rules).find((s) => s.key === key);
    if (value || !selector || selector.held !== "RECORDED") {
      const problem = selectorValueProblem(rules, key, value);
      if (problem) return { ok: false, error: problem };
    }
    input.selectors[key] = value || null;
  }
  const services = rules.BUILDING_FACTS?.SERVICES_ONLY;
  if (services && form.has("servicesOnly")) {
    const parsed = parseYesNo(form.get("servicesOnly"));
    if (!parsed.ok) return { ok: false, error: `Choose an answer for ${lower(services.label)}.` };
    input.servicesOnly = parsed.value;
  }
  const cost = rules.BUILDING_FACTS?.REPLACEMENT_COST;
  if (cost && form.has("replacementCost")) {
    const parsed = parseDollars(form.get("replacementCost"));
    if (!parsed.ok) return { ok: false, error: `The ${lower(cost.label)} must be an amount in dollars, such as 5,000,000.` };
    input.replacementCost = parsed.cents == null ? null : (parsed.cents / 100).toFixed(2);
  }
  const occupiable = rules.BUILDING_FACTS?.LOT_OCCUPIABLE;
  if (occupiable) {
    for (const [name, raw] of form.entries()) {
      if (!name.startsWith("occupiable:")) continue;
      const parsed = parseYesNo(raw);
      if (!parsed.ok) return { ok: false, error: `Choose an answer for ${lower(occupiable.label)} on each lot.` };
      (input.occupiable ??= {})[name.slice("occupiable:".length)] = parsed.value;
    }
  }
  return { ok: true, input };
}
