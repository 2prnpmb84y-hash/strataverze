/**
 * The checked notice rules gate, the timing read through it and the content
 * check (VIC, ACT and WA stage 2, PR 6a, 28 Oct 2026). Fixtures only, never a
 * pack's values: each refusal path, the invariants, a fund's notice mode, the
 * required contents, the approved form, and that a pack without `checked`
 * (NSW, Queensland) is untouched.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { StatutoryRules } from "@/config/statutory";
import { validateLevyNoticeContent, type LevyNoticeContentInput } from "@/lib/finance/levy-notice-content";
import { noticeLeadMark, noticeLeadText, noticeTimingWords } from "@/lib/jurisdiction/wording";
import { issueDateFor, issueTiming, lateMessage, urgentNoticeProblem } from "./issue-timing";
import { noticeRuleProblems, noticeTimingFor, type CheckedNoticeRules } from "./notice-rule-check";

type NoticeRules = StatutoryRules["NOTICE_RULES"];

const SOURCE = "Test Act s 1";
const has = <T,>(value: T, status: "CONFIRMED" | "STRATAVERZE" = "CONFIRMED") => ({ value, status, source: SOURCE });
const none = (note: string, status: "NOT_CONFIRMED" | "GUIDANCE" = "NOT_CONFIRMED") => ({ value: null, status, source: "Test Act s 9", note });

/** A legacy rule, as NSW and Queensland give it. */
const LEGACY: NoticeRules = { minimumNoticeDays: 30, issueDaysBeforeDue: 35, urgentNoticeDays: 14, hardship: null, contents: [], source: SOURCE };

/** Checked rules shaped like the ACT's: a 14-day floor, a 28-day lead and the law's 28-day maximum. */
const CHECKED: CheckedNoticeRules = {
  minimumNoticeDays: has(14, "STRATAVERZE"),
  maximumNoticeDays: has(28),
  issueDaysBeforeDue: has(28, "STRATAVERZE"),
  dueDateMayMove: has(true),
  noticeMode: { ADMINISTRATIVE: has("PER_INSTALMENT" as const, "STRATAVERZE"), CAPITAL_WORKS: has({ annualWithinMonthsAfterAgm: 1 }) },
  requiredContents: [],
  form: null,
  source: SOURCE,
};
const rule = (checked: Partial<CheckedNoticeRules> = {}, legacy: Partial<NoticeRules> = {}): NoticeRules => ({
  minimumNoticeDays: 14,
  issueDaysBeforeDue: 28,
  urgentNoticeDays: null,
  hardship: null,
  contents: [],
  source: SOURCE,
  ...legacy,
  checked: { ...CHECKED, ...checked },
});
const ADMIN = { ledgerFund: "ADMINISTRATIVE" as const };
const COMPLETE: LevyNoticeContentInput = {
  scheme: { name: "Harbour View", planNumber: "12345" },
  lotNumber: "7",
  ownerNames: ["Alex Nguyen"],
  noticeDate: "2026-10-01",
  dueDate: "2026-10-29",
  fundName: "Administrative fund",
  amountCents: 82_509,
  payment: { accountName: "The Owners", bsb: "062-000", accountNumber: "12345678", reference: "LN-0042" },
  contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
  includesInterestWarning: true,
  includesHardshipStatement: false,
  includesLedgerAccess: true,
  ledgerFund: "ADMINISTRATIVE",
};
const points = (r: NoticeRules, ctx: Parameters<typeof noticeRuleProblems>[1] = ADMIN) => noticeRuleProblems(r, ctx).map((p) => p.point);

