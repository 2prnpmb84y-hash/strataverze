/**
 * The lot's overdue notices as the Victorian s 32(1) wait reads them (stage 2,
 * PR 9c review M2), against the in-memory database: each notice's issue day
 * in the building's zone (Australia/Melbourne, either side of midnight and of
 * the daylight saving changes), the pack it was issued under and whether it
 * was brought across at takeover; notices that are not overdue are not read.
 * The earliest day the final notice may be given is then day 29 after it.
 * Since the review of 30 Oct 2026 the final notice step counts from the claim
 * notices (overdueNoticesForClaim), each also past its due day. Since the
 * overdue notices fix (#143, 30 Oct 2026) both reads use its one definition
 * (isOverdueOn: issued, part paid or stored as overdue, past the due day, with
 * a balance; a due day or balance that cannot be read throws
 * UnreadableNoticeError), and a claim notice owes its balance only (C1,
 * "Balance only"), the same total as the case amount for the same notices.
 * Each fixture's balance is its amount due plus its late charge less what was
 * paid.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { currentAmountOwing, overdueNoticesForClaim, overdueNoticesForTiming } = await import("./recovery-records-repo");
const { caseAmountCents } = await import("./case-amount");
const { claimAmount } = await import("./recovery-gates");
const { overdueOn, UnreadableNoticeError } = await import("@/lib/levies/overdue");
const { recoveryGateProblem } = await import("./recovery-gates");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");

const VIC = PENDING_RULE_PACKS.VIC;
const LABEL = `${VIC.code} ${VIC.version}`;
const notice = (id: string, issuedAt: string | null, over: Record<string, unknown> = {}) => ({
  id,
  schemeId: "s1",
  lotId: "lot-1",
  noticeNumber: id.toUpperCase(),
  status: "OVERDUE",
  issuedAt,
  rulePack: LABEL,
  migrationBatchId: null,
  dueDate: null as unknown,
  amountDue: "100.00",
  amountPaid: "0.00",
  balanceOutstanding: "100.00",
  interestCharged: "0",
  ...over,
});

beforeEach(() => {
  sharedFake.reset({
    LevyNotice: [
      notice("n-1", "2026-10-03T13:59:59.000Z", { dueDate: "2026-10-31" }),
      notice("n-2", "2026-10-03T14:00:00.000Z", { dueDate: "2026-10-31" }),
      notice("n-3", "2027-04-03T12:59:59.000Z", { dueDate: "2027-05-01" }),
      notice("n-4", "2027-04-03T13:00:00.000Z", { dueDate: "2027-05-01" }),
      notice("t-1", "2026-09-01T00:00:00.000Z", { rulePack: null, migrationBatchId: "batch-1", dueDate: "2026-10-01" }),
      notice("x-1", "2026-09-02T00:00:00.000Z", { rulePack: null, dueDate: "2026-10-02" }),
      notice("p-1", "2026-09-03T00:00:00.000Z", { status: "PAID", amountPaid: "100.00", balanceOutstanding: "0.00" }),
      notice("o-1", "2026-09-04T00:00:00.000Z", { lotId: "lot-2" }),
    ],
  });
});

/** The final notice step's gate with a fixture that lets a notice given outside StrataVerze be recorded, on `today`. */
function finalNoticeGate(claimNotices: Awaited<ReturnType<typeof overdueNoticesForClaim>>, today: string) {
  const recovery = VIC.rules.DEBT_RECOVERY;
  const rules = {
    DEBT_RECOVERY: { ...recovery, finalNotice: { ...recovery.finalNotice, givenOutsideMayBeRecorded: { value: true, status: "STRATAVERZE", source: "fixture" } } },
    DATED_RULES: VIC.rules.DATED_RULES,
  } as unknown as Parameters<typeof recoveryGateProblem>[0];
  return recoveryGateProblem(rules, {
    action: "COMPLETE_STEP",
    stepType: "FINAL_NOTICE",
    caseSteps: VIC.rules.DEBT_RECOVERY_STEPS.map((s) => ({ stepType: s.stepType, stepOrder: s.stepOrder })),
    authority: null,
    forum: null,
    recorded: { authorityToSue: false, forum: null },
    today,
    caseOpenedOn: "2026-09-01",
    labels: VIC.rules.DEBT_RECOVERY_STEP_LABELS,
    finalNoticeGivenOn: today,
    claimNotices,
    packCode: VIC.code,
  });
}

