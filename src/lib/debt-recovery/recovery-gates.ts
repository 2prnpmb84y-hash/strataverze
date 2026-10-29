/**
 * The draft packs' debt recovery gates (VIC, ACT and WA stage 2, PR 9a,
 * 29 Oct 2026), pure. They read the pack's DEBT_RECOVERY keys `forum`,
 * `authorityToSue` and (since PR 9b) `statutoryCharge`
 * (src/config/statutory/types.ts) and decide, before anything is written,
 * whether a case may be opened, a step completed, a case marked as referred
 * for legal recovery or closed, a charge's revocation recorded, and what a
 * step must record. This module imports no pack: the server actions pass the
 * building's rules.
 *
 * NSW and Queensland are unchanged: a pack with none of the gate keys
 * (recoveryGatesApply false) gets null from every function here, before
 * anything is read.
 *
 * Since PR 9c (Victoria) they also apply `stepTiming`, `finalNotice`,
 * `appliesWhen` and authorityToSue's `amountThreshold`, and read the pack's
 * DATED_RULES for a step a pending law would pause.
 *
 * Fails closed:
 * - a gate key StrataVerze does not apply (a statutoryCharge revocation
 *   deadline, revocation.withinDays with a value; a timing rule counted from a
 *   notice other than the pack's final notice), or a key not in the shared
 *   shape, refuses every action;
 * - appliesWhen (PR 9c): opening a case is refused where the building's
 *   condition is false or cannot be worked out;
 * - amountThreshold (PR 9c): with no comparator value, or no amount for it,
 *   only the `above` resolution decides; where the amount owing when
 *   proceedings are started is more than the amount recorded with the
 *   decision, or either is not known, the step is refused;
 * - stepTiming (PR 9c): a step is refused before day N + 1 after the day it is
 *   counted from (the latest overdue notice's issue day, only notices issued
 *   under the building's pack counting; or the day the final notice was
 *   recorded as given), a value with none refuses, and once the dated rule
 *   that would pause it may have started (recorded as in force or commenced,
 *   or its fixed or latest start date passed) it is refused: the pause is not
 *   supported yet;
 * - finalNotice (PR 9c): StrataVerze never produces it, and completing its
 *   step is refused unless a notice given outside StrataVerze may be recorded
 *   (givenOutsideMayBeRecorded true), with the day it was given;
 * - a CheckedValue with no value refuses the action that needs it, with the
 *   pack's note as the reason (authorityToSue.accepted with none refuses
 *   every legal referral);
 * - the authority must be a recorded resolution, never the adviser alone;
 * - only a forum option the pack confirms (CONFIRMED or STRATAVERZE) may be
 *   recorded; an excluded forum (Western Australia's SAT) is refused with the
 *   pack's reason; a forum limit is never applied;
 * - the statutory charge (PR 9b): its step records that a charge was declared
 *   (by a resolution the pack accepts, checked as the authority is) and
 *   lodged, or that none was; a lodged charge blocks closing the case, and
 *   completing its Closed step, until its revocation is recorded as lodged
 *   (with no value for which closings it blocks, every closing); a revocation is recorded only for a lodged charge
 *   not yet revoked, not before it was lodged and not after the building's day.
 *
 * The order of the steps is not checked here: the step order check
 * (stepCompletionProblem, src/lib/auth/debt-recovery-access.ts) applies to
 * every pack, under the case lock.
 */
import type { StatutoryRules } from "@/config/statutory";
import { auDate, parseIsoDate } from "@/lib/onboarding/property-onboarding";

/** The pack's recovery rules, and (PR 9c) its dated rules, which a step a pending law would pause reads. */
type Rules = Pick<StatutoryRules, "DEBT_RECOVERY"> & Partial<Pick<StatutoryRules, "DATED_RULES">>;
type RecoveryRules = NonNullable<StatutoryRules["DEBT_RECOVERY"]>;
type ForumRule = NonNullable<RecoveryRules["forum"]>;
type AuthorityRule = NonNullable<RecoveryRules["authorityToSue"]>;
type TimingRule = NonNullable<RecoveryRules["stepTiming"]>[number];
type FinalNoticeRule = NonNullable<RecoveryRules["finalNotice"]>;
/** A resolution a pack accepts as the decision to start proceedings. */
export type DebtAuthorityResolution = NonNullable<AuthorityRule["accepted"]["value"]>[number];

/** Every key of DEBT_RECOVERY the gates read. A pack with none of them has no gates. */
export const RECOVERY_GATE_KEYS = ["forum", "authorityToSue", "stepTiming", "finalNotice", "statutoryCharge", "appliesWhen"] as const;

const CHECKED = new Set(["CONFIRMED", "STRATAVERZE"]);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isCheckedValue = (v: unknown): v is Record<string, unknown> & { value: unknown } => isObject(v) && has(v, "value") && typeof v.status === "string";
/** A real calendar day written YYYY-MM-DD. */
const isDay = (v: string | null | undefined): v is string => parseIsoDate(v) != null && /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");
/** The day `n` days after `day` (YYYY-MM-DD, calendar days). */
const addDays = (day: string, n: number) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n)).toISOString().slice(0, 10);

/** Whether a value is one resolution in the shared shape. */
const isResolution = (x: unknown) =>
  isObject(x) && ["GENERAL", "COMMITTEE"].includes(String(x.meeting)) && ["ANY", "ORDINARY", "SPECIAL"].includes(String(x.kind)) && typeof x.words === "string";

/** Whether a CheckedValue's value is a list of resolutions in the shared shape (no value passes: it refuses where it is needed). */
function resolutionsInShape(checked: unknown): boolean {
  const value = (checked as { value: unknown }).value;
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  return (value as unknown[]).every(isResolution);
}

/** Whether the pack has any gate key, so the gates apply. False for NSW and Queensland. */
export function recoveryGatesApply(rules: Rules): boolean {
  const r = rules.DEBT_RECOVERY;
  return !!r && RECOVERY_GATE_KEYS.some((k) => has(r, k));
}

