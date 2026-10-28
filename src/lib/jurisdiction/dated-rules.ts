/**
 * Reading a rule that changes on a date (VIC, ACT and WA stage 2, PR 1,
 * 28 Oct 2026). Pure, with type imports only, so the browser can use it.
 *
 * A pack holds each such rule in DATED_RULES: every value it has had or will
 * have, each with where it stands in law (see DatedValue in
 * src/config/statutory/types.ts). `ruleInForceOn` gives the value in force on
 * a day, which is a day in the building's time zone (its today, or the day of
 * an event such as a meeting or a notice). It never switches a pending value
 * on early:
 * - a value read in the in-force text applies from its `from` day;
 * - an enacted or made value applies only from the `commencedOn` day a pack
 *   version records. Its fixed or latest start date passing does not switch
 *   it on. Once that date has passed the reader refuses the rule until the
 *   pack is checked against the Government Gazette or the legislation
 *   register and bumped; `pendingLawCheck` lists those rules;
 * - a Bill or an announcement never applies.
 * Where no value covers the day, it refuses (fails closed) rather than guess.
 * A value may record that there is no statutory rule (NO_STATUTORY_RULE),
 * which is not the same as no value being recorded.
 */
import type { DatedRule, DatedRules, DatedValue, PendingDatedValue } from "@/config/statutory";
import { dayIn, formatDateIn, isCalendarDay } from "./time-zone";

/** No value of a dated rule is recorded as in force on the day asked for. */
export class NoRuleInForceError extends Error {
  constructor(
    readonly title: string,
    readonly day: string,
  ) {
    super(`No value of "${title}" is recorded as in force on ${day}, so StrataVerze cannot apply it.`);
    this.name = "NoRuleInForceError";
  }
}

/**
 * The day a value starts to apply, or null if it never applies as recorded:
 * an in-force value from `from`, an enacted or made value from its recorded
 * `commencedOn` only, and a Bill or an announcement never (whatever else is
 * set on it).
 */
export function appliesFrom(version: DatedValue<unknown>): string | null {
  switch (version.legalStatus) {
    case "IN_FORCE":
      return version.from;
    case "ENACTED_NOT_COMMENCED":
    case "MADE_NOT_COMMENCED":
      return version.commencedOn;
    default:
      return null;
  }
}

/** The day a pending value is due to start (its fixed start date, else its latest), and which it is, or null if neither is known. */
export function dueDate(version: PendingDatedValue<unknown>): { day: string; by: "FIXED_START_DATE" | "LATEST_START_DATE" } | null {
  if (version.fixedStartDate) return { day: version.fixedStartDate, by: "FIXED_START_DATE" };
  if (version.latestStartDate) return { day: version.latestStartDate, by: "LATEST_START_DATE" };
  return null;
}

const isPending = (v: DatedValue<unknown>): v is PendingDatedValue<unknown> => v.legalStatus === "ENACTED_NOT_COMMENCED" || v.legalStatus === "MADE_NOT_COMMENCED";

/** Pending values whose fixed or latest start date is on or before `day` but whose commencement no pack version records. */
function dueButUnconfirmed(rule: DatedRule<unknown>, day: string): PendingDatedValue<unknown>[] {
  return rule.versions.filter((v): v is PendingDatedValue<unknown> => {
    if (!isPending(v) || v.commencedOn !== null) return false;
    const due = dueDate(v);
    return due !== null && due.day <= day;
  });
}

/** The type of a dated rule's values (any of its versions). */
export type DatedValueOf<R extends DatedRule<unknown>> = R["versions"][number]["value"];

/** The value of a dated rule in force on a day, with the version it comes from. */
export interface RuleOnDay<T> {
  value: T;
  version: DatedValue<T>;
  /** The day that value started to apply. */
  appliesFrom: string;
  /**
   * Values due to have started by the day (their fixed or latest start date
   * has passed) whose commencement no pack version records. Empty unless the
   * caller passed `allowUnconfirmed`: by default the reader refuses instead.
   * They are never applied; `value` is the one in force as recorded.
   */
  unconfirmed: readonly PendingDatedValue<T>[];
}

