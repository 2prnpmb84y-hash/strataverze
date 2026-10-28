/**
 * What a notice states about the whole building (ACT stage 2, PR 6b,
 * 28 Oct 2026): the contribution for each unit of the building for the same
 * schedule and period, the fund and its totals, and the unit's proportion and
 * how it is worked out. Pure: data in, content out. Only a pack whose checked
 * notice rules require one of these (the ACT) asks for it, so NSW and
 * Queensland notices never carry it.
 *
 * Each unit is shown by its number and amount only, never by its owner. A
 * unit with no notice for the period is shown as nil. The content is worked
 * out once for each schedule and period (buildPeriodEveryLot) and then given
 * to each notice of it (everyLotFor). Anything that cannot be stated
 * truthfully is withheld with the reason, and a notice that must state it is
 * refused (or, once issued, not emailed and its PDF not given).
 */
import type { StatutoryRules } from "@/config/statutory";
import type { NoticeContentKey, NoticeLedgerFund } from "./notice-rule-check";

/** The content keys this content lets a notice state. */
export const EVERY_LOT_KEYS = ["EVERY_LOT_CONTRIBUTION", "FUND_TOTAL", "PROPORTION_AND_METHOD"] as const satisfies readonly NoticeContentKey[];
export type EveryLotKey = (typeof EVERY_LOT_KEYS)[number];
const isEveryLotKey = (key: string): key is EveryLotKey => (EVERY_LOT_KEYS as readonly string[]).includes(key);

type NoticeRules = Pick<StatutoryRules["NOTICE_RULES"], "checked">;

/** Whether a building's notice rules require any of the every-lot contents (the ACT): never for a pack without checked rules (NSW, Queensland). */
export function everyLotRequired(rule: NoticeRules): boolean {
  return rule.checked?.requiredContents.some((r) => isEveryLotKey(r.key)) ?? false;
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
  /**
   * The fund the whole contribution is paid into, and the schedule's total
   * (the year's, for a budget schedule), or null where it is not the year's
   * total because the schedule was revised.
   */
  fund: { name: string; scheduleTotalCents: number | null; wholeYear: boolean };
  /** The unit's entitlement and the schedule's total, or null where it is withheld. */
  proportion: { entitlement: number; totalEntitlement: number } | null;
  /** Why a part is not stated, by content key, in words that follow "it cannot be stated for this notice:". */
  withheld: Partial<Record<EveryLotKey, string>>;
}

/** A notice's content, or why none can be stated. */
export type EveryLotBuild = { content: EveryLotContent; reason?: undefined } | { content: null; reason: string };

export interface EveryLotPeriodInput {
  /** Every lot row of the building, as stored. */
  lots: readonly { id: string; lotNumber: string; entitlement: number; lotType?: string | null; deleted?: boolean }[];
  /** The notices of the schedule for the period. */
  periodNotices: readonly { lotId: string; cents: number; insuranceSplit: boolean }[];
  schedule: {
    budgetCents: number;
    levyType: string;
    totalEntitlement: number;
    /** How many instalments the schedule is raised in (1 for a special contribution). */
    instalments: number;
    /** Which instalment the period is (0 for the first), or null where it is not known. */
    instalmentIndex: number | null;
    /** Whether the schedule's total is not the year's because the schedule for this fund and year was revised. */
    revised: boolean;
  };
  fundName: string | null;
  words: EveryLotWords;
  /** Whether the pack shares the contribution by the entitlement on each lot alone (false where it splits insurance by another schedule). */
  sharedByEntitlement: boolean;
}

/** The content of one schedule and period, before it is given to a notice. */
export type EveryLotPeriod =
  | { reason: string }
  | {
      reason?: undefined;
      words: EveryLotWords;
      units: { id: string; lotNumber: string; entitlement: number; cents: number | null }[];
      totalCents: number;
      fund: EveryLotContent["fund"];
      /** The schedule's total entitlement, where the amounts are each unit's share by its current entitlement; else null. */
      totalEntitlement: number | null;
      withheld: Partial<Record<EveryLotKey, string>>;
    };

const COLLATOR = new Intl.Collator("en-AU", { numeric: true });
/** A common property row is not a unit. */
const isCommon = (l: { lotType?: string | null }) => String(l.lotType ?? "").toUpperCase() === "COMMON";

/**
 * The amounts each lot may be given for one instalment when the schedule's
 * total is shared by the lots' current entitlements, exactly as planNotices
 * shares it (./notice-plan.ts): whole cents by the largest remainder, then
 * each lot's share split equally into instalments, the extra cents going to
 * the first instalments. Where lots tie at the rounding cut-off, which of
 * them gets the extra cent depends on the order the lots were read in, so
 * either amount is allowed for them. Null where the shares cannot be worked
 * out.
 */