const NOT_SUPPORTED = "Debt recovery for this building needs rules StrataVerze does not apply yet, so this is refused. Nothing was saved.";
const NOT_IN_SHAPE = "This building's debt recovery rules are not in the shape StrataVerze applies, so this is refused. Nothing was saved.";

/**
 * Why the pack's gate keys cannot be applied at all, or null. Checked first
 * by every gate: a key StrataVerze does not apply, or a key not in the shared
 * shape (such as the ACT pack's own forum and charge fields before PR 9b moved
 * them), refuses.
 */
function rulesProblem(r: RecoveryRules): string | null {
  if (has(r, "appliesWhen")) {
    const w = r.appliesWhen as unknown;
    if (!isObject(w) || !isObject(w.when) || typeof w.refusal !== "string" || typeof w.unknown !== "string") return NOT_IN_SHAPE;
  }
  if (has(r, "finalNotice")) {
    const f = r.finalNotice as unknown;
    if (
      !isObject(f) ||
      typeof f.stepType !== "string" ||
      typeof f.words !== "string" ||
      f.noticeType !== "FINAL_FEE_NOTICE" ||
      !Array.isArray(f.contents) ||
      !isObject(f.form) ||
      typeof f.form.title !== "string" ||
      !isCheckedValue(f.form.required) ||
      !isCheckedValue(f.form.appliedFrom) ||
      !isCheckedValue(f.givenOutsideMayBeRecorded) ||
      !isCheckedValue(f.dailyInterestRounding)
    ) {
      return NOT_IN_SHAPE;
    }
    const outside = f.givenOutsideMayBeRecorded.value;
    if (outside != null && typeof outside !== "boolean") return NOT_IN_SHAPE;
    const rounding = f.dailyInterestRounding.value;
    if (rounding != null && rounding !== "CENT") return NOT_IN_SHAPE;
  }
  if (has(r, "stepTiming")) {
    if (!Array.isArray(r.stepTiming)) return NOT_IN_SHAPE;
    for (const t of r.stepTiming as unknown[]) {
      if (!isObject(t) || typeof t.stepType !== "string" || typeof t.words !== "string" || !isCheckedValue(t.days) || !isCheckedValue(t.earliest) || !isObject(t.after)) return NOT_IN_SHAPE;
      const days = t.days.value;
      if (days != null && !(typeof days === "number" && Number.isInteger(days) && days >= 0)) return NOT_IN_SHAPE;
      if (t.earliest.value != null && t.earliest.value !== "DAY_AFTER_PERIOD") return NOT_IN_SHAPE;
      if (has(t, "forums") && !(Array.isArray(t.forums) && (t.forums as unknown[]).every((x) => typeof x === "string"))) return NOT_IN_SHAPE;
      if (has(t, "pausedBy") && typeof t.pausedBy !== "string") return NOT_IN_SHAPE;
      // A timing rule by forum belongs on the step that records the forum.
      if (has(t, "forums") && (!isObject(r.forum) || r.forum.recordedAtStep !== t.stepType)) return NOT_IN_SHAPE;
      if (t.after.kind === "EACH_OVERDUE_NOTICE_ISSUED") continue;
      if (t.after.kind !== "STEP_NOTICE_SENT" || typeof t.after.stepType !== "string") return NOT_IN_SHAPE;
      // Only the pack's final notice is recorded as given on a case: counting from any other notice is not supported.
      if (!isObject(r.finalNotice) || r.finalNotice.stepType !== t.after.stepType) return NOT_SUPPORTED;
    }
  }
  if (has(r, "forum")) {
    const f = r.forum as unknown;
    if (!isObject(f) || typeof f.recordedAtStep !== "string" || !Array.isArray(f.options) || !Array.isArray(f.excluded)) return NOT_IN_SHAPE;
    for (const o of f.options as unknown[]) if (!isObject(o) || typeof o.key !== "string" || typeof o.words !== "string" || typeof o.status !== "string") return NOT_IN_SHAPE;
    for (const x of f.excluded as unknown[]) if (!isObject(x) || typeof x.key !== "string" || typeof x.words !== "string" || typeof x.reason !== "string") return NOT_IN_SHAPE;
  }
  if (has(r, "authorityToSue")) {
    const a = r.authorityToSue as unknown;
    if (!isObject(a) || typeof a.recordedAtStep !== "string" || !isCheckedValue(a.accepted) || !isCheckedValue(a.managerMayDecide)) return NOT_IN_SHAPE;
    if (!resolutionsInShape(a.accepted)) return NOT_IN_SHAPE;
    if (has(a, "amountThreshold")) {
      const t = a.amountThreshold;
      if (
        !isObject(t) ||
        typeof t.multiple !== "number" ||
        !Number.isFinite(t.multiple) ||
        !(t.multiple > 0) ||
        typeof t.words !== "string" ||
        !isCheckedValue(t.comparator) ||
        !isResolution(t.upTo) ||
        !isResolution(t.above)
      ) {
        return NOT_IN_SHAPE;
      }
      const comparator = t.comparator.value;
      if (comparator != null && comparator !== "SCHEME_CURRENT_ANNUAL_FEES" && comparator !== "LOT_CURRENT_ANNUAL_FEES") return NOT_IN_SHAPE;
      // Both resolutions the threshold chooses between must be ones the pack accepts.
      const accepted = a.accepted.value;
      if (Array.isArray(accepted) && ![t.upTo, t.above].every((x) => (accepted as DebtAuthorityResolution[]).some((y) => sameResolution(y, x as DebtAuthorityResolution)))) {
        return NOT_IN_SHAPE;
      }
    }
  }
  if (has(r, "statutoryCharge")) {
    const c = r.statutoryCharge as unknown;
    if (
      !isObject(c) ||
      c.stepType !== "STATUTORY_CHARGE" ||
      typeof c.words !== "string" ||
      typeof c.lodgedWith !== "string" ||
      !isCheckedValue(c.declaredBy) ||
      !resolutionsInShape(c.declaredBy) ||
      !isObject(c.revocation) ||
      !isCheckedValue(c.revocation.required) ||
      !isCheckedValue(c.revocation.withinDays) ||
      !isCheckedValue(c.closeBlockedUntilRevoked)
    ) {
      return NOT_IN_SHAPE;
    }
    const blocks = (c.closeBlockedUntilRevoked as { value: unknown }).value;
    if (blocks != null && blocks !== "ANY_CLOSE" && blocks !== "PAID_OR_SETTLED") return NOT_IN_SHAPE;
    // A deadline for the revocation is not applied yet: a pack that sets one is refused. With none, no deadline is checked.
    if ((c.revocation.withinDays as { value: unknown }).value != null) return NOT_SUPPORTED;
  }
  return null;
}

