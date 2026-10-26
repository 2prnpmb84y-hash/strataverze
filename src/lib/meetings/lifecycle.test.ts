import { describe, it, expect } from "vitest";
import {
  canTransition,
  allowedTransitions,
  assertTransition,
  isTerminal,
  MeetingTransitionError,
  isBeforeNotice,
  isFinishedMeeting,
  meetingStatusLabel,
  MEETING_STATUS_FILTER_OPTIONS,
  isUpcomingMeeting,
  canEditDetails,
  isOpenForVoting,
} from "./lifecycle";

describe("meeting lifecycle", () => {
  it("allows DRAFT to NOTICE_ISSUED", () => {
    expect(canTransition("DRAFT", "NOTICE_ISSUED")).toBe(true);
  });

  it("allows a legacy SCHEDULED meeting to move into the flow", () => {
    expect(canTransition("SCHEDULED", "NOTICE_ISSUED")).toBe(true);
  });

  it("blocks skipping conduct (DRAFT to PUBLISHED)", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
  });

  it("allows re-issuing a notice", () => {
    expect(canTransition("NOTICE_ISSUED", "NOTICE_ISSUED")).toBe(true);
  });

  it("allows adjourn and resume", () => {
    expect(canTransition("NOTICE_ISSUED", "ADJOURNED")).toBe(true);
    expect(canTransition("ADJOURNED", "NOTICE_ISSUED")).toBe(true);
  });

  it("treats PUBLISHED and CANCELLED as terminal", () => {
    expect(isTerminal("PUBLISHED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(allowedTransitions("PUBLISHED")).toHaveLength(0);
  });

  it("rejects unknown statuses", () => {
    expect(canTransition("FOO", "DRAFT")).toBe(false);
  });

  it("throws on an invalid transition", () => {
    expect(() => assertTransition("DRAFT", "PUBLISHED")).toThrow(
      MeetingTransitionError,
    );
  });

  it("lets details change only before notice", () => {
    expect(isBeforeNotice("DRAFT")).toBe(true);
    expect(isBeforeNotice("SCHEDULED")).toBe(true);
    expect(isBeforeNotice("NOTICE_ISSUED")).toBe(false);
    expect(isBeforeNotice("CANCELLED")).toBe(false);
  });

  it("treats only published, cancelled and completed meetings as finished", () => {
    for (const s of ["PUBLISHED", "CANCELLED", "COMPLETED"]) expect(isFinishedMeeting(s)).toBe(true);
    for (const s of ["DRAFT", "SCHEDULED", "NOTICE_ISSUED", "IN_PROGRESS", "ADJOURNED", "MINUTES_DRAFT"]) expect(isFinishedMeeting(s)).toBe(false);
  });

  it("labels every status in plain words", () => {
    expect(meetingStatusLabel("DRAFT")).toBe("Notice not yet issued");
    expect(meetingStatusLabel("MINUTES_DRAFT")).toBe("Minutes being prepared");
    expect(meetingStatusLabel("SOMETHING_NEW")).toBe("Something new");
    expect(MEETING_STATUS_FILTER_OPTIONS.every((o) => o.label && !/_/.test(o.label))).toBe(true);
  });

  it("counts a draft or noticed meeting not yet started as upcoming", () => {
    const now = new Date("2026-10-26T00:00:00Z");
    const later = new Date("2026-11-02T08:00:00Z");
    expect(isUpcomingMeeting("DRAFT", later, now)).toBe(true);
    expect(isUpcomingMeeting("NOTICE_ISSUED", later, now)).toBe(true);
    expect(isUpcomingMeeting("CANCELLED", later, now)).toBe(false);
    expect(isUpcomingMeeting("DRAFT", new Date("2026-10-25T08:00:00Z"), now)).toBe(false);
    // A meeting under way stays current after its start time.
    expect(isUpcomingMeeting("IN_PROGRESS", new Date("2026-10-25T23:00:00Z"), now)).toBe(true);
  });

  it("lets an adjourned meeting be given a new time, but not a noticed one", () => {
    expect(canEditDetails("ADJOURNED")).toBe(true);
    expect(canEditDetails("DRAFT")).toBe(true);
    expect(canEditDetails("NOTICE_ISSUED")).toBe(false);
    expect(canEditDetails("IN_PROGRESS")).toBe(false);
  });

  it("opens voting only once the notice is out, until the meeting closes", () => {
    for (const s of ["SCHEDULED", "NOTICE_ISSUED", "IN_PROGRESS"]) expect(isOpenForVoting(s)).toBe(true);
    for (const s of ["DRAFT", "ADJOURNED", "MINUTES_DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]) expect(isOpenForVoting(s)).toBe(false);
  });
});
