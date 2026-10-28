/**
 * Each lot's share of a Queensland contribution whose insurance part is
 * shared by the interest schedule (QLD go-live gap, insurance in
 * contributions, 27 Oct 2026): building and volumetric format plans are
 * split, a standard format plan and missing data are refused, and NSW is
 * never split.
 */
import { describe, expect, it } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import { allocateCents, planNotices, type LevyFrequency } from "./notice-plan";
import { ContributionShareError, insuranceBasis, insuranceSplit, type ShareLot } from "./contribution-shares";

const QLD = QLD_RULE_PACK.rules as unknown as StatutoryRules;
const NSW = statutoryRulesFor("NSW");
const NO_DASH_OR_SEMICOLON = /[;–—]| - /;

// Contribution schedule 10, 20, 30; interest schedule 30, 30, 40.
const lots: ShareLot[] = [
  { lotId: "l1", lotNumber: "1", entitlement: 10, interestScheduleEntitlement: 30, ownerId: "o1" },
  { lotId: "l2", lotNumber: "2", entitlement: 20, interestScheduleEntitlement: 30, ownerId: null },
  { lotId: "l3", lotNumber: "3", entitlement: 30, interestScheduleEntitlement: 40, ownerId: "o3" },
];

const split = (over: Partial<Parameters<typeof insuranceSplit>[0]> = {}) =>
  insuranceSplit({ rules: QLD, planFormat: "BUILDING", lots, totalCents: 100_000, insuranceCents: 40_001, ledgerFund: "ADMINISTRATIVE", levyType: "ORDINARY", ...over });

const refusal = (over: Partial<Parameters<typeof insuranceSplit>[0]>) => {
  try {
    split(over);
  } catch (err) {
    expect(err).toBeInstanceOf(ContributionShareError);
    return (err as Error).message;
  }
  throw new Error("Expected a refusal.");
};

describe("a building format plan", () => {
  it("shares the insurance part by the interest schedule and the rest by the contribution schedule, exact to the cent", () => {
    const s = split()!;
    expect(s.insuranceSchedule).toEqual({ key: "INTEREST", name: "interest schedule lot entitlement" });
    expect(s.contributionSchedule).toEqual({ key: "CONTRIBUTION", name: "contribution schedule lot entitlement" });
    // $400.01 by 30:30:40 is 12,000.3, 12,000.3 and 16,000.4 cents: the spare cent goes to lot 3.
    expect(s.shares.map((x) => x.insuranceCents)).toEqual([12_000, 12_000, 16_001]);
    // The other $599.99 by 10:20:30 is 9,999.83, 19,999.67 and 29,999.5 cents: the spare 2 cents go to lots 1 and 2.
    expect(s.shares.map((x) => x.totalCents - x.insuranceCents)).toEqual([10_000, 20_000, 29_999]);
    expect(s.shares.map((x) => x.totalCents)).toEqual([22_000, 32_000, 46_000]);
    expect(s.shares.reduce((a, x) => a + x.insuranceCents, 0)).toBe(40_001);
    expect(s.shares.reduce((a, x) => a + x.totalCents, 0)).toBe(100_000);
    // Not what the contribution schedule alone would give.
    expect(allocateCents(100_000, [10, 20, 30])).not.toEqual(s.shares.map((x) => x.totalCents));
  });

  it("splits each lot's share into instalments whose insurance parts add up exactly and never exceed the instalment", () => {
    const s = split()!;
    const notices = planNotices({ lots, totalCents: 100_000, frequency: "QUARTERLY", periodStart: "2026-07-01", firstDueDate: "2026-07-01", shares: s.shares });
    expect(notices).toHaveLength(12);
    expect(notices.reduce((a, n) => a + n.amountCents, 0)).toBe(100_000);
    expect(notices.reduce((a, n) => a + (n.insuranceCents ?? 0), 0)).toBe(40_001);
    lots.forEach((lot, i) => {
      const own = notices.filter((n) => n.lotId === lot.lotId);
      expect(own.reduce((a, n) => a + n.amountCents, 0)).toBe(s.shares[i].totalCents);
      expect(own.reduce((a, n) => a + n.insuranceCents!, 0)).toBe(s.shares[i].insuranceCents);
    });
    // Lot 3: $460.00 in four, $160.01 of insurance in four (the spare cent in the first).
    expect(notices.filter((n) => n.lotId === "l3").map((n) => [n.amountCents, n.insuranceCents])).toEqual([
      [11_500, 4_001],
      [11_500, 4_000],
      [11_500, 4_000],
      [11_500, 4_000],
    ]);
  });

  it("holds for any amounts and entitlements: every part sums exactly and no notice's insurance exceeds it", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    const frequencies: LevyFrequency[] = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"];
    for (let run = 0; run < 300; run++) {
      const many: ShareLot[] = Array.from({ length: 1 + rand(12) }, (_, i) => ({ lotId: `l${i}`, lotNumber: String(i + 1), entitlement: 1 + rand(500), interestScheduleEntitlement: 1 + rand(500), ownerId: null }));
      const totalCents = 1 + rand(5_000_000);
      const insuranceCents = 1 + rand(totalCents);
      const s = split({ lots: many, totalCents, insuranceCents, planFormat: run % 2 ? "BUILDING" : "VOLUMETRIC" })!;
      expect(s.shares.reduce((a, x) => a + x.totalCents, 0)).toBe(totalCents);
      expect(s.shares.reduce((a, x) => a + x.insuranceCents, 0)).toBe(insuranceCents);
      const notices = planNotices({ lots: many, totalCents, frequency: frequencies[run % 4], periodStart: "2026-07-01", firstDueDate: "2026-07-01", shares: s.shares });
      expect(notices.reduce((a, n) => a + n.amountCents, 0)).toBe(totalCents);
      expect(notices.reduce((a, n) => a + n.insuranceCents!, 0)).toBe(insuranceCents);
      for (const n of notices) expect(n.insuranceCents!).toBeLessThanOrEqual(n.amountCents);
    }
  });

  it("raises the whole contribution as insurance when the budget is all insurance", () => {
    const s = split({ insuranceCents: 100_000 })!;
    expect(s.shares.map((x) => x.totalCents)).toEqual([30_000, 30_000, 40_000]);
    expect(s.shares.every((x) => x.insuranceCents === x.totalCents)).toBe(true);
  });

  it("states the basis on the notice, naming both schedules from the pack", () => {
    // Read from the pack alone, never the building's plan format now, so a regenerated PDF says what the original said.
    expect(insuranceBasis(QLD)).toBe("Your share of the insurance is worked out by your lot's interest schedule lot entitlement, and the rest by its contribution schedule lot entitlement.");
    expect(insuranceBasis(NSW)).toBeNull();
  });
});