/** What completing a step must record, as the pack sets it. */
export interface RecoveryStepNeeds {
  /** The resolution that decided to start proceedings: the accepted kinds, and how the screens say them. */
  authority: { accepted: readonly DebtAuthorityResolution[]; words: string } | null;
  /** Where proceedings were started: the options that may be recorded, and the notes advisers are shown. */
  forum: { options: readonly { key: string; words: string }[]; notes: readonly string[] } | null;
  /**
   * The statutory charge (PR 9b): whether one was declared, by which resolution and when it was lodged. Present
   * only on the pack's charge step, so other steps' needs are unchanged.
   */
  charge?: { declaredBy: readonly DebtAuthorityResolution[]; declaredWords: string; words: string; lodgedWith: string };
  /**
   * The final notice (PR 9c), present only on its step and only where a notice given outside StrataVerze may be
   * recorded: how the screens name it, and that the day it was given is asked for.
   */
  finalNotice?: { words: string };
}

/** "a motion carried at a council meeting or a motion carried at a general meeting". */
export const authorityWords = (accepted: readonly DebtAuthorityResolution[]) => accepted.map((a) => a.words).join(" or ");
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * The resolutions that may decide to start proceedings for a claim of
 * `claimCents` (PR 9c), or a refusal where the pack accepts none. Without an
 * amount threshold, every resolution the pack accepts. With one: where the
 * comparator has no value, or its amount or the claim is not known, only the
 * `above` resolution (the threshold cannot be applied, so the stricter
 * resolution decides); otherwise a claim of no more than `multiple` times the
 * comparator's amount may be decided by `upTo` or `above`, and a larger one
 * only by `above`. Amounts in whole cents.
 */
export function authorityNeeded(rule: AuthorityRule, claimCents: number | null, comparatorCents: number | null): readonly DebtAuthorityResolution[] | { problem: string } {
  const accepted = rule.accepted.value;
  if (accepted == null || accepted.length === 0) {
    return { problem: `Who may decide to start proceedings is not confirmed for this building. ${accepted == null ? rule.accepted.note : ""}`.trim() };
  }
  const t = rule.amountThreshold;
  if (!t) return accepted;
  const known = (n: number | null): n is number => n != null && Number.isFinite(n) && n >= 0;
  if (t.comparator.value == null || !known(comparatorCents) || !known(claimCents)) return [t.above];
  if (claimCents > t.multiple * comparatorCents) return [t.above];
  return sameResolution(t.upTo, t.above) ? [t.upTo] : [t.upTo, t.above];
}

/** The resolutions the decision step offers before an amount is known (PR 9c): with a threshold whose comparator has no value, only `above`. */
function offeredResolutions(rule: AuthorityRule): readonly DebtAuthorityResolution[] | null {
  const accepted = rule.accepted.value;
  if (accepted == null || accepted.length === 0) return null;
  const t = rule.amountThreshold;
  return t && t.comparator.value == null ? [t.above] : accepted;
}

/**
 * Why completing the final notice step is refused (PR 9c): StrataVerze never
 * produces the notice yet, and one given outside StrataVerze may be recorded
 * only where the pack says so. Each reason from the pack.
 */
function finalNoticeRefusal(f: FinalNoticeRule): string {
  const why: string[] = [];
  if (f.form.required.value === true) why.push(`it must be in the approved form (${f.form.title}), which StrataVerze cannot produce yet`);
  else if (f.form.required.value == null) why.push(`whether it must be in an approved form is not confirmed (${lowerFirst(sentence(f.form.required.note)).replace(/\.$/, "")}), and StrataVerze cannot produce it yet`);
  else why.push("StrataVerze cannot produce it yet");
  if (f.form.appliedFrom.value == null) why.push(lowerFirst(sentence(f.form.appliedFrom.note)).replace(/\.$/, ""));
  const outside = f.givenOutsideMayBeRecorded;
  const outsideWhy = outside.value == null ? ` ${sentence(capitalise(outside.note))}` : outside.note ? ` ${sentence(capitalise(outside.note))}` : "";
  return `StrataVerze cannot give ${f.words} yet: ${why.join(", and ")}. ${capitalise(f.words)}, if given outside StrataVerze, cannot be recorded either.${outsideWhy} So this step cannot be completed. Nothing was saved.`;
}

/**
 * What completing `stepType` must record under the pack's rules, a refusal,
 * or null where the step records nothing (always null for NSW and
 * Queensland, and for a pack with no gate keys).
 */