/** Options for reading a dated rule. */
export interface RuleReadOptions {
  /**
   * Give the value in force as recorded even when a later value's fixed or
   * latest start date has passed without a recorded commencement, with those
   * values in `unconfirmed`. Only for reports and checks, never to apply a rule.
   */
  allowUnconfirmed?: boolean;
}

/** Two values of a dated rule start on the same day, so which applies is not known. */
export class SameDayValuesError extends Error {
  constructor(
    readonly title: string,
    readonly from: string,
  ) {
    super(`Two values of "${title}" start on ${from}, so StrataVerze cannot tell which applies. The pack needs correcting.`);
    this.name = "SameDayValuesError";
  }
}

/**
 * A later value of a dated rule was due to start by the day asked for (its
 * fixed or latest start date has passed), but no pack version records that it
 * commenced, so the value recorded as in force may be out of date.
 */
export class UnconfirmedCommencementError extends Error {
  constructor(
    readonly title: string,
    readonly day: string,
    readonly dueOn: string,
  ) {
    super(
      `"${title}" may have changed: a new value was due to start by ${formatDateIn("UTC", `${dueOn}T00:00:00Z`)}, but no pack version records that it commenced. ` +
        `The pack needs checking against the Government Gazette or the legislation register before this rule is applied on ${day}.`,
    );
    this.name = "UnconfirmedCommencementError";
  }
}

/** The day a value applies from, refusing one recorded with a malformed day. */
function checkedStart(rule: DatedRule<unknown>, version: DatedValue<unknown>): string | null {
  const from = appliesFrom(version);
  if (from !== null && (typeof from !== "string" || !isCalendarDay(from))) throw new RangeError(`A value of "${rule.title}" has a start day that is not a date: ${String(from)}`);
  return from;
}

/**
 * The value of `rule` in force on `day` (YYYY-MM-DD in the building's time
 * zone). Fails closed:
 * - NoRuleInForceError when no value covers the day;
 * - SameDayValuesError when the latest values to start by then start on the same day;
 * - UnconfirmedCommencementError when a later value's fixed or latest start
 *   date has passed but no pack version records its commencement (unless
 *   `allowUnconfirmed`);
 * - RangeError for a day, or a recorded start day, that is not a date.
 */
export function ruleInForceOn<R extends DatedRule<unknown>>(rule: R, day: string, options: RuleReadOptions = {}): RuleOnDay<DatedValueOf<R>> {
  if (!isCalendarDay(day)) throw new RangeError(`Not a date: ${day}`);
  let best: { version: DatedValue<unknown>; from: string } | null = null;
  let tied = false;
  for (const version of rule.versions) {
    const from = checkedStart(rule, version);
    if (from === null || from > day) continue;
    if (!best || from > best.from) {
      best = { version, from };
      tied = false;
    } else if (from === best.from) {
      tied = true;
    }
  }
  if (!best) throw new NoRuleInForceError(rule.title, day);
  if (tied) throw new SameDayValuesError(rule.title, best.from);
  const unconfirmed = dueButUnconfirmed(rule, day);
  if (unconfirmed.length && !options.allowUnconfirmed) {
    const due = unconfirmed.map((v) => dueDate(v)?.day ?? day).sort()[0];
    throw new UnconfirmedCommencementError(rule.title, day, due);
  }
  const found: RuleOnDay<unknown> = { value: best.version.value, version: best.version, appliesFrom: best.from, unconfirmed };
  return found as RuleOnDay<DatedValueOf<R>>;
}

/** The value of `rule` in force at an instant, on the day it falls on in the building's time zone `tz` (see `ruleInForceOn`). */
export function ruleInForceAt<R extends DatedRule<unknown>>(
  rule: R,
  tz: string,
  instant: Date | string | number = new Date(),
  options: RuleReadOptions = {},
): RuleOnDay<DatedValueOf<R>> {
  return ruleInForceOn(rule, dayIn(tz, instant), options);
}

/** A pending value that should have started by now but whose commencement no pack version records. */
export interface UnconfirmedCommencement {
  /** The rule's key in the pack's DATED_RULES. */
  ruleKey: string;
  title: string;
  legalStatus: PendingDatedValue<unknown>["legalStatus"];
  /** The day it was due to start. */
  dueOn: string;
  /** Whether `dueOn` is the day the instrument fixes, or the latest day it can start. */
  dueBy: "FIXED_START_DATE" | "LATEST_START_DATE";
  commencement: string;
  source: string;
  pendingChange?: string;
}

