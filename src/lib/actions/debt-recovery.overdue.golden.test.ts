/**
 * Which levy notices debt recovery counts as overdue, golden (overdue notices
 * fix, 30 Oct 2026). Recorded on origin/main (5191ec9) in a temporary
 * worktree, before debt recovery treated a notice past its due day with a
 * balance as overdue. On that base, opening a case
 * (initiateDebtRecoveryAction, through getOverdueLevyNoticesForLot) and the
 * amount owing recorded with a draft pack's decision to start proceedings
 * (currentAmountOwing) read only notices stored as OVERDUE, and nothing in
 * StrataVerze stores that status: the screens work it out from the due date
 * (effectiveStatus).
 *
 * Never regenerate these snapshots to make a change pass: a difference is a
 * change to which notices debt recovery counts. The fix is meant to change
 * only the entries it names in this header, and each changed entry is listed
 * here when it changes.
 *
 * Each entry is, for a building with one lot and the notices shown: what
 * initiateDebtRecoveryAction returns, the case it creates (the arguments to
 * createDebtRecoveryCase), the CASE_OPENED activity, the number of steps
 * created, and what currentAmountOwing gives for the lot (or the message it
 * throws). Timestamps are masked and the in-memory database's ids are
 * numbered in the order they appear. The time is fixed at 2 Nov 2026 12:00
 * in Sydney (01:00 UTC) unless an entry says otherwise.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ log: [] as unknown[] }));

/** A recorded value: a plain copy, without the database handle a write was given. */
const isOrm = (a: unknown) => !!a && typeof a === "object" && "public" in (a as object);
const recorded = (args: unknown[]) => JSON.parse(JSON.stringify(args.filter((a) => !isOrm(a))));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] })),
}));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));
vi.mock("@/lib/queries/debt-recovery", async (orig) => {
  const real = await orig<typeof import("@/lib/queries/debt-recovery")>();
  return {
    ...real,
    createDebtRecoveryCase: (async (...a: unknown[]) => {
      state.log.push({ createDebtRecoveryCase: recorded(a) });
      return (real.createDebtRecoveryCase as (...x: unknown[]) => unknown)(...a);
    }) as typeof real.createDebtRecoveryCase,
    createDebtRecoveryStep: (async (...a: unknown[]) => {
      state.log.push("createDebtRecoveryStep");
      return (real.createDebtRecoveryStep as (...x: unknown[]) => unknown)(...a);
    }) as typeof real.createDebtRecoveryStep,
    logDebtRecoveryActivity: (async (...a: unknown[]) => {
      state.log.push({ logDebtRecoveryActivity: recorded(a) });
      return (real.logDebtRecoveryActivity as (...x: unknown[]) => unknown)(...a);
    }) as typeof real.logDebtRecoveryActivity,
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("./debt-recovery");
const { currentAmountOwing } = await import("@/lib/debt-recovery/recovery-records-repo");

const SCHEME = "scheme-1";
/** 2 Nov 2026, 12:00 in Sydney and 11:00 in Brisbane. */
const NOON_2_NOV = "2026-11-02T01:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOON_2_NOV));
});

/** Mask timestamps and number the in-memory database's ids in order of appearance. */
function normalise(value: unknown): unknown {
  const ids = new Map<string, string>();
  return JSON.parse(JSON.stringify(value), (_k, v) => {
    if (typeof v !== "string") return v;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return "<timestamp>";
    return v.replace(/fake-([A-Za-z]+)-\d+/g, (m, model: string) => {
      if (!ids.has(m)) ids.set(m, `<${model} ${[...ids.keys()].filter((k) => k.startsWith(`fake-${model}-`)).length + 1}>`);
      return ids.get(m)!;
    });
  });
}

type Notice = { status: string; dueDate: string; amountDue?: string; amountPaid?: string; balanceOutstanding: unknown; interestCharged?: string | null };

const ZONES = { NSW: "Australia/Sydney", QLD: "Australia/Brisbane" } as const;

/** A building in `st` with lot 1, its owner, and `notices` on lot 1. */
function seed(st: keyof typeof ZONES, notices: Notice[]) {
  sharedFake.reset({
    Scheme: [{ id: SCHEME, state: st, timeZone: ZONES[st] }],
    Lot: [{ id: "lot-1", schemeId: SCHEME, lotNumber: "1" }],
    SchemeMembership: [
      { id: "m-owner", schemeId: SCHEME, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null },
      { id: "m-adviser", schemeId: SCHEME, lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, endDate: null },
    ],
    LevyNotice: notices.map((n, i) => ({
      id: `notice-${i + 1}`,
      schemeId: SCHEME,
      lotId: "lot-1",
      noticeNumber: `L-${i + 1}`,
      amountDue: "1000.00",
      amountPaid: "0.00",
      interestCharged: null,
      ...n,
    })),
    PaymentPlan: [],
    DebtRecoveryCase: [],
    DebtRecoveryStep: [],
    DebtRecoveryActivity: [],
  });
  state.log = [];
}

/** Open a case on lot 1 and work out its amount owing, as recorded. */
async function entry(st: keyof typeof ZONES, notices: Notice[]) {
  seed(st, notices);
  let amountOwing: unknown;
  try {
    amountOwing = await currentAmountOwing(SCHEME, "lot-1");
  } catch (err) {
    amountOwing = { thrown: err instanceof Error ? err.message : String(err) };
  }
  const result = await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor", "ADVISER");
  const steps = state.log.filter((w) => w === "createDebtRecoveryStep").length;
  const writes = state.log.filter((w) => w !== "createDebtRecoveryStep");
  return normalise({ result, writes, stepsCreated: steps, amountOwing });
}

const PAST = "2026-10-01";
const scenarios: Array<[string, Notice[]]> = [
  ["past-due ISSUED with a balance", [{ status: "ISSUED", dueDate: PAST, balanceOutstanding: "800.25", interestCharged: "12.40" }]],
  ["past-due PARTIALLY_PAID with a balance", [{ status: "PARTIALLY_PAID", dueDate: PAST, amountPaid: "400.00", balanceOutstanding: "600.00" }]],
  ["ISSUED not yet due (due 1 Dec 2026)", [{ status: "ISSUED", dueDate: "2026-12-01", balanceOutstanding: "1000.00" }]],
  ["ISSUED due today (2 Nov 2026), not overdue", [{ status: "ISSUED", dueDate: "2026-11-02", balanceOutstanding: "1000.00" }]],
  ["ISSUED due yesterday (1 Nov 2026)", [{ status: "ISSUED", dueDate: "2026-11-01", balanceOutstanding: "1000.00" }]],
  ["past-due ISSUED with a zero balance", [{ status: "ISSUED", dueDate: PAST, amountPaid: "1000.00", balanceOutstanding: "0.00" }]],
  ["past-due PARTIALLY_PAID with a zero balance", [{ status: "PARTIALLY_PAID", dueDate: PAST, amountPaid: "1000.00", balanceOutstanding: "0.00" }]],
  ["past-due ISSUED with a balance under half a cent", [{ status: "ISSUED", dueDate: PAST, balanceOutstanding: "0.004" }]],
  ["past-due DRAFT, PAID and WRITTEN_OFF with balances (never overdue)", [
    { status: "DRAFT", dueDate: PAST, balanceOutstanding: "1000.00" },
    { status: "PAID", dueDate: PAST, balanceOutstanding: "5.00" },
    { status: "WRITTEN_OFF", dueDate: PAST, balanceOutstanding: "1000.00" },
  ]],
  ["stored OVERDUE, past due with a balance (as before)", [{ status: "OVERDUE", dueDate: PAST, balanceOutstanding: "1200.00", interestCharged: "35.50" }]],
  ["stored OVERDUE, not yet due", [{ status: "OVERDUE", dueDate: "2026-12-01", balanceOutstanding: "1000.00" }]],
  ["stored OVERDUE, past due with a zero balance", [{ status: "OVERDUE", dueDate: PAST, balanceOutstanding: "0.00" }]],
  ["a mix: stored OVERDUE, past-due ISSUED and PARTIALLY_PAID, and ISSUED not yet due", [
    { status: "OVERDUE", dueDate: "2026-07-01", balanceOutstanding: "1200.00", interestCharged: "35.50" },
    { status: "ISSUED", dueDate: PAST, balanceOutstanding: "800.25", interestCharged: "12.40" },
    { status: "PARTIALLY_PAID", dueDate: "2026-10-15", amountPaid: "400.00", balanceOutstanding: "600.00" },
    { status: "ISSUED", dueDate: "2027-01-01", balanceOutstanding: "1000.00" },
  ]],
  ["past-due ISSUED with a balance that cannot be read", [{ status: "ISSUED", dueDate: PAST, balanceOutstanding: "not a number" }]],
  ["stored OVERDUE, past due, with a balance that cannot be read", [{ status: "OVERDUE", dueDate: PAST, balanceOutstanding: "not a number" }]],
];

for (const st of ["NSW", "QLD"] as const) {
  describe(`${st}: which notices count as overdue`, () => {
    for (const [name, notices] of scenarios) {
      it(`${st} ${name}`, async () => {
        expect(await entry(st, notices)).toMatchSnapshot();
      });
    }
  });
}

/** The day turns at midnight in the building's zone, not in UTC (the server's zone). */
describe("midnight in the building's zone", () => {
  const dueSunday = [{ status: "ISSUED", dueDate: "2026-11-01", balanceOutstanding: "1000.00" }];
  const at = (iso: string) => vi.setSystemTime(new Date(iso));

  it("NSW 23:59:59 on 1 Nov in Sydney (12:59:59 UTC), due 1 Nov: due today, not overdue", async () => {
    at("2026-11-01T12:59:59.000Z");
    expect(await entry("NSW", dueSunday)).toMatchSnapshot();
  });

  it("NSW 00:00 on 2 Nov in Sydney (13:00 UTC, still 1 Nov in UTC), due 1 Nov: overdue", async () => {
    at("2026-11-01T13:00:00.000Z");
    expect(await entry("NSW", dueSunday)).toMatchSnapshot();
  });

  it("QLD 13:30 UTC (23:30 on 1 Nov in Brisbane, 00:30 on 2 Nov in Sydney), due 1 Nov: due today, not overdue", async () => {
    at("2026-11-01T13:30:00.000Z");
    expect(await entry("QLD", dueSunday)).toMatchSnapshot();
  });

  it("QLD 23:59:59 on 1 Nov in Brisbane (13:59:59 UTC), due 1 Nov: due today, not overdue", async () => {
    at("2026-11-01T13:59:59.000Z");
    expect(await entry("QLD", dueSunday)).toMatchSnapshot();
  });

  it("QLD 00:00 on 2 Nov in Brisbane (14:00 UTC, still 1 Nov in UTC), due 1 Nov: overdue", async () => {
    at("2026-11-01T14:00:00.000Z");
    expect(await entry("QLD", dueSunday)).toMatchSnapshot();
  });
});
