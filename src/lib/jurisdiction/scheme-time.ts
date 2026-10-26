/**
 * A building's time zone and today's date there (server side; phase 1c).
 * See ./time-zone.ts for why dates are days in the building's time zone.
 */
import { db } from "@/prisma/db";
import { isTimeZone, PLATFORM_TIME_ZONE, todayIn } from "./time-zone";
import { SchemeNotFoundError } from "./scheme-rules";

/** The time zone stored on a building row, checked. */
export function timeZoneOf(scheme: { timeZone: string | null } | null | undefined): string {
  const tz = scheme?.timeZone ?? null;
  // Every building has one (the column is required, default Sydney). An
  // unknown value would make every date wrong, so it is refused, not guessed.
  if (!isTimeZone(tz)) throw new Error(`The building's time zone (${String(tz)}) is not a known time zone.`);
  return tz;
}

/** A building's time zone. Pass a transaction's `tx.orm` to read inside it. */
export async function schemeTimeZone(schemeId: string, orm: typeof db.orm = db.orm): Promise<string> {
  const scheme = await orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) throw new SchemeNotFoundError();
  return timeZoneOf(scheme);
}

/** Today (YYYY-MM-DD) in a building's time zone. */
export async function schemeToday(schemeId: string, now: Date = new Date(), orm: typeof db.orm = db.orm): Promise<string> {
  return todayIn(await schemeTimeZone(schemeId, orm), now);
}

/** The time zones of several buildings, by building id. */
export async function schemeTimeZones(schemeIds: readonly string[], orm: typeof db.orm = db.orm): Promise<Map<string, string>> {
  const ids = [...new Set(schemeIds)];
  if (!ids.length) return new Map();
  const rows = await orm.public.Scheme.where((s) => s.id.in(ids)).limit(ids.length).all();
  return new Map(rows.map((r) => [r.id, timeZoneOf(r)]));
}

export { PLATFORM_TIME_ZONE };
