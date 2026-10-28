/**
 * The notice rules in the shape every pack shares (QLD stage 2, step 5,
 * 27 Oct 2026). The notice code reads `rules.NOTICE_RULES` for every pack: a
 * pack with no hardship statement gives notices without one, and a pack with
 * no shorter urgent notice does not offer it.
 */
import { describe, expect, it, vi } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor, type NswRules, type StatutoryRules } from "@/config/statutory";
import { validateLevyNoticeContent, type LevyNoticeContentInput } from "@/lib/finance/levy-notice-content";
import { lateChargeSentence, noticeLateCharge, noticeTimingWords } from "@/lib/jurisdiction/wording";
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
import { levyNoticeBlocks } from "@/lib/pdf/documents";
import { issueDateFor, issueTiming, urgentNoticeProblem } from "./issue-timing";

const NSW = statutoryRulesFor("NSW") as NswRules;
const QLD = QLD_RULE_PACK.rules;

/** A building's rules as a Queensland pack gives them: the shared rules only. */
const qldShaped: StatutoryRules = {
  TERMINOLOGY: QLD.TERMINOLOGY,
  FUND_CATALOGUE: QLD.FUND_CATALOGUE,
  ENTITLEMENT_SCHEDULES: QLD.ENTITLEMENT_SCHEDULES,
  PAYMENT_ALLOCATION_ORDER: QLD.PAYMENT_ALLOCATION_ORDER,
  FEATURES: QLD.FEATURES,
  NOTICE_RULES: QLD.NOTICE_RULES,
  LATE_CHARGE: QLD.LATE_CHARGE,
  MEETING_RULES: QLD.MEETING_RULES,
};

// For the content check against the database: the building's pack is the Queensland-shaped one,
// or (state CHECKED) one with checked notice rules (stage 2, PR 6a).
const checkedPack = vi.hoisted(() => ({ rules: null as unknown }));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  return {
    ...actual,
    rulesForState: (state: string) =>
      state === "QLD-SHAPED" ? { pack: null, rules: qldShaped, label: "test" } : state === "CHECKED" ? { pack: null, rules: checkedPack.rules, label: "test" } : actual.rulesForState(state),
  };
});
const { sharedFake } = await import("@/test/fake-orm");
const { checkPlannedNotices } = await import("./notice-content-data");

const complete: LevyNoticeContentInput = {
  scheme: { name: "Harbour View", planNumber: "12345" },
  lotNumber: "7",
  ownerNames: ["Alex Nguyen"],
  noticeDate: "2026-10-01",
  dueDate: "2026-11-05",
  fundName: "Administrative Fund",
  amountCents: 82_509,
  payment: { accountName: "The Owners SP 12345", bsb: "062-000", accountNumber: "12345678", reference: "LN-0042" },
  contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
  includesInterestWarning: true,
  includesHardshipStatement: true,
  includesLedgerAccess: true,
};

describe("the NSW notice rules in the shared shape", () => {
  it("are the levy notice rules and hardship information, unchanged", () => {
    const r = NSW.NOTICE_RULES;
    expect(r.minimumNoticeDays).toBe(NSW.LEVY_NOTICE_RULES.minimumNoticeDays);
    expect(r.issueDaysBeforeDue).toBe(NSW.LEVY_NOTICE_RULES.issueDaysBeforeDue);
    expect(r.urgentNoticeDays).toBe(NSW.LEVY_NOTICE_RULES.urgentSpecialLevyNoticeDays);
    expect(r.hardship?.requiredFrom).toBe(NSW.LEVY_NOTICE_RULES.hardshipStatementRequiredFrom);
    expect(r.hardship?.information).toBe(NSW.HARDSHIP_INFORMATION);
    expect(r.source).toBe(NSW.LEVY_NOTICE_RULES.source);
  });
});

describe("the Queensland notice rules in the shared shape", () => {
  it("are the contribution notice rules, with StrataVerze's 35-day lead", () => {
    const r = QLD.NOTICE_RULES;
    expect(r.minimumNoticeDays).toBe(QLD.CONTRIBUTION_NOTICE_RULES.minimumNoticeDays);
    expect(r.issueDaysBeforeDue).toBe(35);
    expect(r.issueDaysBeforeDue).toBeGreaterThanOrEqual(r.minimumNoticeDays);
    expect(r.urgentNoticeDays).toBeNull();
    expect(r.hardship).toBeNull();
    expect(QLD.CONTRIBUTION_NOTICE_RULES.hardshipStatementRequired).toBe(false);
    expect(r.contents).toEqual(QLD.CONTRIBUTION_NOTICE_RULES.contents);
    expect(r.source).toBe(QLD.CONTRIBUTION_NOTICE_RULES.source);
  });
});

