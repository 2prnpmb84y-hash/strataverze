/**
 * The data a building's rule pack asks it to hold (QLD stage 2, step 10,
 * 27 Oct 2026): the setting the pack's REGULATION_MODULE selects, held in
 * `schemes.regulation_module`, and each lot's entitlement in every schedule
 * the pack lists (ENTITLEMENT_SCHEDULES). The schedule marked `onLot` is held
 * in `lots.entitlement`; Queensland's interest schedule is held in
 * `lots.interest_schedule_entitlement`.
 *
 * Missing data fails closed: a building whose pack has a module selector but
 * no supported module recorded, or a lot without an entitlement its pack
 * holds, is flagged to the adviser in plain words and never read as if it
 * were an NSW building. Pure, with type imports only.
 */
import type { StatutoryRules } from "@/config/statutory";

export type EntitlementSchedule = StatutoryRules["ENTITLEMENT_SCHEDULES"][number];
export type EntitlementUse = NonNullable<EntitlementSchedule["decides"]>[number];
export type RegulationModuleSelector = NonNullable<StatutoryRules["REGULATION_MODULE"]>;

type ScheduleRules = Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES">;

/** The lot field each separately held schedule is kept in. A schedule not listed is not held yet. */
const SEPARATE_FIELDS: Readonly<Record<string, SeparateEntitlementField>> = {
  INTEREST: "interestScheduleEntitlement",
};
export type SeparateEntitlementField = "interestScheduleEntitlement";

/** A lot's entitlements, as stored. */
export interface LotEntitlements {
  lotNumber?: string | null;
  entitlement: number | null;
  interestScheduleEntitlement?: number | null;
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

/**
 * The schedule the pack says decides `use`. A pack with a single schedule and
 * no `decides` list (NSW) uses that schedule for everything. Otherwise exactly
 * one schedule must list the use, or EntitlementRuleError is thrown.
 */
export function scheduleFor(rules: ScheduleRules, use: EntitlementUse): EntitlementSchedule {
  const schedules = rules.ENTITLEMENT_SCHEDULES;
  if (schedules.length === 1 && !schedules[0].decides) return schedules[0];
  const listed = schedules.filter((s) => s.decides?.includes(use));
  if (listed.length !== 1) throw new EntitlementRuleError(`The building's rule pack does not say which lot entitlement decides ${use}.`);
  return listed[0];
}

/** The lot field a schedule is held in, or null when StrataVerze does not hold it yet. */
export function entitlementField(schedule: Pick<EntitlementSchedule, "key" | "onLot">): "entitlement" | SeparateEntitlementField | null {
  if (schedule.onLot) return "entitlement";
  return SEPARATE_FIELDS[schedule.key] ?? null;
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

/** A lot's entitlement for one use, from the schedule its pack says decides it. */
export function lotEntitlementFor(rules: ScheduleRules, lot: LotEntitlements, use: EntitlementUse): number {
  return entitlementFor(lot, scheduleFor(rules, use));
}

/** The schedule held on each lot's `entitlement`. */
export function onLotSchedule(rules: ScheduleRules): EntitlementSchedule {
  const schedule = rules.ENTITLEMENT_SCHEDULES.find((s) => s.onLot);
  if (!schedule) throw new EntitlementRuleError("The building's rule pack holds no lot entitlement on each lot.");
  return schedule;
}

/**
 * The second schedule a building's lots hold, as forms and lot pages show
 * it, or null when the pack has none (NSW). Plain data a server page can pass
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

/** The module selector, as the building settings show it: plain data a server page can pass to the browser. */
export function regulationModuleChoices(rules: Pick<StatutoryRules, "REGULATION_MODULE">) {
  const selector = rules.REGULATION_MODULE;
  if (!selector) return null;
  return {
    label: selector.label,
    help: selector.help,
    options: selector.options.map((o) => ({ value: o.value, label: o.label, supported: o.supported, note: o.note ?? null })),
  };
}
export type RegulationModuleChoices = NonNullable<ReturnType<typeof regulationModuleChoices>>;

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
 * the module, and the lots without the second schedule's entitlement. Empty
 * for an NSW building.
 */
export function buildingDataProblems(
  rules: Pick<StatutoryRules, "REGULATION_MODULE" | "ENTITLEMENT_SCHEDULES">,
  scheme: { regulationModule?: string | null },
  lots: readonly LotEntitlements[],
): string[] {
  const problems: string[] = [];
  const moduleProblem = regulationModuleProblem(rules, scheme.regulationModule);
  if (moduleProblem) problems.push(moduleProblem);
  const separate = separateEntitlement(rules);
  if (separate && !separate.field) problems.push(`StrataVerze does not hold each lot's ${separate.name} yet.`);
  else if (separate) {
    const missing = lotsMissingEntitlement(rules, lots).map((l) => String(l.lotNumber ?? "")).filter(Boolean);
    if (missing.length === 1) problems.push(`Lot ${missing[0]} has no ${separate.name} recorded. StrataVerze can enter it from the building's records.`);
    else if (missing.length > 1) problems.push(`${missing.length} lots have no ${separate.name} recorded (lots ${lotList(missing)}). StrataVerze can enter them from the building's records.`);
  }
  return problems;
}
