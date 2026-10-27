/**
 * The notice rules in the shape every pack shares (QLD stage 2, step 5,
 * 27 Oct 2026). The notice code reads `rules.NOTICE_RULES` for every pack: a
 * pack with no hardship statement gives notices without one, and a pack with
 * no shorter urgent notice does not offer it.
 */
import { describe, expect, it, vi } from "vitest";
import { PENDING_RULE_PACKS, RuleNotInPackError, statutoryRulesFor, type NswRules, type StatutoryRules } from "@/config/statutory";
import { validateLevyNoticeContent, type LevyNoticeContentInput } from "@/lib/finance/levy-notice-content";
import { noticeTimingWords } from "@/lib/jurisdiction/wording";
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
import { levyNoticeBlocks } from "@/lib/pdf/documents";
import { issueDateFor, issueTiming, urgentNoticeProblem } from "./issue-timing";

const NSW = statutoryRulesFor("NSW") as NswRules;
const QLD = PENDING_RULE_PACKS.QLD.rules;

/** A building's rules as a Queensland pack gives them: the shared rules only. */
const qldShaped: StatutoryRules = {
  TERMINOLOGY: QLD.TERMINOLOGY,
  FUND_CATALOGUE: QLD.FUND_CATALOGUE,
  ENTITLEMENT_SCHEDULES: QLD.ENTITLEMENT_SCHEDULES,
  PAYMENT_ALLOCATION_ORDER: QLD.PAYMENT_ALLOCATION_ORDER,
  FEATURES: QLD.FEATURES,
  NOTICE_RULES: QLD.NOTICE_RULES,
};

// For the content check against the database: the building's pack is the Queensland-shaped one.
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  return { ...actual, rulesForState: (state: string) => (state === "QLD-SHAPED" ? { pack: null, rules: qldShaped, label: "test" } : actual.rulesForState(state)) };
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
    // Queensland's penalty sentence is step 6: here the building has resolved not to charge one.
    noInterest: true,
    interest: NSW.STATUTORY_INTEREST,
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

describe("checking notices for a pack without the NSW interest rule", () => {
  it("stops before any notice is issued, rather than printing NSW interest (step 6 adds the penalty sentence)", async () => {
    sharedFake.reset({
      Scheme: [{ id: "q1", state: "QLD-SHAPED", name: "Harbour View", planNumber: "12345" }],
      Fund: [{ id: "f1", schemeId: "q1", name: "Administrative fund" }],
      Profile: [{ id: "adviser", firstName: "Sam", lastName: "Adviser", email: "sam@example.com" }],
      SchemeBankAccount: [],
      LotDetail: [],
    });
    const run = checkPlannedNotices({
      schemeId: "q1",
      fundId: "f1",
      issuerId: "adviser",
      noticeDate: "2026-10-01",
      notices: [{ lotId: "l1", lotNumber: "7", ownerId: null, noticeNumber: "LN-0001", dueDate: "2026-11-05", amountCents: 100 }],
    });
    await expect(run).rejects.toBeInstanceOf(RuleNotInPackError);
    await expect(run).rejects.toMatchObject({ rule: "STATUTORY_INTEREST", jurisdiction: "Qld" });
  });
});
