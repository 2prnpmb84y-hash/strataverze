/**
 * The lot's overdue notices as the Victorian s 32(1) wait reads them (stage 2,
 * PR 9c review M2), against the in-memory database: each notice's issue day
 * in the building's zone (Australia/Melbourne, either side of midnight and of
 * the daylight saving changes), the pack it was issued under and whether it
 * was brought across at takeover; notices that are not overdue are not read.
 * The earliest day the final notice may be given is then day 29 after it.
 * Since the review of 30 Oct 2026 the final notice step counts from the claim
 * notices (overdueNoticesForClaim), each also past its due day.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { overdueNoticesForClaim, overdueNoticesForTiming } = await import("./recovery-records-repo");
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
      notice("t-1", "2026-09-01T00:00:00.000Z", { rulePack: null, migrationBatchId: "batch-1" }),
      notice("x-1", "2026-09-02T00:00:00.000Z", { rulePack: null }),
      notice("p-1", "2026-09-03T00:00:00.000Z", { status: "PAID" }),
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
    const rows = await overdueNoticesForTiming("s1", "lot-1", "Australia/Melbourne");
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
});

describe("overdueNoticesForClaim (decision of 30 Oct 2026)", () => {
  it("reads the lot's notices overdue on the building's day: stored as overdue, or issued with a balance and past the due day", async () => {
    sharedFake.reset({
      LevyNotice: [
        notice("n-1", "2026-10-03T13:59:59.000Z", { dueDate: "2026-11-01" }),
        notice("i-1", "2026-10-03T14:00:00.000Z", { status: "ISSUED", dueDate: "2026-11-01" }),
        notice("i-2", "2026-10-03T14:00:00.000Z", { status: "ISSUED", dueDate: "2026-11-02" }),
        notice("q-1", "2026-10-03T14:00:00.000Z", { status: "PARTIALLY_PAID", dueDate: "2026-10-01", balanceOutstanding: "0.00" }),
        notice("q-2", "2026-10-03T14:00:00.000Z", { status: "PARTIALLY_PAID", dueDate: "2026-10-01", balanceOutstanding: "0.01" }),
        notice("t-1", "2026-09-01T00:00:00.000Z", { rulePack: null, migrationBatchId: "batch-1", dueDate: null }),
        notice("p-1", "2026-09-03T00:00:00.000Z", { status: "PAID", dueDate: "2026-10-01" }),
        notice("o-1", "2026-09-04T00:00:00.000Z", { lotId: "lot-2", dueDate: "2026-10-01" }),
      ],
    });
    expect(await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2026-11-02")).toEqual([
      { number: "N-1", issuedOn: "2026-10-03", dueOn: "2026-11-01", rulePack: LABEL, takeover: false, owingCents: 10_000 },
      { number: "I-1", issuedOn: "2026-10-04", dueOn: "2026-11-01", rulePack: LABEL, takeover: false, owingCents: 10_000 },
      { number: "Q-2", issuedOn: "2026-10-04", dueOn: "2026-10-01", rulePack: LABEL, takeover: false, owingCents: 1 },
      { number: "T-1", issuedOn: "2026-09-01", dueOn: null, rulePack: null, takeover: true, owingCents: 10_000 },
    ]);
  });
});

describe("the claim notices' amounts (review of 30 Oct 2026)", () => {
  it("is each notice's balance plus its interest charged, in cents, and null where either is not an amount", async () => {
    sharedFake.reset({
      LevyNotice: [
        notice("a-1", "2026-09-01T00:00:00.000Z", { dueDate: "2026-10-01", balanceOutstanding: "1200.00", interestCharged: "35.50" }),
        notice("a-2", "2026-09-01T00:00:00.000Z", { status: "ISSUED", dueDate: "2026-10-01", balanceOutstanding: 300, interestCharged: null }),
        notice("a-3", "2026-09-01T00:00:00.000Z", { dueDate: "2026-10-01", balanceOutstanding: "abc" }),
      ],
    });
    const rows = await overdueNoticesForClaim("s1", "lot-1", "Australia/Melbourne", "2026-11-02");
    expect(rows.map((r) => [r.number, r.owingCents])).toEqual([
      ["A-1", 123_550],
      ["A-2", 30_000],
      ["A-3", null],
    ]);
  });
});