describe("a pack without checked notice rules (NSW, Queensland)", () => {
  it("gives its own numbers exactly, and never a problem", () => {
    expect(noticeTimingFor(LEGACY)).toEqual({
      minimumDays: 30,
      leadDays: 35,
      urgentDays: 14,
      maximumDays: null,
      dueDateMayMove: true,
      minimumIsStatutory: true,
      checked: false,
    });
    for (const ctx of [undefined, {}, { ledgerFund: null }, { ledgerFund: "CAPITAL_WORKS" as const, states: {} }]) expect(noticeRuleProblems(LEGACY, ctx)).toEqual([]);
  });

  it("keeps its timing words to the four it always had", () => {
    expect(noticeTimingWords(LEGACY)).toEqual({ lead: "5 weeks", mark: "5-week mark", minimumDays: 30, urgentDays: 14 });
    expect(Object.keys(noticeTimingWords(LEGACY))).toEqual(["lead", "mark", "minimumDays", "urgentDays"]);
  });
});

describe("checked notice rules: the gate", () => {
  it("allows a notice whose every value is checked and whose fund is given notices one instalment at a time", () => {
    expect(noticeRuleProblems(rule(), ADMIN)).toEqual([]);
  });

  it("refuses for each value with no value, naming it, with the pack's note", () => {
    const cases: [Partial<CheckedNoticeRules>, string, string][] = [
      [{ minimumNoticeDays: none("the least notice is not in the notes") }, "minimumNoticeDays", "the least notice to pay"],
      [{ maximumNoticeDays: none("whether there is a most notice is not in the notes") }, "maximumNoticeDays", "the most notice to pay the law allows"],
      [{ maximumNoticeDays: none("guidance gives 28 days only", "GUIDANCE") }, "maximumNoticeDays", "the most notice to pay the law allows"],
      [{ issueDaysBeforeDue: none("no lead time has been chosen") }, "issueDaysBeforeDue", "how long before the due date each notice goes out"],
      [{ dueDateMayMove: none("whether a due date may move is not in the notes") }, "dueDateMayMove", "whether a late notice may fall due later than planned"],
    ];
    for (const [c, point, words] of cases) {
      const problems = noticeRuleProblems(rule(c), ADMIN);
      expect(problems.map((p) => p.point), point).toEqual([point]);
      expect(problems[0].code).toBe("NOTICE_RULES_NOT_CONFIRMED");
      expect(problems[0].message).toContain(`This building's rules do not yet confirm ${words} (Test Act s 9).`);
      // The note, as a sentence, then why nothing can go out.
      expect(problems[0].message).toMatch(/\. [A-Z][^.]*\. No notice can be issued until a pack version records it\.$/);
    }
  });

  it("allows no maximum where the law sets none (null)", () => {
    expect(points(rule({ maximumNoticeDays: null, issueDaysBeforeDue: has(35, "STRATAVERZE") }))).toEqual([]);
  });

  it("refuses rules that do not fit together", () => {
    expect(points(rule({ minimumNoticeDays: has(30, "STRATAVERZE") }))).toEqual(["invariants", "invariants"]);
    expect(noticeRuleProblems(rule({ minimumNoticeDays: has(21, "STRATAVERZE"), issueDaysBeforeDue: has(14, "STRATAVERZE") }), ADMIN).map((p) => p.message)).toEqual([
      "This building's notice rules do not fit together: the least notice (21 days) is more than how long before the due date each notice goes out (14 days). No notice can be issued until a pack version corrects them.",
    ]);
    expect(points(rule({ issueDaysBeforeDue: has(35, "STRATAVERZE") }))).toEqual(["invariants"]);
    expect(points(rule({ minimumNoticeDays: has(29, "STRATAVERZE"), issueDaysBeforeDue: has(29, "STRATAVERZE") }))).toEqual(["invariants", "invariants"]);
    expect(points(rule({ minimumNoticeDays: has(-1, "STRATAVERZE") }))).toEqual(["invariants"]);
    expect(points(rule({ issueDaysBeforeDue: has(20.5, "STRATAVERZE") }))).toEqual(["invariants"]);
  });

  it("refuses a notice whose fund is not given notices one instalment at a time", () => {
    // The sinking fund's yearly notice after the AGM.
    expect(noticeRuleProblems(rule(), { ledgerFund: "CAPITAL_WORKS" }).map((p) => p.message)).toEqual([
      "Notices for the capital works or sinking fund are given once a year, within 1 month after the annual general meeting (Test Act s 1). StrataVerze gives one notice for each instalment and cannot give that notice yet.",
    ]);
    // A fund with no mode, a mode not confirmed, and a notice whose fund is not known.
    expect(points(rule({ noticeMode: { ADMINISTRATIVE: CHECKED.noticeMode.ADMINISTRATIVE } }), { ledgerFund: "CAPITAL_WORKS" })).toEqual(["noticeMode"]);
    expect(points(rule({ noticeMode: { ADMINISTRATIVE: none("not in the notes") } }))).toEqual(["noticeMode"]);
    expect(points(rule(), { ledgerFund: null })).toEqual(["noticeMode"]);
    expect(points(rule(), {})).toEqual(["noticeMode"]);
  });

  it("refuses a notice that does not state a required item, and only for the funds the item is for", () => {
    const requiredContents = [
      { key: "EVERY_LOT_CONTRIBUTION" as const, words: "the contribution payable for each other unit", status: "CONFIRMED" as const, source: "Test Act s 4(b)" },
      { key: "FUND_TOTAL" as const, words: "the year's total", ledgerFunds: ["CAPITAL_WORKS" as const], status: "CONFIRMED" as const, source: "Test Act s 5(c)" },
    ];
    const r = rule({ requiredContents });
    expect(noticeRuleProblems(r, ADMIN)).toEqual([
      {
        code: "NOTICE_RULES_NOT_CONFIRMED",
        point: "requiredContents.EVERY_LOT_CONTRIBUTION",
        message: "The notice must state the contribution payable for each other unit (Test Act s 4(b)). StrataVerze notices cannot state it yet, so no notice can be issued.",
      },
    ]);
    expect(points(r, { ...ADMIN, states: { EVERY_LOT_CONTRIBUTION: true } })).toEqual([]);
    expect(points(r, { ...ADMIN, states: { EVERY_LOT_CONTRIBUTION: false, FUND_TOTAL: true } })).toEqual(["requiredContents.EVERY_LOT_CONTRIBUTION"]);
    const perInstalment = rule({ requiredContents, noticeMode: { ADMINISTRATIVE: CHECKED.noticeMode.ADMINISTRATIVE, CAPITAL_WORKS: CHECKED.noticeMode.ADMINISTRATIVE } });
    expect(points(perInstalment, { ledgerFund: "CAPITAL_WORKS", states: { EVERY_LOT_CONTRIBUTION: true } })).toEqual(["requiredContents.FUND_TOTAL"]);
    // A fund that is not known: every item is required.
    expect(points(r, { states: { EVERY_LOT_CONTRIBUTION: true } })).toEqual(["noticeMode", "requiredContents.FUND_TOTAL"]);
  });

  it("refuses an item it does not know, whatever else the notice states", () => {
    const unknown = { key: "SOMETHING_NEW", words: "something new", status: "CONFIRMED", source: "Test Act s 6" } as unknown as CheckedNoticeRules["requiredContents"][number];
    const all = { EVERY_LOT_CONTRIBUTION: true, FUND_TOTAL: true, PROPORTION_AND_METHOD: true, INSTALMENT_DATES: true, EARLY_PAYMENT_DISCOUNT: true, LATE_CHARGE_STATEMENT: true, PAY_WITHIN_DAYS_STATEMENT: true, DISPUTE_PROCESS: true };
    expect(points(rule({ requiredContents: [unknown] }), { ...ADMIN, states: all })).toEqual(["requiredContents.SOMETHING_NEW"]);
  });

  it("refuses a notice that must be in an approved form, or where that is not confirmed", () => {
    const form = { required: has(true), title: "Test fee notice", reference: "https://example.org/form.docx", appliedFrom: none("not confirmed"), source: SOURCE };
    expect(noticeRuleProblems(rule({ form }), ADMIN).map((p) => p.message)).toEqual([
      'The notice must be in the approved form "Test fee notice" (Test Act s 1). StrataVerze cannot produce that form yet, so no notice can be issued.',
    ]);
    expect(points(rule({ form: { ...form, required: none("whether the form is required is not in the notes") } }))).toEqual(["form"]);
    expect(points(rule({ form: { ...form, required: has(false) } }))).toEqual([]);
  });

  it("lists every problem at once", () => {
    const r = rule({
      maximumNoticeDays: none("not in the notes"),
      requiredContents: [{ key: "DISPUTE_PROCESS", words: "the dispute process", status: "CONFIRMED", source: SOURCE }],
      form: { required: has(true), title: "Test fee notice", reference: "x", appliedFrom: none("not confirmed"), source: SOURCE },
    });
    expect(points(r)).toEqual(["maximumNoticeDays", "requiredContents.DISPUTE_PROCESS", "form"]);
  });
});

