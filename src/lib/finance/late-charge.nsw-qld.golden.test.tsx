/**
 * NSW and Queensland late charges, golden (VIC, ACT and WA stage 2, PR 5,
 * 28 Oct 2026). Recorded on origin/main (3aabae1) in a temporary worktree,
 * before the annual resolved rate and the one-case waiver were added. NSW
 * and Queensland must give exactly the same results, rows, calls, words and
 * markup after that change. Never regenerate these snapshots to make a change
 * pass: a difference is a change to NSW or Queensland.
 *
 * Covered: the engine over a grid of notices, payments and dates (NSW
 * statutory interest and no interest; Queensland no penalty and the resolved
 * monthly rate), the setting checks and words, the notice sentence, the
 * payment split, the interest run end to end (worked out, listed, charged),
 * receipting (NSW levy first, Queensland penalty first), the setting action
 * and the interest page.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/adviser/schemes/s/finance/interest",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));

const calls: Array<[string, unknown]> = [];
const record = (name: string) => (arg: unknown) => {
  calls.push([name, arg]);
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
vi.mock("@/lib/queries/schemes", async (orig) => ({
  ...(await orig()),
  getSchemeById: vi.fn(async (id: string) => ({ id, memberships: [{ profileId: "adviser", role: "ADVISER" }] })),
}));
vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(async (a: unknown) => record("logActivity")(a)),
  getAuditTrailForExport: vi.fn(),
  formatAuditTrailCsv: vi.fn(),
}));
vi.mock("@/lib/billing/capture", () => ({
  captureTransactionFee: vi.fn(async (_orm: unknown, a: unknown) => record("captureTransactionFee")(a)),
  captureUsageFee: vi.fn(),
}));
vi.mock("@/lib/finance/bank-allocations", () => ({
  allocateBankTransaction: vi.fn(async (a: unknown) => record("allocateBankTransaction")(a)),
  syncTransaction: vi.fn(async (_orm: unknown, id: unknown) => record("syncTransaction")(id)),
}));
vi.mock("@/lib/queries/journal-entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/journal-entries")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    getNextEntryNumber: async (schemeId: string) => {
      const highest = sharedFake
        .table("JournalEntry")
        .filter((e) => e.schemeId === schemeId)
        .reduce((max, e) => Math.max(max, Number(String(e.entryNumber).replace(/\D/g, "")) || 0), 0);
      return `JE-${String(highest + 1).padStart(4, "0")}`;
    },
    validatePeriodForPosting: async () => undefined,
    createJournalEntry: async (data: Record<string, unknown>) => {
      record("createJournalEntry")(data);
      const lines = (data.lines as Array<Record<string, unknown>>).map((l) => ({ supplierId: null, gstAmount: null, lotId: null, ...l }));
      return sharedFake.db.orm.public.JournalEntry.create({ ...data, lines, status: "DRAFT" });
    },
    postJournalEntry: async (id: string, actorId: string) => {
      record("postJournalEntry")({ id, actorId });
      await sharedFake.db.orm.public.JournalEntry.where({ id }).update({ status: "POSTED" });
    },
  };
});
vi.mock("@/lib/queries/account-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/account-codes")>();
  return {
    ...actual,
    getSystemAccountBySubType: async (schemeId: string, subType: string) => ({ id: `acc-${schemeId}-${subType}`, fundId: `${schemeId}-fund-admin` }),
  };
});
vi.mock("@/lib/queries/seed-chart-of-accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/seed-chart-of-accounts")>();
  return {
    ...actual,
    ensureLeviesInAdvanceAccount: async (s: string, fundId: string) => ({ id: `acc-${s}-LEVIES_IN_ADVANCE`, fundId }),
    ensureSystemAccount: async (s: string, subType: string, fundId: string) => ({ id: `acc-${s}-${subType}`, fundId }),
  };
});
// A Queensland building: the pack is not yet active, so the test gives it to a building directly.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { RULE_PACKS } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) =>
    state === "QLD-SHAPED" ? { pack: null, rules: RULE_PACKS.QLD.rules, label: "AU-QLD test" } : actual.rulesForState(state);
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const SI = await import("./statutory-interest");
const W = await import("@/lib/jurisdiction/wording");
const { statutoryInterestForScheme, getSchemeInterestSetting } = await import("./interest-setting");
const { chargeInterestBatch, getOverdueLevyNoticesWithInterest } = await import("@/lib/queries/interest");
const { receiptLevyPayment } = await import("./levy-receipts");
const { lotArrears } = await import("@/lib/debt-recovery/payment-plan-requests");
const { saveInterestSettingAction } = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const InterestPage = (await import("@/app/(portal)/adviser/schemes/[id]/finance/interest/page")).default;
const { statutoryRulesFor, RULE_PACKS, STATUTORY_INTEREST } = await import("@/config/statutory");

const NSW = statutoryRulesFor("NSW");
const QLD = RULE_PACKS.QLD.rules;

// ─── 1. The engine over a grid ────────────────────────────────────────────

type Payment = { date: string; amountCents: number; lateChargeCents?: number };
const LEVIES = [0, 33_333, 123_457];
const DUE_DATES = ["2026-01-31", "2024-02-29", "2025-12-31"];
/** Payments relative to the due date, by name. */
function paymentSets(due: string, levy: number): Record<string, Payment[]> {
  const d = (days: number) => new Date(Date.parse(`${due}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return {
    none: [],
    onDueDate: [{ date: due, amountCents: levy }],
    dayAfter: [{ date: d(1), amountCents: levy }],
    inGraceFull: [{ date: d(27), amountCents: levy }],
    inGracePart: [{ date: d(20), amountCents: Math.floor(levy / 2) }],
    afterGrace: [{ date: d(45), amountCents: levy }],
    several: [
      { date: d(10), amountCents: Math.floor(levy / 4) },
      { date: d(40), amountCents: Math.floor(levy / 4) },
      { date: d(75), amountCents: levy },
    ],
    correction: [
      { date: d(5), amountCents: levy },
      { date: d(50), amountCents: -Math.floor(levy / 3) },
    ],
    recordedPart: [{ date: d(40), amountCents: Math.floor(levy / 2), lateChargeCents: 250 }],
  };
}
const AS_AT = (due: string) => {
  const d = (days: number) => new Date(Date.parse(`${due}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return [due, d(1), d(31), d(60), d(800)];
};
function grid() {
  const out: { levyCents: number; dueDate: string; payments: Payment[]; asAt: string; stopAt?: string | null; noInterest?: boolean; name: string }[] = [];
  for (const levyCents of LEVIES) {
    for (const dueDate of DUE_DATES) {
      for (const [name, payments] of Object.entries(paymentSets(dueDate, levyCents))) {
        for (const asAt of AS_AT(dueDate)) out.push({ levyCents, dueDate, payments, asAt, name });
      }
      out.push({ levyCents, dueDate, payments: [], asAt: AS_AT(dueDate)[4], stopAt: AS_AT(dueDate)[3], name: "stopped" });
      out.push({ levyCents, dueDate, payments: [], asAt: AS_AT(dueDate)[4], stopAt: AS_AT(dueDate)[4], name: "stoppedOnAsAt" });
      out.push({ levyCents, dueDate, payments: [], asAt: AS_AT(dueDate)[4], noInterest: true, name: "noInterestInput" });
    }
  }
  return out;
}
const NSW_SETTINGS = [{ mode: "STATUTORY" }, { mode: "NO_INTEREST" }, { mode: "RESOLVED_RATE", monthlyRatePercent: 2 }];
const QLD_SETTINGS = [
  { mode: "NONE" },
  { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 },
  { mode: "RESOLVED_RATE", monthlyRatePercent: 1.25 },
  { mode: "RESOLVED_RATE", monthlyRatePercent: 3 },
  { mode: "RESOLVED_RATE", monthlyRatePercent: null },
  { mode: "STATUTORY" },
];
/** One line per case, so a difference shows exactly which case changed. */
const line = (c: ReturnType<typeof grid>[number], r: unknown) => `${c.levyCents}|${c.dueDate}|${c.name}|${c.asAt}|${c.stopAt ?? ""}|${c.noInterest ? 1 : 0} => ${JSON.stringify(r)}`;

describe("1. the engine", () => {
  it("NSW: lateCharge under each setting, and statutoryInterest", () => {
    const cases = grid();
    for (const setting of NSW_SETTINGS) {
      expect(cases.map((c) => line(c, SI.lateCharge(c, NSW.LATE_CHARGE, setting)))).toMatchSnapshot(`lateCharge ${JSON.stringify(setting)}`);
    }
    expect(cases.map((c) => line(c, SI.statutoryInterest(c, STATUTORY_INTEREST)))).toMatchSnapshot("statutoryInterest");
  });

  it("Queensland: lateCharge under each setting, and monthlyPenalty", () => {
    const cases = grid();
    for (const setting of QLD_SETTINGS) {
      expect(cases.map((c) => line(c, SI.lateCharge(c, QLD.LATE_CHARGE, setting)))).toMatchSnapshot(`lateCharge ${JSON.stringify(setting)}`);
    }
    for (const rate of [2.5, 0.333]) expect(cases.map((c) => line(c, SI.monthlyPenalty(c, { monthlyRatePercent: rate })))).toMatchSnapshot(`monthlyPenalty ${rate}`);
  });

  it("whether a setting charges, and the mode the pack reads", () => {
    const out: string[] = [];
    for (const [name, rule, settings] of [
      ["NSW", NSW.LATE_CHARGE, NSW_SETTINGS],
      ["QLD", QLD.LATE_CHARGE, QLD_SETTINGS],
    ] as const) {
      for (const s of settings) out.push(`${name} ${JSON.stringify(s)} applies=${SI.lateChargeApplies(rule, s)} mode=${SI.effectiveLateChargeMode(rule, s.mode)}`);
    }
    expect(out).toMatchSnapshot();
  });

  it("the payment split and the order", () => {
    const owing = { levyCents: 50_000, interestCents: 2_000, recoveryCostsCents: 10_000 };
    const out: unknown[] = [];
    for (const p of [0, 1, 1_500, 2_000, 10_000, 50_000, 52_000, 62_000, 70_000]) {
      out.push([p, SI.allocatePayment(p, owing), SI.allocatePayment(p, owing, NSW.PAYMENT_ALLOCATION_ORDER), SI.allocatePayment(p, owing, QLD.PAYMENT_ALLOCATION_ORDER)]);
    }
    out.push(SI.lateChargeFirst(NSW.PAYMENT_ALLOCATION_ORDER), SI.lateChargeFirst(QLD.PAYMENT_ALLOCATION_ORDER), SI.lateChargeFirst(undefined), SI.lateChargeFirst(null));
    out.push(SI.lateChargePaidOnNotice({ paidCents: 10_000, chargedCents: 2_500, receiptedCents: 8_000, recordedChargeCents: 1_000 }));
    out.push(SI.lateChargePart(100_000, { chargedCents: 7_500, chargePaidCents: 0, accruedByDateCents: 2_500, chargePaidByDateCents: 0 }));
    out.push(SI.addMonths("2026-01-31", 1), SI.addMonths("2024-01-31", 1), SI.addMonths("2026-12-31", 2));
    expect(out).toMatchSnapshot();
  });
});

// ─── 2. Setting checks, words and the notice sentence ─────────────────────

describe("2. setting checks and words", () => {
  const inputs = [
    { mode: "STATUTORY" },
    { mode: "STATUTORY", ratePercent: 10 },
    { mode: "STATUTORY", ratePercent: 8 },
    { mode: "NO_INTEREST" },
    { mode: "NO_INTEREST", resolutionMeetingId: "m", resolutionMotionId: "x" },
    { mode: "NONE" },
    { mode: "RESOLVED_RATE" },
    { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 },
    { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5, resolutionMeetingId: "m", resolutionMotionId: "x" },
    { mode: "RESOLVED_RATE", monthlyRatePercent: 2.51, resolutionMeetingId: "m", resolutionMotionId: "x" },
    { mode: "RESOLVED_RATE", monthlyRatePercent: 1.234, resolutionMeetingId: "m", resolutionMotionId: "x" },
    { mode: "RESOLVED_RATE", monthlyRatePercent: 0, resolutionMeetingId: "m", resolutionMotionId: "x" },
    { mode: "RESOLVED_RATE", monthlyRatePercent: Number.NaN, resolutionMeetingId: "m", resolutionMotionId: "x" },
    { mode: "RESOLVED_ANNUAL_RATE" },
    { mode: "" },
  ];

  it("interestSettingProblem, NSW and Queensland", () => {
    expect(inputs.map((i) => [JSON.stringify(i), SI.interestSettingProblem(i, NSW.LATE_CHARGE, NSW.TERMINOLOGY)])).toMatchSnapshot("NSW");
    expect(inputs.map((i) => [JSON.stringify(i), SI.interestSettingProblem(i, STATUTORY_INTEREST)])).toMatchSnapshot("NSW, interest rule alone");
    expect(inputs.map((i) => [JSON.stringify(i), SI.interestSettingProblem(i, QLD.LATE_CHARGE, QLD.TERMINOLOGY)])).toMatchSnapshot("QLD");
  });

  it("lateChargeWords, noticeLateCharge and the notice sentence", () => {
    const out: unknown[] = [];
    for (const [name, rules, settings] of [
      ["NSW", NSW, NSW_SETTINGS],
      ["QLD", QLD, QLD_SETTINGS],
    ] as const) {
      for (const s of settings) {
        const notice = W.noticeLateCharge(rules.LATE_CHARGE, s);
        out.push([name, s, W.lateChargeWords(rules as never, s), W.lateChargeWords(rules as never, s, true), W.lateChargeWords(rules as never, s, false), notice, W.lateChargeSentence(notice, rules.TERMINOLOGY)]);
      }
    }
    expect(out).toMatchSnapshot();
  });
});

// ─── 3. The interest run, receipting, the action and the page ─────────────

const S = "11111111-0000-0000-0000-0000000000a1"; // NSW, statutory
const SN = "11111111-0000-0000-0000-0000000000a2"; // NSW, no interest
const Q = "22222222-0000-0000-0000-0000000000b1"; // Queensland, 2.5% a month
const QN = "22222222-0000-0000-0000-0000000000b2"; // Queensland, no penalty

const notice = (schemeId: string, id: string, lot: string, dueDate: string, amountDue: string, extra: Record<string, unknown> = {}) => ({
  id,
  schemeId,
  levyScheduleId: `${schemeId}-sched`,
  lotId: `${schemeId}-${lot}`,
  lot: { lotNumber: lot },
  ownerId: `${schemeId}-owner-${lot}`,
  fundId: `${schemeId}-fund-admin`,
  fund: { fundType: "ADMINISTRATIVE", name: "Administrative Fund" },
  noticeNumber: `N-${id}`,
  dueDate,
  amountDue,
  amountPaid: "0",
  balanceOutstanding: amountDue,
  interestCharged: "0",
  migratedInterestCharged: "0",
  migratedInterestPaid: "0",
  status: "ISSUED",
  issuedAt: "2026-01-01T00:00:00.000Z",
  migrationBatchId: null,
  paidInFullAt: null,
  levySchedule: { levyType: "ADMIN" },
  ...extra,
});
const notices = (schemeId: string) => [
  notice(schemeId, `${schemeId}-n1`, "1", "2026-01-31", "1000.00"),
  notice(schemeId, `${schemeId}-n2`, "1", "2026-04-30", "333.33"),
  notice(schemeId, `${schemeId}-n3`, "2", "2026-07-31", "1234.57", { amountPaid: "200.00", balanceOutstanding: "1034.57", status: "PARTIALLY_PAID" }),
  notice(schemeId, `${schemeId}-n4`, "2", "2026-09-30", "500.00", { interestCharged: "3.00", balanceOutstanding: "503.00" }),
  notice(schemeId, `${schemeId}-n5`, "3", "2026-10-25", "700.00"),
  notice(schemeId, `${schemeId}-n6`, "3", "2026-02-28", "120.00", {
    amountPaid: "4.00",
    interestCharged: "10.00",
    migratedInterestCharged: "10.00",
    migratedInterestPaid: "4.00",
    balanceOutstanding: "126.00",
    migrationBatchId: "batch-1",
    issuedAt: "2026-05-01T00:00:00.000Z",
  }),
];
const payment = (schemeId: string, n: string, id: string, paymentDate: string, amount: string, extra: Record<string, unknown> = {}) => ({
  id: `${schemeId}-${id}`,
  schemeId,
  levyNoticeId: `${schemeId}-${n}`,
  paymentDate,
  amount,
  lateChargeAmount: "0",
  journalEntryId: null,
  reversedAt: null,
  ...extra,
});
const scheme = (id: string, state: string, interestMode: string, rate: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  state,
  name: `Golden ${id.slice(-2)}`,
  interestMode,
  lateChargeMonthlyRatePercent: rate,
  interestResolutionMeetingId: null,
  interestResolutionMotionId: null,
  timeZone: state === "NSW" ? "Australia/Sydney" : "Australia/Brisbane",
  ...extra,
});
const tables = () => JSON.parse(JSON.stringify(sharedFake.tables));
const errorOf = async (p: Promise<unknown>) => p.then((v) => v, (e: Error) => `${e.name}: ${e.message}`);
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T01:00:00.000Z"));
  sharedFake.reset({
    Scheme: [
      scheme(S, "NSW", "STATUTORY", null),
      scheme(SN, "NSW", "NO_INTEREST", null, { interestResolutionMeetingId: `${SN}-agm`, interestResolutionMotionId: `${SN}-motion` }),
      scheme(Q, "QLD-SHAPED", "RESOLVED_RATE", "2.50", { interestResolutionMeetingId: `${Q}-agm`, interestResolutionMotionId: `${Q}-motion` }),
      scheme(QN, "QLD-SHAPED", "NONE", null),
    ],
    Fund: [S, SN, Q, QN].map((s) => ({ id: `${s}-fund-admin`, schemeId: s, fundType: "ADMINISTRATIVE", name: "Administrative Fund" })),
    Lot: [S, SN, Q, QN].flatMap((s) => ["1", "2", "3"].map((l) => ({ id: `${s}-${l}`, schemeId: s, lotNumber: l }))),
    AccountCode: [S, SN, Q, QN].flatMap((s) =>
      ["ACCOUNTS_RECEIVABLE", "INTEREST_INCOME", "BANK", "LEVIES_IN_ADVANCE"].map((t) => ({ id: `acc-${s}-${t}`, schemeId: s, code: t, name: t, accountSubType: t, fundId: `${s}-fund-admin` })),
    ),
    LevyNotice: [S, SN, Q, QN].flatMap(notices),
    LevyPayment: [S, SN, Q, QN].flatMap((s) => [
      payment(s, "n2", "p1", "2026-05-20", "100.00"),
      payment(s, "n3", "p2", "2026-08-15", "200.00"),
      payment(s, "n1", "p3", "2026-03-10", "50.00", { reversedAt: "2026-03-12T00:00:00.000Z", reversalJournalEntryId: "rev" }),
    ]),
    Meeting: [S, SN, Q, QN].map((s) => ({ id: `${s}-agm`, schemeId: s, meetingType: "AGM", title: "AGM 2026", scheduledAt: "2026-06-01T00:00:00.000Z", timezone: null })),
    AgendaItem: [S, SN, Q, QN].flatMap((s) => [
      { id: `${s}-motion`, meetingId: `${s}-agm`, position: 1, title: "Interest", status: "CARRIED", outcome: null, resolutionCategory: "ORDINARY" },
      { id: `${s}-lost`, meetingId: `${s}-agm`, position: 2, title: "Lost", status: "LOST", outcome: null, resolutionCategory: "SPECIAL" },
    ]),
    OwnerCreditTransaction: [],
    OwnerCreditBalance: [],
    OwnerCreditRefund: [],
    JournalEntry: [],
    JournalLine: [],
    BankTransactionAllocation: [],
    BankTransaction: [],
    FinancialPeriod: [],
  });
  sharedFake.setUniqueKeys({ JournalEntry: [["schemeId", "entryNumber"]] });
});
afterAll(() => {
  vi.useRealTimers();
});