/**
 * The pending law check: every dated rule in a pack (any pack, active or
 * pending) with a value whose fixed or latest start date is on or before
 * `today` but whose commencement no pack version records. None of them is
 * applied. `today` is YYYY-MM-DD: the building's today, or the day in the
 * jurisdiction's time zone for a check of the pack itself.
 */
export function pendingLawCheck(rules: object, today: string): UnconfirmedCommencement[] {
  if (!isCalendarDay(today)) throw new RangeError(`Not a date: ${today}`);
  // Any pack's rules: a pack without DATED_RULES (NSW, Queensland) has none.
  const dated = (rules as { DATED_RULES?: DatedRules }).DATED_RULES ?? {};
  const found: UnconfirmedCommencement[] = [];
  for (const [ruleKey, rule] of Object.entries(dated)) {
    for (const v of dueButUnconfirmed(rule, today)) {
      const due = dueDate(v);
      if (!due) continue;
      found.push({ ruleKey, title: rule.title, legalStatus: v.legalStatus, dueOn: due.day, dueBy: due.by, commencement: v.commencement, source: v.source, ...(v.pendingChange ? { pendingChange: v.pendingChange } : {}) });
    }
  }
  return found.sort((a, b) => (a.dueOn === b.dueOn ? a.ruleKey.localeCompare(b.ruleKey) : a.dueOn < b.dueOn ? -1 : 1));
}

/** The warning for one item of the pending law check, in plain words, for the person who maintains the pack. */
export function pendingLawWarning(item: UnconfirmedCommencement, jurisdiction: string): string {
  const day = formatDateIn("UTC", `${item.dueOn}T00:00:00Z`);
  const which = item.dueBy === "FIXED_START_DATE" ? "the start date it fixes" : "the latest day it can start";
  return (
    `${jurisdiction}: "${item.title}" was due to start on ${day} (${which}), but no pack version records that it commenced, ` +
    `so StrataVerze still applies the earlier rule. Check the Government Gazette or the legislation register, then record the day it commenced in a new pack version.`
  );
}

/**
 * Problems with how a dated rule is recorded, for the pack tests: a day that
 * is not a calendar day, values out of order, two values starting on the same
 * day, a start date after the latest start date, or a Bill or announcement
 * with a start day set.
 */
export function datedRuleProblems(key: string, rule: DatedRule<unknown>): string[] {
  const problems: string[] = [];
  if (!rule.title.trim()) problems.push(`${key}: no title`);
  if (!rule.versions.length) problems.push(`${key}: no values`);
  const starts: string[] = [];
  let lastInForce = "";
  rule.versions.forEach((v, i) => {
    const at = `${key} value ${i + 1}`;
    if (!v.source.trim()) problems.push(`${at}: no source`);
    const loose = v as unknown as Record<string, unknown>;
    for (const field of ["from", "commencedOn", "fixedStartDate", "latestStartDate", "presentedOn"]) {
      const d = loose[field];
      if (d != null && (typeof d !== "string" || !isCalendarDay(d))) problems.push(`${at}: ${field} is not a date`);
    }
    if (v.legalStatus === "IN_FORCE") {
      if (v.from < lastInForce) problems.push(`${at}: in force values are not oldest first`);
      lastInForce = v.from;
    }
    if (isPending(v) && v.fixedStartDate && v.latestStartDate && v.fixedStartDate > v.latestStartDate) problems.push(`${at}: fixed start date after the latest start date`);
    if ((v.legalStatus === "NOT_LAW" || v.legalStatus === "ANNOUNCED_NO_LEGISLATION") && (loose.from != null || loose.commencedOn != null)) {
      problems.push(`${at}: a Bill or an announcement has a start day set`);
    }
    const from = appliesFrom(v);
    if (from !== null) {
      if (starts.includes(from)) problems.push(`${key}: two values start on ${from}`);
      starts.push(from);
    }
  });
  return problems;
}