describe("checked notice rules: what is not checked is never relied on", () => {
  it("never times a notice beyond the pack's own safest lead while the maximum is not confirmed", () => {
    const vicShaped = rule({ maximumNoticeDays: none("not in the notes"), issueDaysBeforeDue: has(35, "STRATAVERZE"), minimumNoticeDays: has(28) }, { minimumNoticeDays: 28, issueDaysBeforeDue: 28 });
    expect(noticeTimingFor(vicShaped).leadDays).toBe(28);
    expect(issueDateFor("2026-12-01", vicShaped)).toBe("2026-11-03");
    expect(noticeLeadText(vicShaped)).toBe("4 weeks");
    // With no maximum in law (null), the decided lead.
    expect(noticeTimingFor(rule({ maximumNoticeDays: null, issueDaysBeforeDue: has(35, "STRATAVERZE") })).leadDays).toBe(35);
  });

  it("offers no shorter urgent notice, and refuses a pack that sets one outside its checked values", () => {
    const urgent = rule({}, { urgentNoticeDays: 7 });
    expect(noticeTimingFor(urgent).urgentDays).toBeNull();
    expect(noticeTimingWords(urgent).urgentDays).toBeNull();
    expect(points(urgent)).toEqual(["urgentNoticeDays"]);
    expect(urgentNoticeProblem(urgent, { levy: "contribution" })).toBe("A shorter notice for an urgent special contribution is not available for this building. Issue the notice without the urgent option.");
    // A legacy pack's urgent notice is offered, as always.
    expect(urgentNoticeProblem(LEGACY, { levy: "levy" })).toBeNull();
    // An urgent notice cannot shorten a checked pack's minimum.
    expect(validateLevyNoticeContent({ ...COMPLETE, dueDate: "2026-10-09", isUrgentSpecialLevy: true }, urgent).map((m) => m.code)).toEqual(["NOTICE_PERIOD", "NOTICE_RULES_NOT_CONFIRMED"]);
  });
});

