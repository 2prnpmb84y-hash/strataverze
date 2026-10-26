import { describe, it, expect } from "vitest";
import { wholeDaysBetween } from "./rules";
import { MEETING_RULES as NSW_RULE_SET } from "@/config/statutory";
import {
  assembleMinutesContent,
  minutesDistributionDeadline,
  retentionUntil,
  type MinutesContentParams,
} from "./minutes";

const params: MinutesContentParams = {
  scheme: { name: "Example", planNumber: "3782" },
  meeting: {
    title: "2026 AGM",
    meetingType: "AGM",
    startTime: "2026-03-01T09:00:00Z",
    openedAt: "2026-03-01T09:05:00Z",
    closedAt: "2026-03-01T10:00:00Z",
  },
  items: [
    {
      position: 1,
      title: "Confirmation of Minutes",
      resolutionText: "RESOLVES ...",
      explanatoryNote: null,
      outcome: "RESOLVED",
    },
  ],
};

describe("assembleMinutesContent", () => {
  it("builds an AGM minutes heading with the plan number", () => {
    const content = assembleMinutesContent(params);
    expect(content.heading).toContain("MINUTES OF ANNUAL GENERAL MEETING");
    expect(content.heading).toContain("3782");
  });

  it("carries the agenda items with outcomes and the open/close times", () => {
    const content = assembleMinutesContent(params);
    expect(content.items[0].outcome).toBe("RESOLVED");
    expect(content.meeting.closedAt).toBe("2026-03-01T10:00:00Z");
  });

  it("uses a committee heading for a committee meeting", () => {
    const content = assembleMinutesContent({
      ...params,
      meeting: { ...params.meeting, meetingType: "COMMITTEE" },
    });
    expect(content.heading).toContain("STRATA COMMITTEE MEETING");
  });
});

describe("minutesDistributionDeadline", () => {
  it("is 7 days after the meeting under the NSW rule set", () => {
    const meeting = new Date("2026-03-01T10:00:00Z");
    const due = minutesDistributionDeadline(NSW_RULE_SET, "AGM", meeting);
    expect(due).not.toBeNull();
    expect(wholeDaysBetween(meeting, due!)).toBe(7);
  });
});

describe("retentionUntil", () => {
  it("is the general retention period (7 years) after the meeting", () => {
    const from = new Date("2026-03-01T00:00:00Z");
    const until = retentionUntil(NSW_RULE_SET, from);
    expect(until.getUTCFullYear()).toBe(2033);
  });
});
