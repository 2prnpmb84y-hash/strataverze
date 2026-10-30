/**
 * Opening a debt recovery case from the lot's overdue notices (overdue
 * notices fix, review L1 and L4, 30 Oct 2026): a failure to read the notices
 * or the building is never "no overdue notices", a notice whose due date
 * cannot be read opens no case, and the building's day turns at its own
 * midnight across the daylight saving changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const failing: Record<string, unknown> = {};
  const fail = async () => {
    throw new Error("connection lost");
  };
  for (const k of ["where", "orderBy", "limit", "include"]) failing[k] = () => failing;
  failing.all = fail;
  failing.first = fail;
  return { failTable: null as string | null, failing };
});

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  const tables = sharedFake.db.orm.public as Record<string, unknown>;
  const orm = { public: new Proxy({}, { get: (_t, name: string) => (state.failTable === name ? state.failing : tables[name]) }) };
  return { db: { ...sharedFake.db, orm } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] })),
}));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("./debt-recovery");
const { getOverdueLevyNoticesForLot } = await import("@/lib/queries/debt-recovery");

const SCHEME = "scheme-1";

function seed(notices: Array<Record<string, unknown>>, scheme: Record<string, unknown> = { timeZone: "Australia/Sydney" }) {
  sharedFake.reset({
    Scheme: [{ id: SCHEME, state: "NSW", ...scheme }],
    Lot: [{ id: "lot-1", schemeId: SCHEME, lotNumber: "1" }],
    SchemeMembership: [
      { id: "m-owner", schemeId: SCHEME, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null },
      { id: "m-adviser", schemeId: SCHEME, lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, endDate: null },
    ],
    LevyNotice: notices.map((n, i) => ({ id: `notice-${i + 1}`, schemeId: SCHEME, lotId: "lot-1", status: "ISSUED", amountDue: "1000.00", amountPaid: "0.00", interestCharged: "0.00", balanceOutstanding: "1000.00", ...n })),
    PaymentPlan: [],
    DebtRecoveryCase: [],
    DebtRecoveryStep: [],
    DebtRecoveryActivity: [],
  });
}

const initiate = () => actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor", "ADVISER");
const NOTHING_WRITTEN = () => {
  expect(sharedFake.table("DebtRecoveryCase")).toEqual([]);
  expect(sharedFake.table("DebtRecoveryStep")).toEqual([]);
  expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
};

beforeEach(() => {
  state.failTable = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});

describe("getOverdueLevyNoticesForLot never turns a failure into no notices (L1)", () => {
  it("throws when the notices cannot be read", async () => {
    seed([{ dueDate: "2026-10-01" }]);
    state.failTable = "LevyNotice";
    await expect(getOverdueLevyNoticesForLot(SCHEME, "lot-1", "2026-11-02")).rejects.toThrow("connection lost");
  });

  it("throws when the building cannot be found or its time zone is unknown", async () => {
    seed([{ dueDate: "2026-10-01" }]);
    await expect(getOverdueLevyNoticesForLot("no-such-building", "lot-1")).rejects.toThrow();
    seed([{ dueDate: "2026-10-01" }], { timeZone: "Mars/Olympus" });
    await expect(getOverdueLevyNoticesForLot(SCHEME, "lot-1")).rejects.toThrow(/time zone/);
  });

  it("throws for a today that is not a day", async () => {
    seed([{ dueDate: "2026-10-01" }]);
    await expect(getOverdueLevyNoticesForLot(SCHEME, "lot-1", "2/11/2026")).rejects.toThrow(RangeError);
  });

  it("gives the overdue notices on the building's day", async () => {
    seed([{ dueDate: "2026-10-01" }, { dueDate: "2026-11-02" }]);
    expect((await getOverdueLevyNoticesForLot(SCHEME, "lot-1")).map((n) => n.id)).toEqual(["notice-1"]);
  });
});

describe("opening a case when the notices cannot be checked (L1)", () => {
  it("says it could not check, and saves nothing, when the notices cannot be read", async () => {
    seed([{ dueDate: "2026-10-01" }]);
    state.failTable = "LevyNotice";
    expect(await initiate()).toEqual({ error: "Could not check this lot's overdue levy notices. Nothing was saved." });
    state.failTable = null;
    NOTHING_WRITTEN();
  });

  it("says it could not check, and saves nothing, when the building's day cannot be worked out", async () => {
    seed([{ dueDate: "2026-10-01" }], { timeZone: "Mars/Olympus" });
    expect(await initiate()).toEqual({ error: "Could not check this lot's overdue levy notices. Nothing was saved." });
    NOTHING_WRITTEN();
  });
});

describe("a notice that cannot be read opens no case (L2, L4)", () => {
  const UNREADABLE = { error: "A levy notice for this lot could not be read, so the amount owing cannot be worked out. Nothing was saved." };

  it.each([
    ["a due date", { dueDate: "soon" }],
    ["a due date that is empty", { dueDate: null }],
    ["a balance", { dueDate: "2026-10-01", balanceOutstanding: "abc" }],
    ["a late charge", { dueDate: "2026-10-01", interestCharged: "abc" }],
    ["a late charge that is missing", { dueDate: "2026-10-01", interestCharged: null }],
    ["an amount due", { dueDate: "2026-10-01", amountDue: "abc" }],
    ["an amount paid", { dueDate: "2026-10-01", amountPaid: undefined }],
  ])("%s that cannot be read", async (_what, notice) => {
    seed([notice]);
    expect(await initiate()).toEqual(UNREADABLE);
    NOTHING_WRITTEN();
  });

  it("a late charge owing that is more than the balance (the records do not agree)", async () => {
    seed([{ dueDate: "2026-10-01", amountDue: "1000.00", interestCharged: "50.00", balanceOutstanding: "20.00", amountPaid: "1030.00" }]);
    // Levy first: 1030.00 paid pays the 1000.00 levy and 30.00 of the late charge, leaving 20.00: agrees.
    expect(await initiate()).toMatchObject({ success: true });
    seed([{ dueDate: "2026-10-01", amountDue: "1000.00", interestCharged: "50.00", balanceOutstanding: "20.00", amountPaid: "0.00" }]);
    expect(await initiate()).toEqual(UNREADABLE);
    NOTHING_WRITTEN();
  });
});

describe("the case amount is the balances, in cents, the late charge counted once (C1, L5)", () => {
  it("opens the reviewed example for 550.50 (500.50 levy, 50.00 late charge)", async () => {
    seed([{ dueDate: "2026-10-01", amountDue: "500.50", interestCharged: "50.00", balanceOutstanding: "550.50" }]);
    expect(await initiate()).toMatchObject({ success: true });
    expect(sharedFake.table("DebtRecoveryCase")[0]).toMatchObject({ principalOwed: "500.5", interestOwed: "50", totalOwed: "550.5" });
  });

  it("adds cents without floating point error", async () => {
    seed([
      { dueDate: "2026-10-01", amountDue: "0.10", balanceOutstanding: "0.10" },
      { dueDate: "2026-10-02", amountDue: "0.20", balanceOutstanding: "0.20" },
    ]);
    expect(await initiate()).toMatchObject({ success: true });
    expect(sharedFake.table("DebtRecoveryCase")[0]).toMatchObject({ principalOwed: "0.3", interestOwed: "0", totalOwed: "0.3" });
  });
});

/**
 * Sydney's day turns at its own midnight across the daylight saving changes
 * (L4): on Sunday 4 Oct 2026 clocks go forward (AEST +10 to AEDT +11), and
 * on Sunday 5 Apr 2026 they go back (AEDT +11 to AEST +10). The server runs
 * in UTC.
 */
