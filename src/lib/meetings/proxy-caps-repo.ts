/**
 * Proxy caps, warned only (DB access; VIC, ACT and WA stage 2, PR 8b-iv,
 * 29 Oct 2026). See ./proxy-caps.ts for the rules.
 *
 * Read only for a building whose pack has PROXY_RULES (Victoria and the ACT):
 * the callers check the pack first, so nothing here is read for an NSW,
 * Queensland or Western Australian building.
 */
import { db } from "@/prisma/db";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { lotsOwingMoney } from "./debtor-voting-repo";
import { proxiesHeld, proxyCapWarnings, proxyHolderKey, type ProxyCapFacts, type ProxyRecord } from "./proxy-caps";
import type { StatutoryRules } from "@/config/statutory";

/** The building as the caps read it (as `getSchemeById` loads it). */
export interface ProxyScheme {
  id: string;
  timeZone: string;
  totalLots: number | null;
  lots: readonly { id: string; lotNumber: string; lotType?: string | null; occupiable?: boolean | null }[];
  memberships: readonly { role: string; isActive?: boolean | null; lotId?: string | null; profileId: string; profile?: { email?: string | null } | null }[];
}

/** A stored date as YYYY-MM-DD, or null. */
const day = (v: unknown): string | null => (v == null || v === "" ? null : String(v).slice(0, 10));

const isLot = (l: { lotType?: string | null }) => String(l.lotType ?? "").toUpperCase() !== "COMMON";

/** The building's active proxies. */
async function activeProxies(scheme: ProxyScheme): Promise<ProxyRecord[]> {
  const lotIds = scheme.lots.map((l) => l.id);
  if (lotIds.length === 0) return [];
  const rows = await db.orm.public.LotProxy.where((p) => p.lotId.in(lotIds)).where((p) => p.isActive.eq(true)).limit(5000).all();
  return rows.map((r) => ({ lotId: r.lotId, proxyName: r.proxyName ?? null, proxyEmail: r.proxyEmail ?? null, meetingDate: day(r.meetingDate) }));
}

/** The owners recorded on the building's lots (active owner memberships with a lot). */
function owners(scheme: ProxyScheme) {
  const lotIds = new Set(scheme.lots.filter(isLot).map((l) => l.id));
  const list = scheme.memberships.filter((m) => m.role === "OWNER" && m.isActive !== false && m.lotId && lotIds.has(m.lotId));
  const owned = new Set(list.map((m) => m.lotId));
  return { list, distinct: new Set(list.map((m) => m.profileId)).size, everyLotHasOne: lotIds.size > 0 && [...lotIds].every((id) => owned.has(id)) };
}

/** Victoria s 89C(10): the lots owing money on `on` whose owner's email is the holder's. */
async function holderOwesOn(scheme: ProxyScheme, email: string | null, on: string): Promise<string[]> {
  const key = (email ?? "").trim().toLowerCase();
  if (!key) return [];
  const lotIds = owners(scheme)
    .list.filter((m) => (m.profile?.email ?? "").trim().toLowerCase() === key)
    .map((m) => m.lotId as string);
  if (lotIds.length === 0) return [];
  const owing = await lotsOwingMoney({ id: scheme.id, timeZone: scheme.timeZone }, lotIds, on);
  const number = new Map(scheme.lots.map((l) => [l.id, String(l.lotNumber)]));
  return lotIds.filter((id) => owing.has(id)).map((id) => number.get(id) ?? "?");
}

function facts(scheme: ProxyScheme, base: Pick<ProxyCapFacts, "holderName" | "held" | "day" | "meetingDay" | "holderOwesOn">): ProxyCapFacts {
  const o = owners(scheme);
  return {
    ...base,
    building: { scheme: { totalLots: scheme.totalLots }, lots: scheme.lots },
    owners: { distinct: o.distinct, everyLotHasOne: o.everyLotHasOne },
  };
}

/**
 * The warnings for a proxy about to be recorded on one of the building's
 * lots: its holder's proxies for its meeting with it counted. None where the
 * pack has no PROXY_RULES (nothing is read then).
 */
export async function proxyWarningsForNewProxy(
  pack: StatutoryRules,
  scheme: ProxyScheme,
  proxy: Omit<ProxyRecord, "lotId">,
  now: Date = new Date(),
): Promise<string[]> {
  if (!pack.PROXY_RULES) return [];
  const holder = proxyHolderKey(proxy);
  if (!holder) return [];
  const on = proxy.meetingDate ?? todayIn(scheme.timeZone, now);
  const held = proxiesHeld(await activeProxies(scheme), holder, proxy.meetingDate) + 1;
  const owes = pack.PROXY_RULES.holderInArrears ? await holderOwesOn(scheme, proxy.proxyEmail, on) : [];
  return proxyCapWarnings(pack, facts(scheme, { holderName: proxy.proxyName ?? "", held, day: on, meetingDay: !!proxy.meetingDate, holderOwesOn: owes }));
}

/**
 * The warnings for every holder of proxies for the meeting on `meetingDay`
 * (its proxies, and those with no meeting date), for the meeting page. None
 * where the pack has no PROXY_RULES (nothing is read then).
 */
export async function proxyWarningsForMeeting(pack: StatutoryRules, scheme: ProxyScheme, meetingDay: string): Promise<string[]> {
  if (!pack.PROXY_RULES) return [];
  const proxies = (await activeProxies(scheme)).filter((p) => p.meetingDate == null || p.meetingDate === meetingDay);
  const holders = new Map<string, ProxyRecord>();
  for (const p of proxies) {
    const key = proxyHolderKey(p);
    if (key && !holders.has(key)) holders.set(key, p);
  }
  const out: string[] = [];
  for (const [key, first] of holders) {
    const held = proxiesHeld(proxies, key, meetingDay);
    const owes = pack.PROXY_RULES.holderInArrears ? await holderOwesOn(scheme, first.proxyEmail, meetingDay) : [];
    out.push(...proxyCapWarnings(pack, facts(scheme, { holderName: first.proxyName ?? "", held, day: meetingDay, meetingDay: true, holderOwesOn: owes })));
  }
  return out;
}
