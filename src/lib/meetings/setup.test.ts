import { describe, it, expect } from "vitest";
import { NSW_RULE_SET } from "./rules";
import {
  normaliseMeetingType,
  validateMeetingSetup,
  buildSetupPreview,
  type MeetingSetupInput,
} from "./setup";

const base: MeetingSetupInput = {
  schemeId: "s1",
  title: "2026 Annual General Meeting",
  meetingType: "AGM",
  startTime: "2026-03-01T09:00:00Z",
  format: "IN_PERSON",
  location: "Level 3, 123 Example St",
};

const now = new Date("2026-01-01T00:00:00Z");

describe("normaliseMeetingType", () => {
  it("maps legacy SGM to EGM", () => {
    expect(normaliseMeetingType("SGM")).toBe("EGM");
  });
  it("accepts canonical types", () => {
    expect(normaliseMeetingType("AGM")).toBe("AGM");
    expect(normaliseMeetingType("committee")).toBe("COMMITTEE");
  });
  it("rejects unknown types", () => {
    expect(normaliseMeetingType("PARTY")).toBeNull();
  });
});

describe("validateMeetingSetup", () => {
  it("accepts a complete in-person AGM with ample notice", () => {
    const { errors, warnings } = validateMeetingSetup(base, NSW_RULE_SET, now);
    expect(errors).toEqual({});
    expect(warnings).toEqual({});
  });

  it("requires a title", () => {
    const { errors } = validateMeetingSetup(
      { ...base, title: "  " },
      NSW_RULE_SET,
      now,
    );
    expect(errors.title).toBeDefined();
  });

  it("requires a join link for a virtual meeting", () => {
    const { errors } = validateMeetingSetup(
      { ...base, format: "VIRTUAL", location: null, joinUrl: "" },
      NSW_RULE_SET,
      now,
    );
    expect(errors.joinUrl).toBeDefined();
  });

  it("requires a location for an in-person meeting", () => {
    const { errors } = validateMeetingSetup(
      { ...base, location: "" },
      NSW_RULE_SET,
      now,
    );
    expect(errors.location).toBeDefined();
  });

  it("rejects an end time before the start", () => {
    const { errors } = validateMeetingSetup(
      { ...base, endTime: "2026-03-01T08:00:00Z" },
      NSW_RULE_SET,
      now,
    );
    expect(errors.endTime).toBeDefined();
  });

  it("warns on short notice for an AGM", () => {
    const { warnings } = validateMeetingSetup(
      { ...base, startTime: "2026-01-05T09:00:00Z" }, // 4 days away vs 14 required
      NSW_RULE_SET,
      now,
    );
    expect(warnings.startTime).toBeDefined();
  });
});

describe("buildSetupPreview", () => {
  it("returns the notice period and earliest date for each meeting type", () => {
    const rows = buildSetupPreview(NSW_RULE_SET, now);
    const agm = rows.find((r) => r.meetingType === "AGM");
    expect(agm?.noticeDays).toBe(14);
    expect(agm?.earliestDate).toBe(new Date("2026-01-15T00:00:00Z").toISOString());
    const committee = rows.find((r) => r.meetingType === "COMMITTEE");
    expect(committee?.noticeDays).toBe(3);
  });
});
