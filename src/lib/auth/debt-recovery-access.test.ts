import { describe, expect, it } from "vitest";
import {
  caseAccessProblem,
  initiatingRole,
  isCasePriority,
  isCaseStatus,
  isClosedStatus,
  isValidAmount,
} from "./debt-recovery-access";

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

describe("caseAccessProblem", () => {
  const caseInA = { schemeId: SCHEME_A, ownerId: "debtor", status: "OPEN" };

  it("allows an authorised member acting on their own scheme's case", () => {
    expect(caseAccessProblem(caseInA, SCHEME_A, "adviser")).toBeNull();
  });

  it("rejects a case from another scheme (cross-scheme id)", () => {
    expect(caseAccessProblem(caseInA, SCHEME_B, "adviser")).toBe("Case not found.");
  });

  it("rejects a missing case", () => {
    expect(caseAccessProblem(null, SCHEME_A, "adviser")).toBe("Case not found.");
  });

  it("rejects the debtor acting on their own case, even as a committee member", () => {
    expect(caseAccessProblem(caseInA, SCHEME_A, "debtor")).toMatch(/your own lot/);
  });
});

describe("initiatingRole", () => {
  it("takes the role from memberships, preferring adviser", () => {
    expect(initiatingRole(["OWNER", "COMMITTEE", "ADVISER"])).toBe("ADVISER");
    expect(initiatingRole(["OWNER", "COMMITTEE"])).toBe("COMMITTEE");
  });

  it("returns null for anyone else", () => {
    expect(initiatingRole(["OWNER", "SUPPLIER"])).toBeNull();
  });
});

describe("value checks", () => {
  it("accepts only known statuses and priorities", () => {
    expect(isCaseStatus("ON_HOLD")).toBe(true);
    expect(isCaseStatus("CLOSED_FORGIVEN")).toBe(false);
    expect(isClosedStatus("CLOSED_WRITTEN_OFF")).toBe(true);
    expect(isClosedStatus("OPEN")).toBe(false);
    expect(isCasePriority("URGENT")).toBe(true);
    expect(isCasePriority("critical")).toBe(false);
  });

  it("accepts positive amounts in whole cents only", () => {
    expect(isValidAmount(125.5)).toBe(true);
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(-10)).toBe(false);
    expect(isValidAmount(Number.NaN)).toBe(false);
    expect(isValidAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidAmount(10.001)).toBe(false);
  });
});
