/**
 * The data a building's rule pack asks it to hold (QLD stage 2, step 10,
 * 27 Oct 2026): the setting the pack's REGULATION_MODULE selects, held in
 * `schemes.regulation_module`, the plan format the pack's PLAN_FORMAT selects,
 * held in `schemes.plan_format` (QLD go-live gap, 27 Oct 2026), and each lot's
 * entitlement in every schedule the pack lists (ENTITLEMENT_SCHEDULES). The
 * schedule marked `onLot` is held
 * in `lots.entitlement`; Queensland's interest schedule is held in
 * `lots.interest_schedule_entitlement`, and Victoria's lot entitlement in
 * `lots.lot_entitlement` (VIC, ACT and WA stage 2, PR 4, 28 Oct 2026).
 *
 * Missing data fails closed: a building whose pack has a module selector but
 * no supported module recorded, or a lot without an entitlement its pack
 * holds, is flagged to the adviser in plain words and never read as if it
 * were an NSW building. Pure.
 */
import type { StatutoryRules } from "@/config/statutory";
import { buildingSelectorProblems, type SelectorBuilding } from "./building-selectors";
import { fundProblems } from "./funds";

export type EntitlementSchedule = StatutoryRules["ENTITLEMENT_SCHEDULES"][number];
type DecidedUse = NonNullable<EntitlementSchedule["decides"]>[number];
export type EntitlementUse = Extract<DecidedUse, string>;
export type ConditionalUse = Exclude<DecidedUse, string>;
export type RegulationModuleSelector = NonNullable<StatutoryRules["REGULATION_MODULE"]>;
type BuildingSelector = NonNullable<StatutoryRules["PLAN_FORMAT"]>;

/** The pack's schedules, and its plan format selector where a use depends on the building's plan format. */
type ScheduleRules = Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES"> & Partial<Pick<StatutoryRules, "PLAN_FORMAT">>;

/** The building settings a conditional use depends on (QLD go-live gap, 27 Oct 2026). */
export interface BuildingSettings {
  planFormat?: string | null;
}

/**
 * The lot field each separately held schedule is kept in, by the schedule's
 * key in its pack. A schedule not listed is not held yet. Each field has its
 * own column, so a value entered under one pack's schedule is never read as
 * another's: Queensland's interest schedule (stage 2, step 10) and Victoria's
 * lot entitlement (stage 2, PR 4). Forms, the CSV import and the Add Property
 * wizard send each value under its field name.
 */
const SEPARATE_FIELDS = {
  INTEREST: "interestScheduleEntitlement",
  LOT_ENTITLEMENT: "lotEntitlement",
} as const satisfies Readonly<Record<string, string>>;
export type SeparateEntitlementField = (typeof SEPARATE_FIELDS)[keyof typeof SEPARATE_FIELDS];
/** Every lot field a second schedule may be held in. */
export const SEPARATE_ENTITLEMENT_FIELDS: readonly SeparateEntitlementField[] = Object.values(SEPARATE_FIELDS);

/** A lot's entitlements, as stored. */
export interface LotEntitlements {
  lotNumber?: string | null;
  entitlement: number | null;
  interestScheduleEntitlement?: number | null;
  lotEntitlement?: number | null;
}

/** The pack does not say which schedule decides a use, or StrataVerze does not hold the schedule. */
export class EntitlementRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementRuleError";
  }
}

/** A lot has no entitlement recorded in a schedule its pack holds. */
export class MissingEntitlementError extends Error {
  constructor(
    readonly lotNumber: string | null,
    readonly schedule: string,
  ) {
    super(`${lotNumber ? `Lot ${lotNumber}` : "The lot"} has no ${schedule} recorded. Enter it before this can be worked out.`);
    this.name = "MissingEntitlementError";
  }
}

const isConditional = (d: DecidedUse): d is ConditionalUse => typeof d !== "string";

/**
 * The schedule the pack says decides `use`. A pack with a single schedule and
 * no `decides` list (NSW) uses that schedule for everything. Otherwise exactly
 * one schedule must list the use, or EntitlementRuleError is thrown. A use
 * listed with plan formats (Queensland's buildings insurance premium) is
 * decided by that schedule only for a building recorded with one of them: a
 * building with no plan format recorded, or another one, is refused.
 */