export function entitlementShares(
  totalCents: number,
  lots: readonly { id: string; entitlement: number }[],
  instalments: number,
  index: number,
): Map<string, Set<number>> | null {
  const weightSum = lots.reduce((s, l) => s + l.entitlement, 0);
  if (!Number.isInteger(totalCents) || totalCents <= 0 || weightSum <= 0 || lots.some((l) => !Number.isInteger(l.entitlement) || l.entitlement < 0)) return null;
  if (!Number.isInteger(instalments) || instalments < 1 || !Number.isInteger(index) || index < 0 || index >= instalments) return null;
  // Exact integer arithmetic: each lot's share is floor + remainder / weightSum.
  const parts = lots.map((l) => ({ id: l.id, floor: Math.floor((totalCents * l.entitlement) / weightSum), rest: (totalCents * l.entitlement) % weightSum }));
  const remainder = totalCents - parts.reduce((s, p) => s + p.floor, 0);
  const order = [...parts].sort((a, b) => b.rest - a.rest);
  const cutoff = remainder > 0 ? order[remainder - 1].rest : null;
  const instalment = (share: number) => Math.floor(share / instalments) + (index < share % instalments ? 1 : 0);
  const out = new Map<string, Set<number>>();
  for (const p of parts) {
    const shares = cutoff == null || p.rest < cutoff ? [p.floor] : p.rest > cutoff ? [p.floor + 1] : [p.floor, p.floor + 1];
    out.set(p.id, new Set(shares.map(instalment)));
  }
  return out;
}

/** The content of one schedule and period, worked out once for all its notices. */
export function buildPeriodEveryLot(input: EveryLotPeriodInput): EveryLotPeriod {
  const w = input.words;
  const fundName = input.fundName?.trim();
  if (!fundName) return { reason: "the fund has no name" };
  if (!Number.isInteger(input.schedule.budgetCents) || input.schedule.budgetCents <= 0) return { reason: `the ${w.levy} schedule has no total` };
  const recorded = input.lots.filter((l) => !l.deleted);
  const byId = new Map(recorded.map((l) => [l.id, l]));
  const amounts = new Map<string, number>();
  for (const n of input.periodNotices) {
    if (!Number.isInteger(n.cents) || n.cents < 0) return { reason: `a notice for the period has an amount that is not in whole cents` };
    if (amounts.has(n.lotId)) return { reason: `a ${w.lot} has two notices for the period` };
    amounts.set(n.lotId, n.cents);
    const lot = byId.get(n.lotId);
    if (n.cents !== 0 && !lot) return { reason: `a ${w.levy} on the period's notices is for a ${w.lot} that is no longer recorded` };
    if (n.cents !== 0 && lot && isCommon(lot)) return { reason: `common property has a ${w.levy} on the period's notices, and it is not a ${w.lot}` };
  }
  const units = recorded
    .filter((l) => !isCommon(l))
    .sort((a, b) => COLLATOR.compare(String(a.lotNumber), String(b.lotNumber)))
    .map((l) => ({ id: l.id, lotNumber: String(l.lotNumber), entitlement: Number(l.entitlement), cents: amounts.get(l.id) ?? null }));
  const totalCents = units.reduce((s, u) => s + (u.cents ?? 0), 0);
  const withheld: Partial<Record<EveryLotKey, string>> = {};

  // The schedule's total is the year's only while the schedule for this fund and year was not revised.
  const wholeYear = input.schedule.levyType === "ORDINARY";
  if (wholeYear && input.schedule.revised) {
    withheld.FUND_TOTAL = `the ${w.levy} schedule for this fund and year was revised, so no schedule's total is the year's total`;
  }

  // The proportion: only where the contribution was shared by each lot's entitlement alone, the building's
  // entitlements still add up to the schedule's total, and every amount is the unit's share by them.
  const total = input.schedule.totalEntitlement;
  const held = recorded.reduce((s, l) => s + Number(l.entitlement), 0);
  let proportionReason: string | null = null;
  if (!w.entitlement) proportionReason = "the building's rules hold no entitlement on each lot";
  else if (!input.sharedByEntitlement || input.periodNotices.some((n) => n.insuranceSplit)) proportionReason = `the ${w.levy} was not shared by ${w.entitlement} alone`;
  else if (!Number.isFinite(total) || total <= 0) proportionReason = `the ${w.levy} schedule has no total ${w.entitlement}`;
  else if (held !== total) proportionReason = `the ${w.lots}' ${w.entitlement} (${held}) no longer adds up to the schedule's total (${total})`;
  else if (input.schedule.instalmentIndex == null) proportionReason = `which instalment of the schedule the period is cannot be worked out`;
  else {
    const shares = entitlementShares(input.schedule.budgetCents, recorded.map((l) => ({ id: l.id, entitlement: Number(l.entitlement) })), input.schedule.instalments, input.schedule.instalmentIndex);
    if (!shares) proportionReason = `each ${w.lot}'s share by ${w.entitlement} cannot be worked out`;
    else if (units.some((u) => u.cents != null && !shares.get(u.id)?.has(u.cents))) {
      proportionReason = `the amounts on the period's notices are not each ${w.lot}'s share by its current ${w.entitlement} (it has changed since the notices were planned)`;
    }
  }
  if (proportionReason) withheld.PROPORTION_AND_METHOD = proportionReason;

  return {
    words: w,
    units,
    totalCents,
    fund: { name: fundName, scheduleTotalCents: withheld.FUND_TOTAL ? null : input.schedule.budgetCents, wholeYear },
    totalEntitlement: proportionReason ? null : total,
    withheld,
  };
}

