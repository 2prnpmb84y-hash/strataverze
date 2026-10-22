import { describe, expect, it } from "vitest";
import { scopeSchemeIds, scopeToSelectedScheme } from "./scheme-scope";

const schemes = [{ id: "a" }, { id: "b" }];

describe("scopeToSelectedScheme", () => {
  it("keeps every scheme when none is selected", () => {
    expect(scopeToSelectedScheme(schemes, null)).toEqual(schemes);
  });

  it("keeps only the selected scheme", () => {
    expect(scopeToSelectedScheme(schemes, "b")).toEqual([{ id: "b" }]);
  });

  it("shows nothing rather than another scheme's data when the selection is not in the list", () => {
    expect(scopeToSelectedScheme(schemes, "z")).toEqual([]);
  });
});

describe("scopeSchemeIds", () => {
  it("applies the same rule to IDs", () => {
    expect(scopeSchemeIds(["a", "b"], undefined)).toEqual(["a", "b"]);
    expect(scopeSchemeIds(["a", "b"], "a")).toEqual(["a"]);
  });
});