describe("midnight in Sydney across the daylight saving changes (L4)", () => {
  it.each([
    ["the last second of Sat 3 Oct (AEST)", "2026-10-03T13:59:59.000Z", "2026-10-03", false],
    ["midnight starting Sun 4 Oct (AEST)", "2026-10-03T14:00:00.000Z", "2026-10-03", true],
    ["the last second of Sun 4 Oct (AEDT from 2 am)", "2026-10-04T12:59:59.000Z", "2026-10-04", false],
    ["midnight starting Mon 5 Oct (AEDT)", "2026-10-04T13:00:00.000Z", "2026-10-04", true],
    ["the last second of Sat 4 Apr (AEDT)", "2026-04-04T12:59:59.000Z", "2026-04-04", false],
    ["midnight starting Sun 5 Apr (AEDT)", "2026-04-04T13:00:00.000Z", "2026-04-04", true],
    ["the last second of Sun 5 Apr (AEST from 3 am)", "2026-04-05T13:59:59.000Z", "2026-04-05", false],
    ["midnight starting Mon 6 Apr (AEST)", "2026-04-05T14:00:00.000Z", "2026-04-05", true],
  ])("at %s (%s), a notice due %s is overdue: %s", async (_when, instant, dueDate, overdue) => {
    vi.setSystemTime(new Date(instant));
    seed([{ dueDate }]);
    const result = await initiate();
    if (overdue) expect(result).toMatchObject({ success: true });
    else expect(result).toEqual({ error: "No overdue levy notices found for this lot" });
  });
});