export function scheduleFor(rules: ScheduleRules, use: EntitlementUse, building: BuildingSettings = {}): EntitlementSchedule {
  const schedules = rules.ENTITLEMENT_SCHEDULES;
  if (schedules.length === 1 && !schedules[0].decides) return schedules[0];
  const format = (building.planFormat ?? "").trim();
  const decides = (d: DecidedUse) => d === use || (isConditional(d) && d.use === use && !!format && d.planFormats.includes(format));
  const listed = schedules.filter((s) => s.decides?.some(decides));
  if (listed.length === 1) return listed[0];
  const conditional = !listed.length && schedules.some((s) => s.decides?.some((d) => isConditional(d) && d.use === use));
  if (conditional) {
    const problem = planFormatProblem(rules, format);
    if (problem) throw new EntitlementRuleError(problem);
  }
  throw new EntitlementRuleError(`The building's rule pack does not say which lot entitlement decides ${use}.`);
}

/** The lot field a schedule is held in, or null when StrataVerze does not hold it yet. */
export function entitlementField(schedule: Pick<EntitlementSchedule, "key" | "onLot">): "entitlement" | SeparateEntitlementField | null {
  if (schedule.onLot) return "entitlement";
  return Object.prototype.hasOwnProperty.call(SEPARATE_FIELDS, schedule.key) ? SEPARATE_FIELDS[schedule.key as keyof typeof SEPARATE_FIELDS] : null;
}

/**
 * A lot's entitlement in a schedule. Throws EntitlementRuleError when the
 * schedule is not held, and MissingEntitlementError when the lot has none.
 */
export function entitlementFor(lot: LotEntitlements, schedule: Pick<EntitlementSchedule, "key" | "onLot" | "name">): number {
  const field = entitlementField(schedule);
  if (!field) throw new EntitlementRuleError(`StrataVerze does not hold each lot's ${schedule.name} yet.`);
  const value = lot[field];
  if (value == null || !Number.isInteger(Number(value)) || Number(value) < 1) throw new MissingEntitlementError(lot.lotNumber ?? null, schedule.name);
  return Number(value);
}

/** A lot's entitlement for one use, from the schedule its pack says decides it for the building. */
export function lotEntitlementFor(rules: ScheduleRules, lot: LotEntitlements, use: EntitlementUse, building: BuildingSettings = {}): number {
  return entitlementFor(lot, scheduleFor(rules, use, building));
}

/** The schedule held on each lot's `entitlement`. */
export function onLotSchedule(rules: ScheduleRules): EntitlementSchedule {
  const schedule = rules.ENTITLEMENT_SCHEDULES.find((s) => s.onLot);
  if (!schedule) throw new EntitlementRuleError("The building's rule pack holds no lot entitlement on each lot.");
  return schedule;
}

/**
 * The second schedule a building's lots hold, as forms and lot pages show
 * it, or null when the pack has none (NSW): Queensland's interest schedule,
 * Victoria's lot entitlement. Plain data a server page can pass
 * to the browser. `field` is null when StrataVerze does not hold it yet.
 */
export interface SeparateEntitlement {
  key: string;
  name: string;
  label: string;
  help: string | null;
  field: SeparateEntitlementField | null;
}

export function separateEntitlement(rules: ScheduleRules): SeparateEntitlement | null {
  const schedule = rules.ENTITLEMENT_SCHEDULES.find((s) => !s.onLot);
  if (!schedule) return null;
  const field = entitlementField(schedule);
  return { key: schedule.key, name: schedule.name, label: schedule.label ?? titleCase(schedule.name), help: schedule.help ?? null, field: field === "entitlement" ? null : field };
}

