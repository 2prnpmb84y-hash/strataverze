import { describe, expect, it } from "vitest";
import { canSeeDocument, parseVisibility } from "./visibility";

const owner = (lots: string[] = ["5"]) => ({ roles: ["OWNER"], ownLotNumbers: lots });
const committee = { roles: ["OWNER", "COMMITTEE"], ownLotNumbers: ["1"] };
const adviser = { roles: ["ADVISER"], ownLotNumbers: [] };
const supplier = { roles: ["SUPPLIER"], ownLotNumbers: [] };

describe("canSeeDocument", () => {
  it("all members: owners, committee and the Adviser, never suppliers", () => {
    const doc = { visibility: "ALL_MEMBERS" };
    expect([owner(), committee, adviser, supplier].map((v) => canSeeDocument(doc, v))).toEqual([true, true, true, false]);
  });

  it("existing documents with no visibility behave as all members", () => {
    expect(canSeeDocument({ visibility: null }, owner())).toBe(true);
  });

  it("committee only", () => {
    const doc = { visibility: "COMMITTEE" };
    expect([owner(), committee, adviser].map((v) => canSeeDocument(doc, v))).toEqual([false, true, true]);
  });

  it("one lot's owners: that lot only, plus committee and Adviser", () => {
    const doc = { visibility: "LOT_OWNERS", lotNumber: "5" };
    expect(canSeeDocument(doc, owner(["5"]))).toBe(true);
    expect(canSeeDocument(doc, owner(["6"]))).toBe(false);
    expect(canSeeDocument({ visibility: "LOT_OWNERS", lotNumber: null }, owner(["5"]))).toBe(false);
    expect(canSeeDocument(doc, committee)).toBe(true);
  });

  it("manager only", () => {
    const doc = { visibility: "MANAGEMENT" };
    expect([owner(), committee, adviser].map((v) => canSeeDocument(doc, v))).toEqual([false, false, true]);
  });
});

describe("parseVisibility", () => {
  it("defaults to all members and needs a lot for one lot's owners", () => {
    expect(parseVisibility("", null)).toBe("ALL_MEMBERS");
    expect(parseVisibility("LOT_OWNERS", "5")).toBe("LOT_OWNERS");
    expect(parseVisibility("LOT_OWNERS", "")).toEqual({ error: expect.stringMatching(/lot number/) });
    expect(parseVisibility("EVERYONE", null)).toEqual({ error: expect.any(String) });
  });
});
