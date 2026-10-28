/**
 * Victorian fees are not split for insurance yet (VIC, ACT and WA stage 2,
 * PR 4 review). The notes limit the s 23A fee, by lot entitlement, to the
 * reinstatement and replacement premium, while annual fees, insurance
 * included, are shared by lot liability (s 23(1), (3)). The budget holds every
 * policy together, so the pack has no CONTRIBUTION_INSURANCE until FOR_REVIEW
 * CONTRIBUTION_INSURANCE_S23A is decided: the whole of every Victorian fee is
 * shared by lot liability, and lot entitlement is not needed for it.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import { allocateCents, planNotices } from "./notice-plan";
import { insuranceBasis, insuranceSplit, type ShareLot } from "./contribution-shares";
import { levySharedBy } from "@/lib/jurisdiction/screen-words";

const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as StatutoryRules;

// Lot liability 1, 1, 2; lot entitlement 50, 30 and none.
const lots: ShareLot[] = [
  { lotId: "l1", lotNumber: "1", entitlement: 1, lotEntitlement: 50, ownerId: "o1" },
  { lotId: "l2", lotNumber: "2", entitlement: 1, lotEntitlement: 30, ownerId: null },
  { lotId: "l3", lotNumber: "3", entitlement: 2, lotEntitlement: null, ownerId: "o3" },
];

describe("a Victorian annual fee with insurance in its budget", () => {
  it("is never split, whatever the fund, the insurance or the lots' lot entitlements", () => {
    expect(VIC.CONTRIBUTION_INSURANCE).toBeUndefined();
    for (const ledgerFund of ["ADMINISTRATIVE", "CAPITAL_WORKS"]) {
      for (const insuranceCents of [0, 33_333, 100_000, 100_001]) {
        for (const levyType of ["ORDINARY", "SPECIAL"] as const) {
          expect(insuranceSplit({ rules: VIC, planFormat: null, lots, totalCents: 100_000, insuranceCents, ledgerFund, levyType })).toBeNull();
        }
      }
    }
  });

  it("is shared by lot liability alone, exact to the cent, insurance included", () => {
    const notices = planNotices({ lots, totalCents: 100_000, frequency: "QUARTERLY", periodStart: "2026-07-01", firstDueDate: "2026-07-01" });
    const byLot = lots.map((l) => notices.filter((n) => n.lotId === l.lotId).reduce((a, n) => a + n.amountCents, 0));
    expect(byLot).toEqual(allocateCents(100_000, [1, 1, 2]));
    expect(byLot.reduce((a, b) => a + b, 0)).toBe(100_000);
    expect(notices.every((n) => n.insuranceCents == null)).toBe(true);
  });

  it("is described as shared by lot liability, with no insurance sentence", () => {
    expect(levySharedBy(VIC)).toBe("lot liability");
    expect(insuranceBasis(VIC)).toBeNull();
  });
});
