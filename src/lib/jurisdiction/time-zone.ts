/**
 * Time zones (multi-jurisdiction plan, phase 1c, 26 Oct 2026). Pure, so it
 * can be used in the browser too.
 *
 * Every building has its own time zone (`schemes.time_zone`), set from its
 * state and postcode when it is created. A building's dates (today, a due
 * date, the date of a payment or an interest charge) are days in that time
 * zone, so a deadline falls on the same day for the building wherever the
 * server runs. Dates that belong to StrataVerze itself (platform billing,
 * contractor accounts, the admin pages) use PLATFORM_TIME_ZONE.
 *
 * Never take "today" from `new Date().toISOString()`: that is the date in
 * UTC, which in Sydney is the day before until 10 or 11 am.
 */

/** StrataVerze's own time zone, for dates that belong to no building. */
export const PLATFORM_TIME_ZONE = "Australia/Sydney";

/**
 * A building's time zone from its state and postcode, or null for a state
 * without one listed.
 *
 * NSW is on Sydney time except two areas (to be confirmed against the
 * Standard Time Act 1987 (NSW) before a building there is set up; not checked
 * on 26 Oct 2026):
 * - Broken Hill (postcode 2880) keeps South Australian (central) time:
 *   Australia/Broken_Hill. Not every locality with postcode 2880 may be in
 *   that area.
 * - Lord Howe Island (postcode 2898): Australia/Lord_Howe.
 */
export function defaultTimeZone(state: string | null | undefined, postcode: string | null | undefined): string | null {
  const s = (state ?? "").trim().toUpperCase();
  const p = (postcode ?? "").trim();
  switch (s) {
    case "NSW":
      if (p === "2880") return "Australia/Broken_Hill";
      if (p === "2898") return "Australia/Lord_Howe";
      return "Australia/Sydney";
    case "ACT":
      return "Australia/Sydney";
    case "VIC":
      return "Australia/Melbourne";
    case "QLD":
      return "Australia/Brisbane";
    case "SA":
      return "Australia/Adelaide";
    case "WA":
      return "Australia/Perth";
    case "TAS":
      return "Australia/Hobart";
    case "NT":
      return "Australia/Darwin";
    default:
      return null;
  }
}

/** Whether `tz` is a time zone this runtime knows (IANA name). */
export function isTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `tz` when it is a real time zone, else `fallback`. */
export function zoneOr(tz: unknown, fallback: string): string {
  return typeof tz === "string" && isTimeZone(tz) ? tz : fallback;
}

/**
 * A meeting's time zone (recorded on the meeting when it is set up, from the
 * building's), or `fallback` when none or an unknown one is recorded.
 */
export function meetingZone(meeting: { timezone?: unknown } | null | undefined, fallback: string = PLATFORM_TIME_ZONE): string {
  return zoneOr(meeting?.timezone, fallback);
}

/** The day (YYYY-MM-DD) an instant falls on in `tz`. */
export function dayIn(tz: string, instant: Date | string | number = new Date()): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Not a date: ${String(instant)}`);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Today (YYYY-MM-DD) in `tz`. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return dayIn(tz, now);
}

/** Today in StrataVerze's own time zone, for dates that belong to no building. */
export function platformToday(now: Date = new Date()): string {
  return todayIn(PLATFORM_TIME_ZONE, now);
}

/**
 * The day a stored timestamp falls on in `tz`. A value that is already a
 * plain date (YYYY-MM-DD) is returned as it is, and an empty value as "".
 */
export function storedDayIn(tz: string, value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return dayIn(tz, value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : dayIn(tz, d);
}

/** The UTC offset of `tz` at an instant, as "+10:00". */
export function offsetIn(tz: string, at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+00:00";
}

/**
 * The instant that is midnight at the start of `day` (YYYY-MM-DD) in `tz`,
 * as an ISO timestamp with that zone's offset, for example
 * "2026-10-26T00:00:00+11:00".
 */
export function startOfDayIn(tz: string, day: string): string {
  // The offset in force at local midnight. Start from the offset at midnight
  // UTC, then take the offset at the instant that guess gives, until they
  // agree (on a daylight saving change day the first guess is the wrong one).
  let offset = offsetIn(tz, new Date(`${day}T00:00:00Z`));
  for (let i = 0; i < 3; i++) {
    const next = offsetIn(tz, new Date(`${day}T00:00:00${offset}`));
    if (next === offset) break;
    offset = next;
  }
  return `${day}T00:00:00${offset}`;
}

/** The last minute (11.59 pm) of `day` (YYYY-MM-DD) in `tz`, as an instant, or null for a bad date. */
export function endOfDayIn(tz: string, day: string): Date | null {
  if (!isCalendarDay(day)) return null;
  const midnight = new Date(startOfDayIn(tz, day));
  if (Number.isNaN(midnight.getTime())) return null;
  // The next local midnight, less a minute (a day can be 23 or 25 hours long).
  const nextDay = dayIn(tz, new Date(midnight.getTime() + 36 * 3_600_000));
  return new Date(new Date(startOfDayIn(tz, nextDay)).getTime() - 60_000);
}

/**
 * The instant a local date and time (as a datetime-local input gives it,
 * "YYYY-MM-DDTHH:mm") is in `tz`, as an ISO timestamp, or null if it is not
 * one. Never parse such a value with `new Date(value)` on the server: that
 * reads it in the server's own time zone (UTC on Vercel).
 */
export function localToInstant(tz: string, local: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m || !isCalendarDay(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] ?? 0) > 59) return null;
  const wall = `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}`;
  // The wall-clock time read with each of the zone's offsets that day (they
  // differ only on a daylight saving change day). Keep the one that really
  // reads as that wall-clock time; in the repeated hour both do, and the
  // later (standard time) one is taken; in the skipped hour neither does,
  // and the time is read with the offset before the change (2.30 am becomes
  // 3.30 am daylight time), as clocks do.
  // Every offset the zone uses within 15 hours either side (any Australian or New Zealand offset is within that).
  const around = new Date(`${wall}Z`).getTime();
  const offsets = new Set<string>();
  for (let h = -15; h <= 15; h += 3) offsets.add(offsetIn(tz, new Date(around + h * 3_600_000)));
  const candidates = [...offsets].map((o) => new Date(`${wall}${o}`)).filter((d) => !Number.isNaN(d.getTime()));
  if (!candidates.length) return null;
  const exact = candidates.filter((d) => instantToLocalInput(tz, d) === wall.slice(0, 16));
  // Repeated hour: the later instant (standard time). Skipped hour: the later
  // instant too, which is the time read with the smaller offset in force before the change.
  const pick = exact.length ? exact : candidates;
  return new Date(Math.max(...pick.map((d) => d.getTime()))).toISOString();
}

/** Whether YYYY-MM-DD is a real calendar day (no 30 February). */
export function isCalendarDay(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** An instant as a datetime-local input value ("YYYY-MM-DDTHH:mm") in `tz`, or "" for none. */
export function instantToLocalInput(tz: string, value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Date and time in `tz`, Australian style ("26 Oct 2026, 3:05 pm"). */
export function formatDateTimeIn(tz: string, value: Date | string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", ...opts, timeZone: tz });
}

/** A date in `tz`, Australian style ("26 Oct 2026"). */
export function formatDateIn(tz: string, value: Date | string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", ...opts, timeZone: tz });
}