describe("the content check", () => {
  const noHardship = { ...complete, includesHardshipStatement: false };

  it("does not require a hardship statement where the pack has none", () => {
    expect(validateLevyNoticeContent(noHardship, qldShaped.NOTICE_RULES)).toEqual([]);
    expect(validateLevyNoticeContent(noHardship, NSW.NOTICE_RULES).map((m) => m.code)).toEqual(["HARDSHIP_STATEMENT"]);
  });

  it("gives an urgent levy the usual notice where the pack has no shorter one", () => {
    const urgent = { ...complete, dueDate: "2026-10-15", isUrgentSpecialLevy: true };
    expect(validateLevyNoticeContent(urgent, NSW.NOTICE_RULES)).toEqual([]);
    expect(validateLevyNoticeContent(urgent, qldShaped.NOTICE_RULES)).toEqual([
      { code: "NOTICE_PERIOD", message: "At least 30 days' notice to pay. The due date is 14 days after the notice date." },
    ]);
  });
});

describe("the urgent special levy option", () => {
  it("is refused where the pack has no shorter notice, in plain words", () => {
    expect(urgentNoticeProblem(qldShaped.NOTICE_RULES, qldShaped.TERMINOLOGY)).toBe(
      "A shorter notice for an urgent special contribution is not available for this building. Issue the notice without the urgent option.",
    );
    expect(urgentNoticeProblem(NSW.NOTICE_RULES, NSW.TERMINOLOGY)).toBeNull();
  });
});

describe("notice timing words, from NOTICE_RULES", () => {
  it("gives each pack's lead, minimum and urgent notice", () => {
    expect(noticeTimingWords(NSW.NOTICE_RULES)).toEqual({ lead: "5 weeks", mark: "5-week mark", minimumDays: 30, urgentDays: 14 });
    expect(noticeTimingWords(qldShaped.NOTICE_RULES)).toEqual({ lead: "5 weeks", mark: "5-week mark", minimumDays: 30, urgentDays: null });
  });

  it("times a Queensland notice from its own rules", () => {
    expect(issueDateFor("2026-12-01", qldShaped.NOTICE_RULES)).toBe("2026-10-27");
    expect(issueTiming("2026-12-01", "2026-11-20", qldShaped.NOTICE_RULES)).toEqual({ kind: "moved", issueOn: "2026-11-20", dueDate: "2026-12-20", originalDueDate: "2026-12-01" });
  });
});

describe("a notice where the pack has no hardship statement", () => {
  const doc = {
    schemeName: "Harbour View",
    planNumber: "12345",
    lotNumber: "7",
    ownerNames: ["Alex Nguyen"],
    noticeNumber: "LN-0042",
    noticeDate: "2026-10-01",
    dueDate: "2026-11-05",
    periodStart: null,
    periodEnd: null,
    fundName: "Administrative fund",
    amountCents: 82_509,
    payment: complete.payment as { accountName: string; bsb: string; accountNumber: string; reference: string },
    contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
    ledgerUrl: "https://app.strataverze.com/owner/levies",
    // A Queensland building with no penalty resolved.
    ...noticeLateCharge(QLD.LATE_CHARGE, { mode: "NONE" }),
    hardship: qldShaped.NOTICE_RULES.hardship?.information ?? null,
    terms: qldShaped.TERMINOLOGY,
  };

  it("has no hardship box on the PDF", () => {
    const blocks = levyNoticeBlocks(doc);
    expect(blocks.some((b) => b.kind === "box")).toBe(false);
    expect(JSON.stringify(blocks)).not.toContain(NSW.HARDSHIP_INFORMATION.title);
    // The NSW notice keeps it, last.
    expect(levyNoticeBlocks({ ...doc, hardship: NSW.NOTICE_RULES.hardship!.information, terms: NSW.TERMINOLOGY }).at(-1)).toMatchObject({ kind: "box", title: NSW.HARDSHIP_INFORMATION.title });
  });

  it("has no hardship statement in the email", () => {
    const email = levyNoticeEmail({ to: "alex@example.com", ownerName: "Alex Nguyen", amount: "825.09", ...doc, planNumber: "12345" });
    expect(email.html).not.toContain(NSW.HARDSHIP_INFORMATION.title);
    expect(email.html).not.toContain(NSW.HARDSHIP_INFORMATION.helplinePhone);
    expect(email.html).toContain("View your contribution ledger");
  });
});

