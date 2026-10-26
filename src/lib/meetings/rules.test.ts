import { describe, it, expect } from "vitest";
import { MEETING_RULES as NSW_RULE_SET } from "@/config/statutory";
import {
  earliestCompliantMeetingDate,
  validateNoticePeriod,
  minutesDeadline,
  evaluateResolution,
  wholeDaysBetween,
} from "./rules";

describe("NSW rule set notice periods", () => {
  it("uses the confirmed notice periods (AGM 14, EGM 7, committee 3)", () => {
    expect(NSW_RULE_SET.noticePeriods.AGM).toBe(14);
    expect(NSW_RULE_SET.noticePeriods.EGM).toBe(7);
    expect(NSW_RULE_SET.noticePeriods.COMMITTEE).toBe(3);
    expect(NSW_RULE_SET.noticePeriods.FIRST_AGM).toBe(14);
  });

  it("uses a 7-day minutes deadline for all types", () => {
    expect(NSW_RULE_SET.minutesDeadlines.AGM).toBe(7);
    expect(NSW_RULE_SET.minutesDeadlines.EGM).toBe(7);
    expect(NSW_RULE_SET.minutesDeadlines.COMMITTEE).toBe(7);
  });
});

describe("wholeDaysBetween", () => {
  it("counts whole days ignoring time of day", () => {
    const a = new Date("2026-01-01T23:00:00Z");
    const b = new Date("2026-01-15T01:00:00Z");
    expect(wholeDaysBetween(a, b)).toBe(14);
  });
});

describe("earliestCompliantMeetingDate", () => {
  it("adds the AGM notice period of 14 days", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const earliest = earliestCompliantMeetingDate(NSW_RULE_SET, "AGM", from);
    expect(earliest).not.toBeNull();
    expect(wholeDaysBetween(from, earliest!)).toBe(14);
  });
});

describe("validateNoticePeriod", () => {
  it("passes an AGM with 14 days notice", () => {
    const result = validateNoticePeriod(
      NSW_RULE_SET,
      "AGM",
      new Date("2026-01-01"),
      new Date("2026-01-15"),
      "UTC",
    );
    expect(result.requiredDays).toBe(14);
    expect(result.actualDays).toBe(14);
    expect(result.compliant).toBe(true);
  });

  it("fails an AGM with only 7 days notice", () => {
    const result = validateNoticePeriod(
      NSW_RULE_SET,
      "AGM",
      new Date("2026-01-01"),
      new Date("2026-01-08"),
      "UTC",
    );
    expect(result.compliant).toBe(false);
  });

  it("passes a committee meeting with 3 days notice", () => {
    const result = validateNoticePeriod(
      NSW_RULE_SET,
      "COMMITTEE",
      new Date("2026-01-01"),
      new Date("2026-01-04"),
      "UTC",
    );
    expect(result.compliant).toBe(true);
  });
});

describe("minutesDeadline", () => {
  it("is 7 days after the meeting", () => {
    const meeting = new Date("2026-01-15");
    const deadline = minutesDeadline(NSW_RULE_SET, "AGM", meeting);
    expect(deadline).not.toBeNull();
    expect(wholeDaysBetween(meeting, deadline!)).toBe(7);
  });
});

describe("evaluateResolution", () => {
  it("passes an ordinary resolution on a simple majority of votes cast", () => {
    const out = evaluateResolution(NSW_RULE_SET, "ORDINARY", {
      forCount: 6,
      againstCount: 4,
    });
    expect(out.passed).toBe(true);
  });

  it("fails an ordinary resolution without a majority", () => {
    const out = evaluateResolution(NSW_RULE_SET, "ORDINARY", {
      forCount: 4,
      againstCount: 6,
    });
    expect(out.passed).toBe(false);
  });

  it("fails a unanimous resolution on any against vote", () => {
    const out = evaluateResolution(NSW_RULE_SET, "UNANIMOUS", {
      forCount: 20,
      againstCount: 1,
    });
    expect(out.passed).toBe(false);
  });

  it("passes a special resolution when against is below 25% by unit entitlement", () => {
    const out = evaluateResolution(NSW_RULE_SET, "SPECIAL", {
      forCount: 0,
      againstCount: 0,
      forUE: 80,
      againstUE: 20, // 20% against
    });
    expect(out.passed).toBe(true);
  });

  it("fails a special resolution when against reaches 25% by unit entitlement", () => {
    const out = evaluateResolution(NSW_RULE_SET, "SPECIAL", {
      forCount: 0,
      againstCount: 0,
      forUE: 75,
      againstUE: 25, // 25% against
    });
    expect(out.passed).toBe(false);
  });

  it("passes a sustainability-infrastructure resolution unless 50% or more vote against", () => {
    const pass = evaluateResolution(NSW_RULE_SET, "SUSTAINABILITY_INFRASTRUCTURE", {
      forCount: 0,
      againstCount: 0,
      forUE: 51,
      againstUE: 49,
    });
    expect(pass.passed).toBe(true);

    const fail = evaluateResolution(NSW_RULE_SET, "SUSTAINABILITY_INFRASTRUCTURE", {
      forCount: 0,
      againstCount: 0,
      forUE: 50,
      againstUE: 50,
    });
    expect(fail.passed).toBe(false);
  });
});

describe("notice periods in the meeting's time zone (phase 1c)", () => {
  it("counts the days the notice and the meeting fall on locally, not in UTC", () => {
    // Notice at noon on 1 Jan in Sydney (01:00 UTC on 1 Jan); meeting at 9 am on 15 Jan in Sydney (22:00 UTC on 14 Jan).
    const notice = new Date("2026-01-01T01:00:00Z");
    const meeting = new Date("2026-01-14T22:00:00Z");
    expect(validateNoticePeriod(NSW_RULE_SET, "AGM", notice, meeting, "UTC").actualDays).toBe(13);
    const sydney = validateNoticePeriod(NSW_RULE_SET, "AGM", notice, meeting, "Australia/Sydney");
    expect(sydney).toEqual({ requiredDays: 14, actualDays: 14, compliant: true });
  });
});
