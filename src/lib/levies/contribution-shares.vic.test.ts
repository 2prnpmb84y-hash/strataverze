/**
 * Victoria's insurance premium fee in an annual fee (VIC, ACT and WA stage 2,
 * PR 4): the insurance part of an annual fee to the administrative fund is
 * shared by lot entitlement (OCA s 23A) and the rest by lot liability
 * (s 23(3)), each exact to the cent. A lot without a lot entitlement is
 * refused, never shared by lot liability instead.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import { allocateCents, planNotices } from "./notice-plan";
import { ContributionShareError, insuranceBasis, insuranceSplit, type ShareLot } from "./contribution-shares";
import { levySharedBy } from "@/lib/jurisdiction/screen-words";

const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as StatutoryRules;
const NO_DASH_OR_SEMICOLON = /[;–—]| - /;

// Lot liability 1, 1, 2; lot entitlement 50, 30, 20.
const lots: ShareLot[] = [
  { lotId: "l1", lotNumber: "1", entitlement: 1, lotEntitlement: 50, ownerId: "o1" },
  { lotId: "l2", lotNumber: "2", entitlement: 1, lotEntitlement: 30, ownerId: null },
  { lotId: "l3", lotNumber: "3", entitlement: 2, lotEntitlement: 20, ownerId: "o3" },
];

const split = (over: Partial<Parameters<typeof insuranceSplit>[0]> = {}) =>
  insuranceSplit({ rules: VIC, planFormat: null, lots, totalCents: 100_000, insuranceCents: 33_333, ledgerFund: "ADMINISTRATIVE", levyType: "ORDINARY", ...over });

const refusal = (over: Partial<Parameters<typeof insuranceSplit>[0]>) => {
  try {
    split(over);
  } catch (err) {
    expect(err).toBeInstanceOf(ContributionShareError);
    return (err as Error).message;
  }
  throw new Error("Expected a refusal.");
};

describe("the s 23A insurance premium fee in an annual fee", () => {
  it("shares the insurance by lot entitlement and the rest by lot liability, exact to the cent", () => {
    const s = split()!;
    expect(s.insuranceSchedule).toEqual({ key: "LOT_ENTITLEMENT", name: "lot entitlement" });
    expect(s.contributionSchedule).toEqual({ key: "LOT_LIABILITY", name: "lot liability" });
    // $333.33 by 50:30:20 is 16,666.5, 9,999.9 and 6,666.6 cents.
    expect(s.shares.map((x) => x.insuranceCents)).toEqual(allocateCents(33_333, [50, 30, 20]));
    // The other $666.67 by 1:1:2.
    expect(s.shares.map((x) => x.totalCents - x.insuranceCents)).toEqual(allocateCents(66_667, [1, 1, 2]));
    expect(s.shares.reduce((a, x) => a + x.insuranceCents, 0)).toBe(33_333);
    expect(s.shares.reduce((a, x) => a + x.totalCents, 0)).toBe(100_000);
    expect(s.shares.map((x) => x.totalCents)).not.toEqual(allocateCents(100_000, [1, 1, 2]));
  });

  it("sums exactly for any total and insurance, every share whole cents and never negative", () => {
    const weights = [
      [1, 1, 2],
      [7, 13, 1, 999],
      [3, 3, 3],
    ];
    for (const liability of weights) {
      const entitlement = liability.map((_, i) => (i * 37 + 11) % 101 || 1);
      const own: ShareLot[] = liability.map((e, i) => ({ lotId: `l${i}`, lotNumber: String(i + 1), entitlement: e, lotEntitlement: entitlement[i], ownerId: null }));
      for (const totalCents of [1, 99, 100_000, 1_234_567, 99_999_999]) {
        for (const insuranceCents of [1, Math.floor(totalCents / 3), totalCents]) {
          if (insuranceCents < 1 || insuranceCents > totalCents) continue;
          const s = split({ lots: own, totalCents, insuranceCents })!;
          expect(s.shares.reduce((a, x) => a + x.totalCents, 0)).toBe(totalCents);
          expect(s.shares.reduce((a, x) => a + x.insuranceCents, 0)).toBe(insuranceCents);
          for (const x of s.shares) {
            expect(Number.isInteger(x.totalCents) && Number.isInteger(x.insuranceCents)).toBe(true);
            expect(x.insuranceCents).toBeGreaterThanOrEqual(0);
            expect(x.totalCents).toBeGreaterThanOrEqual(x.insuranceCents);
          }
        }
      }
    }
  });

  it("keeps each instalment's insurance part exact when the fee is paid in instalments", () => {
    const s = split()!;
    const notices = planNotices({ lots, totalCents: 100_000, frequency: "QUARTERLY", periodStart: "2026-07-01", firstDueDate: "2026-07-01", shares: s.shares });
    expect(notices.reduce((a, n) => a + n.amountCents, 0)).toBe(100_000);
    expect(notices.reduce((a, n) => a + (n.insuranceCents ?? 0), 0)).toBe(33_333);
  });

  it("refuses a lot with no lot entitlement, or 0, never sharing it by lot liability", () => {
    expect(refusal({ lots: [lots[0], { ...lots[1], lotEntitlement: null }, lots[2]] })).toBe(
      "Lot 2 has no lot entitlement recorded, so its share cannot be worked out. StrataVerze enters it from the building's records. The fees were not issued.",
    );
    expect(refusal({ lots: [{ ...lots[0], lotEntitlement: 0 }, lots[1], { ...lots[2], lotEntitlement: undefined }] })).toBe(
      "Lot 3 has no lot entitlement recorded, so its share cannot be worked out. The lot entitlement of lot 1 is 0, but each entitlement is a whole number of at least 1. StrataVerze corrects them from the building's records. The fees were not issued.",
    );
    // A Queensland interest schedule value is never read as a lot entitlement.
    expect(refusal({ lots: lots.map((l) => ({ ...l, lotEntitlement: null, interestScheduleEntitlement: 5 })) })).toMatch(/^3 lots have no lot entitlement recorded \(lots 1, 2 and 3\)/);
  });

  it("does not refuse a budget with no insurance line: the whole fee is shared by lot liability (a StrataVerze choice)", () => {
    expect(VIC.CONTRIBUTION_INSURANCE?.insuranceLineRequired).toEqual({ value: false, status: "STRATAVERZE" });
    expect(split({ insuranceCents: 0 })).toBeNull();
    // Lot entitlement is not needed then.
    expect(split({ insuranceCents: 0, lots: lots.map((l) => ({ ...l, lotEntitlement: null })) })).toBeNull();
  });

  it("refuses an insurance line in the maintenance fund budget, and insurance above the fee", () => {
    expect(refusal({ ledgerFund: "CAPITAL_WORKS" })).toBe(
      "The maintenance fund budget has an insurance line, but insurance is paid from the administrative fund. Move the insurance to the administrative fund budget, then issue the fees.",
    );
    expect(split({ ledgerFund: "CAPITAL_WORKS", insuranceCents: 0 })).toBeNull();
    expect(refusal({ insuranceCents: 100_001 })).toBe("The insurance in the budget ($1,000.01) is more than the fees to be raised ($1,000.00). Check the budget and the amount to be raised.");
  });

  it("shares a special fee by lot liability only (s 24(2))", () => {
    expect(split({ levyType: "SPECIAL" })).toBeNull();
  });

  it("says how the parts are shared, in plain words", () => {
    const sentence = insuranceBasis(VIC);
    expect(sentence).toBe("Your share of the insurance is worked out by your lot's lot entitlement, and the rest by its lot liability.");
    expect(levySharedBy(VIC)).toBe("lot liability (the insurance in the administrative fund by lot entitlement)");
    expect(sentence).not.toMatch(NO_DASH_OR_SEMICOLON);
  });

  it("is marked NOT_CONFIRMED, with the open points for review", () => {
    expect(VIC.CONTRIBUTION_INSURANCE).toMatchObject({ paidFrom: "ADMINISTRATIVE", uses: ["INSURANCE_PREMIUM_FEE"], status: "NOT_CONFIRMED" });
    expect(VIC.CONTRIBUTION_INSURANCE!.source).toContain("23A");
  });
});
