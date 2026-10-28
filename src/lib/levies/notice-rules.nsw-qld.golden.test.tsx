/**
 * NSW and Queensland levy notice rules, golden (VIC, ACT and WA stage 2,
 * PR 6a, 28 Oct 2026). Recorded on origin/main (0aa016d) in a temporary
 * worktree, before the checked notice rules (minimum, maximum, lead, whether
 * a due date may move, notice mode, required contents and approved form)
 * were added for Victoria, the ACT and WA. NSW and Queensland must give
 * exactly the same results, rows, calls, words, bytes and markup after that
 * change. Never regenerate these snapshots to make a change pass: a
 * difference is a change to NSW or Queensland.
 *
 * Covered: the content check over a grid (notice period, urgent notice,
 * hardship statement before and after it was required, late charge stated or
 * not), the timing (issue date, planned, late or moved, the late message,
 * the urgent refusal, the timing words) for every day from 60 days before a
 * due date to the day after, the notice PDF blocks and bytes and the notice
 * email (NSW, NSW no interest, Queensland with and without a penalty, a
 * Queensland insurance split), the generate action (NSW quarterly on time,
 * late and moved, NSW special and urgent special levy, Queensland ordinary,
 * Queensland urgent refused, a notice missing content), the daily job, the
 * overdue drafts and the confirm action, the Queensland schedule page
 * (approved, planned and overdue) and the issue and overdue forms.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/adviser/schemes/s/finance/levies/x",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));

const calls = vi.hoisted(() => [] as Array<[string, unknown]>);
const planLots = vi.hoisted(() => new Map<string, Array<{ lotId: string; lotNumber: string; entitlement: number; ownerId: string | null }>>());
const record = (name: string) => (arg: unknown) => {
  calls.push([name, JSON.parse(JSON.stringify(arg ?? null))]);
};

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
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adviser" })) }));
vi.mock("@/lib/queries/schemes", async (orig) => {
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...(await orig()),
    getSchemeById: vi.fn(async (id: string) => {
      const row = sharedFake.table("Scheme").find((s) => s.id === id);
      return row ? { ...row, memberships: [{ profileId: "adviser", role: "ADVISER" }] } : null;
    }),
  };
});
vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(async (a: unknown) => record("logActivity")(a)),
  getAuditTrailForExport: vi.fn(),
  formatAuditTrailCsv: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { to: string; subject: string; html: string; attachments?: unknown[] }) => {
    record("sendEmail")({ to: e.to, subject: e.subject, attachments: e.attachments?.length ?? 0, html: createHash("sha256").update(e.html).digest("hex") });
    return true;
  }),
}));
vi.mock("@/lib/pdf/generate", () => ({
  generateLevyNoticePdf: vi.fn(async (noticeId: string, actorId: string) => {
    record("generateLevyNoticePdf")({ noticeId, actorId });
    return null;
  }),
}));
vi.mock("@/lib/levies/load-plan-lots", () => ({ loadPlanLots: vi.fn(async (schemeId: string) => planLots.get(schemeId) ?? []) }));
vi.mock("@/lib/levies/contribution-insurance", () => ({ contributionInsurance: vi.fn(async () => ({ split: null, problem: null })) }));
vi.mock("@/lib/billing/capture", () => ({ transactionFeeTable: vi.fn(async () => null), captureUsageFee: vi.fn(), captureTransactionFee: vi.fn() }));
vi.mock("@/lib/finance/owner-credits", async (orig) => ({
  ...(await orig()),
  applyOwnerCredit: vi.fn(async (a: unknown) => {
    record("applyOwnerCredit")(a);
    return 0;
  }),
}));
vi.mock("@/lib/queries/account-codes", async (orig) => ({
  ...(await orig()),
  getSystemAccountBySubType: vi.fn(async (schemeId: string, subType: string, fundType?: string) => ({ id: `acc-${schemeId}-${subType}-${fundType ?? ""}` })),
}));
vi.mock("@/lib/queries/journal-numbering", async (orig) => {
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...(await orig()),
    numberedTransaction: vi.fn(async (_schemeId: string, fn: (tx: { orm: unknown }) => Promise<unknown>) => fn({ orm: sharedFake.db.orm })),
    addNumberedJournal: vi.fn(async (_tx: unknown, data: unknown, postedBy: string | null) => {
      record("addNumberedJournal")({ data, postedBy });
      return { entry: { id: "je" }, entryNumber: "JE-0001" };
    }),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { validateLevyNoticeContent } = await import("@/lib/finance/levy-notice-content");
const T = await import("./issue-timing");
const W = await import("@/lib/jurisdiction/wording");
const { levyNoticeBlocks, renderLevyNoticePdf } = await import("@/lib/pdf/documents");
const { levyNoticeEmail } = await import("@/lib/email-templates/levy-notice");
const { noticeFundWords } = await import("./notice-content-data");
const { issueScheduleNoticesAction, issueOverdueNoticesAction } = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const { issueDueNotices, overdueDrafts } = await import("./issue-notices");
const LevySchedulePage = (await import("@/app/(portal)/adviser/schemes/[id]/finance/levies/[scheduleId]/page")).default;
const { IssueNoticesForm, OverdueNoticesForm } = await import("@/app/(portal)/adviser/schemes/[id]/finance/levies/[scheduleId]/schedule-actions");
const { statutoryRulesFor, QLD_RULE_PACK } = await import("@/config/statutory");

const NSW = statutoryRulesFor("NSW");
const QLD = QLD_RULE_PACK.rules;
const PACKS = [
  ["NSW", NSW],
  ["QLD", QLD],
] as const;

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ─── 1. The content check over a grid ─────────────────────────────────────

const complete = {
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
const GAPS = [-1, 0, 13, 14, 29, 30, 31, 35, 60, 400];
const NOTICE_DATES = ["2025-10-26", "2025-10-27", "2026-10-28"];
const LATE = [
  { name: "states", includesInterestWarning: true },
  { name: "silent", includesInterestWarning: false },
  { name: "silent-none-applies", includesInterestWarning: false, lateChargeApplies: false },
  { name: "silent-applies", includesInterestWarning: false, lateChargeApplies: true },
] as const;

describe("1. the content check", () => {
  for (const [name, rules] of PACKS) {
    it(`${name}: the grid`, () => {
      const out: string[] = [];
      for (const noticeDate of NOTICE_DATES) {
        for (const gap of GAPS) {
          for (const urgent of [false, true]) {
            for (const late of LATE) {
              for (const hardship of [true, false]) {
                const { name: lateName, ...lateFields } = late;
                const input = { ...complete, noticeDate, dueDate: addDays(noticeDate, gap), isUrgentSpecialLevy: urgent, ...lateFields, includesHardshipStatement: hardship };
                const plain = validateLevyNoticeContent(input, rules.NOTICE_RULES);
                const worded = validateLevyNoticeContent(input, rules.NOTICE_RULES, rules.TERMINOLOGY, noticeFundWords(rules));
                out.push(`${noticeDate}|${gap}|${urgent ? "urgent" : "usual"}|${lateName}|${hardship ? "hardship" : "none"} => ${JSON.stringify(plain)} ${JSON.stringify(worded)}`);
              }
            }
          }
        }
      }
      expect(out).toMatchSnapshot();
    });

    it(`${name}: a notice missing everything, and bad dates`, () => {
      const empty = {
        scheme: { name: null, planNumber: " " },
        lotNumber: null,
        ownerNames: [" "],
        noticeDate: "2026-1-1",
        dueDate: "",
        fundName: null,
        amountCents: 0,
        payment: { accountName: null, bsb: null, accountNumber: null, reference: null },
        contact: { name: null, emailOrPhone: null },
        includesInterestWarning: false,
        includesHardshipStatement: false,
        includesLedgerAccess: false,
      };
      expect([
        validateLevyNoticeContent(empty, rules.NOTICE_RULES),
        validateLevyNoticeContent(empty, rules.NOTICE_RULES, rules.TERMINOLOGY, noticeFundWords(rules)),
        validateLevyNoticeContent({ ...complete, dueDate: "2026/11/05" }, rules.NOTICE_RULES),
        validateLevyNoticeContent({ ...complete, isUrgentSpecialLevy: undefined, dueDate: "2026-10-14" }, rules.NOTICE_RULES, rules.TERMINOLOGY),
      ]).toMatchSnapshot();
    });
  }
});

// ─── 2. Timing and its words ──────────────────────────────────────────────

/** Rules in the NSW and Queensland shape with other numbers (no other field), as a pack could give them. */
const SHAPED = [
  ["NSW", NSW.NOTICE_RULES],
  ["QLD", QLD.NOTICE_RULES],
  ["40/21/7", { ...NSW.NOTICE_RULES, issueDaysBeforeDue: 40, minimumNoticeDays: 21, urgentNoticeDays: 7 }],
  ["7/7/null", { ...QLD.NOTICE_RULES, issueDaysBeforeDue: 7, minimumNoticeDays: 7, urgentNoticeDays: null }],
  ["1/0/null", { ...QLD.NOTICE_RULES, issueDaysBeforeDue: 1, minimumNoticeDays: 0, urgentNoticeDays: null }],
] as const;
const DUE = ["2026-12-01", "2027-01-01", "2024-03-01"];

