import { describe, expect, it } from "vitest";
import { isPrefetch, viewEventFor } from "./view-audit";

const S = "11111111-1111-4111-8111-111111111111";
const L = "22222222-2222-4222-8222-222222222222";

describe("viewEventFor", () => {
  it("records owner detail, strata roll and financial pages", () => {
    expect(viewEventFor(`/adviser/schemes/${S}/lots/${L}`)).toMatchObject({ action: "view.owner_details", schemeId: S, resourceId: L });
    expect(viewEventFor(`/adviser/schemes/${S}`)).toMatchObject({ action: "view.strata_roll", schemeId: S });
    expect(viewEventFor(`/adviser/schemes/${S}/finance/reports/trial-balance`)).toMatchObject({
      action: "view.financial",
      area: "finance/reports/trial-balance",
    });
    expect(viewEventFor(`/adviser/schemes/${S}/finance/journal`)).toMatchObject({ action: "view.financial" });
    expect(viewEventFor(`/adviser/schemes/${S}/members`)).toMatchObject({ action: "view.member_list" });
  });

  it("ignores other pages and malformed ids", () => {
    expect(viewEventFor(`/adviser/schemes/${S}/meetings`)).toBeNull();
    expect(viewEventFor(`/adviser/schemes/not-a-uuid/lots/${L}`)).toBeNull();
    expect(viewEventFor("/owner/dashboard")).toBeNull();
  });
});

describe("isPrefetch", () => {
  it("spots prefetch requests", () => {
    expect(isPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetch(new Headers({}))).toBe(false);
  });
});
