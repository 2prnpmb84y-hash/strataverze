import { describe, expect, it } from "vitest";
import { hrefFor, searchPlan, searchScopes } from "./scope";

/** Finding F11: search scope comes from server-side roles per scheme. */

const A = "scheme-a";
const B = "scheme-b";
const C = "scheme-c";

describe("searchScopes", () => {
  it("takes the strongest active role on each scheme", () => {
    const scopes = searchScopes([
      { schemeId: A, role: "OWNER", isActive: true },
      { schemeId: A, role: "COMMITTEE", isActive: true },
      { schemeId: B, role: "SUPPLIER", isActive: true },
      { schemeId: C, role: "ADVISER", isActive: false },
    ]);
    expect(scopes).toEqual([
      { schemeId: A, level: "committee" },
      { schemeId: B, level: "supplier" },
    ]);
  });

  it("lets the portal narrow but never widen", () => {
    const memberships = [
      { schemeId: A, role: "SUPPLIER", isActive: true },
      { schemeId: B, role: "OWNER", isActive: true },
    ];
    // A supplier claiming the adviser portal gets nothing.
    expect(searchScopes([memberships[0]], "adviser")).toEqual([]);
    // A supplier claiming the owner portal gets nothing on their supplier scheme.
    expect(searchScopes(memberships, "owner")).toEqual([{ schemeId: B, level: "owner" }]);
    expect(searchScopes(memberships, "supplier")).toEqual([{ schemeId: A, level: "supplier" }]);
    expect(searchScopes(memberships, "made-up")).toEqual([]);
    expect(searchScopes(memberships, "")).toEqual([]);
  });

  it("an adviser who also owns a lot gets owner scope in the owner portal", () => {
    const memberships = [
      { schemeId: A, role: "ADVISER", isActive: true },
      { schemeId: A, role: "OWNER", isActive: true },
    ];
    expect(searchScopes(memberships, "owner")).toEqual([{ schemeId: A, level: "owner" }]);
    expect(searchScopes(memberships, "adviser")).toEqual([{ schemeId: A, level: "adviser" }]);
  });
});

describe("searchPlan", () => {
  it("gives a supplier only work orders awarded to them", () => {
    expect(searchPlan([{ schemeId: A, level: "supplier" }])).toEqual({
      schemes: [],
      lots: [],
      documents: [],
      contacts: [],
      workOrdersAll: [],
      workOrdersRaised: [],
      workOrdersAwarded: [A],
    });
  });

  it("gives an owner the building's documents, lots and work orders, and no contacts", () => {
    expect(searchPlan([{ schemeId: A, level: "owner" }])).toEqual({
      schemes: [A],
      lots: [A],
      documents: [A],
      contacts: [],
      workOrdersAll: [A],
      workOrdersRaised: [],
      workOrdersAwarded: [],
    });
  });

  it("gives advisers and the committee the scheme's documents, work orders and contacts", () => {
    const plan = searchPlan([
      { schemeId: A, level: "adviser" },
      { schemeId: B, level: "committee" },
    ]);
    expect(plan.documents).toEqual([A, B]);
    expect(plan.contacts).toEqual([A, B]);
    expect(plan.workOrdersAll).toEqual([A, B]);
    expect(plan.workOrdersRaised).toEqual([]);
  });

  it("gives an accountant the scheme only", () => {
    expect(searchPlan([{ schemeId: A, level: "accountant" }])).toMatchObject({
      schemes: [A],
      lots: [],
      documents: [],
      contacts: [],
      workOrdersAll: [],
    });
  });
});

describe("hrefFor", () => {
  it("links by the level searched", () => {
    expect(hrefFor("adviser", "document", A, "d1")).toBe(`/adviser/schemes/${A}/documents/d1`);
    expect(hrefFor("owner", "work-order", A, "w1")).toBe("/owner/maintenance/w1");
    expect(hrefFor("supplier", "work-order", A, "w1")).toBe("/supplier/work-orders/w1");
    expect(hrefFor("accountant", "scheme", A, A)).toBe(`/accountant/schemes/${A}`);
  });
});