describe("overdueNoticesForTiming", () => {
  it("reads the lot's overdue notices only, each with its issue day in the building's zone, its pack and whether it was taken over", async () => {
    const rows = await overdueNoticesForTiming("s1", "lot-1", "Australia/Melbourne", "2027-06-01");
    expect(rows).toEqual([
      { number: "N-1", issuedOn: "2026-10-03", rulePack: LABEL, takeover: false },
      { number: "N-2", issuedOn: "2026-10-04", rulePack: LABEL, takeover: false },
      { number: "N-3", issuedOn: "2027-04-03", rulePack: LABEL, takeover: false },
      { number: "N-4", issuedOn: "2027-04-04", rulePack: LABEL, takeover: false },
      { number: "T-1", issuedOn: "2026-09-01", rulePack: null, takeover: true },
      { number: "X-1", issuedOn: "2026-09-02", rulePack: null, takeover: false },
    ]);
  });

  it("gives the earliest day for the final notice: day 29 after the issue day (the claim notices, each past its due day)", async () => {
    const rows = await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2027-06-01");
    const [n1, n2, n3, n4] = rows;
    // 3 Oct 2026: earliest 1 Nov. 4 Oct 2026: earliest 2 Nov.
    expect(finalNoticeGate([n1], "2026-10-31")).toMatch(/cannot have been given before 01\/11\/2026/);
    expect(finalNoticeGate([n1], "2026-11-01")).toBeNull();
    expect(finalNoticeGate([n2], "2026-11-01")).toMatch(/cannot have been given before 02\/11\/2026/);
    expect(finalNoticeGate([n2], "2026-11-02")).toBeNull();
    // 3 Apr 2027: earliest 2 May. 4 Apr 2027: earliest 3 May.
    expect(finalNoticeGate([n3], "2027-05-02")).toBeNull();
    expect(finalNoticeGate([n4], "2027-05-02")).toMatch(/cannot have been given before 03\/05\/2027/);
    // The takeover notice and the one with no pack refuse.
    expect(finalNoticeGate(rows, "2027-06-01")).toMatch(/^Notice T-1, X-1 was not issued under this building's rules in StrataVerze/);
  });

  it("reads the same notices as overdueNoticesForClaim, by the one definition: one stored as overdue but not yet due is not read", async () => {
    // On 31 Oct 2026 N-1 and N-2 (stored OVERDUE, due that day) are not yet overdue, nor N-3 and N-4.
    const timing = await overdueNoticesForTiming("s1", "lot-1", "Australia/Melbourne", "2026-10-31");
    expect(timing.map((n) => n.number)).toEqual(["T-1", "X-1"]);
    const claim = await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2026-10-31");
    expect(claim.map(({ number, issuedOn, rulePack, takeover }) => ({ number, issuedOn, rulePack, takeover }))).toEqual(timing);
  });
});

describe("overdueNoticesForClaim (decision of 30 Oct 2026)", () => {
  it("reads the lot's notices overdue on the building's day: issued, part paid or stored as overdue, past the due day, with a balance", async () => {
    sharedFake.reset({
      LevyNotice: [
        notice("n-1", "2026-10-03T13:59:59.000Z", { dueDate: "2026-11-01" }),
        notice("i-1", "2026-10-03T14:00:00.000Z", { status: "ISSUED", dueDate: "2026-11-01" }),
        notice("i-2", "2026-10-03T14:00:00.000Z", { status: "ISSUED", dueDate: "2026-11-02" }),
        notice("q-1", "2026-10-03T14:00:00.000Z", { status: "PARTIALLY_PAID", dueDate: "2026-10-01", amountPaid: "100.00", balanceOutstanding: "0.00" }),
        notice("q-2", "2026-10-03T14:00:00.000Z", { status: "PARTIALLY_PAID", dueDate: "2026-10-01", amountPaid: "99.99", balanceOutstanding: "0.01" }),
        notice("t-1", "2026-09-01T00:00:00.000Z", { rulePack: null, migrationBatchId: "batch-1", migratedInterestPaid: "0", dueDate: "2026-10-01" }),
        notice("p-1", "2026-09-03T00:00:00.000Z", { status: "PAID", dueDate: "2026-10-01", amountPaid: "100.00", balanceOutstanding: "0.00" }),
        notice("o-1", "2026-09-04T00:00:00.000Z", { lotId: "lot-2", dueDate: "2026-10-01" }),
      ],
    });
    expect(await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2026-11-02")).toEqual([
      { number: "N-1", issuedOn: "2026-10-03", dueOn: "2026-11-01", rulePack: LABEL, takeover: false, owingCents: 10_000 },
      { number: "I-1", issuedOn: "2026-10-04", dueOn: "2026-11-01", rulePack: LABEL, takeover: false, owingCents: 10_000 },
      { number: "Q-2", issuedOn: "2026-10-04", dueOn: "2026-10-01", rulePack: LABEL, takeover: false, owingCents: 1 },
      { number: "T-1", issuedOn: "2026-09-01", dueOn: "2026-10-01", rulePack: null, takeover: true, owingCents: 10_000 },
    ]);
  });

  it("counts a past-due ISSUED notice, and not a stored-OVERDUE notice not yet due or one past due with nothing owing", async () => {
    sharedFake.reset({
      LevyNotice: [
        notice("i-1", "2026-09-01T00:00:00.000Z", { status: "ISSUED", dueDate: "2026-10-01" }),
        notice("o-1", "2026-09-01T00:00:00.000Z", { status: "OVERDUE", dueDate: "2026-11-30" }),
        notice("o-2", "2026-09-01T00:00:00.000Z", { status: "OVERDUE", dueDate: "2026-11-02" }),
        notice("o-3", "2026-09-01T00:00:00.000Z", { status: "OVERDUE", dueDate: "2026-10-01", amountPaid: "100.00", balanceOutstanding: "0.00" }),
      ],
    });
    expect((await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2026-11-02")).map((n) => n.number)).toEqual(["I-1"]);
  });

  it.each([
    ["a stored-OVERDUE notice with no due day", { dueDate: null }, "dueDate"],
    ["a due day that is not a day", { status: "ISSUED", dueDate: "soon" }, "dueDate"],
    ["a past-due balance that cannot be read", { dueDate: "2026-10-01", balanceOutstanding: "abc" }, "balanceOutstanding"],
    ["a late charge that cannot be read", { dueDate: "2026-10-01", interestCharged: null }, "interestCharged"],
  ])("throws UnreadableNoticeError for %s, never counting or leaving out the notice silently", async (_what, over, field) => {
    sharedFake.reset({ LevyNotice: [notice("u-1", "2026-09-01T00:00:00.000Z", over)] });
    const read = overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2026-11-02");
    await expect(read).rejects.toBeInstanceOf(UnreadableNoticeError);
    await expect(read).rejects.toMatchObject({ field });
  });
});

describe("the claim notices' amounts: balance only (C1, 30 Oct 2026)", () => {
  it("is each notice's balance in cents, its late charge already in it: a 50.00 late charge in a 550.50 balance gives 550.50", async () => {
    sharedFake.reset({
      LevyNotice: [notice("a-1", "2026-09-01T00:00:00.000Z", { dueDate: "2026-10-01", amountDue: "500.50", interestCharged: "50.00", balanceOutstanding: "550.50" })],
    });
    const rows = await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2026-11-02");
    expect(rows.map((r) => [r.number, r.owingCents])).toEqual([["A-1", 55_050]]);
    expect(claimAmount(rows)).toBe("550.50");
  });

  it("agrees with the case amount and currentAmountOwing for the same notices", async () => {
    const LevyNotice = [
      // Stored OVERDUE, with a late charge, part paid: 1200.00 + 35.50 - 100.00.
      notice("a-1", "2026-09-01T00:00:00.000Z", { dueDate: "2026-10-01", amountDue: "1200.00", interestCharged: "35.50", amountPaid: "100.00", balanceOutstanding: "1135.50" }),
      // Issued, past due, a late charge and nothing paid: 300.00 + 5.05.
      notice("a-2", "2026-09-01T00:00:00.000Z", { status: "ISSUED", dueDate: "2026-10-15", amountDue: "300.00", interestCharged: "5.05", balanceOutstanding: "305.05" }),
      // Part paid, past due: 250.00 - 249.99.
      notice("a-3", "2026-09-01T00:00:00.000Z", { status: "PARTIALLY_PAID", dueDate: "2026-10-20", amountDue: "250.00", amountPaid: "249.99", balanceOutstanding: "0.01" }),
      // Not counted by any of them: not yet due, paid, another lot.
      notice("a-4", "2026-09-01T00:00:00.000Z", { status: "ISSUED", dueDate: "2026-11-30" }),
      notice("a-5", "2026-09-01T00:00:00.000Z", { status: "PAID", dueDate: "2026-10-01", amountPaid: "100.00", balanceOutstanding: "0.00" }),
      notice("a-6", "2026-09-01T00:00:00.000Z", { lotId: "lot-2", dueDate: "2026-10-01" }),
    ];
    sharedFake.reset({ LevyNotice });
    const today = "2026-11-02";
    const claim = await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", today);
    expect(claim.map((n) => n.number)).toEqual(["A-1", "A-2", "A-3"]);
    const lot1 = LevyNotice.filter((n) => n.lotId === "lot-1" && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(n.status));
    const amount = await caseAmountCents(overdueOn(lot1, today), VIC.rules.PAYMENT_ALLOCATION_ORDER);
    expect(amount.totalCents).toBe(144_056);
    expect(claimAmount(claim)).toBe((amount.totalCents / 100).toFixed(2));
    expect(await currentAmountOwing("s1", "lot-1", undefined, today)).toBe(claimAmount(claim));
  });
});
