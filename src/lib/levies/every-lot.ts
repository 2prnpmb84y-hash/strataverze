/**
 * What a notice states about the whole building (ACT stage 2, PR 6b,
 * 28 Oct 2026): the contribution for each unit of the building for the same
 * schedule and period, the fund and its totals, and the unit's proportion and
 * how it is worked out. Pure: data in, content out. Only a pack whose checked
 * notice rules require one of these (the ACT) asks for it, so NSW and
 * Queensland notices never carry it.
 *
 * Each unit is shown by its number and amount only, never by its owner. A
 * unit with no notice for the period is shown as nil. The proportion is the
 * unit's entitlement over the schedule's total, and is stated only where the
 * contribution was shared that way: no insurance split, and the building's
 * entitlements still add up to the schedule's total.
 */
import type { StatutoryRules } from "@/config/statutory";
import type { NoticeContentKey, NoticeLedgerFund } from "./notice-rule-check";

/** The content keys this content lets a notice state. */
export const EVERY_LOT_KEYS = ["EVERY_LOT_CONTRIBUTION", "FUND_TOTAL", "PROPORTION_AND_METHOD"] as const satisfies readonly NoticeContentKey[];

/** Whether a building's notice rules require any of the every-lot contents (the ACT): never for a pack without checked rules (NSW, Queensland). */
export function everyLotRequired(rule: Pick<StatutoryRules["NOTICE_RULES"], "checked">): boolean {
  return rule.checked?.requiredContents.some((r) => (EVERY_LOT_KEYS as readonly string[]).includes(r.key)) ?? false;
}

/** The building's words the content is stated in, from its pack. */
export interface EveryLotWords {
  /** What a lot is called ("unit"), and its plural. */
  lot: string;
  lots: string;
  /** What a levy is called ("contribution"). */
  levy: string;
  /** The entitlement each lot holds that the contribution is shared by ("unit entitlement"), or null where the pack holds none. */
  entitlement: string | null;
}

export interface EveryLotContent {
  words: EveryLotWords;
  /** Each unit of the building (not common property), in number order: its amount for the same schedule and period, or null (nil) where it has no notice. */
  rows: { lotNumber: string; cents: number | null; thisLot: boolean }[];
  /** The total of the rows: the contribution for the period from every unit. */
  totalCents: number;
  /** The fund the whole contribution is paid into, and the schedule's total (the year's, for a budget schedule). */
  fund: { name: string; scheduleTotalCents: number; wholeYear: boolean };
  /** The unit's entitlement and the schedule's total, or null where the contribution was not shared by entitlement alone. */
  proportion: { entitlement: number; totalEntitlement: number } | null;
}

export interface EveryLotInput {
  /** The notice's lot. */
  lotId: string;
  /** Every lot row of the building, as stored. */
  lots: readonly { id: string; lotNumber: string; entitlement: number; lotType?: string | null; deleted?: boolean }[];
  /** The notices of the same schedule and period, one per lot. */
  periodNotices: readonly { lotId: string; cents: number; insuranceSplit: boolean }[];
  schedule: { budgetCents: number; levyType: string; totalEntitlement: number };
  fundName: string | null;
  words: EveryLotWords;
  /** Whether the pack shares the contribution by the entitlement on each lot alone (false where it splits insurance by another schedule). */
  sharedByEntitlement: boolean;
}

/** A common property row is not a unit. */
const isUnit = (l: { lotType?: string | null; deleted?: boolean }) => !l.deleted && String(l.lotType ?? "").toUpperCase() !== "COMMON";
const byNumber = (a: string, b: string) => a.localeCompare(b, "en-AU", { numeric: true });

/**
 * The content for one notice, or null where it cannot be stated truthfully:
 * the notice's lot is not a unit of the building, a lot has two notices for
 * the period, a lot not shown (common property, or a removed lot) has an
 * amount, or the schedule's total is not known.
 */
