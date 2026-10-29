import { describe, expect, it } from "vitest";
import {
  caseAccessProblem,
  currentRecoveryStep,
  initiatingRole,
  isCasePriority,
  isCaseStatus,
  isClosedStatus,
  isValidAmount,
  legalReferralComplete,
  stepCompletionProblem,
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

describe("the order of the recovery steps", () => {
  // Out of order on purpose: the order is the steps' stepOrder.
  const steps = [
    { id: "s3", stepType: "REMINDER_NOTICE", stepOrder: 3, status: "PENDING" },
    { id: "s1", stepType: "LEDGER_VERIFICATION", stepOrder: 1, status: "COMPLETED" },
    { id: "s2", stepType: "INITIAL_CONTACT", stepOrder: 2, status: "PENDING" },
  ];
  const open = { status: "OPEN", currentStep: "INITIAL_CONTACT" };
  const labels = { INITIAL_CONTACT: "Initial Contact" };

  it("the current step is the first step not complete, when the case records it as current", () => {
    expect(currentRecoveryStep(open, steps)?.id).toBe("s2");
    expect(currentRecoveryStep({ currentStep: "REMINDER_NOTICE" }, steps)).toBeNull();
    expect(currentRecoveryStep({ currentStep: "CLOSED" }, steps.map((s) => ({ ...s, status: "COMPLETED" })))).toBeNull();
  });

  it("allows only the current step of an open case", () => {
    expect(stepCompletionProblem(open, steps, "s2", labels)).toBeNull();
    expect(stepCompletionProblem(open, steps, "s3", labels)).toBe("Steps are completed in order. Complete Initial Contact first.");
    expect(stepCompletionProblem(open, steps, "s3")).toBe("Steps are completed in order. Complete INITIAL_CONTACT first.");
    expect(stepCompletionProblem(open, steps, "s1", labels)).toBe("This step is already complete");
    expect(stepCompletionProblem(open, steps, "other", labels)).toBe("Step not found");
    expect(stepCompletionProblem({ status: "CLOSED_SETTLED", currentStep: "INITIAL_CONTACT" }, steps, "s2", labels)).toBe(
      "This case is closed, so its steps cannot be completed.",
    );
    expect(stepCompletionProblem({ status: "OPEN", currentStep: "REMINDER_NOTICE" }, steps, "s3", labels)).toBe(
      "Steps are completed in order, and this step is not the current step.",
    );
  });

  it("allows the other open statuses, as the screens do", () => {
    for (const status of ["IN_PROGRESS", "PAYMENT_PLAN", "ON_HOLD", "REFERRED_LEGAL"]) {
      expect(stepCompletionProblem({ status, currentStep: "INITIAL_CONTACT" }, steps, "s2", labels)).toBeNull();
    }
  });

  it("the legal referral is complete only when its step is", () => {
    expect(legalReferralComplete([])).toBe(false);
    expect(legalReferralComplete([{ stepType: "LEGAL_REFERRAL", status: "PENDING" }])).toBe(false);
    expect(legalReferralComplete([{ stepType: "PROCEEDINGS", status: "COMPLETED" }])).toBe(false);
    expect(legalReferralComplete([{ stepType: "LEGAL_REFERRAL", status: "COMPLETED" }])).toBe(true);
  });
});
