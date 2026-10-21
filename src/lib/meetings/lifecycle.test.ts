import { describe, it, expect } from "vitest";
import {
  canTransition,
  allowedTransitions,
  assertTransition,
  isTerminal,
  MeetingTransitionError,
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
});
