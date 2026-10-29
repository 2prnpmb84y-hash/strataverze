/**
 * The draft packs' debt recovery gates (VIC, ACT and WA stage 2, PR 9a,
 * 29 Oct 2026), pure. They read the pack's DEBT_RECOVERY keys `forum` and
 * `authorityToSue` (src/config/statutory/types.ts) and decide, before
 * anything is written, whether a case may be opened, a step completed, a case
 * marked as referred for legal recovery or closed, and what a step must
 * record. This module imports no pack: the server actions pass the
 * building's rules.
 *
 * NSW and Queensland are unchanged: a pack with none of the gate keys
 * (recoveryGatesApply false) gets null from every function here, before
 * anything is read.
 *
 * Fails closed:
 * - a gate key StrataVerze does not apply yet (stepTiming, finalNotice,
 *   statutoryCharge and appliesWhen, PR 9b and 9c; authorityToSue's
 *   amountThreshold, PR 9c), or a key not in the shared shape, refuses every
 *   action;
 * - a CheckedValue with no value refuses the action that needs it, with the
 *   pack's note as the reason (authorityToSue.accepted with none refuses
 *   every legal referral);
 * - the authority must be a recorded resolution, never the adviser alone;
 * - only a forum option the pack confirms (CONFIRMED or STRATAVERZE) may be
 *   recorded; an excluded forum (Western Australia's SAT) is refused with the
 *   pack's reason; a forum limit is never applied.
 *
 * The order of the steps is not checked here: the step order check
 * (stepCompletionProblem, src/lib/auth/debt-recovery-access.ts) applies to
 * every pack, under the case lock.
 */
import type { StatutoryRules } from "@/config/statutory";

type Rules = Pick<StatutoryRules, "DEBT_RECOVERY">;
type RecoveryRules = NonNullable<StatutoryRules["DEBT_RECOVERY"]>;
type ForumRule = NonNullable<RecoveryRules["forum"]>;
type AuthorityRule = NonNullable<RecoveryRules["authorityToSue"]>;
/** A resolution a pack accepts as the decision to start proceedings. */
export type DebtAuthorityResolution = NonNullable<AuthorityRule["accepted"]["value"]>[number];

/** Every key of DEBT_RECOVERY the gates read. A pack with none of them has no gates. */
export const RECOVERY_GATE_KEYS = ["forum", "authorityToSue", "stepTiming", "finalNotice", "statutoryCharge", "appliesWhen"] as const;
/** The keys StrataVerze does not apply yet (PR 9b and 9c): a pack with one is refused. */
const NOT_APPLIED_YET = ["stepTiming", "finalNotice", "statutoryCharge", "appliesWhen"] as const;

const CHECKED = new Set(["CONFIRMED", "STRATAVERZE"]);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isCheckedValue = (v: unknown) => isObject(v) && has(v, "value") && typeof v.status === "string";

/** Whether the pack has any gate key, so the gates apply. False for NSW and Queensland. */
export function recoveryGatesApply(rules: Rules): boolean {
  const r = rules.DEBT_RECOVERY;
  return !!r && RECOVERY_GATE_KEYS.some((k) => has(r, k));
}

const NOT_SUPPORTED = "Debt recovery for this building needs rules StrataVerze does not apply yet, so this is refused. Nothing was saved.";
const NOT_IN_SHAPE = "This building's debt recovery rules are not in the shape StrataVerze applies, so this is refused. Nothing was saved.";

/**
 * Why the pack's gate keys cannot be applied at all, or null. Checked first
 * by every gate: a key not applied yet, or a key not in the shared shape (the
 * ACT pack's own forum and statutoryCharge, until PR 9b), refuses.
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
    const accepted = (a.accepted as { value: unknown }).value;
    if (accepted != null) {
      if (!Array.isArray(accepted)) return NOT_IN_SHAPE;
      for (const x of accepted as unknown[]) {
        if (!isObject(x) || !["GENERAL", "COMMITTEE"].includes(String(x.meeting)) || !["ANY", "ORDINARY", "SPECIAL"].includes(String(x.kind)) || typeof x.words !== "string") return NOT_IN_SHAPE;
      }
    }
  }
  return null;
}

/** What completing a step must record, as the pack sets it. */
export interface RecoveryStepNeeds {
  /** The resolution that decided to start proceedings: the accepted kinds, and how the screens say them. */
  authority: { accepted: readonly DebtAuthorityResolution[]; words: string } | null;
  /** Where proceedings were started: the options that may be recorded, and the notes advisers are shown. */
  forum: { options: readonly { key: string; words: string }[]; notes: readonly string[] } | null;
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
  return authority || forum ? { authority, forum } : null;
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
    }
  | { action: "REFER_LEGAL"; recorded: RecordedRecoveryFacts; labels?: Readonly<Record<string, string>> }
  | { action: "CLOSE" };

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
  if (input.action === "INITIATE" || input.action === "CLOSE") return null;

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
  return null;
}

/** A record to write with the step (debt_recovery_records), in the step's transaction. */
export interface RecoveryRecordToWrite {
  kind: "AUTHORITY_TO_SUE" | "PROCEEDINGS_STARTED";
  decidedOn: string;
  resolutionMeetingId: string | null;
  resolutionItemId: string | null;
  /** GENERAL_MEETING, ORDINARY, SPECIAL or COMMITTEE. */
  resolutionKind: string | null;
  /** The amount owing, AUTHORITY_TO_SUE only. */
  amount: string | null;
  forum: string | null;
}

/** How a recorded resolution's kind is stored. */
export function storedResolutionKind(r: DebtAuthorityResolution): string {
  if (r.meeting === "COMMITTEE") return "COMMITTEE";
  return r.kind === "ANY" ? "GENERAL_MEETING" : r.kind;
}

/**
 * The records completing the step writes, once recoveryGateProblem has passed
 * it: the authority (with the lot's amount owing when the step is completed) and the forum. None for a
 * pack with no gate keys.
 */
export function recoveryRecordsToWrite(
  rules: Rules,
  input: { stepType: string; authority: AuthorityFact | null; forum: string | null; today: string; amountOwing: string },
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
  return out;
}

/** The words for a recorded forum (the pack's option words), or the key where the pack no longer lists it. */
export function forumWordsFor(rules: Rules, key: string): string {
  return rules.DEBT_RECOVERY?.forum?.options?.find((o) => o.key === key)?.words ?? key;
}
