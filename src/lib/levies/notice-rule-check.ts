/**
 * The checked notice rules gate (VIC, ACT and WA stage 2, PR 6a,
 * 28 Oct 2026). Pure, with type imports only, so it reads no pack itself:
 * it is given a building's `rules.NOTICE_RULES`.
 *
 * A pack without `checked` (NSW, Queensland) gives its own numbers exactly
 * and no problems, so its notices are timed and checked as they always were.
 * A pack with `checked` is read from it, and a notice is refused, with what
 * is missing named in plain words, wherever a value it needs has no value
 * (NOT_CONFIRMED or GUIDANCE), the values do not fit together, the notice's
 * fund is not given notices one instalment at a time, the notice must state
 * something StrataVerze notices cannot state yet, or it must be in an
 * approved form StrataVerze cannot produce yet. Nothing not confirmed ever
 * acts as law.
 */
import type { StatutoryRules } from "@/config/statutory";

/** A building's notice rules (`rules.NOTICE_RULES`). */
type NoticeRules = StatutoryRules["NOTICE_RULES"];
/** The checked notice rules of a pack that has them. */
export type CheckedNoticeRules = NonNullable<NoticeRules["checked"]>;
/** What a pack may require a notice to state (NoticeContentKey in the pack types). */
export type NoticeContentKey = CheckedNoticeRules["requiredContents"][number]["key"];
/** The ledger fund a notice is for. */
export type NoticeLedgerFund = keyof CheckedNoticeRules["noticeMode"];

/** The rule fields the timing reads: the legacy numbers, and `checked` where the pack has it. */
export type NoticeTimingRule = Pick<NoticeRules, "minimumNoticeDays" | "issueDaysBeforeDue" | "urgentNoticeDays"> & { checked?: CheckedNoticeRules };

/** When a building's notices go out and fall due, as one set of plain values. */
export interface NoticeTiming {
  /** The least notice between the notice and the due date, in days. */
  minimumDays: number;
  /** How many days before it falls due each notice goes out (never more than the maximum). */
  leadDays: number;
  /** The shorter notice for an urgent special levy, or null where the pack has none. */
  urgentDays: number | null;
  /** The most notice the law allows, in days, or null where none is set or known (a pack whose maximum is not confirmed is refused by noticeRuleProblems). */
  maximumDays: number | null;
  /** Whether a notice that cannot be given the minimum notice may fall due the minimum after the day it goes out. */
  dueDateMayMove: boolean;
  /** Whether the minimum is the law's (NSW, Queensland, or a CONFIRMED value), rather than a StrataVerze choice. */
  minimumIsStatutory: boolean;
  /** Whether the pack has checked notice rules. */
  checked: boolean;
}

/**
 * How many days before it falls due a notice goes out, from the checked lead
 * where the pack has one: never beyond the maximum, and, where the maximum is
 * not confirmed (VIC), never beyond the pack's own safest lead either.
 */
export function noticeLeadDays(rule: { issueDaysBeforeDue: number; checked?: CheckedNoticeRules }): number {
  const c = rule.checked;
  if (!c) return rule.issueDaysBeforeDue;
  const lead = c.issueDaysBeforeDue.value ?? rule.issueDaysBeforeDue;
  if (c.maximumNoticeDays == null) return lead;
  const max = c.maximumNoticeDays.value;
  return Math.min(lead, max ?? rule.issueDaysBeforeDue);
}

/**
 * A building's notice timing. Without `checked`, the pack's own numbers
 * exactly (NSW and Queensland). With it, the checked values; one with no
 * value falls back to the pack's safest number, and the notice is refused
 * by `noticeRuleProblems` anyway. A due date whose moving is not confirmed
 * is never moved.
 */
export function noticeTimingFor(rule: NoticeTimingRule): NoticeTiming {
  const c = rule.checked;
  if (!c) {
    return {
      minimumDays: rule.minimumNoticeDays,
      leadDays: rule.issueDaysBeforeDue,
      urgentDays: rule.urgentNoticeDays,
      maximumDays: null,
      dueDateMayMove: true,
      minimumIsStatutory: true,
      checked: false,
    };
  }
  return {
    minimumDays: c.minimumNoticeDays.value ?? rule.minimumNoticeDays,
    leadDays: noticeLeadDays(rule),
    // The checked rules have no shorter urgent notice, so none is offered (noticeRuleProblems refuses a pack that sets one).
    urgentDays: null,
    maximumDays: c.maximumNoticeDays?.value ?? null,
    dueDateMayMove: c.dueDateMayMove.value === true,
    minimumIsStatutory: c.minimumNoticeDays.status === "CONFIRMED",
    checked: true,
  };
}

/** What a notice is for and what it can state, for the gate. */
export interface NoticeRuleContext {
  /** The ledger fund of the notice's fund, or null where it is not known (a special fund, or none). */
  ledgerFund?: NoticeLedgerFund | null;
  /** What the notice states beyond the items every notice carries, by content key. A key not true is not stated. */
  states?: Partial<Record<NoticeContentKey, boolean>>;
  /**
   * Why a key StrataVerze can state is not stated for this notice (the data
   * for it is not there), in words that follow "it cannot be stated for this
   * notice:". The refusal then names the cause.
   */
  notStated?: Partial<Record<NoticeContentKey, string>>;
}

export interface NoticeRuleProblem {
  code: "NOTICE_RULES_NOT_CONFIRMED";
  /** Which point of the rules it is about ("maximumNoticeDays", "noticeMode", "requiredContents.DISPUTE_PROCESS", "form"). */
  point: string;
  message: string;
}

