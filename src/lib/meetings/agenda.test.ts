import { describe, it, expect } from "vitest";
import {
  allowedCategoriesForMeetingType,
  canAddCategoryToMeetingType,
  validateAgendaItem,
} from "./agenda";
import { MEETING_RULES as NSW_RULE_SET } from "@/config/statutory";

describe("resolution categories by meeting type", () => {
  it("restricts a committee meeting to ordinary resolutions", () => {
    expect(allowedCategoriesForMeetingType(NSW_RULE_SET, "COMMITTEE")).toEqual(["ORDINARY"]);
  });

  it("allows all categories at an AGM", () => {
    const cats = allowedCategoriesForMeetingType(NSW_RULE_SET, "AGM");
    expect(cats).toContain("SPECIAL");
    expect(cats).toContain("UNANIMOUS");
  });

  it("blocks a special resolution on a committee agenda", () => {
    expect(canAddCategoryToMeetingType(NSW_RULE_SET, "COMMITTEE", "SPECIAL")).toBe(false);
  });

  it("allows a special resolution at an AGM", () => {
    expect(canAddCategoryToMeetingType(NSW_RULE_SET, "AGM", "SPECIAL")).toBe(true);
  });

  it("treats a legacy SGM like an EGM", () => {
    expect(canAddCategoryToMeetingType(NSW_RULE_SET, "SGM", "SPECIAL")).toBe(true);
  });
});

describe("validateAgendaItem", () => {
  it("requires a title", () => {
    const errors = validateAgendaItem({ title: "" }, "AGM", NSW_RULE_SET);
    expect(errors.title).toBeDefined();
  });

  it("rejects a special resolution on a committee agenda", () => {
    const errors = validateAgendaItem(
      { title: "Approve special levy", resolutionCategory: "SPECIAL" },
      "COMMITTEE",
      NSW_RULE_SET,
    );
    expect(errors.resolutionCategory).toBeDefined();
  });

  it("accepts a special resolution at an AGM", () => {
    const errors = validateAgendaItem(
      { title: "Amend by-law 3", resolutionCategory: "SPECIAL" },
      "AGM",
      NSW_RULE_SET,
    );
    expect(errors).toEqual({});
  });
});
