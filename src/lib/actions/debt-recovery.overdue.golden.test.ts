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
 *
 * One deliberate change (30 Oct 2026, approved by Matthew Wrigley: "treat
 * notices past due with a balance as overdue wherever recovery reads them"):
 * debt recovery counts a notice as overdue when it is ISSUED, PARTIALLY_PAID
 * or OVERDUE, has a balance of at least a cent and its due day is before the
 * building's day (isOverdueOn, src/lib/levies/overdue.ts), and a notice whose
 * balance cannot be read refuses the case (and throws from
 * currentAmountOwing) rather than being counted or left out. Only these 18
 * entries were updated, by a targeted run of this file; the other 17 are
 * byte-identical to the recording on 5191ec9.
 *   NSW and QLD (9 each):
 *   - "past-due ISSUED with a balance", "past-due PARTIALLY_PAID with a
 *     balance", "ISSUED due yesterday (1 Nov 2026)": refused before; now a
 *     case is opened for the balance and its late charge, and
 *     currentAmountOwing gives that amount (was "0.00").
 *   - "a mix: ...": the case was for the stored OVERDUE notice only
 *     (1235.50); now for it and the past-due ISSUED and PARTIALLY_PAID
 *     notices (2648.15). The notice not yet due is still left out.
 *   - "stored OVERDUE, not yet due" and "stored OVERDUE, past due with a zero
 *     balance": a case was opened (for 1000.00 and for 0.00); now refused,
 *     as nothing is overdue on the building's day. Nothing stores OVERDUE.
 *   - "past-due ISSUED with a balance that cannot be read": refused as "No
 *     overdue ... notices" with "0.00" owing; now refused as a notice that
 *     cannot be read, and currentAmountOwing throws.
 *   - "stored OVERDUE, past due, with a balance that cannot be read": a case
 *     was opened with no amount (NaN) and "NaN" owing; now refused the same
 *     way.
 *   Midnight in the building's zone (2):
 *   - "NSW 00:00 on 2 Nov in Sydney ..." and "QLD 00:00 on 2 Nov in
 *     Brisbane ...": refused before; now overdue (the building's day is 2
 *     Nov while UTC is still 1 Nov), and a case is opened for 1000.00.
 *
 * Fixtures corrected (30 Oct 2026, review C1): every writer keeps a notice's
 * balance outstanding = amount due + late charge (interestCharged) - amount
 * paid, so the balance already includes the late charge. Three fixtures gave
 * a late charge their balance did not include, and the default late charge
 * was null (the column is never null; it defaults to 0). Each fixture now
 * has an amount due and amount paid, a late charge of "0.00" by default, and
 * a balance that includes its late charge. Re-recorded by a targeted run of
 * this file on 6b4d953 (the branch before the C1 fix), in a temporary
 * worktree. These 6 entries changed, because their fixtures did; on that
 * code a case adds the late charge to the balance again:
 *   NSW and QLD (3 each):
 *   - "past-due ISSUED with a balance" (amount due 800.25, late charge
 *     12.40, balance 812.65): 825.05 owing, was 812.65.
 *   - "stored OVERDUE, past due with a balance (as before)" (1200.00 +
 *     35.50 = 1235.50): 1271.00 owing, was 1235.50.
 *   - "a mix: ..." (the PARTIALLY_PAID notice now has a late charge of
 *     20.00, balance 620.00): 2736.05 owing (balances 2668.15 plus late
 *     charges 67.90), was 2648.15.
 * Added, recorded on the same code (8, 4 for each state): the "C1: ..."
 * entries (the reviewed example, amount due 500.50, late charge 50.00,
 * balance 550.50, stored OVERDUE, ISSUED, and PARTIALLY_PAID with 300.00
 * paid) and "past-due ISSUED with a late charge that cannot be read". The
 * other entries are byte-identical. The stored OVERDUE entries (as before,
 * and the C1 one) give the same on 5191ec9 (checked: 1271.00 and 600.50).
 *
 * Second deliberate change (30 Oct 2026, review C1, "Balance only", decided
 * by Matthew Wrigley): a case is opened for the sum, in cents, of the
 * overdue notices' balances, which already include their late charge. The
 * interest part is the late charge still owing (noticeOwingSplit, with
 * payments applied in the pack's order, as lotArrears works out the payment
 * plan figure), and the principal is the rest. currentAmountOwing is the
 * sum of the balances. A late charge, amount due or amount paid that cannot
 * be read refuses the case. Only these 14 entries were updated, by a
 * targeted run of this file; the other 29 are byte-identical to the
 * recording on 6b4d953.
 *   NSW and QLD (7 each):
 *   - "past-due ISSUED with a balance": 812.65 (principal 800.25, interest
 *     12.40), was 825.05.
 *   - "stored OVERDUE, past due with a balance (as before)": 1235.50
 *     (1200.00 and 35.50), was 1271.00.
 *   - "a mix: ...": 2668.15, was 2736.05. NSW (levy first): interest 67.90,
 *     principal 2600.25. QLD (penalty first, SM s 166(5)): the 400.00 paid
 *     on the PARTIALLY_PAID notice paid its 20.00 penalty first, so interest
 *     47.90, principal 2620.25.
 *   - "C1: stored OVERDUE ..." and "C1: past-due ISSUED ...": 550.50
 *     (500.50 and 50.00), was 600.50.
 *   - "C1: past-due PARTIALLY_PAID ... 300.00 paid": 250.50, was 300.50.
 *     NSW: the 300.00 paid the levy, so interest 50.00, principal 200.50.
 *     QLD: it paid the 50.00 penalty first, so interest 0, principal 250.50.
 *   - "past-due ISSUED with a late charge that cannot be read": a case was
 *     opened with no amount (NaN); now refused as a notice that cannot be
 *     read, and currentAmountOwing gives the balance (1000.00, was "NaN").
 *
 * Third deliberate change (30 Oct 2026, review low L2): currentAmountOwing
 * reads the late charge as opening a case does, so one that cannot be read
 * refuses there too. Only these 2 entries were updated, by a targeted run of
 * this file; the other 41 are byte-identical.
 *   - "NSW past-due ISSUED with a late charge that cannot be read" and "QLD
 *     past-due ISSUED with a late charge that cannot be read":
 *     currentAmountOwing throws (the notice's late charge cannot be read),
 *     was "1000.00". Opening the case is refused, as before.
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

type Notice = { status: string; dueDate: string; amountDue?: string; amountPaid?: string; balanceOutstanding: unknown; interestCharged?: string };

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
      interestCharged: "0.00",
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
  ["past-due ISSUED with a balance", [{ status: "ISSUED", dueDate: PAST, amountDue: "800.25", balanceOutstanding: "812.65", interestCharged: "12.40" }]],
  ["past-due PARTIALLY_PAID with a balance", [{ status: "PARTIALLY_PAID", dueDate: PAST, amountPaid: "400.00", balanceOutstanding: "600.00" }]],
  ["ISSUED not yet due (due 1 Dec 2026)", [{ status: "ISSUED", dueDate: "2026-12-01", balanceOutstanding: "1000.00" }]],
  ["ISSUED due today (2 Nov 2026), not overdue", [{ status: "ISSUED", dueDate: "2026-11-02", balanceOutstanding: "1000.00" }]],
  ["ISSUED due yesterday (1 Nov 2026)", [{ status: "ISSUED", dueDate: "2026-11-01", balanceOutstanding: "1000.00" }]],
  ["past-due ISSUED with a zero balance", [{ status: "ISSUED", dueDate: PAST, amountPaid: "1000.00", balanceOutstanding: "0.00" }]],
  ["past-due PARTIALLY_PAID with a zero balance", [{ status: "PARTIALLY_PAID", dueDate: PAST, amountPaid: "1000.00", balanceOutstanding: "0.00" }]],
  ["past-due ISSUED with a balance under half a cent", [{ status: "ISSUED", dueDate: PAST, amountDue: "0.004", balanceOutstanding: "0.004" }]],
  ["past-due DRAFT, PAID and WRITTEN_OFF with balances (never overdue)", [
    { status: "DRAFT", dueDate: PAST, balanceOutstanding: "1000.00" },
    { status: "PAID", dueDate: PAST, amountPaid: "995.00", balanceOutstanding: "5.00" },
    { status: "WRITTEN_OFF", dueDate: PAST, balanceOutstanding: "1000.00" },
  ]],
  ["stored OVERDUE, past due with a balance (as before)", [{ status: "OVERDUE", dueDate: PAST, amountDue: "1200.00", balanceOutstanding: "1235.50", interestCharged: "35.50" }]],
  ["stored OVERDUE, not yet due", [{ status: "OVERDUE", dueDate: "2026-12-01", balanceOutstanding: "1000.00" }]],
  ["stored OVERDUE, past due with a zero balance", [{ status: "OVERDUE", dueDate: PAST, amountPaid: "1000.00", balanceOutstanding: "0.00" }]],
  ["a mix: stored OVERDUE, past-due ISSUED and PARTIALLY_PAID, and ISSUED not yet due", [
    { status: "OVERDUE", dueDate: "2026-07-01", amountDue: "1200.00", balanceOutstanding: "1235.50", interestCharged: "35.50" },
    { status: "ISSUED", dueDate: PAST, amountDue: "800.25", balanceOutstanding: "812.65", interestCharged: "12.40" },
    { status: "PARTIALLY_PAID", dueDate: "2026-10-15", amountPaid: "400.00", balanceOutstanding: "620.00", interestCharged: "20.00" },
    { status: "ISSUED", dueDate: "2027-01-01", balanceOutstanding: "1000.00" },
  ]],
  ["past-due ISSUED with a balance that cannot be read", [{ status: "ISSUED", dueDate: PAST, balanceOutstanding: "not a number" }]],
  ["stored OVERDUE, past due, with a balance that cannot be read", [{ status: "OVERDUE", dueDate: PAST, balanceOutstanding: "not a number" }]],
  // The case amount (C1, 30 Oct 2026): a balance already includes the notice's late charge.
  ["C1: stored OVERDUE, late charge in the balance (500.50 + 50.00 = 550.50)", [{ status: "OVERDUE", dueDate: PAST, amountDue: "500.50", interestCharged: "50.00", balanceOutstanding: "550.50" }]],
  ["C1: past-due ISSUED, late charge in the balance (500.50 + 50.00 = 550.50)", [{ status: "ISSUED", dueDate: PAST, amountDue: "500.50", interestCharged: "50.00", balanceOutstanding: "550.50" }]],
  ["C1: past-due PARTIALLY_PAID, late charge in the balance, 300.00 paid (500.50 + 50.00 - 300.00 = 250.50)", [
    { status: "PARTIALLY_PAID", dueDate: PAST, amountDue: "500.50", interestCharged: "50.00", amountPaid: "300.00", balanceOutstanding: "250.50" },
  ]],
  ["past-due ISSUED with a late charge that cannot be read", [{ status: "ISSUED", dueDate: PAST, amountDue: "1000.00", interestCharged: "not a number", balanceOutstanding: "1000.00" }]],
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