export function buildEveryLot(input: EveryLotInput): EveryLotContent | null {
  const units = input.lots.filter(isUnit);
  if (!units.some((l) => l.id === input.lotId)) return null;
  const fundName = input.fundName?.trim();
  if (!fundName) return null;
  if (!Number.isInteger(input.schedule.budgetCents) || input.schedule.budgetCents <= 0) return null;
  const amounts = new Map<string, number>();
  for (const n of input.periodNotices) {
    if (amounts.has(n.lotId) || !Number.isInteger(n.cents) || n.cents < 0) return null;
    amounts.set(n.lotId, n.cents);
  }
  const shown = new Set(units.map((l) => l.id));
  if ([...amounts].some(([lotId, cents]) => !shown.has(lotId) && cents !== 0)) return null;
  const rows = [...units]
    .sort((a, b) => byNumber(String(a.lotNumber), String(b.lotNumber)))
    .map((l) => ({ lotNumber: String(l.lotNumber), cents: amounts.get(l.id) ?? null, thisLot: l.id === input.lotId }));
  const totalCents = rows.reduce((s, r) => s + (r.cents ?? 0), 0);

  // The proportion, only where the contribution was shared by the entitlement on each lot and the
  // building's entitlements still add up to the schedule's total.
  const lot = units.find((l) => l.id === input.lotId)!;
  const total = input.schedule.totalEntitlement;
  const held = input.lots.filter((l) => !l.deleted).reduce((s, l) => s + Number(l.entitlement), 0);
  const proportion =
    input.sharedByEntitlement &&
    input.words.entitlement &&
    !input.periodNotices.some((n) => n.insuranceSplit) &&
    Number.isFinite(total) &&
    total > 0 &&
    Number.isInteger(lot.entitlement) &&
    lot.entitlement > 0 &&
    held === total
      ? { entitlement: lot.entitlement, totalEntitlement: total }
      : null;

  return {
    words: input.words,
    rows,
    totalCents,
    fund: { name: fundName, scheduleTotalCents: input.schedule.budgetCents, wholeYear: input.schedule.levyType === "ORDINARY" },
    proportion,
  };
}

/**
 * What the content lets the notice state, by content key. The fund total of
 * a sinking fund notice is the year's (the pack's words), so it counts only
 * for a budget schedule; nothing counts without the content.
 */
export function everyLotStates(content: EveryLotContent | null, ledgerFund: NoticeLedgerFund | null | undefined): Partial<Record<NoticeContentKey, boolean>> {
  if (!content) return {};
  return {
    EVERY_LOT_CONTRIBUTION: content.rows.some((r) => r.thisLot),
    FUND_TOTAL: ledgerFund === "CAPITAL_WORKS" ? content.fund.wholeYear : true,
    PROPORTION_AND_METHOD: content.proportion != null,
  };
}

const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** A percentage to at most 4 decimal places: 5, 33.3333. */
const percent = (part: number, whole: number) => String(Number(((part / whole) * 100).toFixed(4)));

/** The content as the PDF and the email state it: the same sections, in the same words. */
export interface EveryLotSections {
  contributions: { title: string; columns: [string, string]; rows: [string, string][]; total: [string, string] };
  funds: { title: string; rows: [string, string][] };
  proportion: { title: string; rows: [string, string][] } | null;
}

export function everyLotSections(e: EveryLotContent): EveryLotSections {
  const w = e.words;
  const p = e.proportion;
  return {
    contributions: {
      title: `${capital(w.levy)} for each ${w.lot}`,
      columns: [capital(w.lot), capital(w.levy)],
      rows: e.rows.map((r) => [r.thisLot ? `${r.lotNumber} (this ${w.lot})` : r.lotNumber, r.cents == null ? "Nil" : money(r.cents)]),
      total: [`Total, all ${w.lots}`, money(e.totalCents)],
    },
    funds: {
      title: "Fund and totals",
      rows: [
        ["Fund", `${e.fund.name} (all of this ${w.levy})`],
        [`This period, all ${w.lots}`, money(e.totalCents)],
        [e.fund.wholeYear ? `The year, all ${w.lots}` : `This ${w.levy}, all ${w.lots}`, money(e.fund.scheduleTotalCents)],
      ],
    },
    proportion:
      p && w.entitlement
        ? {
            title: `This ${w.lot}'s proportion`,
            rows: [
              ["Proportion", `${p.entitlement} of ${p.totalEntitlement} (${percent(p.entitlement, p.totalEntitlement)}%)`],
              ["How it is worked out", `By ${w.entitlement}: this ${w.lot}'s ${w.entitlement} divided by the total ${w.entitlement} of all ${w.lots}`],
            ],
          }
        : null,
  };
}
