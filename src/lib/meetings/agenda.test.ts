import { describe, it, expect } from "vitest";
import {
  allowedCategoriesForMeetingType,
  canAddCategoryToMeetingType,
  validateAgendaItem,
} from "./agenda";

describe("resolution categories by meeting type", () => {
  it("restricts a committee meeting to ordinary resolutions", () => {
    expect(allowedCategoriesForMeetingType("COMMITTEE")).toEqual(["ORDINARY"]);
  });

  it("allows all categories at an AGM", () => {
    const cats = allowedCategoriesForMeetingType("AGM");
    expect(cats).toContain("SPECIAL");
    expect(cats).toContain("UNANIMOUS");
  });

  it("blocks a special resolution on a committee agenda", () => {
    expect(canAddCategoryToMeetingType("COMMITTEE", "SPECIAL")).toBe(false);
  });

  it("allows a special resolution at an AGM", () => {
    expect(canAddCategoryToMeetingType("AGM", "SPECIAL")).toBe(true);
  });

  it("treats a legacy SGM like an EGM", () => {
    expect(canAddCategoryToMeetingType("SGM", "SPECIAL")).toBe(true);
  });
});

describe("validateAgendaItem", () => {
  it("requires a title", () => {
    const errors = validateAgendaItem({ title: "" }, "AGM");
    expect(errors.title).toBeDefined();
  });

  it("rejects a special resolution on a committee agenda", () => {
    const errors = validateAgendaItem(
      { title: "Approve special levy", resolutionCategory: "SPECIAL" },
      "COMMITTEE",
    );
    expect(errors.resolutionCategory).toBeDefined();
  });

  it("accepts a special resolution at an AGM", () => {
    const errors = validateAgendaItem(
      { title: "Amend by-law 3", resolutionCategory: "SPECIAL" },
      "AGM",
    );
    expect(errors).toEqual({});
  });
});
