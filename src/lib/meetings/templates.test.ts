import { describe, it, expect } from "vitest";
import {
  getAgendaTemplate,
  getMotionLibrary,
  fillPlaceholders,
  resolveAgendaTemplate,
  NSW_AGM_TEMPLATE,
  QLD_AGM_TEMPLATE,
  QLD_MOTION_LIBRARY,
} from "./templates";
import { QLD_RULE_PACK, UnsupportedJurisdictionError } from "@/config/statutory";
import { bodyCorporateName } from "@/lib/jurisdiction/wording";

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

describe("Queensland AGM template (draft for StrataVerze review)", () => {
  const terms = QLD_RULE_PACK.rules.TERMINOLOGY;
  const bodyCorporate = bodyCorporateName(terms, { name: "Seaview", planNumber: "1234" });

  it("is given to a Queensland building now its pack is active, and never to a state without a pack", () => {
    expect(getAgendaTemplate("QLD", "AGM")).toBe(QLD_AGM_TEMPLATE);
    expect(getAgendaTemplate(" qld ", "FIRST_AGM")).toBe(QLD_AGM_TEMPLATE);
    expect(getMotionLibrary("QLD")).toEqual(QLD_MOTION_LIBRARY);
    expect(getMotionLibrary("QLD", "AGM").every((m) => QLD_MOTION_LIBRARY.includes(m))).toBe(true);
    expect(() => getAgendaTemplate("VIC", "AGM")).toThrow(UnsupportedJurisdictionError);
    expect(() => getMotionLibrary("VIC", "AGM")).toThrow(UnsupportedJurisdictionError);
  });

  it("holds the AGM business the pack records, with the committee election last", () => {
    expect(QLD_AGM_TEMPLATE.map((i) => i.title)).toEqual([
      "Statement of Accounts",
      "Auditor",
      "Administrative Fund Budget",
      "Sinking Fund Budget",
      "Contributions",
      "Insurance Review",
      "Election of Committee",
    ]);
    const last = QLD_AGM_TEMPLATE[QLD_AGM_TEMPLATE.length - 1];
    expect(last.resolutionCategory).toBeNull();
    expect(last.explanatoryNote).toContain("last business");
    expect(QLD_RULE_PACK.rules.COMMITTEE.electionIsLastBusiness).toBe(true);
  });

  it("has one item for each statutory motion qld.ts records, with the type it records", () => {
    const recorded = QLD_RULE_PACK.rules.MEETINGS.statutoryMotions;
    expect(recorded.status).toBe("CONFIRMED");
    const keys = recorded.motions.map((m) => m.key);
    expect([...new Set(QLD_AGM_TEMPLATE.flatMap((i) => (i.statutoryMotion ? [i.statutoryMotion] : [])))].sort()).toEqual([...keys].sort());
    for (const item of QLD_AGM_TEMPLATE.filter((i) => i.statutoryMotion)) {
      const m = recorded.motions.find((r) => r.key === item.statutoryMotion)!;
      // Where qld.ts records the type, the item uses it. Where it records none, the draft's ordinary resolution is for review.
      expect(item.resolutionCategory).toBe(m.resolution ?? "ORDINARY");
    }
    expect(QLD_RULE_PACK.rules.FOR_REVIEW.some((f) => f.where.includes("QLD_AGM_TEMPLATE"))).toBe(true);
  });

  it("words each motion as the body corporate resolving, filled with the pack's legal name", () => {
    for (const item of QLD_AGM_TEMPLATE.slice(0, -1)) {
      expect(item.resolutionText.startsWith("{{BODY_CORPORATE}} RESOLVES by ordinary resolution ")).toBe(true);
      expect(item.resolutionCategory).toBe("ORDINARY");
      const filled = fillPlaceholders(item.resolutionText, { bodyCorporate });
      expect(filled.startsWith("Body corporate for Seaview community titles scheme 1234 RESOLVES")).toBe(true);
    }
  });

  it("has the special resolution not to audit in the motion library, for a basic scheme", () => {
    const noAudit = QLD_MOTION_LIBRARY.find((m) => m.key === "no-audit");
    expect(noAudit?.defaultResolutionCategory).toBe("SPECIAL");
    expect(noAudit?.resolutionText).toContain("RESOLVES by special resolution not to audit");
    expect(noAudit?.explanatoryNote).toContain("basic scheme");
  });

  it("uses only Queensland categories and plain wording", () => {
    const qld = QLD_RULE_PACK.rules.MEETING_RULES;
    for (const m of QLD_MOTION_LIBRARY) expect(qld.generalMeetingCategories).toContain(m.defaultResolutionCategory);
    const text = [...QLD_AGM_TEMPLATE, ...QLD_MOTION_LIBRARY].flatMap((i) => [i.title, i.resolutionText, i.explanatoryNote ?? ""]).join(" ");
    expect(text).not.toMatch(/[;\u2013\u2014]| - /);
    expect(text).not.toMatch(/owners corporation|Strata Plan|levy/i);
  });

  it("leaves the NSW wording without the body corporate token", () => {
    expect(NSW_AGM_TEMPLATE.some((i) => i.resolutionText.includes("{{BODY_CORPORATE}}"))).toBe(false);
  });
});