export function recoveryStepNeeds(rules: Rules, stepType: string): RecoveryStepNeeds | { problem: string } | null {
  if (!recoveryGatesApply(rules)) return null;
  const r = rules.DEBT_RECOVERY!;
  const problem = rulesProblem(r);
  if (problem) return { problem };
  let authority: RecoveryStepNeeds["authority"] = null;
  let forum: RecoveryStepNeeds["forum"] = null;
  let charge: RecoveryStepNeeds["charge"];
  let finalNotice: RecoveryStepNeeds["finalNotice"];
  const a = r.authorityToSue;
  if (a && a.recordedAtStep === stepType) {
    const offered = offeredResolutions(a);
    if (offered == null) {
      return { problem: `Who may decide to start proceedings is not confirmed for this building, so this step cannot be completed. ${a.accepted.value == null ? a.accepted.note : ""}`.trim() };
    }
    authority = { accepted: offered, words: authorityWords(offered) };
  }
  const f = r.forum;
  if (f && f.recordedAtStep === stepType) {
    const options = f.options.filter((o) => CHECKED.has(o.status));
    if (options.length === 0) return { problem: "Where proceedings may be brought is not confirmed for this building, so this step cannot be completed." };
    forum = { options: options.map((o) => ({ key: o.key, words: o.words })), notes: forumNotes(f) };
  }
  const c = r.statutoryCharge;
  if (c && c.stepType === stepType) {
    if (c.declaredBy.value == null || c.declaredBy.value.length === 0) {
      return { problem: `Who may declare ${c.words} is not confirmed for this building, so this step cannot be completed. ${c.declaredBy.value == null ? c.declaredBy.note : ""}`.trim() };
    }
    charge = { declaredBy: c.declaredBy.value, declaredWords: authorityWords(c.declaredBy.value), words: c.words, lodgedWith: c.lodgedWith };
  }
  const fn = r.finalNotice;
  if (fn && fn.stepType === stepType) {
    // StrataVerze never produces the final notice yet; one given outside it is recorded only where the pack says so.
    if (fn.givenOutsideMayBeRecorded.value !== true) return { problem: finalNoticeRefusal(fn) };
    finalNotice = { words: fn.words };
  }
  if (!authority && !forum && !charge && !finalNotice) return null;
  return { authority, forum, ...(charge ? { charge } : {}), ...(finalNotice ? { finalNotice } : {}) };
}

/** What advisers are shown beside the forum: each guidance limit (never applied), each option not confirmed, and where proceedings may not go. */
function forumNotes(f: ForumRule): string[] {
  const notes: string[] = [];
  for (const o of f.options) {
    if (!CHECKED.has(o.status)) notes.push(`Guidance, not confirmed: ${o.words}.`);
    if (o.limitCents && o.limitCents.value == null) notes.push(`Guidance, not confirmed, never applied: ${o.limitCents.note}`);
  }
  for (const x of f.excluded) notes.push(`Not ${x.words}: ${x.reason}.`);
  return notes;
}

/** The resolution the adviser chose, as the server found it (authorityResolution, src/lib/finance/resolutions.ts). */
export type AuthorityFact = { problem: string } | { problem: null; resolution: DebtAuthorityResolution; decidedOn: string; meetingId: string; itemId: string };

/** What the case already records (debt_recovery_records). */
export interface RecordedRecoveryFacts {
  authorityToSue: boolean;
  forum: string | null;
  /** The day the final notice was recorded as given (PR 9c), given only for a pack with a final notice; null where none is. */
  finalNoticeGivenOn?: string | null;
  /** The amount owing recorded with the decision to start proceedings (PR 9c), given only for a pack with an amount threshold. */
  authorisedAmount?: string | null;
}

/** One of the lot's overdue notices, for a step counted from the notices' issue days (PR 9c). */
export interface TimingNotice {
  /** The notice's number, to name it in a refusal. */
  number: string;
  /** The day it was issued, in the building's zone, or null where none is recorded. */
  issuedOn: string | null;
  /** The pack label it was issued under ("AU-VIC 2026.10.13"), or null. */
  rulePack: string | null;
  /** Brought across at takeover (a migration batch). */
  takeover: boolean;
}

/**
 * The statutory charge on a case, from its records (PR 9b): the day the latest
 * charge was lodged, and the day its revocation was lodged, if one was lodged
 * on or after it. Null days where none is recorded.
 */
export interface ChargeFacts {
  lodgedOn: string | null;
  revokedOn: string | null;
}

/**
 * A case's charge from its records, in any order (review L2: matched by the
 * days lodged, not by when the rows were recorded, so ties and ordering do
 * not matter). The charge is the one lodged latest; a revocation revokes it
 * only if it was lodged on or after that day (the latest such). A lodged day
 * is always recorded (migration 20261125's check); a row without a real one
 * is still a charge, outstanding until a revocation with a real day, and such
 * a revocation revokes nothing.
 */
export function chargeFacts(rows: readonly { kind: string; lodgedOn?: string | null }[]): ChargeFacts {
  const day = (r: { lodgedOn?: string | null }) => (isDay(r.lodgedOn) ? r.lodgedOn : "");
  const latest = (days: string[]) => days.reduce<string | null>((max, d) => (max == null || d > max ? d : max), null);
  const lodgedOn = latest(rows.filter((r) => r.kind === "STATUTORY_CHARGE_LODGED").map(day));
  if (lodgedOn == null) return { lodgedOn: null, revokedOn: null };
  const revokedOn = latest(rows.filter((r) => r.kind === "STATUTORY_CHARGE_REVOKED").map(day).filter((d) => d !== "" && d >= lodgedOn));
  return { lodgedOn, revokedOn };
}

/**
 * What the adviser chose at the charge step: no charge declared, or a charge
 * declared by the chosen resolution (as the server found it) and lodged on a day.
 */
export type ChargeChoice = { declared: false } | { declared: true; resolution: AuthorityFact; lodgedOn: string | null };

