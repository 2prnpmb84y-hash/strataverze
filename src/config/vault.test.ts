import { describe, expect, it } from "vitest";
import { isVaultTrialBuilding } from "./vault";

describe("the vault trial buildings", () => {
  it("are matched by state and plan number, as plan numbers are unique within each state only", () => {
    expect(isVaultTrialBuilding({ state: "NSW", planNumber: "SP 99999" })).toBe(true);
    expect(isVaultTrialBuilding({ state: " nsw ", planNumber: " SP 99999 " })).toBe(true);
    // A Queensland building on survey plan SP 99999 is not the trial building.
    expect(isVaultTrialBuilding({ state: "QLD", planNumber: "SP 99999" })).toBe(false);
    expect(isVaultTrialBuilding({ state: "NSW", planNumber: "SP 1" })).toBe(false);
    expect(isVaultTrialBuilding({ state: null, planNumber: "SP 99999" })).toBe(false);
    expect(isVaultTrialBuilding({ state: "NSW", planNumber: null })).toBe(false);
  });
});