describe("checking notices for a Queensland-shaped pack (step 6: the late charge from LATE_CHARGE)", () => {
  const check = () =>
    checkPlannedNotices({
      schemeId: "q1",
      fundId: "f1",
      issuerId: "adviser",
      noticeDate: "2026-10-01",
      notices: [{ lotId: "l1", lotNumber: "7", ownerId: null, noticeNumber: "LN-0001", dueDate: "2026-11-05", amountCents: 100 }],
    });
  const seed = (scheme: Record<string, unknown>) =>
    sharedFake.reset({
      Scheme: [{ id: "q1", state: "QLD-SHAPED", name: "Harbour View", planNumber: "12345", timeZone: "Australia/Brisbane", ...scheme }],
      Fund: [{ id: "f1", schemeId: "q1", name: "Administrative fund" }],
      Profile: [{ id: "adviser", firstName: "Sam", lastName: "Adviser", email: "sam@example.com" }],
      SchemeBankAccount: [],
      LotDetail: [],
    });

  it("no longer stops for want of the NSW interest rule, and asks for no penalty statement where none applies", async () => {
    seed({ interestMode: "NONE" });
    const codes = (await check()).map((m) => m.code);
    expect(codes).not.toContain("INTEREST_WARNING");
    // The other items are still checked (no bank account, no owner on the roll).
    expect(codes).toEqual(expect.arrayContaining(["PAYMENT_DETAILS", "OWNER"]));
  });

  it("states a resolved penalty, so its statement is there", async () => {
    seed({ interestMode: "RESOLVED_RATE", lateChargeMonthlyRatePercent: "2.50", interestResolutionMeetingId: "m", interestResolutionMotionId: "x" });
    expect((await check()).map((m) => m.code)).not.toContain("INTEREST_WARNING");
  });
});

describe("the late charge item of the content check", () => {
  it("is required only where a late charge applies, in the pack's words", () => {
    const without = { ...complete, includesInterestWarning: false, includesHardshipStatement: false };
    expect(validateLevyNoticeContent({ ...without, lateChargeApplies: false }, qldShaped.NOTICE_RULES, qldShaped.TERMINOLOGY)).toEqual([]);
    expect(validateLevyNoticeContent({ ...without, lateChargeApplies: true }, qldShaped.NOTICE_RULES, qldShaped.TERMINOLOGY)).toEqual([
      { code: "INTEREST_WARNING", message: "A warning that penalty is charged on overdue amounts." },
    ]);
    // NSW, with its words or without, as before.
    const nsw = { ...without, includesHardshipStatement: true };
    const message = { code: "INTEREST_WARNING", message: "A warning that interest is charged on overdue amounts." };
    expect(validateLevyNoticeContent(nsw, NSW.NOTICE_RULES)).toEqual([message]);
    expect(validateLevyNoticeContent(nsw, NSW.NOTICE_RULES, NSW.TERMINOLOGY)).toEqual([message]);
  });
});

