import { describe, expect, it } from "vitest";
import { costPerLotPerYear, feesByCodeAndMonth } from "./platform-report";

const ev = (code: string, occurredAt: string, cents: number, status = "INVOICED") => ({
  code,
  status,
  occurredAt,
  exGstCents: cents,
  gstCents: Math.round(cents / 10),
});

describe("feesByCodeAndMonth", () => {
  it("groups by code and Sydney month, nets reversals and drops waived charges", () => {
    const cells = feesByCodeAndMonth([
      ev("MEETING_EGM", "2026-10-05T01:00:00Z", 5500),
      ev("MEETING_EGM", "2026-10-06T01:00:00Z", -5500, "REVERSED"),
      ev("BALLOT", "2026-10-31T13:30:00Z", 2500), // 1 Nov in Sydney
      ev("BALLOT", "2026-10-20T01:00:00Z", 2500, "WAIVED"),
    ]);
    expect(cells).toEqual([
      { code: "MEETING_EGM", month: "2026-10", totalCents: 0, count: 1 },
      { code: "BALLOT", month: "2026-11", totalCents: 2750, count: 1 },
    ]);
  });
});

describe("costPerLotPerYear", () => {
  it("divides the last 12 months of charges by the lot count", () => {
    const asAt = new Date("2026-10-22T00:00:00Z");
    const events = [
      ev("SUBSCRIPTION_SMALL", "2026-09-01T00:00:00Z", 4900),
      ev("SUBSCRIPTION_SMALL", "2025-09-01T00:00:00Z", 4900), // over a year ago
    ];
    expect(costPerLotPerYear(events, 7, asAt)).toBe(Math.round(5390 / 7));
    expect(costPerLotPerYear(events, 0, asAt)).toBeNull();
  });
});
