import { describe, it, expect } from "vitest";
import {
  adviserSchemeNav,
  isNavItemActive,
  formatBuildingClass,
  formatEnumLabel,
  formatSchemeAddress,
} from "./scheme-nav";

const ID = "abc";
const nav = adviserSchemeNav(ID);
const item = (label: string) => nav.find((n) => n.label === label)!;
const activeFor = (path: string) =>
  nav.filter((n) => isNavItemActive(n, path)).map((n) => n.label);

describe("adviserSchemeNav", () => {
  it("lists the 9 approved pills in the approved order", () => {
    expect(nav.map((n) => n.label)).toEqual([
      "Lots / Owners",
      "Financials",
      "Compliance",
      "Insurance",
      "Conversations",
      "Document",
      "Work Order",
      "Meetings",
      "Governance",
    ]);
  });

  it("puts the first six in the peach row and the last three in the mint row", () => {
    expect(nav.map((n) => n.tone ?? "section")).toEqual([
      "section", "section", "section", "section", "section", "section",
      "action", "action", "action",
    ]);
  });

  it("scopes every link to the given scheme", () => {
    expect(nav.every((n) => n.href.startsWith(`/adviser/schemes/${ID}/`))).toBe(true);
  });
});

describe("isNavItemActive", () => {
  it("marks nothing active on the scheme's main page", () => {
    expect(activeFor(`/adviser/schemes/${ID}`)).toEqual([]);
  });

  it("marks the section active on its index and on nested pages", () => {
    expect(activeFor(`/adviser/schemes/${ID}/insurance`)).toEqual(["Insurance"]);
    expect(activeFor(`/adviser/schemes/${ID}/insurance/claims/x`)).toEqual(["Insurance"]);
    expect(activeFor(`/adviser/schemes/${ID}/lots/123`)).toEqual(["Lots / Owners"]);
  });

  it("marks exactly one pill active for nested sections", () => {
    const cases: [string, string][] = [
      ["works/rfqs", "Work Order"],
      ["funds/f1", "Financials"],
      ["levies", "Financials"],
      ["levies/l1", "Financials"],
      ["finance/levies", "Financials"],
      ["contacts", "Lots / Owners"],
      ["contacts/new", "Lots / Owners"],
      ["announcements/a1", "Conversations"],
      ["notifications", "Conversations"],
      ["bylaws", "Governance"],
      ["bylaws/b1", "Governance"],
      ["members", "Governance"],
      ["documents/d1", "Document"],
    ];
    for (const [path, label] of cases) {
      expect(activeFor(`/adviser/schemes/${ID}/${path}`)).toEqual([label]);
    }
  });

  it("does not confuse sections that share a prefix", () => {
    // /works must not activate a hypothetical /work-orders match by prefix alone
    expect(isNavItemActive(item("Work Order"), `/adviser/schemes/${ID}/work-orders-x`)).toBe(false);
  });
});

describe("formatters", () => {
  it("formats building class as the design shows", () => {
    expect(formatBuildingClass("2")).toBe("Class 2");
    expect(formatBuildingClass("Class 2")).toBe("Class 2");
    expect(formatBuildingClass(null)).toBeNull();
  });

  it("title-cases enum values", () => {
    expect(formatEnumLabel("STRATA")).toBe("Strata");
    expect(formatEnumLabel("COMPANY_TITLE")).toBe("Company Title");
    expect(formatEnumLabel("")).toBeNull();
  });

  it("formats the address heading", () => {
    expect(
      formatSchemeAddress({ address: "42 Harbour Street", suburb: "Sydney", state: "NSW", postcode: "2000" }),
    ).toBe("42 Harbour Street, Sydney NSW 2000");
  });
});