describe("a volumetric format plan", () => {
  it("is shared the same way, both premiums by the interest schedule", () => {
    expect(split({ planFormat: "VOLUMETRIC" })).toEqual(split({ planFormat: "BUILDING" }));
  });
});

describe("refused, never worked out another way", () => {
  it("a standard format plan", () => {
    expect(refusal({ planFormat: "STANDARD" })).toBe(
      "This building is recorded as a standard format plan. Its buildings insurance is shared by the cost of reinstating the buildings on each lot, which StrataVerze does not work out yet. Contributions that include insurance cannot be raised for it until then. The contributions were not issued.",
    );
  });

  it("no plan format recorded", () => {
    for (const planFormat of [null, undefined, "", "  "]) {
      expect(refusal({ planFormat })).toBe(
        "No plan format is recorded for this building. Choose it in the building settings before contributions that include insurance are raised. The contributions were not issued.",
      );
    }
    expect(refusal({ planFormat: "LAYERED" })).toMatch(/^The building's plan format is not one StrataVerze knows/);
  });

  it("a lot with no interest schedule entitlement, listing every such lot", () => {
    const one = lots.map((l) => (l.lotId === "l2" ? { ...l, interestScheduleEntitlement: null } : l));
    expect(refusal({ lots: one })).toBe(
      "Lot 2 has no interest schedule lot entitlement recorded, so its share cannot be worked out. StrataVerze enters it from the building's records. The contributions were not issued.",
    );
    const two = lots.map((l) => (l.lotId === "l1" ? l : { ...l, interestScheduleEntitlement: null }));
    expect(refusal({ lots: two })).toBe(
      "2 lots have no interest schedule lot entitlement recorded (lots 2 and 3), so their shares cannot be worked out. StrataVerze enters them from the building's records. The contributions were not issued.",
    );
    // A zero entitlement is said to be 0, not missing, and never falls back to the contribution schedule.
    expect(refusal({ lots: lots.map((l) => (l.lotId === "l3" ? { ...l, interestScheduleEntitlement: 0 } : l)) })).toBe(
      "The interest schedule lot entitlement of lot 3 is 0, but each entitlement is a whole number of at least 1. StrataVerze corrects it from the building's records. The contributions were not issued.",
    );
    expect(refusal({ lots: lots.map((l) => ({ ...l, interestScheduleEntitlement: l.lotId === "l1" ? null : 0 })) })).toBe(
      "Lot 1 has no interest schedule lot entitlement recorded, so its share cannot be worked out. The interest schedule lot entitlement of 2 lots is 0 (lots 2 and 3), but each entitlement is a whole number of at least 1. StrataVerze corrects them from the building's records. The contributions were not issued.",
    );
    expect(refusal({ lots: lots.map((l) => (l.lotId === "l2" ? { ...l, entitlement: 0 } : l)) })).toMatch(/^The contribution schedule lot entitlement of lot 2 is 0/);
  });

  it("an administrative fund budget with no insurance line", () => {
    expect(refusal({ insuranceCents: 0 })).toBe(
      "The administrative fund budget has no insurance. Put the insurance premium in the budget on the Insurance account, so each lot's share of it can be worked out, then issue the contributions.",
    );
  });

  it("an insurance line in the sinking fund budget, which is never shared as insurance (SM s 169(2))", () => {
    for (const planFormat of ["BUILDING", "STANDARD", null]) {
      expect(refusal({ ledgerFund: "CAPITAL_WORKS", planFormat })).toBe(
        "The sinking fund budget has an insurance line, but insurance is paid from the administrative fund. Move the insurance to the administrative fund budget, then issue the contributions.",
      );
    }
  });

  it("no insurance line only while the pack requires one, a StrataVerze choice", () => {
    expect(QLD.CONTRIBUTION_INSURANCE!.insuranceLineRequired).toEqual({ value: true, status: "STRATAVERZE" });
    const relaxed = { ...QLD, CONTRIBUTION_INSURANCE: { ...QLD.CONTRIBUTION_INSURANCE!, insuranceLineRequired: { value: false, status: "STRATAVERZE" as const } } };
    expect(split({ rules: relaxed, insuranceCents: 0 })).toBeNull();
  });

  it("insurance above the amount to be raised", () => {
    expect(refusal({ insuranceCents: 100_001 })).toBe(
      "The insurance in the budget ($1,000.01) is more than the contributions to be raised ($1,000.00). Check the budget and the amount to be raised.",
    );
  });

  it("in plain words, with no dash or semicolon", () => {
    const messages = [
      refusal({ planFormat: "STANDARD" }),
      refusal({ planFormat: null }),
      refusal({ planFormat: "LAYERED" }),
      refusal({ insuranceCents: 0 }),
      refusal({ insuranceCents: 100_001 }),
      refusal({ lots: lots.map((l) => ({ ...l, interestScheduleEntitlement: null })) }),
      insuranceBasis(QLD)!,
      refusal({ ledgerFund: "CAPITAL_WORKS" }),
      refusal({ lots: lots.map((l) => ({ ...l, interestScheduleEntitlement: 0 })) }),
    ];
    for (const m of messages) expect(m).not.toMatch(NO_DASH_OR_SEMICOLON);
  });
});

describe("not split", () => {
  it("a sinking fund contribution with no insurance line, whatever the plan format", () => {
    for (const planFormat of ["BUILDING", "STANDARD", null]) expect(split({ ledgerFund: "CAPITAL_WORKS", insuranceCents: 0, planFormat })).toBeNull();
  });

  it("a special contribution (FOR_REVIEW)", () => {
    expect(split({ levyType: "SPECIAL", planFormat: "STANDARD" })).toBeNull();
  });

  it("any NSW levy, even with an insurance line, so NSW is shared by unit entitlement as before", () => {
    for (const planFormat of [null, "BUILDING", "STANDARD"]) {
      expect(split({ rules: NSW, planFormat })).toBeNull();
      expect(split({ rules: NSW, planFormat, insuranceCents: 0 })).toBeNull();
    }
  });

  it("leaves the planner as it was without shares: no insurance part on any notice", () => {
    const notices = planNotices({ lots, totalCents: 100_000, frequency: "QUARTERLY", periodStart: "2026-07-01", firstDueDate: "2026-07-01" });
    expect(notices.every((n) => !("insuranceCents" in n))).toBe(true);
    expect(() => planNotices({ lots, totalCents: 100_000, frequency: "QUARTERLY", periodStart: "2026-07-01", firstDueDate: "2026-07-01", shares: [{ totalCents: 1, insuranceCents: 0 }] })).toThrow();
  });
});
