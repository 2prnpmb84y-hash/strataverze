/**
 * Proxy caps, warned only (pure; VIC, ACT and WA stage 2, PR 8b-iv,
 * 29 Oct 2026).
 *
 * A pack with PROXY_RULES limits how many proxies one person may hold for a
 * meeting: Victoria (OCA s 89D: 1 lot owner where there are 20 or fewer
 * occupiable lots, otherwise no more than 5% of the lot owners, read on the
 * meeting's day from DATED_RULES.PROXY_LIMIT, so 1 lot owner always once
 * CLAA 2026 Part 6 Div 2 is recorded as commenced) and the ACT (UTMA sch 3
 * s 3.26(3): 1 proxy with 20 units or fewer, otherwise no more than 5% of the
 * units, the chair exempt). Matthew Wrigley's decisions of 29 Oct 2026, kept
 * in the packs' FOR_REVIEW:
 * - D15: every cap warns only, the 1-proxy cap included, and never stops a
 *   proxy being saved. The exceptions (family members and the reg 8A cases in
 *   Victoria, the ACT's chair) cannot be told from the records, so the words
 *   name them. A share is rounded in neither direction by the notes: a holder
 *   above the share rounded down "may be over", above it rounded up "is
 *   over", and the words say the rounding is not confirmed. Where the share
 *   is less than 1 proxy (review M2), no floor is applied, as s 89D sets
 *   none: any proxy "may be over", and the words say whether at least 1 is
 *   allowed is not confirmed;
 * - D16: Victoria's 5% is of the distinct owners recorded on the building's
 *   lots, and of the lots where any lot has no owner recorded (said so);
 * - D17: a Victorian holder whose email matches an owner of a lot owing money
 *   on the day (s 89C(10): an owner in arrears may not act as a proxy) is
 *   warned of, warn only.
 *
 * A proxy is held as free text on a lot (`lot_proxies`), with no holder
 * identity and no link to a meeting: the holder is matched by email (trimmed,
 * any case) or, with no email, by name, and a proxy belongs to the meeting on
 * its meeting date. A proxy with no meeting date is counted for every
 * meeting. Every day is YYYY-MM-DD in the building's time zone. Plain words
 * with no dashes or semicolons.
 */
import type { StatutoryRules } from "@/config/statutory";
import { ruleInForceOn, type DatedValueOf } from "@/lib/jurisdiction/dated-rules";
import { buildingFacts, deriveSelector, derivedProblem, gapWords, lotNouns, type BuildingFactRecords } from "@/lib/jurisdiction/building-selectors";
import { formatDay } from "./pending";

export type ProxyRules = NonNullable<StatutoryRules["PROXY_RULES"]>;
type PackRules = Pick<StatutoryRules, "BUILDING_FACTS" | "TERMINOLOGY"> & { PROXY_RULES?: ProxyRules };

/** A proxy as the caps read it. */
export interface ProxyRecord {
  lotId: string;
  proxyName: string | null;
  proxyEmail: string | null;
  /** The meeting date (YYYY-MM-DD), or null where none is recorded. */
  meetingDate: string | null;
}