describe("a Queensland notice's late charge (step 6)", () => {
  const doc = {
    schemeName: "Harbour View",
    planNumber: "12345",
    lotNumber: "7",
    ownerNames: ["Alex Nguyen"],
    noticeNumber: "LN-0042",
    noticeDate: "2026-10-01",
    dueDate: "2026-11-05",
    periodStart: "2026-10-01",
    periodEnd: "2026-12-31",
    fundName: "Administrative Fund",
    amountCents: 82_509,
    payment: complete.payment as { accountName: string; bsb: string; accountNumber: string; reference: string },
    contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
    ledgerUrl: "https://app.strataverze.com/owner/levies",
    hardship: null,
    terms: qldShaped.TERMINOLOGY,
  };
  const withPenalty = { ...doc, ...noticeLateCharge(QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 }) };
  const noPenalty = { ...doc, ...noticeLateCharge(QLD.LATE_CHARGE, { mode: "NONE", monthlyRatePercent: null }) };
  const email = (d: typeof withPenalty) => levyNoticeEmail({ to: "alex@example.com", ownerName: "Alex Nguyen", amount: "825.09", ...d, planNumber: "12345" });
  const SENTENCE =
    "Penalty: if this contribution is not paid by the due date, a penalty of 2.5% a month is charged on the amount unpaid for each whole month it is in arrears after the date for payment (Body Corporate and Community Management (Standard Module) Regulation 2020 (Qld) s 165).";

  it("states the resolved monthly penalty for each whole month in arrears", () => {
    expect(lateChargeSentence(withPenalty, qldShaped.TERMINOLOGY)).toBe(SENTENCE);
    expect(levyNoticeBlocks(withPenalty)).toContainEqual({ kind: "text", text: SENTENCE });
    expect(email(withPenalty).html).toContain(SENTENCE);
    expect(lateChargeSentence({ ...doc, ...noticeLateCharge(QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 1.25 }) }, qldShaped.TERMINOLOGY)).toContain("a penalty of 1.25% a month");
  });

  it("states no penalty where none applies, and no discount", () => {
    expect(lateChargeSentence(noPenalty, qldShaped.TERMINOLOGY)).toBeNull();
    const blocks = JSON.stringify(levyNoticeBlocks(noPenalty));
    expect(blocks).not.toMatch(/penalty/i);
    expect(email(noPenalty).html).not.toMatch(/penalty/i);
    // The database default (STATUTORY) is not a Queensland setting: no penalty.
    expect(lateChargeSentence({ ...doc, ...noticeLateCharge(QLD.LATE_CHARGE, { mode: "STATUTORY" }) }, qldShaped.TERMINOLOGY)).toBeNull();
    for (const d of [withPenalty, noPenalty]) {
      expect(JSON.stringify(levyNoticeBlocks(d))).not.toMatch(/discount/i);
      expect(email(d).html).not.toMatch(/discount/i);
    }
  });

  it("never says interest, on the PDF or in the email", () => {
    for (const d of [withPenalty, noPenalty]) {
      expect(JSON.stringify(levyNoticeBlocks(d))).not.toMatch(/interest/i);
      expect(email(d).html).not.toMatch(/interest/i);
      expect(email(d).subject).not.toMatch(/interest/i);
    }
  });

  it("leaves the NSW notice's sentence as it always was", () => {
    const nsw = noticeLateCharge(NSW.LATE_CHARGE, { mode: "STATUTORY" });
    expect(nsw).toEqual({ noInterest: false, interest: { annualRatePercent: 10, graceMonths: 1, source: NSW.STATUTORY_INTEREST.source } });
    expect(noticeLateCharge(NSW.LATE_CHARGE, { mode: "NO_INTEREST" }).noInterest).toBe(true);
    const terms = NSW.TERMINOLOGY;
    expect(lateChargeSentence({ noInterest: false, interest: NSW.STATUTORY_INTEREST }, terms)).toBe(lateChargeSentence(nsw, terms));
    expect(levyNoticeBlocks({ ...doc, ...nsw, terms })).toEqual(levyNoticeBlocks({ ...doc, noInterest: false, interest: NSW.STATUTORY_INTEREST, terms }));
  });
});