describe("2. timing", () => {
  for (const [name, rule] of SHAPED) {
    it(`${name}: every day from 60 days before to the day after`, () => {
      const out: string[] = [];
      for (const due of DUE) {
        out.push(`${due} issueDateFor => ${T.issueDateFor(due, rule)}`);
        for (let d = -60; d <= 1; d++) {
          const today = addDays(due, d);
          const t = T.issueTiming(due, today, rule);
          out.push(`${due}|${today} => ${JSON.stringify(t)} ${JSON.stringify(T.lateMessage(t, "Instalment 2", rule))}`);
        }
      }
      expect(out).toMatchSnapshot();
    });

    it(`${name}: the words`, () => {
      expect({
        timing: W.noticeTimingWords(rule),
        lead: W.noticeLeadText(rule),
        mark: W.noticeLeadMark(rule),
        urgentNsw: T.urgentNoticeProblem(rule, NSW.TERMINOLOGY),
        urgentQld: T.urgentNoticeProblem(rule, QLD.TERMINOLOGY),
      }).toMatchSnapshot();
    });
  }

  it("the lead words for other numbers of days", () => {
    expect([0, 1, 6, 7, 14, 28, 30, 35, 40, 70].map((d) => [d, W.noticeLeadText({ issueDaysBeforeDue: d }), W.noticeLeadMark({ issueDaysBeforeDue: d })])).toMatchSnapshot();
  });
});

