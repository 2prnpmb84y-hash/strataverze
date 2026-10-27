import { describe, it, expect } from "vitest";
import { wholeDaysBetween } from "./rules";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";
import {
  assembleMinutesContent,
  minutesDistributionDeadline,
  retentionUntil,
  type MinutesContentParams,
} from "./minutes";

const NSW = statutoryRulesFor("NSW").TERMINOLOGY;
const QLD = PENDING_RULE_PACKS.QLD.rules.TERMINOLOGY;

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
    const content = assembleMinutesContent(params, NSW);
    expect(content.heading).toContain("MINUTES OF ANNUAL GENERAL MEETING");
    expect(content.heading).toContain("3782");
  });

  it("carries the agenda items with outcomes and the open/close times", () => {
    const content = assembleMinutesContent(params, NSW);
    expect(content.items[0].outcome).toBe("RESOLVED");
    expect(content.meeting.closedAt).toBe("2026-03-01T10:00:00Z");
  });

  it("uses a committee heading for a committee meeting", () => {
    const content = assembleMinutesContent({
      ...params,
      meeting: { ...params.meeting, meetingType: "COMMITTEE" },
    }, NSW);
    expect(content.heading).toContain("STRATA COMMITTEE MEETING");
  });
});

describe("assembleMinutesContent wording", () => {
  it("heads NSW minutes as they always have", () => {
    expect(assembleMinutesContent(params, NSW).heading).toBe("MINUTES OF ANNUAL GENERAL MEETING — THE OWNERS - STRATA PLAN 3782");
    expect(assembleMinutesContent({ ...params, meeting: { ...params.meeting, meetingType: "COMMITTEE" } }, NSW).heading).toBe(
      "MINUTES OF STRATA COMMITTEE MEETING — THE OWNERS - STRATA PLAN 3782",
    );
  });

  it("heads Queensland minutes with the body corporate and its committee", () => {
    expect(assembleMinutesContent({ ...params, meeting: { ...params.meeting, meetingType: "COMMITTEE" } }, QLD).heading).toBe(
      "MINUTES OF COMMITTEE MEETING — BODY CORPORATE FOR EXAMPLE COMMUNITY TITLES SCHEME 3782",
    );
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
    expect(until?.getUTCFullYear()).toBe(2033);
  });
});

describe("retentionUntil without a limit (Queensland)", () => {
  it("gives no retention date where the rule set keeps the record without a limit", () => {
    const qld = PENDING_RULE_PACKS.QLD.rules.MEETING_RULES;
    expect(qld.retention.generalYears).toBeNull();
    expect(retentionUntil(qld, new Date("2026-03-01T00:00:00Z"))).toBeNull();
  });
});
