import { describe, expect, it, vi } from "vitest";

vi.mock("@/prisma/db", () => ({ db: {} }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn() }));

const { quotationProblem } = await import("./require-contractor");

const NOW = new Date("2026-10-23T00:00:00Z");
const open = { status: "ISSUED", closingDate: "2026-11-01T00:00:00Z" };

describe("quotationProblem", () => {
  it("allows an invited contractor on an open RFQ", () => {
    expect(quotationProblem(open, { status: "PENDING" }, NOW)).toBeNull();
    expect(quotationProblem({ ...open, status: "CLARIFICATIONS" }, { status: "ACCEPTED" }, NOW)).toBeNull();
  });

  it("rejects draft, closed and awarded RFQs", () => {
    for (const status of ["DRAFT", "CLOSED", "EVALUATED", "AWARDED", "CANCELLED"]) {
      expect(quotationProblem({ ...open, status }, { status: "PENDING" }, NOW)).toMatch(/not open/);
    }
  });

  it("rejects after the closing date", () => {
    expect(quotationProblem({ ...open, closingDate: "2026-10-22T00:00:00Z" }, { status: "PENDING" }, NOW)).toMatch(
      /closed/,
    );
  });

  it("rejects contractors who were not invited, declined or were withdrawn", () => {
    expect(quotationProblem(open, null, NOW)).toMatch(/not invited/);
    expect(quotationProblem(open, { status: "DECLINED" }, NOW)).toMatch(/not invited/);
    expect(quotationProblem(open, { status: "WITHDRAWN" }, NOW)).toMatch(/not invited/);
  });

  it("rejects a missing RFQ", () => {
    expect(quotationProblem(null, { status: "PENDING" }, NOW)).toBe("RFQ not found.");
  });
});
