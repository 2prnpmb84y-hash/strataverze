import { describe, it, expect } from "vitest";
import { formatActionLabel, formatEntityTypeLabel } from "./activity-log-utils";

describe("formatActionLabel", () => {
  it("converts SCREAMING_SNAKE_CASE to Title Case", () => {
    expect(formatActionLabel("INTEREST_CHARGED")).toBe("Interest Charged");
  });

  it("handles single word", () => {
    expect(formatActionLabel("CREATED")).toBe("Created");
  });

  it("handles multiple underscores", () => {
    expect(formatActionLabel("LEVY_NOTICE_ISSUED")).toBe(
      "Levy Notice Issued",
    );
  });

  it("handles already lowercase input", () => {
    expect(formatActionLabel("updated")).toBe("Updated");
  });

  it("handles mixed case input", () => {
    expect(formatActionLabel("Work_Order_Created")).toBe(
      "Work Order Created",
    );
  });

  it("handles empty string", () => {
    expect(formatActionLabel("")).toBe("");
  });
});

describe("formatEntityTypeLabel", () => {
  it("converts CamelCase to spaced words", () => {
    expect(formatEntityTypeLabel("LevyNotice")).toBe("Levy Notice");
  });

  it("handles single word", () => {
    expect(formatEntityTypeLabel("Scheme")).toBe("Scheme");
  });

  it("handles multiple transitions", () => {
    expect(formatEntityTypeLabel("WorkOrderComment")).toBe(
      "Work Order Comment",
    );
  });

  it("handles all uppercase (no transitions)", () => {
    expect(formatEntityTypeLabel("ABC")).toBe("ABC");
  });

  it("handles empty string", () => {
    expect(formatEntityTypeLabel("")).toBe("");
  });

  it("handles already spaced input", () => {
    expect(formatEntityTypeLabel("Levy Notice")).toBe("Levy Notice");
  });
});