export type RecoveryGateInput =
  | {
      action: "INITIATE";
      /** Whether the pack's appliesWhen holds for the building (PR 9c): null where it cannot be worked out. Needed for a pack with appliesWhen. */
      applies?: boolean | null;
    }
  | {
      action: "COMPLETE_STEP";
      stepType: string;
      /** The case's steps, for which come after the step that records the authority. */
      caseSteps: readonly { stepType: string; stepOrder: number }[];
      /** The chosen resolution, or null where none was chosen. */
      authority: AuthorityFact | null;
      /** The forum key chosen, or null. */
      forum: string | null;
      recorded: RecordedRecoveryFacts;
      /** The building's day (YYYY-MM-DD). */
      today: string;
      /** The day the case was opened, in the building's zone (YYYY-MM-DD), or null where it is not known. */
      caseOpenedOn: string | null;
      /** The building's step names. */
      labels?: Readonly<Record<string, string>>;
      /** The charge step's choice (PR 9b), or null where none was made. */
      charge?: ChargeChoice | null;
      /** The case's charge (PR 9b), for the Closed step of a pack with a statutory charge, which is refused without it. */
      chargeOnCase?: ChargeFacts;
      /** The day the final notice was given, entered at its step (PR 9c), where one given outside StrataVerze may be recorded. */
      finalNoticeGivenOn?: string | null;
      /** The lot's overdue notices (PR 9c), for a step counted from their issue days; refused without them. */
      notices?: readonly TimingNotice[];
      /** The building's pack code ("AU-VIC"): only notices issued under it count (PR 9c). */
      packCode?: string;
      /** The lot's amount owing now, two decimals (PR 9c), for a pack with an amount threshold. */
      amountOwing?: string | null;
      /** The comparator's amount in cents (PR 9c), or null where StrataVerze does not work it out (it never does yet). */
      comparatorCents?: number | null;
    }
  | { action: "REFER_LEGAL"; recorded: RecordedRecoveryFacts; labels?: Readonly<Record<string, string>> }
  | {
      action: "CLOSE";
      /** The closing status chosen (CLOSED_PAID, CLOSED_SETTLED or CLOSED_WRITTEN_OFF). */
      status?: string;
      /** The case's charge (PR 9b): needed for a pack with a statutory charge, and refused without. */
      charge?: ChargeFacts;
    };

const sameResolution = (a: DebtAuthorityResolution, b: DebtAuthorityResolution) => a.meeting === b.meeting && a.kind === b.kind;

/**
 * Why the action is refused under the pack's recovery rules, or null. Null
 * at once for a pack with no gate keys (NSW, Queensland). Checks, in order:
 * the rules can be applied; for a step, its authority and forum; the
 * authority recorded before any step after it, and before the case is marked
 * as referred for legal recovery.
 */
export function recoveryGateProblem(rules: Rules, input: RecoveryGateInput): string | null {
  if (!recoveryGatesApply(rules)) return null;
  const r = rules.DEBT_RECOVERY!;
  const problem = rulesProblem(r);
  if (problem) return problem;
  if (input.action === "INITIATE") {
    // The buildings the rules apply to (PR 9c): false or unknown refuses.
    const w = r.appliesWhen;
    if (!w || input.applies === true) return null;
    return input.applies === false ? `${sentence(w.refusal)} A case cannot be opened. Nothing was saved.` : `${sentence(w.unknown)} A case cannot be opened. Nothing was saved.`;
  }
  if (input.action === "CLOSE") return chargeCloseProblem(rules, input);

  const a = r.authorityToSue;
  const authorityLabel = a ? (input.labels?.[a.recordedAtStep] ?? a.recordedAtStep) : "";
  if (input.action === "REFER_LEGAL") {
    if (a && !input.recorded.authorityToSue) return `Record the decision to start proceedings on the ${authorityLabel} step before referring this case for legal recovery.`;
    return null;
  }

  // COMPLETE_STEP
  const needs = recoveryStepNeeds(rules, input.stepType);
  if (needs && "problem" in needs) return needs.problem;
  if (a) {
    const orderOf = (t: string) => input.caseSteps.find((s) => s.stepType === t)?.stepOrder;
    const at = orderOf(a.recordedAtStep);
    const here = orderOf(input.stepType);
    // A step after the one that records the authority needs it recorded (and a case without that step never has it).
    if (here == null || ((at == null || here > at) && !input.recorded.authorityToSue)) {
      return `Record the decision to start proceedings on the ${authorityLabel} step first.`;
    }
  }
  if (needs?.authority) {
    const fact = input.authority;
    if (!fact) return `Choose the meeting and the motion that decided to start proceedings: ${needs.authority.words}.`;
    if (fact.problem !== null) return fact.problem;
    if (!needs.authority.accepted.some((x) => sameResolution(x, fact.resolution))) return `Choose ${needs.authority.words}.`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fact.decidedOn) || fact.decidedOn > input.today) return "That resolution has not taken effect yet, so it cannot be relied on.";
    // A decision made before the case was opened is not taken to be about it (review L4; the motion's subject is not checked).
    if (!input.caseOpenedOn) return "The day this case was opened is not known, so no resolution can be checked against it.";
    if (fact.decidedOn < input.caseOpenedOn) return "That resolution took effect before this case was opened, so it cannot be relied on for it. Choose the motion that decided to start proceedings for this case.";
    // The amount threshold (PR 9c): the resolution must be one that may decide a claim of the amount owing now.
    if (a?.amountThreshold) {
      const thresholdProblem = authorityAmountProblem(a, fact.resolution, input.amountOwing ?? null, input.comparatorCents ?? null);
      if (thresholdProblem) return thresholdProblem;
    }
  }
  if (needs?.forum) {
    const chosen = (input.forum ?? "").trim();
    const excluded = r.forum!.excluded.find((x) => x.key === chosen);
    if (excluded) return `${capitalise(excluded.words)} cannot hear this claim: ${excluded.reason}.`;
    if (!needs.forum.options.some((o) => o.key === chosen)) return `Choose where proceedings were started: ${needs.forum.options.map((o) => o.words).join(" or ")}.`;
  }
  // With an amount threshold (PR 9c), proceedings may not be started for more than the amount the decision was recorded for.
  if (a?.amountThreshold && input.stepType === (r.forum?.recordedAtStep ?? "PROCEEDINGS")) {
    const grown = authorisedAmountProblem(input.amountOwing ?? null, input.recorded.authorisedAmount ?? null);
    if (grown) return grown;
  }
  // The final notice given outside StrataVerze (PR 9c): the day it was given.
  if (needs?.finalNotice) {
    const given = (input.finalNoticeGivenOn ?? "").trim();
    if (!isDay(given)) return `Enter the day ${needs.finalNotice.words} was given.`;
    if (given > input.today) return `The day ${needs.finalNotice.words} was given cannot be after today (${auDate(input.today)}).`;
  }
  // The days a step must wait, and a pending law that would pause it (PR 9c).
  const timing = timingProblem(rules, input);
  if (timing) return timing;
  if (needs?.charge) return chargeStepProblem(needs.charge, input);
  // The Closed step says the case is closed: not while a lodged charge's revocation is not recorded (PR 9b).
  if (r.statutoryCharge && input.stepType === "CLOSED") return chargeCloseProblem(rules, { charge: input.chargeOnCase });
  return null;
}

