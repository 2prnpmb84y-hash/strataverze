/**
 * Issuing notices under checked notice rules with the REAL content check
 * (VIC, ACT and WA stage 2, PR 6a review, 28 Oct 2026). issue-notices.test.ts
 * mocks checkPlannedNotices; here every path runs it:
 * - an ACT-shaped pack (a 28-day maximum) plans a quarterly schedule, and
 *   each later notice is checked from the day it goes out, so instalments 2
 *   to 4 are not measured from instalment 1's date; the daily job and the
 *   overdue confirm send them;
 * - the real WA pending pack is refused on every path, because notices cannot
 *   state an annual-rate late charge yet (otherwise they would be issued and
 *   posted but never sent);
 * - (PR 6b) an ACT-shaped pack that requires each other unit's contribution,
 *   the fund total and the proportion has them stated where the data is there
 *   (and refuses otherwise), and the email states them without the PDF; the
 *   real ACT pending pack is then refused only for the instalment dates, the
 *   discount and the interest (and a sinking fund notice for its yearly mode).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const sent = vi.hoisted(() => ({ emails: [] as string[], html: [] as string[], activity: [] as Array<{ action: string; metadata: unknown }> }));
const packs = vi.hoisted(() => ({ ACT_SHAPED: null as unknown, ACT_CONTENTS: null as unknown }));

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] })),
}));
vi.mock("@/lib/queries/schemes", async (orig) => {
  const { sharedFake } = await import("@/test/fake-orm");
  return { ...(await orig()), getSchemeById: vi.fn(async (id: string) => sharedFake.table("Scheme").find((s) => s.id === id) ?? null) };
});
vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(async (a: { action: string; metadata: unknown }) => {
    sent.activity.push({ action: a.action, metadata: a.metadata });
  }),
  getAuditTrailForExport: vi.fn(),
  formatAuditTrailCsv: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { subject: string; html: string }) => {
    sent.emails.push(e.subject);
    sent.html.push(e.html);
    return true;
  }),
}));
vi.mock("@/lib/pdf/generate", () => ({ generateLevyNoticePdf: vi.fn(async () => null) }));
vi.mock("@/lib/levies/load-plan-lots", () => ({
  loadPlanLots: vi.fn(async (schemeId: string) => [
    { lotId: `${schemeId}-l1`, lotNumber: "1", entitlement: 60, ownerId: "o1" },
    { lotId: `${schemeId}-l2`, lotNumber: "2", entitlement: 40, ownerId: null },
  ]),
}));
vi.mock("@/lib/levies/contribution-insurance", () => ({ contributionInsurance: vi.fn(async () => ({ split: null, problem: null })) }));
vi.mock("@/lib/finance/owner-credits", async (orig) => ({ ...(await orig()), applyOwnerCredit: vi.fn(async () => 0) }));
vi.mock("@/lib/queries/account-codes", async (orig) => ({ ...(await orig()), getSystemAccountBySubType: vi.fn(async (s: string, t: string) => ({ id: `acc-${s}-${t}` })) }));
vi.mock("@/lib/queries/journal-numbering", async (orig) => {
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...(await orig()),
    numberedTransaction: vi.fn(async (_s: string, fn: (tx: { orm: unknown }) => Promise<unknown>) => fn({ orm: sharedFake.db.orm })),
    addNumberedJournal: vi.fn(async () => ({ entry: { id: "je" }, entryNumber: "JE-0001" })),
  };
});
// The ACT-shaped building gets the fixture pack; the WA building the real WA pending pack.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) =>
    state === "ACT-SHAPED"
      ? { pack: null, rules: packs.ACT_SHAPED, label: "AU-ACT test" }
      : state === "ACT-CONTENTS"
        ? { pack: null, rules: packs.ACT_CONTENTS, label: "AU-ACT contents test" }
        : state === "ACT"
          ? { pack: null, rules: PENDING_RULE_PACKS.ACT.rules, label: "AU-ACT draft" }
          : state === "WA"
            ? { pack: null, rules: PENDING_RULE_PACKS.WA.rules, label: "AU-WA test" }
            : actual.rulesForState(state);
  const forScheme = async (schemeId: string) => {
    const { sharedFake } = await import("@/test/fake-orm");
    return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
  };
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: forScheme,
    messageTermsFor: async (schemeId: string) => ((await forScheme(schemeId)).rules as { TERMINOLOGY: unknown }).TERMINOLOGY,
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { QLD_RULE_PACK, PENDING_RULE_PACKS } = await import("@/config/statutory");
const { issueScheduleNoticesAction, issueOverdueNoticesAction } = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const { issueDueNotices } = await import("./issue-notices");
const { checkPlannedNotices } = await import("./notice-content-data");

const has = (value: unknown, status = "STRATAVERZE") => ({ value, status, source: "Test Act s 1" }) as never;
// An ACT-shaped pack whose late charge notices can state (a monthly penalty), with checked rules that require nothing else.
packs.ACT_SHAPED = {
  ...QLD_RULE_PACK.rules,
  NOTICE_RULES: {
    minimumNoticeDays: 14,
    issueDaysBeforeDue: 28,
    urgentNoticeDays: null,
    hardship: null,
    contents: [],
    source: "Test Act",
    checked: {
      minimumNoticeDays: has(14),
      maximumNoticeDays: has(28, "CONFIRMED"),
      issueDaysBeforeDue: has(28),
      dueDateMayMove: has(true),
      noticeMode: { ADMINISTRATIVE: has("PER_INSTALMENT") },
      requiredContents: [],
      form: null,
      source: "Test Act",
    },
  },
};

// The same, requiring each other unit's contribution, the fund total and the proportion (stage 2, PR 6b),
// with each lot's contribution shared by its entitlement alone (no insurance split).
const ACT_SHAPED_RULES = packs.ACT_SHAPED as typeof QLD_RULE_PACK.rules;
const ACT_CONTENTS = {
  ...Object.fromEntries(Object.entries(ACT_SHAPED_RULES).filter(([key]) => key !== "CONTRIBUTION_INSURANCE")),
  NOTICE_RULES: {
    ...ACT_SHAPED_RULES.NOTICE_RULES,
    checked: {
      ...ACT_SHAPED_RULES.NOTICE_RULES.checked!,
      requiredContents: [
        { key: "EVERY_LOT_CONTRIBUTION", words: "the contribution for each other unit", status: "CONFIRMED", source: "Test Act s 4(b)" },
        { key: "FUND_TOTAL", words: "the fund and the totals", ledgerFunds: ["ADMINISTRATIVE"], status: "CONFIRMED", source: "Test Act s 4(c)" },
        { key: "PROPORTION_AND_METHOD", words: "the unit's proportion and how it is worked out", status: "CONFIRMED", source: "Test Act s 4(d)" },
      ],
    },
  },
};
packs.ACT_CONTENTS = ACT_CONTENTS;

const A = "act-shaped";
const WA = "wa-real";
const C = "act-contents";
const R = "act-real";
const at = (day: string) => vi.setSystemTime(new Date(`${day}T02:00:00.000Z`));
const confirm = () => {
  const fd = new FormData();
  fd.set("confirmLate", "on");
  return fd;
};
const notices = (schemeId: string) => sharedFake.table("LevyNotice").filter((n) => n.schemeId === schemeId);

const STATE: Record<string, string> = { [A]: "ACT-SHAPED", [WA]: "WA", [C]: "ACT-CONTENTS", [R]: "ACT" };

function seed() {
  const ids = [A, WA, C, R];
  sharedFake.reset({
    Scheme: ids.map((id) => ({
      id,
      state: STATE[id],
      name: "Harbour View",
      planNumber: "SP 1",
      timeZone: "Australia/Sydney",
      financialYearEnd: "06-30",
      autoApplyOwnerCredit: true,
      interestMode: id === A || id === C ? "RESOLVED_RATE" : "STATUTORY",
      lateChargeMonthlyRatePercent: id === A || id === C ? "2.50" : null,
    })),
    Fund: ids.flatMap((s) => [
      { id: `${s}-admin`, schemeId: s, name: "Administrative fund", fundType: "ADMINISTRATIVE", isActive: true },
      { id: `${s}-sinking`, schemeId: s, name: "Sinking fund", fundType: "CAPITAL_WORKS", isActive: true },
    ]),
    SchemeBankAccount: ids.map((s) => ({ id: `${s}-bank`, schemeId: s, isActive: true, isOperating: true, accountName: "The Owners", bsb: "062-000", accountNumber: "1" })),
    Lot: ids.flatMap((s) => [
      { id: `${s}-l1`, schemeId: s, lotNumber: "1", entitlement: 60 },
      { id: `${s}-l2`, schemeId: s, lotNumber: "2", entitlement: 40 },
      // Common property is not a unit: never listed, its entitlement nil.
      ...(s === C || s === R ? [{ id: `${s}-cp`, schemeId: s, lotNumber: "CP", entitlement: 0, lotType: "COMMON" }] : []),
    ]),
    LotDetail: ids.map((s) => ({ id: `${s}-d2`, lotId: `${s}-l2`, rollOwnerName: "Robin Roll" })),
    Profile: [
      { id: "adviser", firstName: "Sam", lastName: "Adviser", email: "sam@example.com" },
      { id: "o1", firstName: "Alex", lastName: "Nguyen", email: "alex@example.com" },
    ],
    SchemeMembership: ids.map((s) => ({ id: `${s}-m`, schemeId: s, profileId: "adviser", role: "ADVISER", isActive: true })),
    Budget: ids.map((s) => ({ id: `${s}-b`, schemeId: s, fundId: `${s}-admin`, financialYear: 2026, version: 1, status: "ADOPTED" })),
    BudgetLine: [],
    LevySchedule: ids.map((s) => ({
      id: `${s}-q`,
      schemeId: s,
      fundId: `${s}-admin`,
      financialYear: 2026,
      budgetAmount: "40000.00",
      frequency: "QUARTERLY",
      levyType: "ORDINARY",
      totalLots: 2,
      totalEntitlement: "100",
      status: "APPROVED",
      approvedBy: "adviser",
      approvedAt: "2026-04-20",
      dueDate: null,
      raisedBeforeTakeover: null,
    })),
    LevyNotice: [],
    LevyPayment: [],
  });
  sharedFake.setRelations({ LevySchedule: { levyNotices: { table: "LevyNotice", foreignKey: "levyScheduleId" } } });
  sent.emails = [];
  sent.html = [];
  sent.activity = [];
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(seed);

describe("an ACT-shaped pack with a 28-day maximum, through the real content check", () => {
  it("plans a quarterly schedule: each later notice is checked from its own day, so none is refused for the maximum", async () => {
    at("2026-05-01");
    const r = await issueScheduleNoticesAction(A, `${A}-q`, {}, new FormData());
    expect(r).toMatchObject({ success: true, data: { count: 0, planned: 8, nextIssueOn: "2026-06-03" } });
    expect(JSON.stringify(r)).not.toContain("NOTICE_PERIOD_MAX");
    expect([...new Set(notices(A).map((n) => String(n.dueDate)))]).toEqual(["2026-07-01", "2026-10-01", "2027-01-01", "2027-04-01"]);
  });

  it("sends each instalment on its day through the daily job, and an overdue one when confirmed", async () => {
    at("2026-05-01");
    await issueScheduleNoticesAction(A, `${A}-q`, {}, new FormData());
    at("2026-06-03");
    expect((await issueDueNotices(new Date("2026-06-03T02:00:00.000Z"))).find((x) => x.schemeId === A)).toMatchObject({ issued: 2, held: null });
    at("2026-09-03");
    expect((await issueDueNotices(new Date("2026-09-03T02:00:00.000Z"))).find((x) => x.schemeId === A)).toMatchObject({ issued: 2, held: null });
    // The third instalment's 28-day mark (4 Dec) has passed: 22 days left, sent once confirmed.
    at("2026-12-10");
    expect(await issueOverdueNoticesAction(A, `${A}-q`, {}, confirm())).toEqual({ success: true, data: { count: 2, emailed: 1 } });
    expect(notices(A).filter((n) => n.status === "ISSUED").map((n) => String(n.dueDate)).sort()).toEqual(["2026-07-01", "2026-07-01", "2026-10-01", "2026-10-01", "2027-01-01", "2027-01-01"]);
  });

  it("still refuses a notice whose own date is too far from its due date", async () => {
    at("2026-05-01");
    const missing = await checkPlannedNotices({
      schemeId: A,
      fundId: `${A}-admin`,
      issuerId: "adviser",
      noticeDate: "2026-06-03",
      notices: [{ lotId: `${A}-l1`, lotNumber: "1", ownerId: "o1", noticeNumber: "LN-9", dueDate: "2026-10-01", amountCents: 100 }],
    });
    expect(missing.map((m) => m.code)).toEqual(["NOTICE_PERIOD_MAX"]);
  });
});

describe("the real WA pending pack", () => {
  const REASON = `Notices cannot state this building's interest yet (${PENDING_RULE_PACKS.WA.rules.LATE_CHARGE.source}), so no notice can be issued until they can.`;

  it("is refused by the content check, because notices cannot state its late charge", async () => {
    at("2026-05-01");
    const missing = await checkPlannedNotices({
      schemeId: WA,
      fundId: `${WA}-admin`,
      issuerId: "adviser",
      noticeDate: "2026-05-27",
      notices: [{ lotId: `${WA}-l1`, lotNumber: "1", ownerId: "o1", noticeNumber: "LN-1", dueDate: "2026-07-01", amountCents: 100 }],
    });
    expect(missing).toContainEqual({ code: "LATE_CHARGE_WORDING", message: REASON });
  });

  it("plans nothing in the generate action", async () => {
    at("2026-05-01");
    const r = await issueScheduleNoticesAction(WA, `${WA}-q`, {}, new FormData());
    expect(r.error).toContain("cannot be issued yet");
    expect(r.data?.missing).toContainEqual({ code: "LATE_CHARGE_WORDING", message: REASON });
    expect(notices(WA)).toEqual([]);
  });

  it("issues nothing from the daily job or the overdue confirm, and sends nothing", async () => {
    // Planned notices, as if a schedule had been planned before the check.
    sharedFake.table("LevySchedule").find((s) => s.id === `${WA}-q`)!.status = "ACTIVE";
    for (const [i, dueDate] of ["2026-07-01", "2026-10-01"].entries()) {
      for (const lot of ["l1", "l2"]) {
        sharedFake.table("LevyNotice").push({
          id: `${WA}-n${i}-${lot}`, schemeId: WA, levyScheduleId: `${WA}-q`, lotId: `${WA}-${lot}`, ownerId: lot === "l1" ? "o1" : null, fundId: `${WA}-admin`,
          noticeNumber: `LN-${i}${lot}`, periodStart: dueDate, periodEnd: dueDate, dueDate, amountDue: "5000.00", status: "DRAFT",
        });
      }
    }
    at("2026-05-27");
    const run = (await issueDueNotices(new Date("2026-05-27T02:00:00.000Z"))).find((x) => x.schemeId === WA);
    expect(run).toMatchObject({ issued: 0 });
    expect(run?.held).toContain(REASON);
    // 30 Aug: the first instalment can no longer go out (held); the second, 32 days away, is refused for its late charge.
    at("2026-08-30");
    const r = await issueOverdueNoticesAction(WA, `${WA}-q`, {}, confirm());
    expect(r.error).toContain("cannot be issued yet");
    expect(r.data?.missing).toContainEqual({ code: REASON, message: REASON });
    expect(notices(WA).every((n) => n.status === "DRAFT")).toBe(true);
    expect(sent.emails).toEqual([]);
  });
});

describe("an ACT-shaped pack that requires each other unit's contribution, the fund total and the proportion (PR 6b)", () => {
  const planned = (lotId: string, over: Record<string, unknown> = {}) => ({
    lotId: `${C}-${lotId}`,
    lotNumber: lotId === "l1" ? "1" : "2",
    ownerId: lotId === "l1" ? "o1" : null,
    noticeNumber: `LN-${lotId}`,
    dueDate: "2026-07-01",
    amountCents: lotId === "l1" ? 600_000 : 400_000,
    periodStart: "2026-07-01",
    ...over,
  });
  const check = (input: Record<string, unknown> = {}) =>
    checkPlannedNotices({ schemeId: C, fundId: `${C}-admin`, issuerId: "adviser", noticeDate: "2026-06-03", levyScheduleId: `${C}-q`, notices: [planned("l1"), planned("l2")], ...input });
  const refusedFor = (missing: { code: string; message: string }[]) =>
    missing.filter((m) => m.code === "NOTICE_RULES_NOT_CONFIRMED").map((m) => m.message.match(/\(Test Act s 4\((\w)\)\)/)?.[1]);

  it("states them for planned notices of the schedule, so nothing is missing", async () => {
    at("2026-05-01");
    expect(await check()).toEqual([]);
  });

  it("refuses each where its data is not there", async () => {
    at("2026-05-01");
    // No schedule, or no period: none of the three.
    expect(refusedFor(await check({ levyScheduleId: undefined }))).toEqual(["b", "c", "d"]);
    expect(refusedFor(await check({ notices: [planned("l1", { periodStart: undefined })] }))).toEqual(["b", "c", "d"]);
    // A schedule of another fund, or another building.
    sharedFake.table("LevySchedule").find((s) => s.id === `${C}-q`)!.fundId = `${C}-sinking`;
    expect(refusedFor(await check())).toEqual(["b", "c", "d"]);
    seed();
    expect(refusedFor(await check({ levyScheduleId: `${A}-q` }))).toEqual(["b", "c", "d"]);
    // Two notices for one unit in the period.
    expect(refusedFor(await check({ notices: [planned("l1"), planned("l1", { noticeNumber: "LN-x" })] }))).toEqual(["b", "c", "d"]);
    // A pack that shares insurance by another schedule: only the proportion.
    packs.ACT_CONTENTS = { ...ACT_CONTENTS, CONTRIBUTION_INSURANCE: ACT_SHAPED_RULES.CONTRIBUTION_INSURANCE };
    expect(refusedFor(await check())).toEqual(["d"]);
    packs.ACT_CONTENTS = ACT_CONTENTS;
    // The units' entitlements no longer add up to the schedule's total: only the proportion.
    sharedFake.table("Lot").find((l) => l.id === `${C}-l2`)!.entitlement = 50;
    expect(refusedFor(await check())).toEqual(["d"]);
  });

  it("plans the schedule, and the daily job emails each unit's contribution, the totals and the proportion, with no other owner named", async () => {
    at("2026-05-01");
    const r = await issueScheduleNoticesAction(C, `${C}-q`, {}, new FormData());
    expect(r).toMatchObject({ success: true, data: { count: 0, planned: 8 } });
    at("2026-06-03");
    expect((await issueDueNotices(new Date("2026-06-03T02:00:00.000Z"))).find((x) => x.schemeId === C)).toMatchObject({ issued: 2, held: null });
    // Only unit 1 has an owner with an email. The PDF is not attached (the mock gives none), so the email states it all.
    expect(sent.html).toHaveLength(1);
    const html = sent.html[0];
    for (const s of ["Contribution for each lot", "1 (this lot)", "$6,000.00", "$4,000.00", "Total, all lots", "$10,000.00", "The year, all lots", "$40,000.00", "60 of 100 (60%)"]) {
      expect(html).toContain(s);
    }
    expect(html).not.toContain(">CP<");
    expect(html).not.toContain("Robin Roll");
    expect(html.match(/Alex Nguyen/g)).toHaveLength(1);
  });

  it("gives the PDF the same content, and a unit with no notice for the period as nil", async () => {
    at("2026-05-01");
    await issueScheduleNoticesAction(C, `${C}-q`, {}, new FormData());
    // Unit 2's first notice is gone (as if never raised): it shows as nil.
    const table = sharedFake.table("LevyNotice");
    const first = table.find((n) => n.lotId === `${C}-l1` && String(n.periodStart) === "2026-07-01")!;
    table.splice(table.findIndex((n) => n.lotId === `${C}-l2` && String(n.periodStart) === "2026-07-01"), 1);
    first.issuedAt = "2026-06-03T02:00:00.000Z";
    const { levyNoticeData } = await vi.importActual<typeof import("@/lib/pdf/generate")>("@/lib/pdf/generate");
    const loaded = await levyNoticeData(String(first.id), "adviser");
    expect(loaded?.data.everyLot).toEqual({
      words: { lot: "lot", lots: "lots", levy: QLD_RULE_PACK.rules.TERMINOLOGY.levy, entitlement: "contribution schedule lot entitlement" },
      rows: [
        { lotNumber: "1", cents: 600_000, thisLot: true },
        { lotNumber: "2", cents: null, thisLot: false },
      ],
      totalCents: 600_000,
      fund: { name: "Administrative fund", scheduleTotalCents: 4_000_000, wholeYear: true },
      proportion: { entitlement: 60, totalEntitlement: 100 },
    });
    expect(JSON.stringify(loaded?.data.everyLot)).not.toContain("Robin Roll");
    // A pack that does not require it has no everyLot key at all (as NSW and Queensland).
    const other = { ...first, id: "other", schemeId: A, levyScheduleId: `${A}-q`, lotId: `${A}-l1`, fundId: `${A}-admin` };
    table.push(other);
    expect("everyLot" in (await levyNoticeData("other", "adviser"))!.data).toBe(false);
  });
});

describe("the real ACT pending pack after PR 6b", () => {
  const check = (fundId: string) =>
    checkPlannedNotices({
      schemeId: R,
      fundId,
      issuerId: "adviser",
      noticeDate: "2026-06-03",
      levyScheduleId: `${R}-q`,
      notices: [
        { lotId: `${R}-l1`, lotNumber: "1", ownerId: "o1", noticeNumber: "LN-1", dueDate: "2026-07-01", amountCents: 600_000, periodStart: "2026-07-01" },
        { lotId: `${R}-l2`, lotNumber: "2", ownerId: null, noticeNumber: "LN-2", dueDate: "2026-07-01", amountCents: 400_000, periodStart: "2026-07-01" },
      ],
    });
  const act = PENDING_RULE_PACKS.ACT.rules;
  const words = (key: string) => act.NOTICE_RULES.checked!.requiredContents.find((r) => r.key === key)!;
  const refusal = (key: string) => `The notice must state ${words(key).words} (${words(key).source}). StrataVerze notices cannot state it yet, so no notice can be issued.`;
  const LATE = { code: "LATE_CHARGE_WORDING", message: `Notices cannot state this building's interest yet (${act.LATE_CHARGE.source}), so no notice can be issued until they can.` };

  it("refuses an administrative fund notice only for the instalment dates, the discount and the interest", async () => {
    at("2026-05-01");
    expect(await check(`${R}-admin`)).toEqual([
      { code: "NOTICE_RULES_NOT_CONFIRMED", message: refusal("INSTALMENT_DATES") },
      { code: "NOTICE_RULES_NOT_CONFIRMED", message: refusal("EARLY_PAYMENT_DISCOUNT") },
      { code: "NOTICE_RULES_NOT_CONFIRMED", message: refusal("LATE_CHARGE_STATEMENT") },
      LATE,
    ]);
  });

  it("refuses a sinking fund notice for its yearly mode too, and states its year's total from a budget schedule", async () => {
    at("2026-05-01");
    sharedFake.table("LevySchedule").find((s) => s.id === `${R}-q`)!.fundId = `${R}-sinking`;
    const missing = await check(`${R}-sinking`);
    expect(missing.map((m) => m.message.slice(0, 40))).toEqual([
      "Notices for the capital works or sinking",
      refusal("INSTALMENT_DATES").slice(0, 40),
      refusal("EARLY_PAYMENT_DISCOUNT").slice(0, 40),
      refusal("LATE_CHARGE_STATEMENT").slice(0, 40),
      LATE.message.slice(0, 40),
    ]);
    expect(missing.some((m) => m.message.includes("each other unit") || m.message.includes("proportion") || m.message.includes("sinking fund contribution for the year"))).toBe(false);
  });
});