/** A notice's content from its period's: its own unit marked, and its proportion. */
export function everyLotFor(period: EveryLotPeriod, lotId: string): EveryLotBuild {
  if (period.reason != null) return { content: null, reason: period.reason };
  const unit = period.units.find((u) => u.id === lotId);
  if (!unit) return { content: null, reason: `the notice's ${period.words.lot} is not a ${period.words.lot} of the building (common property, or no longer recorded)` };
  const withheld = { ...period.withheld };
  let proportion: EveryLotContent["proportion"] = null;
  if (period.totalEntitlement != null) {
    if (Number.isInteger(unit.entitlement) && unit.entitlement > 0) proportion = { entitlement: unit.entitlement, totalEntitlement: period.totalEntitlement };
    else withheld.PROPORTION_AND_METHOD = `the ${period.words.lot} has no ${period.words.entitlement}`;
  }
  return {
    content: {
      words: period.words,
      rows: period.units.map((u) => ({ lotNumber: u.lotNumber, cents: u.cents, thisLot: u.id === lotId })),
      totalCents: period.totalCents,
      fund: period.fund,
      proportion,
      withheld,
    },
  };
}

/**
 * What the content lets the notice state, by content key, and why a key is
 * not stated. The fund total of a sinking fund notice is the year's (the
 * pack's words), so it counts only for a budget schedule.
 */
export function everyLotStatus(build: EveryLotBuild, ledgerFund: NoticeLedgerFund | null | undefined): {
  states: Partial<Record<EveryLotKey, boolean>>;
  reasons: Partial<Record<EveryLotKey, string>>;
} {
  const e = build.content;
  if (!e) return { states: {}, reasons: Object.fromEntries(EVERY_LOT_KEYS.map((k) => [k, build.reason])) };
  const reasons: Partial<Record<EveryLotKey, string>> = { ...e.withheld };
  if (e.fund.scheduleTotalCents != null && ledgerFund === "CAPITAL_WORKS" && !e.fund.wholeYear) {
    reasons.FUND_TOTAL = `a special ${e.words.levy} has no total for the year`;
  }
  return {
    states: {
      EVERY_LOT_CONTRIBUTION: !reasons.EVERY_LOT_CONTRIBUTION && e.rows.some((r) => r.thisLot),
      FUND_TOTAL: !reasons.FUND_TOTAL && e.fund.scheduleTotalCents != null,
      PROPORTION_AND_METHOD: !reasons.PROPORTION_AND_METHOD && e.proportion != null,
    },
    reasons,
  };
}

/**
 * Why a notice cannot state every one of these contents its building's rules
 * require for its fund (as the gate reads them), or null where it can. Used
 * before a notice already issued is emailed or its PDF given.
 */
export function everyLotMissing(rule: NoticeRules, build: EveryLotBuild, ledgerFund: NoticeLedgerFund | null | undefined): string | null {
  const { states, reasons } = everyLotStatus(build, ledgerFund);
  for (const req of rule.checked?.requiredContents ?? []) {
    if (!isEveryLotKey(req.key)) continue;
    if (ledgerFund && req.ledgerFunds && !req.ledgerFunds.includes(ledgerFund)) continue;
    if (states[req.key] !== true) return `The notice must state ${req.words} (${req.source}), and it cannot be stated: ${reasons[req.key] ?? "the content is missing"}.`;
  }
  return null;
}

/** A notice whose required contents cannot be stated in full: its PDF is not given. */
export class EveryLotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EveryLotUnavailableError";
  }
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
        ...(e.fund.scheduleTotalCents != null
          ? ([[e.fund.wholeYear ? `The year, all ${w.lots}` : `This ${w.levy}, all ${w.lots}`, money(e.fund.scheduleTotalCents)]] as [string, string][])
          : []),
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