/** An amount of money (two decimals, as stored) in whole cents, or null where it is not one. */
export function amountCents(v: string | null | undefined): number | null {
  const text = (v ?? "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, part = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  return text.startsWith("-") ? -cents : cents;
}

const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

/**
 * Why the chosen resolution cannot decide a claim of the amount owing now
 * under the pack's amount threshold (PR 9c), or null. Every refusal says why
 * from the pack: with no comparator value, its note; with no amount for it,
 * that StrataVerze does not work it out.
 */
function authorityAmountProblem(a: AuthorityRule, chosen: DebtAuthorityResolution, amountOwing: string | null, comparatorCents: number | null): string | null {
  const t = a.amountThreshold!;
  const claim = amountCents(amountOwing);
  const needed = authorityNeeded(a, claim, comparatorCents);
  if ("problem" in needed) return needed.problem;
  if (needed.some((x) => sameResolution(x, chosen))) return null;
  if (t.comparator.value == null) return `Choose ${t.above.words}. Whether a claim is within ${t.words} cannot be told: ${lowerFirst(sentence(t.comparator.note))}`;
  if (claim == null) return `Could not work out the amount owing, so choose ${t.above.words}. Nothing was saved.`;
  if (comparatorCents == null) return `Choose ${t.above.words}. StrataVerze does not work out ${t.words} yet, so whether the claim is within it cannot be told.`;
  return `The amount owing (${money(claim)}) is more than ${t.words} (${money(t.multiple * comparatorCents)}), so choose ${t.above.words}.`;
}

/**
 * Why proceedings cannot be recorded for the amount owing now (PR 9c), or
 * null: it must not be more than the amount owing recorded with the decision
 * to start proceedings. Either amount not known refuses.
 */
function authorisedAmountProblem(amountOwing: string | null, authorisedAmount: string | null): string | null {
  const owing = amountCents(amountOwing);
  const authorised = amountCents(authorisedAmount);
  if (owing == null || authorised == null) {
    return "Could not compare the amount owing with the amount recorded with the decision to start proceedings, so this step cannot be completed. Nothing was saved.";
  }
  if (owing <= authorised) return null;
  return `The amount owing now (${money(owing)}) is more than the amount owing when the decision to start proceedings was recorded (${money(authorised)}), so that decision may not cover it. This step cannot be completed. Nothing was saved.`;
}

/**
 * Why a dated rule that would pause a step may have started by `today`, or
 * null (PR 9c): any of its values recorded as in force from a day on or before
 * today, or enacted or made with its commencement, fixed start or latest start
 * on or before today (a Bill or an announcement never). A key the pack does
 * not hold refuses.
 */
function pauseProblem(rules: Rules, key: string, today: string, label: string): string | null {
  const rule = (rules.DATED_RULES as Record<string, unknown> | undefined)?.[key];
  if (!isObject(rule) || !Array.isArray(rule.versions)) return `${label} cannot be checked against the law that would pause it, which is not in this building's rules. Nothing was saved.`;
  const onOrBefore = (d: unknown) => d != null && (typeof d !== "string" || !isDay(d) || d <= today);
  const started = (rule.versions as unknown[]).some((v) => {
    if (!isObject(v)) return true;
    if (v.legalStatus === "IN_FORCE") return onOrBefore(v.from ?? "");
    if (v.legalStatus === "ENACTED_NOT_COMMENCED" || v.legalStatus === "MADE_NOT_COMMENCED") return [v.commencedOn, v.fixedStartDate, v.latestStartDate].some(onOrBefore);
    return false;
  });
  if (!started) return null;
  const title = typeof rule.title === "string" ? lowerFirst(rule.title) : key;
  return `${label} cannot be completed: the law on ${title} may have started by today (${auDate(today)}), and the payment plan pause is not supported yet. Nothing was saved.`;
}

/**
 * Why a step must wait, or null (PR 9c): each timing rule for the step (for
 * the forum chosen, where it names forums) refuses once a dated rule that
 * would pause it may have started, where a value has none, and before day
 * N + 1 after the day it is counted from. That is the latest issue day of the
 * lot's overdue notices, each issued under the building's pack (a takeover
 * notice or another pack's refuses), or the day the final notice was recorded
 * as given. The day checked is the building's day, or for the final notice
 * step the day the notice was given.
 */
function timingProblem(rules: Rules, input: Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>): string | null {
  const r = rules.DEBT_RECOVERY!;
  const list = (r.stepTiming ?? []).filter((t) => t.stepType === input.stepType);
  if (list.length === 0) return null;
  const label = input.labels?.[input.stepType] ?? input.stepType;
  const finalStep = r.finalNotice?.stepType === input.stepType;
  const given = finalStep && isDay((input.finalNoticeGivenOn ?? "").trim()) ? (input.finalNoticeGivenOn ?? "").trim() : null;
  const on = given ?? input.today;
  for (const t of list) {
    if (t.forums && !t.forums.includes((input.forum ?? "").trim())) continue;
    if (t.pausedBy) {
      const paused = pauseProblem(rules, t.pausedBy, input.today, label);
      if (paused) return paused;
    }
    if (t.days.value == null) return `${label} cannot be completed: how many days it must wait is not confirmed. ${sentence(t.days.note)} Nothing was saved.`;
    if (t.earliest.value == null) return `${label} cannot be completed: from which day it may be completed is not confirmed. ${sentence(t.earliest.note)} Nothing was saved.`;
    const from = timingStart(t, input, r.finalNotice, label);
    if ("problem" in from) return from.problem;
    const earliest = addDays(from.day, t.days.value + 1);
    if (on < earliest) {
      return given
        ? `${label} cannot have been given before ${auDate(earliest)}: ${t.words}. Nothing was saved.`
        : `${label} can be completed from ${auDate(earliest)}: ${t.words}. Nothing was saved.`;
    }
  }
  return null;
}

/** The day a timing rule counts from (PR 9c), or why it cannot be told. */
function timingStart(
  t: TimingRule,
  input: Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>,
  finalNotice: FinalNoticeRule | undefined,
  label: string,
): { day: string } | { problem: string } {
  if (t.after.kind === "STEP_NOTICE_SENT") {
    const given = input.recorded.finalNoticeGivenOn ?? null;
    if (!isDay(given)) return { problem: `${capitalise(finalNotice?.words ?? "the final notice")} is not recorded as given on this case, so ${label} cannot be completed. Nothing was saved.` };
    return { day: given };
  }
  const notices = input.notices;
  if (!notices) return { problem: `Could not check the lot's notices, so ${label} cannot be completed. Nothing was saved.` };
  if (notices.length === 0) return { problem: `No notice of this lot is overdue, so ${label} cannot be completed. Nothing was saved.` };
  const pack = (input.packCode ?? "").trim();
  const foreign = notices.filter((n) => n.takeover || !pack || !(n.rulePack ?? "").startsWith(`${pack} `));
  if (foreign.length > 0) {
    return {
      problem: `Notice ${foreign.map((n) => n.number).join(", ")} was not issued under this building's rules in StrataVerze (brought across at takeover, or issued under other rules), so the days before ${label} cannot be counted from it. Nothing was saved.`,
    };
  }
  const undated = notices.filter((n) => !isDay(n.issuedOn));
  if (undated.length > 0) return { problem: `The day notice ${undated.map((n) => n.number).join(", ")} was issued is not recorded, so ${label} cannot be completed. Nothing was saved.` };
  return { day: notices.map((n) => n.issuedOn as string).reduce((max, d) => (d > max ? d : max)) };
}

/**
 * Why the charge step's choice is refused, or null (PR 9b). No charge
 * declared records nothing. A declared charge needs a resolution the pack
 * accepts that has taken effect (on any day up to the building's day: one
 * before the case was opened is accepted, review M1), and the day it was
 * lodged: a real day, not before the resolution took effect and not after
 * the building's day. The motion's subject is not checked.
 */
function chargeStepProblem(
  charge: NonNullable<RecoveryStepNeeds["charge"]>,
  input: Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>,
): string | null {
  const choice = input.charge;
  if (!choice) return `Say whether ${charge.words} was declared and lodged.`;
  if (!choice.declared) return null;
  const fact = choice.resolution;
  if (fact.problem !== null) return fact.problem;
  if (!charge.declaredBy.some((x) => sameResolution(x, fact.resolution))) return `Choose ${charge.declaredWords}.`;
  if (!isDay(fact.decidedOn) || fact.decidedOn > input.today) return "That resolution has not taken effect yet, so it cannot be relied on.";
  // No limit on how early: a charge declared and lodged before the case was opened is recorded (review M1, D8 sets none).
  const lodged = (choice.lodgedOn ?? "").trim();
  if (!isDay(lodged)) return `Enter the day it was lodged with ${charge.lodgedWith}.`;
  if (lodged > input.today) return `The day it was lodged with ${charge.lodgedWith} cannot be after today (${auDate(input.today)}).`;
  if (lodged < fact.decidedOn) return `It cannot have been lodged before the resolution that declared it took effect (${auDate(fact.decidedOn)}).`;
  return null;
}

/** Whether the pack has a statutory charge (PR 9b). False for NSW, Queensland and Western Australia. */
export function statutoryChargeApplies(rules: Rules): boolean {
  return !!rules.DEBT_RECOVERY?.statutoryCharge;
}

const dayWords = (day: string) => (isDay(day) ? auDate(day) : "an unknown day");

/**
 * Why the case cannot be closed for its statutory charge, or null (PR 9b).
 * Null at once for a pack without a statutory charge (NSW, Queensland,
 * Western Australia), before anything else is looked at. Without the case's
 * charge facts it refuses. A lodged charge with no later revocation blocks
 * the closings the pack names (ANY_CLOSE: every status; PAID_OR_SETTLED: paid
 * or settled, or a status not given; no value: every status).
 */
export function chargeCloseProblem(rules: Rules, input: { status?: string; charge?: ChargeFacts }): string | null {
  const c = rules.DEBT_RECOVERY?.statutoryCharge;
  if (!c) return null;
  if (!input.charge) return "Could not check whether a charge on this case is still to be revoked, so it cannot be closed. Nothing was saved.";
  const { lodgedOn, revokedOn } = input.charge;
  if (lodgedOn == null || revokedOn != null) return null;
  const blocks = c.closeBlockedUntilRevoked.value;
  if (blocks === "PAID_OR_SETTLED" && input.status && !["CLOSED_PAID", "CLOSED_SETTLED"].includes(input.status)) return null;
  return `${capitalise(c.words)} was lodged with ${c.lodgedWith} on ${dayWords(lodgedOn)}, and its revocation is not recorded as lodged. Record the revocation before closing this case. Nothing was saved.`;
}

/**
 * Why the revocation of the case's charge cannot be recorded as lodged on
 * `lodgedOn`, or null (PR 9b). Refused for a pack without a statutory charge
 * or whose rules cannot be applied, without the case's charge facts, with no
 * charge lodged, with its revocation already recorded, and for a day that is
 * not a real day, is after the building's day or is before the charge was
 * lodged. No deadline is checked (revocation.withinDays has no value; a pack
 * with one is refused by the rules check).
 */
export function chargeRevocationProblem(rules: Rules, input: { charge?: ChargeFacts; lodgedOn: string | null; today: string }): string | null {
  const r = rules.DEBT_RECOVERY;
  const c = r?.statutoryCharge;
  if (!r || !c) return "There is no charge to revoke under this building's rules. Nothing was saved.";
  const problem = rulesProblem(r);
  if (problem) return problem;
  if (!input.charge) return "Could not check the charge on this case. Nothing was saved.";
  const { lodgedOn, revokedOn } = input.charge;
  if (lodgedOn == null) return "No charge is recorded as lodged on this case, so there is nothing to revoke. Nothing was saved.";
  if (revokedOn != null) return `The revocation of this charge is already recorded (lodged on ${dayWords(revokedOn)}). Nothing was saved.`;
  const day = (input.lodgedOn ?? "").trim();
  if (!isDay(day)) return `Enter the day the revocation was lodged with ${c.lodgedWith}.`;
  if (day > input.today) return `The day the revocation was lodged cannot be after today (${auDate(input.today)}).`;
  if (day < lodgedOn) return `The revocation cannot have been lodged before the charge was (on ${dayWords(lodgedOn)}).`;
  return null;
}

/** A record to write with the step (debt_recovery_records), in the step's transaction. */
export interface RecoveryRecordToWrite {
  kind: "AUTHORITY_TO_SUE" | "FINAL_NOTICE_GIVEN" | "PROCEEDINGS_STARTED" | "STATUTORY_CHARGE_LODGED" | "STATUTORY_CHARGE_REVOKED";
  decidedOn: string;
  resolutionMeetingId: string | null;
  resolutionItemId: string | null;
  /** GENERAL_MEETING, ORDINARY, SPECIAL or COMMITTEE. */
  resolutionKind: string | null;
  /** The amount owing, AUTHORITY_TO_SUE only. */
  amount: string | null;
  forum: string | null;
  /** The day lodged, the statutory charge and its revocation only (left out otherwise). */
  lodgedOn?: string;
}

/** How a recorded resolution's kind is stored. */
export function storedResolutionKind(r: DebtAuthorityResolution): string {
  if (r.meeting === "COMMITTEE") return "COMMITTEE";
  return r.kind === "ANY" ? "GENERAL_MEETING" : r.kind;
}

/**
 * The records completing the step writes, once recoveryGateProblem has passed
 * it: the authority (with the lot's amount owing when the step is completed),
 * the forum and a declared charge (the day its resolution took effect and the
 * day it was lodged; none where no charge was declared). None for a pack with
 * no gate keys.
 */
export function recoveryRecordsToWrite(
  rules: Rules,
  input: { stepType: string; authority: AuthorityFact | null; forum: string | null; today: string; amountOwing: string; charge?: ChargeChoice | null; finalNoticeGivenOn?: string | null },
): RecoveryRecordToWrite[] {
  const needs = recoveryStepNeeds(rules, input.stepType);
  if (!needs || "problem" in needs) return [];
  const out: RecoveryRecordToWrite[] = [];
  const fact = input.authority;
  if (needs.authority && fact && fact.problem === null) {
    out.push({
      kind: "AUTHORITY_TO_SUE",
      decidedOn: fact.decidedOn,
      resolutionMeetingId: fact.meetingId,
      resolutionItemId: fact.itemId,
      resolutionKind: storedResolutionKind(fact.resolution),
      amount: input.amountOwing,
      forum: null,
    });
  }
  // The final notice given outside StrataVerze (PR 9c): the day it was given (never a resolution, amount, forum or day lodged).
  const given = (input.finalNoticeGivenOn ?? "").trim();
  if (needs.finalNotice && isDay(given)) {
    out.push({ kind: "FINAL_NOTICE_GIVEN", decidedOn: given, resolutionMeetingId: null, resolutionItemId: null, resolutionKind: null, amount: null, forum: null });
  }
  if (needs.forum && input.forum) {
    out.push({ kind: "PROCEEDINGS_STARTED", decidedOn: input.today, resolutionMeetingId: null, resolutionItemId: null, resolutionKind: null, amount: null, forum: input.forum.trim() });
  }
  const choice = input.charge;
  if (needs.charge && choice?.declared && choice.resolution.problem === null && isDay((choice.lodgedOn ?? "").trim())) {
    const declared = choice.resolution;
    out.push({
      kind: "STATUTORY_CHARGE_LODGED",
      decidedOn: declared.decidedOn,
      resolutionMeetingId: declared.meetingId,
      resolutionItemId: declared.itemId,
      resolutionKind: storedResolutionKind(declared.resolution),
      amount: null,
      forum: null,
      lodgedOn: (choice.lodgedOn ?? "").trim(),
    });
  }
  return out;
}

/** The record of a charge's revocation, once chargeRevocationProblem has passed it (the day lodged is also the day it is recorded as decided). */
export function revocationRecord(lodgedOn: string): RecoveryRecordToWrite {
  const day = lodgedOn.trim();
  return { kind: "STATUTORY_CHARGE_REVOKED", decidedOn: day, resolutionMeetingId: null, resolutionItemId: null, resolutionKind: null, amount: null, forum: null, lodgedOn: day };
}

/** The words for a recorded forum (the pack's option words), or the key where the pack no longer lists it. */
export function forumWordsFor(rules: Rules, key: string): string {
  return rules.DEBT_RECOVERY?.forum?.options?.find((o) => o.key === key)?.words ?? key;
}