/** The label and help for each lot's `entitlement`, from the pack where it gives them; null keeps the screen's own words. */
export function onLotEntitlementWords(rules: ScheduleRules): { label: string | null; help: string | null } {
  const schedule = rules.ENTITLEMENT_SCHEDULES.find((s) => s.onLot);
  return { label: schedule?.label ?? null, help: schedule?.help ?? null };
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Reads an entitlement typed into a form or an import: a positive whole
 * number (each entitlement is a whole number, not 0). Empty gives null.
 */
export function parseEntitlement(text: unknown): { ok: true; value: number | null } | { ok: false } {
  const s = String(text ?? "").trim().replace(/,/g, "");
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  // Within a Postgres integer.
  return n >= 1 && n <= 2_147_483_647 ? { ok: true, value: n } : { ok: false };
}

/** The problem with an entitlement typed for a schedule, or null. */
export function entitlementInputProblem(label: string, text: unknown, required: boolean): string | null {
  const parsed = parseEntitlement(text);
  if (!parsed.ok) return `${label} must be a whole number of at least 1.`;
  if (parsed.value == null && required) return `Enter the ${label.toLowerCase()}.`;
  return null;
}

/** A selector as the building settings show it: plain data a server page can pass to the browser. */
function selectorChoices(selector: BuildingSelector | undefined) {
  if (!selector) return null;
  return {
    label: selector.label,
    help: selector.help,
    options: selector.options.map((o) => ({ value: o.value, label: o.label, supported: o.supported, note: o.note ?? null })),
  };
}

/** The module selector, as the building settings show it: plain data a server page can pass to the browser. */
export function regulationModuleChoices(rules: Pick<StatutoryRules, "REGULATION_MODULE">) {
  return selectorChoices(rules.REGULATION_MODULE);
}
export type RegulationModuleChoices = NonNullable<ReturnType<typeof regulationModuleChoices>>;

/** The plan format selector, as the building settings show it, or null when the pack has none (NSW). */
export function planFormatChoices(rules: Partial<Pick<StatutoryRules, "PLAN_FORMAT">>) {
  return selectorChoices(rules.PLAN_FORMAT);
}
export type PlanFormatChoices = NonNullable<ReturnType<typeof planFormatChoices>>;

/**
 * Why a plan format cannot be saved for a building, or null when it can. Any
 * of the selector's options may be recorded, since the plan format is a fact
 * about the building: one StrataVerze does not support yet is refused where
 * it matters (scheduleFor, the contribution split).
 */
export function planFormatChoiceProblem(rules: Partial<Pick<StatutoryRules, "PLAN_FORMAT">>, value: string): string | null {
  const selector = rules.PLAN_FORMAT;
  if (!selector) return "This building has no such setting.";
  const name = selector.label.toLowerCase();
  if (!value) return `Choose the ${name}.`;
  if (!selector.options.some((o) => o.value === value)) return `Choose a valid ${name}.`;
  return null;
}

/**
 * Why a building's stored plan format does not let StrataVerze apply the
 * rules that depend on it, or null. Null too for a pack with no plan format
 * selector (NSW).
 */
export function planFormatProblem(rules: Partial<Pick<StatutoryRules, "PLAN_FORMAT">>, stored: string | null | undefined): string | null {
  const selector = rules.PLAN_FORMAT;
  if (!selector) return null;
  const name = selector.label.toLowerCase();
  const value = (stored ?? "").trim();
  if (!value) return `No ${name} is recorded for this building. Choose it in the building settings before contributions that include insurance are raised.`;
  const option = selector.options.find((o) => o.value === value);
  if (!option) return `The building's ${name} is not one StrataVerze knows. Choose it again in the building settings.`;
  if (!option.supported) return `This building is recorded as a ${option.label.toLowerCase()}.${option.note ? ` ${option.note}` : ""}`;
  return null;
}

/** The label of a building's stored plan format, or null when none or unknown. */
export function planFormatLabel(rules: Partial<Pick<StatutoryRules, "PLAN_FORMAT">>, stored: string | null | undefined): string | null {
  return rules.PLAN_FORMAT?.options.find((o) => o.value === (stored ?? "").trim())?.label ?? null;
}

const supportedList = (selector: RegulationModuleSelector) => {
  const labels = selector.options.filter((o) => o.supported).map((o) => o.label);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : (labels[0] ?? "none");
};

/**
 * Why a module cannot be saved for a building, or null when it can: it must
 * be one of the selector's options, and one StrataVerze applies.
 */
export function regulationModuleChoiceProblem(rules: Pick<StatutoryRules, "REGULATION_MODULE">, value: string): string | null {
  const selector = rules.REGULATION_MODULE;
  if (!selector) return "This building has no such setting.";
  const name = selector.label.toLowerCase();
  if (!value) return `Choose the ${name}.`;
  const option = selector.options.find((o) => o.value === value);
  if (!option) return `Choose a valid ${name}.`;
  if (!option.supported) return `StrataVerze applies the ${supportedList(selector)} only for now, so a building under the ${option.label} cannot be managed yet.`;
  return null;
}

/**
 * Why a building's stored module is not one StrataVerze can apply, or null.
 * Null too for a pack with no module selector (NSW).
 */
export function regulationModuleProblem(rules: Pick<StatutoryRules, "REGULATION_MODULE">, stored: string | null | undefined): string | null {
  const selector = rules.REGULATION_MODULE;
  if (!selector) return null;
  const name = selector.label.toLowerCase();
  const value = (stored ?? "").trim();
  if (!value) return `No ${name} is recorded for this building. Choose it in the building settings before relying on its rules.`;
  const option = selector.options.find((o) => o.value === value);
  if (!option) return `The building's ${name} is not one StrataVerze knows. Choose it again in the building settings.`;
  if (!option.supported) return `This building is recorded under the ${option.label}, which StrataVerze does not apply yet. Its rules here are not right for it.`;
  return null;
}

/** The label of a building's stored module, or null when none or unknown. */
export function regulationModuleLabel(rules: Pick<StatutoryRules, "REGULATION_MODULE">, stored: string | null | undefined): string | null {
  return rules.REGULATION_MODULE?.options.find((o) => o.value === (stored ?? "").trim())?.label ?? null;
}

/** The lots missing an entitlement their pack holds separately (none for NSW). */
export function lotsMissingEntitlement(rules: ScheduleRules, lots: readonly LotEntitlements[]): LotEntitlements[] {
  const separate = separateEntitlement(rules);
  if (!separate) return [];
  if (!separate.field) return [...lots];
  const field = separate.field;
  return lots.filter((l) => l[field] == null);
}

/** The problem with one lot's entitlements, or null. */
export function lotEntitlementProblem(rules: ScheduleRules, lot: LotEntitlements): string | null {
  const separate = separateEntitlement(rules);
  if (!separate) return null;
  if (!separate.field) return `StrataVerze does not hold each lot's ${separate.name} yet.`;
  return lot[separate.field] == null ? `This lot has no ${separate.name} recorded. StrataVerze can enter it from the building's records.` : null;
}

const lotList = (numbers: string[]) => {
  const shown = numbers.slice(0, 10);
  const more = numbers.length - shown.length;
  const text = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
  return more > 0 ? `${text}, and ${more} more` : text;
};

/**
 * What a building is missing that its pack asks it to hold, for the adviser:
 * the module, the plan format (or one StrataVerze does not support yet), and
 * the lots without the second schedule's entitlement. Then, for a pack with
 * building selectors (VIC, ACT and WA stage 2, PR 2), each recorded selector
 * not recorded and each derived one that cannot be worked out, with the facts
 * to record (building-selectors.ts). Then, for a pack with fund conditions
 * (stage 2, PR 3), each fund that cannot be worked out and, given the
 * building's `funds`, each required fund it lacks and each it may not have
 * (fundProblems in funds.ts). Empty for an NSW building; a Queensland
 * building's problems are as before, since its pack has no building selectors
 * and no fund conditions.
 */
export function buildingDataProblems(
  rules: Pick<StatutoryRules, "REGULATION_MODULE" | "ENTITLEMENT_SCHEDULES"> &
    Partial<Pick<StatutoryRules, "PLAN_FORMAT" | "BUILDING_SELECTORS" | "BUILDING_FACTS" | "FUND_CATALOGUE" | "TERMINOLOGY">>,
  scheme: { regulationModule?: string | null; planFormat?: string | null } & Partial<SelectorBuilding["scheme"]>,
  lots: readonly (LotEntitlements & Partial<SelectorBuilding["lots"][number]>)[],
  recorded: SelectorBuilding["recorded"] = {},
  funds?: readonly { fundType: string }[],
): string[] {
  const problems: string[] = [];
  const moduleProblem = regulationModuleProblem(rules, scheme.regulationModule);
  if (moduleProblem) problems.push(moduleProblem);
  const formatProblem = planFormatProblem(rules, scheme.planFormat);
  if (formatProblem) problems.push(formatProblem);
  const separate = separateEntitlement(rules);
  if (separate && !separate.field) problems.push(`StrataVerze does not hold each lot's ${separate.name} yet.`);
  else if (separate) {
    const missing = lotsMissingEntitlement(rules, lots).map((l) => String(l.lotNumber ?? "")).filter(Boolean);
    if (missing.length === 1) problems.push(`Lot ${missing[0]} has no ${separate.name} recorded. StrataVerze can enter it from the building's records.`);
    else if (missing.length > 1) problems.push(`${missing.length} lots have no ${separate.name} recorded (lots ${lotList(missing)}). StrataVerze can enter them from the building's records.`);
  }
  if (rules.BUILDING_SELECTORS?.length) problems.push(...buildingSelectorProblems(rules, { scheme, lots, recorded }));
  if (rules.FUND_CATALOGUE) problems.push(...fundProblems({ ...rules, FUND_CATALOGUE: rules.FUND_CATALOGUE }, { scheme, lots, recorded }, funds));
  return problems;
}
