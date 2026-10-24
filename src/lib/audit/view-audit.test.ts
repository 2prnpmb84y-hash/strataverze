import { describe, expect, it } from "vitest";
import { canonicalUuid, isPrefetch, viewTargetFor } from "./view-audit";

const S = "11111111-1111-4111-8111-111111111111";
const L = "22222222-2222-4222-8222-222222222222";

describe("viewTargetFor", () => {
  it("names the sensitive building pages", () => {
    expect(viewTargetFor(`/adviser/schemes/${S}/lots/${L}`)).toMatchObject({ action: "view.owner_details", schemeId: S, resourceId: L, roles: ["ADVISER"] });
    expect(viewTargetFor(`/adviser/schemes/${S}`)).toMatchObject({ action: "view.strata_roll", page: "overview" });
    expect(viewTargetFor(`/adviser/schemes/${S}/lots`)).toMatchObject({ action: "view.lot_list" });
    expect(viewTargetFor(`/adviser/schemes/${S}/finance/reports/trial-balance`)).toMatchObject({ action: "view.financial", page: "finance/reports/trial-balance" });
    expect(viewTargetFor(`/adviser/schemes/${S}/finance/suppliers`)).toMatchObject({ action: "view.financial" });
    expect(viewTargetFor(`/adviser/schemes/${S}/contacts`)).toMatchObject({ action: "view.contacts" });
    expect(viewTargetFor(`/adviser/schemes/${S}/members`)).toMatchObject({ action: "view.member_list" });
  });

  it("records every other building page too", () => {
    expect(viewTargetFor(`/adviser/schemes/${S}/meetings`)).toMatchObject({ action: "view.scheme_page" });
  });

  it("cannot be dodged with another spelling of the id", () => {
    const upper = L.toUpperCase();
    const bare = L.replace(/-/g, "");
    for (const lot of [upper, bare, `{${L}}`, encodeURIComponent(`{${upper}}`)]) {
      expect(viewTargetFor(`/adviser/schemes/${S.toUpperCase()}/LOTS/${lot}`)).toMatchObject({
        action: "view.owner_details",
        schemeId: S,
        resourceId: L,
      });
    }
  });

  it("covers the accountant area and owner pages showing others' arrears", () => {
    expect(viewTargetFor(`/accountant/schemes/${S}/finance/reports/levy-register`)).toMatchObject({
      action: "view.financial",
      roles: ["ACCOUNTANT", "ADVISER"],
    });
    expect(viewTargetFor("/owner/finance/treasurer")).toMatchObject({ area: "owner", schemeId: null });
    expect(viewTargetFor("/owner/levies/debt-recovery/abc")).toMatchObject({ area: "owner" });
    expect(viewTargetFor("/owner/dashboard")).toBeNull();
  });

  it("ignores malformed building ids", () => {
    expect(viewTargetFor("/adviser/schemes/not-a-uuid/lots")).toBeNull();
  });
});

describe("canonicalUuid", () => {
  it("normalises the accepted forms and refuses others", () => {
    expect(canonicalUuid(L.toUpperCase())).toBe(L);
    expect(canonicalUuid(`{${L}}`)).toBe(L);
    expect(canonicalUuid("xyz")).toBeNull();
  });
});

describe("isPrefetch", () => {
  it("spots prefetch requests", () => {
    expect(isPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetch(new Headers({}))).toBe(false);
  });
});
