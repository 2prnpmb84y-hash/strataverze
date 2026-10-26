import { describe, expect, it } from "vitest";
import { committeeMayTransition } from "./status-transitions";

describe("committeeMayTransition", () => {
  it("allows the owner-portal buttons", () => {
    expect(committeeMayTransition("OPEN", "IN_PROGRESS")).toBe(true);
    expect(committeeMayTransition("OPEN", "COMPLETED")).toBe(true);
    expect(committeeMayTransition("OPEN", "CANCELLED")).toBe(true);
    expect(committeeMayTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(committeeMayTransition("IN_PROGRESS", "CANCELLED")).toBe(true);
  });

  it("rejects re-opening finished work and unknown statuses", () => {
    expect(committeeMayTransition("COMPLETED", "OPEN")).toBe(false);
    expect(committeeMayTransition("CANCELLED", "IN_PROGRESS")).toBe(false);
    expect(committeeMayTransition("IN_PROGRESS", "OPEN")).toBe(false);
    expect(committeeMayTransition("OPEN", "AWARDED")).toBe(false);
  });
});
