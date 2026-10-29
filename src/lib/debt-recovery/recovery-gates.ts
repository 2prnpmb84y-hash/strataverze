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
 * Fails closed:
 * - a gate key StrataVerze does not apply yet (stepTiming, finalNotice and
 *   appliesWhen, PR 9c; authorityToSue's amountThreshold, PR 9c; a
 *   statutoryCharge revocation deadline, revocation.withinDays with a value),
 *   or a key not in the shared shape, refuses every action;
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

type Rules = Pick<StatutoryRules, "DEBT_RECOVERY">;
type RecoveryRules = NonNullable<StatutoryRules["DEBT_RECOVERY"]>;
type ForumRule = NonNullable<RecoveryRules["forum"]>;
type AuthorityRule = NonNullable<RecoveryRules["authorityToSue"]>;
/** A resolution a pack accepts as the decision to start proceedings. */
export type DebtAuthorityResolution = NonNullable<AuthorityRule["accepted"]["value"]>[number];

/** Every key of DEBT_RECOVERY the gates read. A pack with none of them has no gates. */
export const RECOVERY_GATE_KEYS = ["forum", "authorityToSue", "stepTiming", "finalNotice", "statutoryCharge", "appliesWhen"] as const;
/** The keys StrataVerze does not apply yet (PR 9c): a pack with one is refused. */
const NOT_APPLIED_YET = ["stepTiming", "finalNotice", "appliesWhen"] as const;

const CHECKED = new Set(["CONFIRMED", "STRATAVERZE"]);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isCheckedValue = (v: unknown) => isObject(v) && has(v, "value") && typeof v.status === "string";
/** A real calendar day written YYYY-MM-DD. */
const isDay = (v: string | null | undefined): v is string => parseIsoDate(v) != null && /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");

/** Whether a CheckedValue's value is a list of resolutions in the shared shape (no value passes: it refuses where it is needed). */
function resolutionsInShape(checked: unknown): boolean {
  const value = (checked as { value: unknown }).value;
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  return (value as unknown[]).every(
    (x) => isObject(x) && ["GENERAL", "COMMITTEE"].includes(String(x.meeting)) && ["ANY", "ORDINARY", "SPECIAL"].includes(String(x.kind)) && typeof x.words === "string",
  );
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
 * by every gate: a key not applied yet, or a key not in the shared shape (such
 * as the ACT pack's own forum and charge fields before PR 9b moved them),
 * refuses.
 */
function rulesProblem(r: RecoveryRules): string | null {
  if (NOT_APPLIED_YET.some((k) => has(r, k))) return NOT_SUPPORTED;
  if (has(r, "forum")) {
    const f = r.forum as unknown;
    if (!isObject(f) || typeof f.recordedAtStep !== "string" || !Array.isArray(f.options) || !Array.isArray(f.excluded)) return NOT_IN_SHAPE;
    for (const o of f.options as unknown[]) if (!isObject(o) || typeof o.key !== "string" || typeof o.words !== "string" || typeof o.status !== "string") return NOT_IN_SHAPE;
    for (const x of f.excluded as unknown[]) if (!isObject(x) || typeof x.key !== "string" || typeof x.words !== "string" || typeof x.reason !== "string") return NOT_IN_SHAPE;
  }
  if (has(r, "authorityToSue")) {
    const a = r.authorityToSue as unknown;
    if (!isObject(a) || typeof a.recordedAtStep !== "string" || !isCheckedValue(a.accepted) || !isCheckedValue(a.managerMayDecide)) return NOT_IN_SHAPE;
    if (has(a, "amountThreshold")) return NOT_SUPPORTED;
    if (!resolutionsInShape(a.accepted)) return NOT_IN_SHAPE;
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
}

/** "a motion carried at a council meeting or a motion carried at a general meeting". */
export const authorityWords = (accepted: readonly DebtAuthorityResolution[]) => accepted.map((a) => a.words).join(" or ");
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const a = r.authorityToSue;
  if (a && a.recordedAtStep === stepType) {
    if (a.accepted.value == null || a.accepted.value.length === 0) {
      return { problem: `Who may decide to start proceedings is not confirmed for this building, so this step cannot be completed. ${a.accepted.value == null ? a.accepted.note : ""}`.trim() };
    }
    authority = { accepted: a.accepted.value, words: authorityWords(a.accepted.value) };
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
  if (!authority && !forum && !charge) return null;
  return charge ? { authority, forum, charge } : { authority, forum };
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
}

/**
 * The statutory charge on a case, from its records (PR 9b): the day the latest
 * charge was lodged, and the day its revocation was lodged, if recorded after
 * it. Null days where none is recorded.
 */
export interface ChargeFacts {
  lodgedOn: string | null;
  revokedOn: string | null;
}

/** A case's charge from its records, oldest first (a revocation counts only after the charge it revokes). */
export function chargeFacts(rows: readonly { kind: string; lodgedOn?: string | null }[]): ChargeFacts {
  let lodgedOn: string | null = null;
  let revokedOn: string | null = null;
  for (const row of rows) {
    if (row.kind === "STATUTORY_CHARGE_LODGED") {
      lodgedOn = row.lodgedOn ?? "";
      revokedOn = null;
    } else if (row.kind === "STATUTORY_CHARGE_REVOKED" && lodgedOn != null) {
      revokedOn = row.lodgedOn ?? "";
    }
  }
  return { lodgedOn, revokedOn };
}

/**
 * What the adviser chose at the charge step: no charge declared, or a charge
 * declared by the chosen resolution (as the server found it) and lodged on a day.
 */
export type ChargeChoice = { declared: false } | { declared: true; resolution: AuthorityFact; lodgedOn: string | null };

export type RecoveryGateInput =
  | { action: "INITIATE" }
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
  if (input.action === "INITIATE") return null;
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
  }
  if (needs?.forum) {
    const chosen = (input.forum ?? "").trim();
    const excluded = r.forum!.excluded.find((x) => x.key === chosen);
    if (excluded) return `${capitalise(excluded.words)} cannot hear this claim: ${excluded.reason}.`;
    if (!needs.forum.options.some((o) => o.key === chosen)) return `Choose where proceedings were started: ${needs.forum.options.map((o) => o.words).join(" or ")}.`;
  }
  if (needs?.charge) return chargeStepProblem(needs.charge, input);
  // The Closed step says the case is closed: not while a lodged charge's revocation is not recorded (PR 9b).
  if (r.statutoryCharge && input.stepType === "CLOSED") return chargeCloseProblem(rules, { charge: input.chargeOnCase });
  return null;
}

/**
 * Why the charge step's choice is refused, or null (PR 9b). No charge
 * declared records nothing. A declared charge needs a resolution the pack
 * accepts, checked as the authority is (taken effect, on or after the day the
 * case was opened), and the day it was lodged: a real day, not before the
 * resolution took effect and not after the building's day.
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
  if (!input.caseOpenedOn) return "The day this case was opened is not known, so no resolution can be checked against it.";
  if (fact.decidedOn < input.caseOpenedOn) {
    return "That resolution took effect before this case was opened, so it cannot be relied on for it. Choose the motion that declared the charge for this case.";
  }
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
  kind: "AUTHORITY_TO_SUE" | "PROCEEDINGS_STARTED" | "STATUTORY_CHARGE_LODGED" | "STATUTORY_CHARGE_REVOKED";
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
  input: { stepType: string; authority: AuthorityFact | null; forum: string | null; today: string; amountOwing: string; charge?: ChargeChoice | null },
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