describe("checked notice rules: the timing", () => {
  it("reads the checked values, never a lead beyond the maximum, and never moves a due date it is not told it may", () => {
    expect(noticeTimingFor(rule())).toEqual({ minimumDays: 14, leadDays: 28, urgentDays: null, maximumDays: 28, dueDateMayMove: true, minimumIsStatutory: false, checked: true });
    expect(noticeTimingFor(rule({ issueDaysBeforeDue: has(35, "STRATAVERZE") })).leadDays).toBe(28);
    expect(noticeTimingFor(rule({ dueDateMayMove: none("not in the notes") })).dueDateMayMove).toBe(false);
    expect(noticeTimingFor(rule({ minimumNoticeDays: has(14) })).minimumIsStatutory).toBe(true);
    // A value with no value falls back to the pack's safest number (and the notice is refused anyway).
    expect(noticeTimingFor(rule({ minimumNoticeDays: none("x"), maximumNoticeDays: none("y") }, { minimumNoticeDays: 21 }))).toMatchObject({ minimumDays: 21, maximumDays: null });
  });

  it("plans each notice its lead before the due date, never beyond the maximum", () => {
    const r = rule();
    expect(issueDateFor("2026-12-01", r)).toBe("2026-11-03");
    expect(issueTiming("2026-12-01", "2026-10-01", r)).toEqual({ kind: "planned", issueOn: "2026-11-03", dueDate: "2026-12-01" });
    const longLead = rule({ issueDaysBeforeDue: has(35, "STRATAVERZE") });
    expect(issueDateFor("2026-12-01", longLead)).toBe("2026-11-03");
    expect(noticeLeadText(longLead)).toBe("4 weeks");
    expect(noticeLeadMark(longLead)).toBe("4-week mark");
    for (let d = -60; d <= 0; d++) {
      const today = new Date(Date.parse("2026-12-01T00:00:00Z") + d * 86_400_000).toISOString().slice(0, 10);
      const t = issueTiming("2026-12-01", today, r);
      const issueOn = t.issueOn;
      const notice = Math.round((Date.parse(`${t.dueDate}T00:00:00Z`) - Date.parse(`${issueOn}T00:00:00Z`)) / 86_400_000);
      expect(notice, today).toBeLessThanOrEqual(28);
    }
  });

  it("moves a late notice to its minimum, naming a StrataVerze minimum as such", () => {
    const r = rule();
    expect(issueTiming("2026-12-01", "2026-11-10", r)).toEqual({ kind: "late", issueOn: "2026-11-10", dueDate: "2026-12-01", daysNotice: 21 });
    const moved = issueTiming("2026-12-01", "2026-11-20", r);
    expect(moved).toEqual({ kind: "moved", issueOn: "2026-11-20", dueDate: "2026-12-04", originalDueDate: "2026-12-01" });
    expect(lateMessage(moved, "Instalment 2", r)).toBe("Instalment 2: due 01/12/2026, fewer than 14 days away, so it goes out today and falls due on 04/12/2026 (StrataVerze's minimum of 14 days).");
    expect(lateMessage(moved, "Instalment 2", rule({ minimumNoticeDays: has(14) }))).toContain("(the statutory 14 days)");
  });

  it("never moves a due date the rules fix (WA-shaped): the notice cannot go out", () => {
    const wa = rule({ maximumNoticeDays: null, issueDaysBeforeDue: has(35, "STRATAVERZE"), dueDateMayMove: has(false, "STRATAVERZE") }, { issueDaysBeforeDue: 35 });
    expect(issueTiming("2026-12-01", "2026-11-10", wa)).toEqual({ kind: "late", issueOn: "2026-11-10", dueDate: "2026-12-01", daysNotice: 21 });
    const t = issueTiming("2026-12-01", "2026-11-20", wa);
    expect(t).toEqual({ kind: "cannotMove", issueOn: "2026-11-20", dueDate: "2026-12-01", daysLeft: 11 });
    expect(lateMessage(t, "Instalment 2", wa)).toBe("Instalment 2: due 01/12/2026, fewer than 14 days away. Its due date cannot be moved under this building's rules, so it cannot go out.");
    expect(issueTiming("2026-12-01", "2026-12-05", wa)).toMatchObject({ kind: "cannotMove", daysLeft: -4 });
  });

  it("gives the screens the maximum, whether the minimum is the law's and whether a due date may move", () => {
    expect(noticeTimingWords(rule())).toEqual({ lead: "4 weeks", mark: "4-week mark", minimumDays: 14, urgentDays: null, maximumDays: 28, minimumIsStatutory: false, dueDateMayMove: true });
    expect(noticeTimingWords(rule({ maximumNoticeDays: null, issueDaysBeforeDue: has(35, "STRATAVERZE"), dueDateMayMove: has(false, "STRATAVERZE") }))).toMatchObject({ lead: "5 weeks", maximumDays: null, dueDateMayMove: false });
  });
});

