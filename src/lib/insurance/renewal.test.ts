import { describe, it, expect } from "vitest";
import {
  wholeDaysBetween,
  reminderDate,
  isRenewalDue,
  detectContinuity,
} from "./renewal";

const d = (s: string) => new Date(s);

describe("wholeDaysBetween", () => {
  it("counts whole days regardless of time of day", () => {
    expect(wholeDaysBetween(d("2026-01-01T23:00:00Z"), d("2026-01-15T01:00:00Z"))).toBe(14);
  });
});

describe("reminderDate / isRenewalDue", () => {
  it("places the reminder leadDays before expiry", () => {
    const remind = reminderDate(d("2026-12-31T00:00:00Z"), 60);
    expect(remind.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("is not due before the window opens and is due after", () => {
    const end = d("2026-12-31T00:00:00Z");
    expect(isRenewalDue(end, 60, d("2026-10-01T00:00:00Z"))).toBe(false);
    expect(isRenewalDue(end, 60, d("2026-11-15T00:00:00Z"))).toBe(true);
  });
});

describe("detectContinuity", () => {
  it("is contiguous when the successor starts the day after expiry", () => {
    const res = detectContinuity(d("2026-12-31T00:00:00Z"), d("2027-01-01T00:00:00Z"));
    expect(res).toEqual({ type: "CONTIGUOUS", days: 0 });
  });

  it("flags a gap when the successor starts later", () => {
    const res = detectContinuity(d("2026-12-31T00:00:00Z"), d("2027-01-06T00:00:00Z"));
    expect(res).toEqual({ type: "GAP", days: 5 });
  });

  it("flags an overlap when the successor starts on or before expiry", () => {
    const res = detectContinuity(d("2026-12-31T00:00:00Z"), d("2026-12-25T00:00:00Z"));
    expect(res.type).toBe("OVERLAP");
    expect(res.days).toBe(7);
  });
});