describe("checking notices for a pack with checked notice rules (stage 2, PR 6a)", () => {
  const SRC = "Test Act s 1";
  const has = (value: unknown, status = "STRATAVERZE") => ({ value, status, source: SRC }) as never;
  const checkedRules = (over: Partial<NonNullable<StatutoryRules["NOTICE_RULES"]["checked"]>> = {}): StatutoryRules["NOTICE_RULES"] => ({
    minimumNoticeDays: 14,
    issueDaysBeforeDue: 28,
    urgentNoticeDays: null,
    hardship: null,
    contents: [],
    source: SRC,
    checked: {
      minimumNoticeDays: has(14),
      maximumNoticeDays: has(28, "CONFIRMED"),
      issueDaysBeforeDue: has(28),
      dueDateMayMove: has(true, "CONFIRMED"),
      noticeMode: { ADMINISTRATIVE: has("PER_INSTALMENT"), CAPITAL_WORKS: has({ annualWithinMonthsAfterAgm: 1 }, "CONFIRMED") },
      requiredContents: [
        { key: "EVERY_LOT_CONTRIBUTION", words: "the contribution payable for each other unit", status: "CONFIRMED", source: "Test Act s 4(b)" },
        { key: "LATE_CHARGE_STATEMENT", words: "the interest payable for late payment", status: "CONFIRMED", source: "Test Act s 4(i)" },
      ],
      form: null,
      source: SRC,
      ...over,
    },
  });
  const seed = (fundType: string, lateCharge: StatutoryRules["LATE_CHARGE"], scheme: Record<string, unknown> = {}) => {
    sharedFake.reset({
      Scheme: [{ id: "c1", state: "CHECKED", name: "Harbour View", planNumber: "12345", timeZone: "Australia/Sydney", ...scheme }],
      Fund: [{ id: "f1", schemeId: "c1", name: "Fund", fundType }],
      Profile: [{ id: "adviser", firstName: "Sam", lastName: "Adviser", email: "sam@example.com" }],
      SchemeBankAccount: [{ id: "b1", schemeId: "c1", isActive: true, isOperating: true, accountName: "The Owners", bsb: "062-000", accountNumber: "1" }],
      LotDetail: [{ id: "d1", lotId: "l1", rollOwnerName: "Alex Nguyen" }],
    });
    checkedPack.rules = { ...qldShaped, NOTICE_RULES: checkedRules(), LATE_CHARGE: lateCharge };
  };
  const check = (noticeDate = "2026-10-01", dueDate = "2026-10-29") =>
    checkPlannedNotices({
      schemeId: "c1",
      fundId: "f1",
      issuerId: "adviser",
      noticeDate,
      notices: [
        { lotId: "l1", lotNumber: "7", ownerId: null, noticeNumber: "LN-0001", dueDate, amountCents: 100 },
        { lotId: "l1", lotNumber: "7", ownerId: null, noticeNumber: "LN-0002", dueDate, amountCents: 100 },
      ],
    });

  it("lists each point the rules refuse on once, by its own message, for the notice's fund", async () => {
    seed("ADMINISTRATIVE", QLD.LATE_CHARGE, { interestMode: "RESOLVED_RATE", lateChargeMonthlyRatePercent: "2.50" });
    // The late charge is stated (a monthly penalty here), each other unit's contribution is not.
    expect(await check()).toEqual([
      {
        code: "NOTICE_RULES_NOT_CONFIRMED",
        message: "The notice must state the contribution payable for each other unit (Test Act s 4(b)). StrataVerze notices cannot state it yet, so no notice can be issued.",
      },
    ]);
    // A sinking fund notice: its yearly mode refuses too.
    seed("CAPITAL_WORKS", QLD.LATE_CHARGE, { interestMode: "RESOLVED_RATE", lateChargeMonthlyRatePercent: "2.50" });
    expect((await check()).map((m) => m.message.slice(0, 40))).toEqual(["Notices for the capital works or sinking", "The notice must state the contribution p"]);
    // A special fund has no ledger fund, so no notice mode: refused.
    seed("SPECIAL", QLD.LATE_CHARGE, { interestMode: "RESOLVED_RATE", lateChargeMonthlyRatePercent: "2.50" });
    expect((await check()).map((m) => m.code)).toEqual(["NOTICE_RULES_NOT_CONFIRMED", "NOTICE_RULES_NOT_CONFIRMED"]);
  });

  it("refuses a due date beyond the maximum", async () => {
    seed("ADMINISTRATIVE", QLD.LATE_CHARGE, { interestMode: "RESOLVED_RATE", lateChargeMonthlyRatePercent: "2.50" });
    expect((await check("2026-10-01", "2026-10-30")).map((m) => m.code)).toEqual(["NOTICE_PERIOD_MAX", "NOTICE_RULES_NOT_CONFIRMED"]);
  });

  it("does not throw for an annual-rate late charge: the notice cannot state it, so it is refused with that reason", async () => {
    const annual: StatutoryRules["LATE_CHARGE"] = {
      method: "ANNUAL_RATE",
      modes: ["STATUTORY"],
      defaultMode: "STATUTORY",
      resolutionRequiredFor: [],
      annualRatePercent: null,
      maxMonthlyRatePercent: null,
      graceMonths: 0,
      source: SRC,
      annual: {
        statutoryRatePercent: has(10, "CONFIRMED"),
        resolvedRate: null,
        accrual: { from: has("DUE_DATE", "CONFIRMED"), graceMonths: has(0, "CONFIRMED"), simple: has(true, "CONFIRMED"), daysInYear: has(365, "CONFIRMED") },
        waiver: null,
        source: SRC,
      },
    };
    seed("ADMINISTRATIVE", annual, { interestMode: "STATUTORY" });
    const missing = await check();
    expect(missing.map((m) => m.code)).toEqual(["INTEREST_WARNING", "NOTICE_RULES_NOT_CONFIRMED", "NOTICE_RULES_NOT_CONFIRMED", "LATE_CHARGE_WORDING"]);
    expect(missing[2].message).toContain("the interest payable for late payment (Test Act s 4(i))");
    // Refused whatever the pack requires: the PDF and email cannot word an annual-rate late charge yet.
    expect(missing[3]).toEqual({ code: "LATE_CHARGE_WORDING", message: "Notices cannot state this building's penalty yet (Test Act s 1), so no notice can be issued until they can." });
  });
});