describe("checked notice rules: the content check", () => {
  const complete: LevyNoticeContentInput = {
    scheme: { name: "Harbour View", planNumber: "12345" },
    lotNumber: "7",
    ownerNames: ["Alex Nguyen"],
    noticeDate: "2026-10-01",
    dueDate: "2026-10-29",
    fundName: "Administrative fund",
    amountCents: 82_509,
    payment: { accountName: "The Owners", bsb: "062-000", accountNumber: "12345678", reference: "LN-0042" },
    contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
    includesInterestWarning: true,
    includesHardshipStatement: false,
    includesLedgerAccess: true,
    ledgerFund: "ADMINISTRATIVE",
  };
  const codes = (n: Partial<LevyNoticeContentInput>, r: NoticeRules = rule()) => validateLevyNoticeContent({ ...complete, ...n }, r).map((m) => m.code);

  it("refuses a due date further from the notice than the maximum: 27 and 28 days pass, 29 do not", () => {
    expect(codes({ dueDate: "2026-10-28" })).toEqual([]);
    expect(codes({ dueDate: "2026-10-29" })).toEqual([]);
    expect(validateLevyNoticeContent({ ...complete, dueDate: "2026-10-30" }, rule())).toEqual([
      { code: "NOTICE_PERIOD_MAX", message: "The due date must be no later than 28 days after the date of the notice (Test Act s 1). The due date is 29 days after the notice date." },
    ]);
    // The least notice is still checked.
    expect(codes({ dueDate: "2026-10-14" })).toEqual(["NOTICE_PERIOD"]);
    expect(codes({ dueDate: "2026-10-15" })).toEqual([]);
  });

  it("adds the gate's problems, each with its own message", () => {
    const r = rule({ requiredContents: [{ key: "DISPUTE_PROCESS", words: "the dispute process", status: "CONFIRMED", source: SOURCE }] });
    expect(codes({}, r)).toEqual(["NOTICE_RULES_NOT_CONFIRMED"]);
    expect(codes({ states: { DISPUTE_PROCESS: true } }, r)).toEqual([]);
    // The notice's fund decides its mode: the yearly sinking fund notice is refused, and so is a notice whose fund is not known.
    expect(codes({ ledgerFund: "CAPITAL_WORKS" })).toEqual(["NOTICE_RULES_NOT_CONFIRMED"]);
    expect(codes({ ledgerFund: null })).toEqual(["NOTICE_RULES_NOT_CONFIRMED"]);
    expect(codes({ ledgerFund: undefined })).toEqual(["NOTICE_RULES_NOT_CONFIRMED"]);
  });

  it("is unchanged for a pack without checked rules, whatever the new fields say", () => {
    const nswLike = { ...LEGACY, hardship: null };
    const at = (dueDate: string, extra: Partial<LevyNoticeContentInput> = {}) => validateLevyNoticeContent({ ...complete, dueDate, ...extra }, nswLike);
    expect(at("2026-12-31")).toEqual([]);
    expect(at("2026-12-31", { ledgerFund: null, states: {} })).toEqual([]);
    expect(at("2026-10-15").map((m) => m.code)).toEqual(["NOTICE_PERIOD"]);
  });
});

describe("the notice timing numbers are read through noticeTimingFor", () => {
  /** Where `minimumNoticeDays`, `issueDaysBeforeDue` and `urgentNoticeDays` may be named outside src/config (and tests). */
  const READERS = new Set(["lib/levies/issue-timing.ts", "lib/finance/levy-notice-content.ts", "lib/jurisdiction/wording.ts", "lib/levies/notice-rule-check.ts"]);
  const SRC = join(__dirname, "..", "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
    });

  it("only in the timing, content check, wording and gate modules", () => {
    const found: string[] = [];
    for (const file of files(SRC)) {
      const rel = relative(SRC, file);
      if (rel.startsWith("config/") || READERS.has(rel)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // The bare names, so destructuring or bracket access cannot read them either.
        if (/\b(minimumNoticeDays|issueDaysBeforeDue|urgentNoticeDays)\b/.test(line)) found.push(`${rel}:${i + 1} ${line.trim().slice(0, 100)}`);
      });
    }
    expect(found).toEqual([]);
  });
});
