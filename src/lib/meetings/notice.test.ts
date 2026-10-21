import { describe, it, expect } from "vitest";
import { assembleNoticeContent, type NoticeContentParams } from "./notice";

const params: NoticeContentParams = {
  scheme: {
    name: "Example",
    planNumber: "3782",
    address: "7 Bortfield Drive",
    suburb: "Chiswick",
    state: "NSW",
    postcode: "2046",
  },
  meeting: {
    title: "2026 AGM",
    meetingType: "AGM",
    startTime: "2026-03-01T09:00:00Z",
    format: "HYBRID",
    location: "Level 3",
    joinUrl: "https://zoom.us/j/1",
    joinDetails: null,
    timezone: "Australia/Sydney",
  },
  items: [
    {
      position: 1,
      title: "Confirmation of Minutes",
      resolutionText: "RESOLVES ...",
      explanatoryNote: "note",
      resolutionCategory: "ORDINARY",
    },
  ],
};

describe("assembleNoticeContent", () => {
  it("builds an AGM heading with the plan number", () => {
    const content = assembleNoticeContent(params);
    expect(content.heading).toContain("ANNUAL GENERAL MEETING");
    expect(content.heading).toContain("3782");
  });

  it("carries the agenda items and meeting details", () => {
    const content = assembleNoticeContent(params);
    expect(content.items).toHaveLength(1);
    expect(content.meeting.joinUrl).toBe("https://zoom.us/j/1");
  });

  it("uses a committee heading for a committee meeting", () => {
    const content = assembleNoticeContent({
      ...params,
      meeting: { ...params.meeting, meetingType: "COMMITTEE" },
    });
    expect(content.heading).toContain("STRATA COMMITTEE MEETING");
  });
});