const NOT_YET = "No notice can be issued until a pack version records it.";
/** A pack's note as a sentence: a capital first letter and a full stop. */
const sentence = (text: string) => {
  const t = text.trim();
  const capital = t ? t[0].toUpperCase() + t.slice(1) : t;
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
const FUND_WORDS: Record<string, string> = { ADMINISTRATIVE: "the administrative fund", CAPITAL_WORKS: "the capital works or sinking fund" };

/**
 * Why a building's notice cannot be issued under its checked notice rules:
 * empty for a pack without `checked` (NSW, Queensland), and for one whose
 * rules allow the notice. Each problem names what is missing.
 */
export function noticeRuleProblems(rule: Pick<NoticeRules, "checked"> & Partial<Pick<NoticeRules, "urgentNoticeDays">>, ctx: NoticeRuleContext = {}): NoticeRuleProblem[] {
  const c = rule.checked;
  if (!c) return [];
  const problems: NoticeRuleProblem[] = [];
  const add = (point: string, message: string) => problems.push({ code: "NOTICE_RULES_NOT_CONFIRMED", point, message });
  const unconfirmed = (point: string, what: string, v: { value: unknown; note?: string; source: string }) => {
    if (v.value != null) return false;
    add(point, `This building's rules do not yet confirm ${what} (${v.source}).${v.note ? ` ${sentence(v.note)}` : ""} ${NOT_YET}`);
    return true;
  };

  // Every timing value, then whether they fit together.
  const minMissing = unconfirmed("minimumNoticeDays", "the least notice to pay", c.minimumNoticeDays);
  const maxMissing = c.maximumNoticeDays ? unconfirmed("maximumNoticeDays", "the most notice to pay the law allows", c.maximumNoticeDays) : false;
  const leadMissing = unconfirmed("issueDaysBeforeDue", "how long before the due date each notice goes out", c.issueDaysBeforeDue);
  unconfirmed("dueDateMayMove", "whether a late notice may fall due later than planned", c.dueDateMayMove);
  // A shorter urgent notice is not in the checked shape, so one set outside it is never relied on.
  if (rule.urgentNoticeDays != null) {
    add("urgentNoticeDays", `This building's rules give a shorter notice for an urgent special levy (${rule.urgentNoticeDays} days) that is not among their checked values. No notice can be issued until a pack version records it as checked or removes it.`);
  }
  const min = c.minimumNoticeDays.value;
  const lead = c.issueDaysBeforeDue.value;
  const max = c.maximumNoticeDays?.value ?? null;
  const fit = (ok: boolean, message: string) => {
    if (!ok) add("invariants", `This building's notice rules do not fit together: ${message} No notice can be issued until a pack version corrects them.`);
  };
  if (!minMissing && min != null) fit(Number.isInteger(min) && min >= 0, `the least notice is ${min} days.`);
  if (!leadMissing && lead != null) fit(Number.isInteger(lead) && lead >= 0, `each notice goes out ${lead} days before it falls due.`);
  if (!minMissing && !leadMissing && min != null && lead != null) fit(min <= lead, `the least notice (${days(min)}) is more than how long before the due date each notice goes out (${days(lead)}).`);
  if (!maxMissing && !leadMissing && max != null && lead != null) fit(lead <= max, `each notice goes out ${days(lead)} before it falls due, more than the most notice the law allows (${days(max)}).`);
  if (!minMissing && !maxMissing && min != null && max != null) fit(min <= max, `the least notice (${days(min)}) is more than the most notice the law allows (${days(max)}).`);

  // How the notice's fund is given notices.
  const fund = ctx.ledgerFund ?? null;
  if (!fund) {
    add("noticeMode", `This building's rules say how notices are given for each of its funds, and this notice's fund is not one of them. No notice can be issued for it.`);
  } else {
    const mode = c.noticeMode[fund];
    const fundWords = FUND_WORDS[fund] ?? fund;
    if (!mode) add("noticeMode", `This building's rules do not say how notices are given for ${fundWords}. ${NOT_YET}`);
    else if (!unconfirmed("noticeMode", `how notices are given for ${fundWords}`, mode) && mode.value != null && mode.value !== "PER_INSTALMENT") {
      const within = mode.value.annualWithinMonthsAfterAgm;
      add(
        "noticeMode",
        `Notices for ${fundWords} are given once a year, within ${months(within)} after the annual general meeting (${mode.source}). StrataVerze gives one notice for each instalment and cannot give that notice yet.`,
      );
    }
  }

  // What the notice must state.
  for (const req of c.requiredContents) {
    if (fund && req.ledgerFunds && !req.ledgerFunds.includes(fund)) continue;
    if (ctx.states?.[req.key] === true) continue;
    const why = ctx.notStated?.[req.key];
    add(
      `requiredContents.${req.key}`,
      why
        ? `The notice must state ${req.words} (${req.source}), and it cannot be stated for this notice: ${why}. No notice can be issued until it can.`
        : `The notice must state ${req.words} (${req.source}). StrataVerze notices cannot state it yet, so no notice can be issued.`,
    );
  }

  // The approved form.
  if (c.form) {
    const f = c.form;
    if (f.required.value == null) {
      unconfirmed("form", `whether the notice must be in the approved form "${f.title}"`, f.required);
    } else if (f.required.value) {
      add("form", `The notice must be in the approved form "${f.title}" (${f.required.source}). StrataVerze cannot produce that form yet, so no notice can be issued.`);
    }
  }
  return problems;
}