/** Who holds a proxy: its email, trimmed and in lower case, or with no email its name. Null where neither is given. */
export function proxyHolderKey(p: Pick<ProxyRecord, "proxyName" | "proxyEmail">): string | null {
  const email = (p.proxyEmail ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = (p.proxyName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return name ? `name:${name}` : null;
}

/**
 * How many of `proxies` the holder holds for the meeting on `day`: those for
 * that day and those with no meeting date. With no day, those with no meeting
 * date and the most for any one day.
 */
export function proxiesHeld(proxies: readonly ProxyRecord[], holder: string, day: string | null): number {
  const mine = proxies.filter((p) => proxyHolderKey(p) === holder);
  const undated = mine.filter((p) => !p.meetingDate).length;
  if (day) return undated + mine.filter((p) => p.meetingDate === day).length;
  const byDay = new Map<string, number>();
  for (const p of mine) if (p.meetingDate) byDay.set(p.meetingDate, (byDay.get(p.meetingDate) ?? 0) + 1);
  return undated + Math.max(0, ...byDay.values());
}

/** What the caps need of the building and the holder. */
export interface ProxyCapFacts {
  /** The holder, as named on the proxy. */
  holderName: string;
  /** The proxies the holder holds for the meeting. */
  held: number;
  /** The day the limit is read on: the meeting's day, or today where the proxy has no meeting date. */
  day: string;
  /** Whether `day` is the meeting's day. */
  meetingDay: boolean;
  /** The building and its lots (common property rows are not lots). */
  building: BuildingFactRecords;
  /** The distinct owners recorded on the building's lots, and whether every lot has one. */
  owners: { distinct: number; everyLotHasOne: boolean };
  /** Victoria s 89C(10): the lots whose owner's email is the holder's and which owe money on `day`. */
  holderOwesOn?: readonly string[];
}

const proxiesWord = (n: number) => (n === 1 ? "1 proxy" : `${n} proxies`);
const lotWords = (numbers: readonly string[]) =>
  numbers.length > 1 ? `lots ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}` : `lot ${numbers[0] ?? ""}`;
const shareWords = (n: number, percent: number) => String(Number(((n * percent) / 100).toFixed(2)));

/** A limit as a share of a number: rounded down and up, equal where the share is whole. */
function share(n: number, percent: number): { down: number; up: number } {
  const down = Math.floor((n * percent) / 100);
  return { down, up: (n * percent) % 100 === 0 ? down : down + 1 };
}

/**
 * The warnings for one holder of proxies for a meeting, under the pack's
 * PROXY_RULES. None where the pack has none, or the holder is within the
 * limit. Never a refusal (D15).
 */
export function proxyCapWarnings(pack: PackRules, facts: ProxyCapFacts): string[] {
  const rules = pack.PROXY_RULES;
  if (!rules) return [];
  const out: string[] = [];
  const who = facts.holderName.trim() || "This proxy holder";
  const when = facts.meetingDay ? `the meeting on ${formatDay(facts.day)}` : "one meeting";
  const holds = `${who} holds ${proxiesWord(facts.held)} for ${when}`;
  const except = `The limit does not apply ${rules.exceptWords}.`;
  const rounding = rules.roundingStatus === "CONFIRMED" ? "" : " How the share is rounded is not confirmed.";
  const factsOf = buildingFacts(facts.building, pack);
  const values = factsOf.values;

  /** The warning for a holder over a fixed limit, or over (or perhaps over) a share. */
  const fixed = (max: number, why: string, extra = "") => {
    if (facts.held > max) out.push(`${holds}, over the limit of ${proxiesWord(max)}${why}. ${except}${extra}`);
  };
  const shareOf = (n: number, percent: number, of: string, extra = "") => {
    const { down, up } = share(n, percent);
    const limit = `${percent}% of ${n} ${of}, which is ${shareWords(n, percent)}`;
    if (down === 0 && facts.held <= up) {
      // Review M2: the share is less than 1 proxy. s 89D sets no floor, so whether at least 1 is allowed is not
      // confirmed (FOR_REVIEW PROXY_CAPS): any proxy may be over, and no limit of 0 proxies is stated.
      out.push(`${holds}, which may be over the limit. ${percent}% of ${n} ${of} is ${shareWords(n, percent)}, less than 1 proxy, and whether at least 1 is allowed is not confirmed. ${except}${extra}`);
    } else if (facts.held > up) {
      out.push(`${holds}, over the limit of ${limit}.${down === up ? "" : " This is over it rounded either way."} ${except}${extra}`);
    } else if (facts.held > down) {
      out.push(`${holds}, which may be over the limit of ${limit}. Rounded down the limit is ${proxiesWord(down)}, rounded up ${proxiesWord(up)}.${rounding} ${except}${extra}`);
    }
  };

  if (rules.datedLimit) {
    let value: DatedValueOf<NonNullable<ProxyRules["datedLimit"]>> | null = null;
    try {
      value = ruleInForceOn(rules.datedLimit, facts.day).value;
    } catch (err) {
      // The reader refused (no value in force, or a change due but not recorded as commenced): the limit cannot be told.
      if (facts.held > 1) {
        out.push(`StrataVerze cannot tell which proxy limit applies on ${formatDay(facts.day)}, so ${who}'s ${proxiesWord(facts.held)} for ${when} are not checked. ${err instanceof Error ? err.message : ""}`.trim());
      }
    }
    if (value) {
      const extra = value.exceptionsStatus === "CONFIRMED" ? "" : " Whether these exceptions still apply is not confirmed.";
      const above = value.aboveThreshold;
      if (!above) {
        fixed(value.maxLotOwners, "", extra);
      } else {
        const occupiable = factsOf.values.OCCUPIABLE_LOT_COUNT;
        const atMost = above.occupiableLotsMoreThan;
        if (typeof occupiable !== "number") {
          // Not every lot's occupiable answer is known: the stricter limit may apply.
          if (facts.held > value.maxLotOwners) {
            out.push(
              `${holds}, which may be over the limit. The limit is ${proxiesWord(value.maxLotOwners)} where there are ${atMost} or fewer occupiable lots, and StrataVerze cannot tell how many lots are occupiable because ${gapWords(pack, "OCCUPIABLE_LOT_COUNT", factsOf)}. ${except}${extra}`,
            );
          }
        } else if (occupiable <= atMost) {
          fixed(value.maxLotOwners, ` where there are ${atMost} or fewer occupiable lots`, extra);
        } else if (rules.shareOf === "LOT_OWNERS" && facts.owners.everyLotHasOne && facts.owners.distinct > 0) {
          shareOf(facts.owners.distinct, above.maxPercentOfLotOwners, "lot owners recorded", extra);
        } else {
          // D16: owners missing, so the lots are counted, and said so.
          const lots = facts.building.lots.filter((l) => String(l.lotType ?? "").toUpperCase() !== "COMMON").length;
          shareOf(lots, above.maxPercentOfLotOwners, lotNouns(pack).lots, ` The owners are not recorded for every lot, so the lots are counted in place of the lot owners.${extra}`);
        }
      }
    }
  }

  if (rules.band) {
    const derived = deriveSelector(rules.band.selector, values);
    const limit = derived.ok ? rules.band.limits.find((l) => l.value === derived.value) : undefined;
    if (!derived.ok || !limit) {
      if (facts.held > 1) {
        const why = (!derived.ok ? derivedProblem(pack, rules.band.selector, derived, factsOf) : null) ?? rules.band.selector.noRuleFits;
        out.push(`StrataVerze cannot work out the proxy limit for this building, so ${who}'s ${proxiesWord(facts.held)} for ${when} are not checked. ${why}`);
      }
    } else if ("proxies" in limit.max) {
      fixed(limit.max.proxies, "");
    } else if (typeof values.LOT_COUNT === "number") {
      shareOf(values.LOT_COUNT, limit.max.percentOfUnits, lotNouns(pack).lots);
    }
  }

  if (rules.holderInArrears && facts.holderOwesOn && facts.holderOwesOn.length > 0) {
    out.push(
      `${who}'s email matches the owner of ${lotWords(facts.holderOwesOn)}, which ${facts.holderOwesOn.length > 1 ? "owe" : "owes"} the ${pack.TERMINOLOGY.ownersCorporation} money on ${formatDay(facts.day)}. ${rules.holderInArrears.words}`,
    );
  }
  return out;
}