describe("3. NSW and Queensland buildings end to end", () => {
  it("a. each building's setting", async () => {
    for (const id of [S, SN, Q, QN]) {
      const s = await getSchemeInterestSetting(id);
      expect({ mode: s.mode, monthlyRatePercent: s.monthlyRatePercent, meetingId: s.meetingId, motionId: s.motionId, label: s.rules.label, timeZone: s.timeZone }).toMatchSnapshot(id);
    }
  });

  it("b. the late charge owed, and the overdue list", async () => {
    for (const id of [S, SN, Q, QN]) {
      for (const asAt of ["2026-02-28", "2026-03-01", "2026-06-30", "2026-10-28", "2027-03-31"]) expect(await statutoryInterestForScheme(id, asAt)).toMatchSnapshot(`${id} ${asAt}`);
      expect(await getOverdueLevyNoticesWithInterest(id)).toMatchSnapshot(`${id} overdue`);
    }
  });

  it("c. the interest page", async () => {
    for (const id of [S, SN, Q, QN]) expect(renderToStaticMarkup(await InterestPage({ params: Promise.resolve({ id }) }))).toMatchSnapshot(id);
  });

  it("d. the interest run charges", async () => {
    for (const id of [S, SN, Q, QN]) expect(await errorOf(chargeInterestBatch({ schemeId: id, actorId: "adviser" }))).toMatchSnapshot(id);
    expect(tables().LevyNotice).toMatchSnapshot("notices after the run");
    expect(tables().JournalEntry).toMatchSnapshot("journals after the run");
  });

  it("e. receipting: NSW levy first, Queensland penalty first", async () => {
    vi.setSystemTime(new Date("2026-11-20T01:00:00.000Z"));
    for (const id of [S, Q]) {
      expect(await errorOf(receiptLevyPayment({ schemeId: id, levyNoticeId: `${id}-n1`, amountCents: 60_000, paymentDate: "2026-11-20", actorId: "adviser", reference: "EFT 1" }))).toMatchSnapshot(`${id} part`);
      expect(await errorOf(receiptLevyPayment({ schemeId: id, levyNoticeId: `${id}-n4`, amountCents: 60_000, paymentDate: "2026-11-20", actorId: "adviser", confirmOverpayment: true }))).toMatchSnapshot(`${id} over`);
      for (const lot of ["1", "2"]) expect(await lotArrears(id, `${id}-${lot}`, "2026-11-20", (id === Q ? QLD : NSW).PAYMENT_ALLOCATION_ORDER)).toMatchSnapshot(`${id} lot ${lot}`);
      expect(await statutoryInterestForScheme(id, "2026-11-20")).toMatchSnapshot(`${id} owed after`);
    }
  });

  it("f. the setting action", async () => {
    const save = (id: string, fields: Record<string, string>) => saveInterestSettingAction(id, {}, form(fields));
    const out: unknown[] = [];
    const tries: [string, Record<string, string>][] = [
      [S, { mode: "RESOLVED_RATE", monthlyRatePercent: "2" }],
      [S, { mode: "NO_INTEREST" }],
      [S, { mode: "NO_INTEREST", meetingId: `${S}-agm`, motionId: `${S}-lost` }],
      [S, { mode: "NO_INTEREST", meetingId: `${S}-agm`, motionId: `${S}-motion` }],
      [S, { mode: "STATUTORY", meetingId: `${S}-agm`, motionId: `${S}-motion`, monthlyRatePercent: "2", annualRatePercent: "8" }],
      [S, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "8", meetingId: `${S}-agm`, motionId: `${S}-motion` }],
      [QN, { mode: "STATUTORY" }],
      [QN, { mode: "RESOLVED_RATE", monthlyRatePercent: "3", meetingId: `${QN}-agm`, motionId: `${QN}-motion` }],
      [QN, { mode: "RESOLVED_RATE", monthlyRatePercent: "1.234", meetingId: `${QN}-agm`, motionId: `${QN}-motion` }],
      [QN, { mode: "RESOLVED_RATE", monthlyRatePercent: "2%", meetingId: `${QN}-agm`, motionId: `${QN}-motion` }],
      [QN, { mode: "RESOLVED_RATE", monthlyRatePercent: "1.75" }],
      [QN, { mode: "RESOLVED_RATE", monthlyRatePercent: "1.75", meetingId: `${S}-agm`, motionId: `${S}-motion` }],
      [QN, { mode: "RESOLVED_RATE", monthlyRatePercent: "1.75", meetingId: `${QN}-agm`, motionId: `${QN}-motion` }],
      [QN, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "8", meetingId: `${QN}-agm`, motionId: `${QN}-motion` }],
      [QN, { mode: "NONE", monthlyRatePercent: "1.75", meetingId: `${QN}-agm`, motionId: `${QN}-motion` }],
      [Q, { mode: "RESOLVED_RATE", monthlyRatePercent: "2.5", meetingId: `${Q}-agm`, motionId: `${Q}-motion` }],
    ];
    for (const [id, fields] of tries) {
      const r = await save(id, fields);
      const row = sharedFake.table("Scheme").find((s) => s.id === id)!;
      out.push([id, fields, r, { ...row, interestResolutionRecordedAt: row.interestResolutionRecordedAt ? "set" : row.interestResolutionRecordedAt }]);
    }
    expect(out).toMatchSnapshot();
  });

  it("g. every row and call", () => {
    const t = tables();
    for (const s of t.Scheme) if (s.interestResolutionRecordedAt) s.interestResolutionRecordedAt = "set";
    expect(t).toMatchSnapshot("tables");
    expect(JSON.parse(JSON.stringify(calls))).toMatchSnapshot("calls");
  });
});
