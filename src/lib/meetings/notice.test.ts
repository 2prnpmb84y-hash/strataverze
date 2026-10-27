import { describe, it, expect } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";
import { assembleNoticeContent, type NoticeContentParams } from "./notice";

const NSW = statutoryRulesFor("NSW").TERMINOLOGY;
const QLD = PENDING_RULE_PACKS.QLD.rules.TERMINOLOGY;

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
    const content = assembleNoticeContent(params, NSW);
    expect(content.heading).toContain("ANNUAL GENERAL MEETING");
    expect(content.heading).toContain("3782");
  });

  it("carries the agenda items and meeting details", () => {
    const content = assembleNoticeContent(params, NSW);
    expect(content.items).toHaveLength(1);
    expect(content.meeting.joinUrl).toBe("https://zoom.us/j/1");
  });

  it("uses a committee heading for a committee meeting", () => {
    const content = assembleNoticeContent({
      ...params,
      meeting: { ...params.meeting, meetingType: "COMMITTEE" },
    }, NSW);
    expect(content.heading).toContain("STRATA COMMITTEE MEETING");
  });
});

describe("assembleNoticeContent wording", () => {
  it("heads an NSW notice with the owners corporation as it always has", () => {
    expect(assembleNoticeContent(params, NSW).heading).toBe("NOTICE OF ANNUAL GENERAL MEETING — THE OWNERS - STRATA PLAN 3782");
    expect(assembleNoticeContent({ ...params, meeting: { ...params.meeting, meetingType: "COMMITTEE" } }, NSW).heading).toBe(
      "NOTICE OF STRATA COMMITTEE MEETING — THE OWNERS - STRATA PLAN 3782",
    );
  });

  it("heads a Queensland notice with the body corporate and its committee", () => {
    const qld = { ...params, scheme: { ...params.scheme, state: "QLD" } };
    expect(assembleNoticeContent(qld, QLD).heading).toBe("NOTICE OF ANNUAL GENERAL MEETING — BODY CORPORATE FOR EXAMPLE COMMUNITY TITLES SCHEME 3782");
    const committee = assembleNoticeContent({ ...qld, meeting: { ...qld.meeting, meetingType: "COMMITTEE" } }, QLD).heading;
    expect(committee).toBe("NOTICE OF COMMITTEE MEETING — BODY CORPORATE FOR EXAMPLE COMMUNITY TITLES SCHEME 3782");
    expect(committee).not.toMatch(/STRATA/);
  });
});