// ─── 3. The notice: PDF and email ─────────────────────────────────────────

const doc = (rules: typeof NSW, setting: { mode: string; monthlyRatePercent?: number | null }, extra: Record<string, unknown> = {}) => ({
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
  payment: complete.payment,
  contact: complete.contact,
  ledgerUrl: "https://app.strataverze.com/owner/levies",
  ...W.noticeLateCharge(rules.LATE_CHARGE, setting),
  hardship: rules.NOTICE_RULES.hardship?.information ?? null,
  terms: rules.TERMINOLOGY,
  ...extra,
});
const DOCS = [
  ["NSW", doc(NSW, { mode: "STATUTORY" })],
  ["NSW no interest", doc(NSW, { mode: "NO_INTEREST" }, { periodStart: null, periodEnd: null, ownerNames: [] })],
  ["QLD penalty", doc(QLD as typeof NSW, { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 })],
  ["QLD no penalty", doc(QLD as typeof NSW, { mode: "NONE" })],
  ["QLD insurance split", doc(QLD as typeof NSW, { mode: "RESOLVED_RATE", monthlyRatePercent: 1.25 }, { insurance: { cents: 12_345, basis: "Insurance is shared by the interest schedule lot entitlement; the rest by the contribution schedule lot entitlement." } })],
] as const;

