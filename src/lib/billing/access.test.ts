import { describe, expect, it } from "vitest";
import { canViewSchemeBilling } from "./access";

describe("canViewSchemeBilling", () => {
  it("lets owners, committee, advisers and accountants see their own scheme", () => {
    for (const role of ["OWNER", "COMMITTEE", "ADVISER", "ACCOUNTANT"]) {
      expect(canViewSchemeBilling([{ schemeId: "s1", role }], "s1")).toBe(true);
    }
  });

  it("does not let an owner see another scheme's fees", () => {
    expect(canViewSchemeBilling([{ schemeId: "s1", role: "OWNER" }], "s2")).toBe(false);
  });

  it("does not let a supplier see scheme fee pages", () => {
    expect(canViewSchemeBilling([{ schemeId: "s1", role: "SUPPLIER" }], "s1")).toBe(false);
  });

  it("ignores inactive memberships", () => {
    expect(canViewSchemeBilling([{ schemeId: "s1", role: "OWNER", isActive: false }], "s1")).toBe(false);
  });

  it("lets platform admins see every scheme", () => {
    expect(canViewSchemeBilling([], "s9", true)).toBe(true);
  });
});
