import { describe, it, expect } from "vitest";
import {
  getAgendaTemplate,
  getMotionLibrary,
  fillPlaceholders,
  resolveAgendaTemplate,
  NSW_AGM_TEMPLATE,
} from "./templates";

describe("agenda templates", () => {
  it("returns the NSW AGM mandatory items for an AGM and first AGM", () => {
    const agm = getAgendaTemplate("NSW", "AGM");
    expect(agm.length).toBeGreaterThanOrEqual(4);
    expect(agm[0].title).toBe("Confirmation of Minutes");
    expect(getAgendaTemplate("NSW", "FIRST_AGM")).toEqual(NSW_AGM_TEMPLATE);
  });

  it("returns no template items for a committee meeting", () => {
    expect(getAgendaTemplate("NSW", "COMMITTEE")).toEqual([]);
  });

  it("includes the capital works and environmental sustainability items", () => {
    const titles = getAgendaTemplate("NSW", "AGM").map((i) => i.title);
    expect(titles).toContain("Ten-Year Capital Works Fund Plan");
    expect(titles).toContain("Environmental Sustainability");
  });
});

describe("motion library", () => {
  it("excludes the special by-law motion from committee meetings", () => {
    const committee = getMotionLibrary("NSW", "COMMITTEE");
    expect(committee.some((m) => m.key === "by-law-amendment")).toBe(false);
  });

  it("includes the by-law motion for an AGM", () => {
    const agm = getMotionLibrary("NSW", "AGM");
    expect(agm.some((m) => m.key === "by-law-amendment")).toBe(true);
  });
});

describe("fillPlaceholders", () => {
  it("fills the plan number token", () => {
    const filled = fillPlaceholders(
      "Strata Plan No. {{PLAN_NUMBER}} RESOLVES",
      { planNumber: "3782" },
    );
    expect(filled).toContain("3782");
    expect(filled).not.toContain("{{PLAN_NUMBER}}");
  });

  it("uses a blank placeholder when no value is supplied", () => {
    const filled = fillPlaceholders("No. {{PLAN_NUMBER}}", {});
    expect(filled).not.toContain("{{PLAN_NUMBER}}");
  });
});

describe("resolveAgendaTemplate", () => {
  it("positions items from 1 and fills the plan number", () => {
    const items = resolveAgendaTemplate("NSW", "AGM", { planNumber: "3782" });
    expect(items[0].position).toBe(1);
    expect(items[items.length - 1].position).toBe(items.length);
    expect(items[0].resolutionText).toContain("3782");
    expect(items[0].resolutionText).not.toContain("{{PLAN_NUMBER}}");
  });

  it("returns an empty list for a committee meeting", () => {
    expect(resolveAgendaTemplate("NSW", "COMMITTEE", {})).toEqual([]);
  });
});