describe("3. the notice", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T01:00:00.000Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  for (const [name, d] of DOCS) {
    it(`${name}: PDF blocks and bytes, and the email`, async () => {
      const bytes = await renderLevyNoticePdf(d);
      expect({
        blocks: levyNoticeBlocks(d),
        pdf: createHash("sha256").update(bytes).digest("hex"),
        email: levyNoticeEmail({ to: "alex@example.com", ownerName: "Alex Nguyen", amount: "825.09", ...d, planNumber: "12345" }),
      }).toMatchSnapshot();
    });
  }
});

// ─── 4. Issuing: the actions, the daily job and the page ──────────────────

const N1 = "n1-nsw-on-time";
const N2 = "n2-nsw-late";
const N3 = "n3-nsw-moved";
const Q1 = "q1-qld";
const Q2 = "q2-qld-no-bank";
const SCHEMES = [N1, N2, N3, Q1, Q2];
const isQld = (s: string) => s.startsWith("q");

const at = (day: string) => vi.setSystemTime(new Date(`${day}T02:00:00.000Z`));
const form = (fields: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const rows = (name: string) => JSON.parse(JSON.stringify([...sharedFake.table(name)].sort((a, b) => String(a.id).localeCompare(String(b.id)))));
const errorOf = async (p: Promise<unknown>) => p.then((v) => v, (e: Error) => `${e.name}: ${e.message}`);

function seed() {
  const scheme = (id: string) => ({
    id,
    state: isQld(id) ? "QLD" : "NSW",
    name: isQld(id) ? "Palm Court" : "Harbour View",
    planNumber: isQld(id) ? "CTS 4321" : "SP 12345",
    timeZone: isQld(id) ? "Australia/Brisbane" : "Australia/Sydney",
    financialYearEnd: "06-30",
    autoApplyOwnerCredit: true,
    totalLots: 2,
    totalEntitlement: 100,
    interestMode: isQld(id) ? "RESOLVED_RATE" : "STATUTORY",
    lateChargeMonthlyRatePercent: isQld(id) ? "2.50" : null,
    interestResolutionMeetingId: isQld(id) ? `${id}-agm` : null,
    interestResolutionMotionId: isQld(id) ? `${id}-motion` : null,
  });
  const schedule = (schemeId: string, id: string, extra: Record<string, unknown> = {}) => ({
    id,
    schemeId,
    fundId: `${schemeId}-admin`,
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
    title: null,
    description: null,
    raisedBeforeTakeover: null,
    ...extra,
  });
  sharedFake.reset({
    Scheme: SCHEMES.map(scheme),
    Fund: SCHEMES.map((s) => ({ id: `${s}-admin`, schemeId: s, name: isQld(s) ? "Administrative fund" : "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true, bankAccountId: null })),
    SchemeBankAccount: SCHEMES.filter((s) => s !== Q2).map((s) => ({ id: `${s}-bank`, schemeId: s, isActive: true, isOperating: true, accountName: `The Owners ${s}`, bsb: "062-000", accountNumber: "12345678" })),
    Lot: SCHEMES.flatMap((s) => [
      { id: `${s}-l1`, schemeId: s, lotNumber: "1", entitlement: 60 },
      { id: `${s}-l2`, schemeId: s, lotNumber: "2", entitlement: 40 },
    ]),
    LotDetail: SCHEMES.map((s) => ({ id: `${s}-d2`, lotId: `${s}-l2`, rollOwnerName: "Robin Roll" })),
    Profile: [
      { id: "adviser", firstName: "Sam", lastName: "Adviser", email: "sam@example.com" },
      { id: "o1", firstName: "Alex", lastName: "Nguyen", email: "alex@example.com" },
    ],
    SchemeMembership: SCHEMES.map((s) => ({ id: `${s}-m`, schemeId: s, profileId: "adviser", role: "ADVISER", isActive: true })),
    Budget: SCHEMES.map((s) => ({ id: `${s}-b`, schemeId: s, fundId: `${s}-admin`, financialYear: 2026, version: 1, status: "ADOPTED" })),
    BudgetLine: [],
    LevySchedule: [
      ...SCHEMES.map((s) => schedule(s, `${s}-q`)),
      schedule(N1, `${N1}-special`, { levyType: "SPECIAL", frequency: "ONE_OFF", budgetAmount: "10000.00", title: "Roof", approvedAt: "2026-05-01", dueDate: "2026-05-20" }),
      schedule(Q1, `${Q1}-special`, { levyType: "SPECIAL", frequency: "ONE_OFF", budgetAmount: "10000.00", title: "Pool", approvedAt: "2026-05-01", dueDate: "2026-06-15" }),
      schedule(Q1, `${Q1}-urgent`, { levyType: "SPECIAL", frequency: "ONE_OFF", budgetAmount: "5000.00", title: "Lift", approvedAt: "2026-05-01", dueDate: "2026-05-20" }),
    ],
    LevyNotice: [],
    LevyPayment: [],
  });
  sharedFake.setRelations({ LevySchedule: { levyNotices: { table: "LevyNotice", foreignKey: "levyScheduleId" } } });
  for (const s of SCHEMES) {
    planLots.set(s, [
      { lotId: `${s}-l1`, lotNumber: "1", entitlement: 60, ownerId: "o1" },
      { lotId: `${s}-l2`, lotNumber: "2", entitlement: 40, ownerId: null },
    ]);
  }
}

describe("4. issuing NSW and Queensland notices", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    seed();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("a. the generate action", async () => {
    const out: unknown[] = [];
    const issue = async (label: string, day: string, schemeId: string, scheduleId: string, fields: Record<string, string> = {}) => {
      at(day);
      out.push([label, day, await errorOf(issueScheduleNoticesAction(schemeId, scheduleId, {}, form(fields)))]);
    };
    // NSW quarterly, every notice on time (planned).
    await issue("NSW on time", "2026-05-01", N1, `${N1}-q`);
    // NSW quarterly, the first 32 days away: late, then confirmed.
    await issue("NSW late, unconfirmed", "2026-05-30", N2, `${N2}-q`);
    await issue("NSW late, confirmed", "2026-05-30", N2, `${N2}-q`, { confirmLate: "on" });
    // NSW quarterly, the first 21 days away: moved, then confirmed.
    await issue("NSW moved, unconfirmed", "2026-06-10", N3, `${N3}-q`);
    await issue("NSW moved, confirmed", "2026-06-10", N3, `${N3}-q`, { confirmLate: "on" });
    // NSW special levy due in 19 days: refused with the usual notice, issued as urgent.
    await issue("NSW special, not urgent", "2026-05-01", N1, `${N1}-special`);
    await issue("NSW special, urgent", "2026-05-01", N1, `${N1}-special`, { urgentSpecialLevy: "on" });
    // Queensland ordinary, planned; a Queensland special; the urgent option refused.
    await issue("QLD ordinary", "2026-05-01", Q1, `${Q1}-q`);
    await issue("QLD special", "2026-05-01", Q1, `${Q1}-special`);
    await issue("QLD urgent refused", "2026-05-01", Q1, `${Q1}-urgent`, { urgentSpecialLevy: "on" });
    await issue("QLD urgent without the option", "2026-05-01", Q1, `${Q1}-urgent`);
    // Queensland with no bank account: refused for the missing content.
    await issue("QLD missing content", "2026-05-01", Q2, `${Q2}-q`);
    // Again on an issued schedule.
    await issue("NSW again", "2026-05-02", N1, `${N1}-q`);
    expect(out).toMatchSnapshot("returns");
    expect(rows("LevyNotice")).toMatchSnapshot("notices");
    expect(rows("LevySchedule")).toMatchSnapshot("schedules");
  });

  it("b. the daily job", async () => {
    const out: unknown[] = [];
    // 13:00 UTC on 26 May is 23:00 in Sydney and Brisbane; 14:15 UTC is 00:15 on 27 May in Sydney, 00:15 in Brisbane too.
    for (const moment of ["2026-05-26T13:00:00.000Z", "2026-05-26T14:15:00.000Z", "2026-05-27T02:00:00.000Z", "2026-09-03T02:00:00.000Z", "2026-11-27T02:00:00.000Z", "2026-11-27T02:00:00.000Z"]) {
      vi.setSystemTime(new Date(moment));
      out.push([moment, await errorOf(issueDueNotices(new Date(moment)))]);
    }
    expect(out).toMatchSnapshot("results");
    expect(rows("LevyNotice")).toMatchSnapshot("notices");
  });

  it("c. the overdue drafts and the confirm action", async () => {
    const out: unknown[] = [];
    for (const [schemeId, day] of [
      [N1, "2026-08-30"],
      [N2, "2026-09-20"],
      [Q1, "2026-08-30"],
      [Q1, "2026-09-20"],
    ] as const) {
      at(day);
      out.push([schemeId, day, "drafts", await errorOf(overdueDrafts(schemeId, `${schemeId}-q`, day))]);
    }
    for (const [schemeId, day, fields] of [
      [N1, "2026-08-30", {}],
      [N1, "2026-08-30", { confirmLate: "on" }],
      [Q1, "2026-09-20", {}],
      [Q1, "2026-09-20", { confirmLate: "on" }],
      [Q1, "2026-09-21", { confirmLate: "on" }],
      [N3, "2026-12-20", { confirmLate: "on" }],
    ] as const) {
      at(day);
      out.push([schemeId, day, fields, await errorOf(issueOverdueNoticesAction(schemeId, `${schemeId}-q`, {}, form(fields)))]);
    }
    expect(out).toMatchSnapshot("returns");
    expect(rows("LevyNotice")).toMatchSnapshot("notices");
  });

  it("d. the Queensland schedule page: approved, planned and overdue", async () => {
    const page = async (schemeId: string, scheduleId: string, day: string) => {
      at(day);
      return renderToStaticMarkup(await LevySchedulePage({ params: Promise.resolve({ id: schemeId, scheduleId }) }));
    };
    expect(await page(Q2, `${Q2}-q`, "2026-05-01")).toMatchSnapshot("approved");
    expect(await page(N1, `${N1}-q`, "2026-12-01")).toMatchSnapshot("NSW planned");
    expect(await page(N2, `${N2}-q`, "2026-12-01")).toMatchSnapshot("NSW overdue");
    // Queensland with its last instalment planned, not yet overdue, then overdue.
    expect(await page(Q1, `${Q1}-q`, "2027-01-15")).toMatchSnapshot("QLD planned");
    expect(await page(Q1, `${Q1}-q`, "2027-03-10")).toMatchSnapshot("QLD overdue");
  });

  it("e. every call", () => {
    expect(JSON.parse(JSON.stringify(calls))).toMatchSnapshot();
  });
});

// ─── 5. The issue and overdue forms ───────────────────────────────────────

describe("5. the forms with each pack's timing", () => {
  for (const [name, rules] of PACKS) {
    it(name, () => {
      const timing = W.noticeTimingWords(rules.NOTICE_RULES);
      const levyWords = { levy: rules.TERMINOLOGY.levy, levies: rules.TERMINOLOGY.levies };
      expect([
        renderToStaticMarkup(<IssueNoticesForm schemeId="s1" scheduleId="sc1" isSpecial={false} noticeCount={8} blocked={false} timing={timing} levyWords={levyWords} />),
        renderToStaticMarkup(<IssueNoticesForm schemeId="s1" scheduleId="sc1" isSpecial noticeCount={1} blocked timing={timing} levyWords={levyWords} />),
        renderToStaticMarkup(<OverdueNoticesForm schemeId="s1" scheduleId="sc1" count={1} timing={timing} />),
        renderToStaticMarkup(<OverdueNoticesForm schemeId="s1" scheduleId="sc1" count={3} timing={timing} />),
      ]).toMatchSnapshot();
    });
  }
});
