import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/prisma/db", () => ({ db: {} }));

const { complianceFeeVersion, parseComplianceFeeVersion } = await import("./contractor-fees");

describe("compliance verification confirmation", () => {
  it("records and reads back the amount the contractor confirmed", () => {
    expect(complianceFeeVersion(5390)).toBe("fee:5390");
    expect(parseComplianceFeeVersion("fee:5390")).toBe(5390);
  });

  it("ignores anything that is not a fee confirmation", () => {
    expect(parseComplianceFeeVersion("1.0")).toBeNull();
    expect(parseComplianceFeeVersion(null)).toBeNull();
    expect(parseComplianceFeeVersion("fee:abc")).toBeNull();
  });
});
