import { describe, it, expect } from "vitest";
import {
  derivePolicyStatus,
  daysUntilExpiry,
  canTransitionClaim,
  allowedClaimTransitions,
  isTerminalClaim,
  isClaimDecided,
  canAdvanceRenewal,
  isTerminalRenewal,
  renewalProgress,
} from "./status";

const d = (s: string) => new Date(s);

describe("derivePolicyStatus", () => {
  const start = d("2026-01-01T00:00:00Z");
  const end = d("2026-12-31T23:59:59Z");

  it("is UPCOMING before the start date", () => {
    expect(
      derivePolicyStatus({ startDate: start, endDate: end }, d("2025-12-01T00:00:00Z")),
    ).toBe("UPCOMING");
  });

  it("is ACTIVE within the period", () => {
    expect(
      derivePolicyStatus({ startDate: start, endDate: end }, d("2026-06-01T00:00:00Z")),
    ).toBe("ACTIVE");
  });

  it("is EXPIRED after the end date", () => {
    expect(
      derivePolicyStatus({ startDate: start, endDate: end }, d("2027-01-02T00:00:00Z")),
    ).toBe("EXPIRED");
  });

  it("honours an explicit DRAFT or CANCELLED over the dates", () => {
    expect(
      derivePolicyStatus({ startDate: start, endDate: end, status: "DRAFT" }, d("2026-06-01T00:00:00Z")),
    ).toBe("DRAFT");
    expect(
      derivePolicyStatus({ startDate: start, endDate: end, status: "CANCELLED" }, d("2026-06-01T00:00:00Z")),
    ).toBe("CANCELLED");
  });
});

describe("daysUntilExpiry", () => {
  it("counts whole days and goes negative once expired", () => {
    expect(daysUntilExpiry(d("2026-01-15T00:00:00Z"), d("2026-01-01T00:00:00Z"))).toBe(14);
    expect(daysUntilExpiry(d("2026-01-01T00:00:00Z"), d("2026-01-11T00:00:00Z"))).toBe(-10);
  });
});

describe("claim status machine", () => {
  it("allows the normal lodgement path", () => {
    expect(canTransitionClaim("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionClaim("SUBMITTED", "UNDER_ASSESSMENT")).toBe(true);
    expect(canTransitionClaim("UNDER_ASSESSMENT", "APPROVED")).toBe(true);
    expect(canTransitionClaim("APPROVED", "CLOSED")).toBe(true);
  });

  it("does not allow skipping from DRAFT straight to APPROVED", () => {
    expect(canTransitionClaim("DRAFT", "APPROVED")).toBe(false);
  });

  it("treats WITHDRAWN and CLOSED as terminal", () => {
    expect(isTerminalClaim("WITHDRAWN")).toBe(true);
    expect(isTerminalClaim("CLOSED")).toBe(true);
    expect(allowedClaimTransitions("CLOSED")).toEqual([]);
  });

  it("flags insurer decisions separately from administrative state", () => {
    expect(isClaimDecided("APPROVED")).toBe(true);
    expect(isClaimDecided("PARTIALLY_APPROVED")).toBe(true);
    expect(isClaimDecided("DECLINED")).toBe(true);
    expect(isClaimDecided("UNDER_ASSESSMENT")).toBe(false);
  });

  it("rejects unknown statuses", () => {
    expect(canTransitionClaim("NONSENSE", "CLOSED")).toBe(false);
  });
});

describe("renewal stage machine", () => {
  it("advances forward along the ordered stages", () => {
    expect(canAdvanceRenewal("NOT_STARTED", "INFORMATION_REQUIRED")).toBe(true);
    expect(canAdvanceRenewal("QUOTES_RECEIVED", "UNDER_REVIEW")).toBe(true);
  });

  it("allows stepping back to correct a mistake", () => {
    expect(canAdvanceRenewal("UNDER_REVIEW", "QUOTES_RECEIVED")).toBe(true);
  });

  it("only allows COMPLETED after COVER_CONFIRMED", () => {
    expect(canAdvanceRenewal("COVER_CONFIRMED", "COMPLETED")).toBe(true);
    expect(canAdvanceRenewal("AWAITING_APPROVAL", "COMPLETED")).toBe(false);
  });

  it("can branch to NOT_PROCEEDING from any active stage", () => {
    expect(canAdvanceRenewal("QUOTES_REQUESTED", "NOT_PROCEEDING")).toBe(true);
  });

  it("treats COMPLETED and NOT_PROCEEDING as terminal", () => {
    expect(isTerminalRenewal("COMPLETED")).toBe(true);
    expect(isTerminalRenewal("NOT_PROCEEDING")).toBe(true);
    expect(canAdvanceRenewal("COMPLETED", "UNDER_REVIEW")).toBe(false);
  });

  it("reports progress along the happy path", () => {
    expect(renewalProgress("NOT_STARTED")).toBe(0);
    expect(renewalProgress("COMPLETED")).toBe(1);
    expect(renewalProgress("NOT_PROCEEDING")).toBe(0);
  });
});
