import { describe, expect, it, vi } from "vitest";

vi.mock("./require-membership", () => ({ requireAuth: vi.fn(), requirePlatformAdmin: vi.fn(), requireSchemeMembership: vi.fn() }));
vi.mock("./require-access", () => ({ requireSchemeAccess: vi.fn() }));
const { LOCKED_LOT_FIELDS, LOCKED_SCHEME_FIELDS, changedLockedFields } = await import("./building-lock");

describe("the locked building record (24 Oct)", () => {
  const scheme = { planNumber: "SP 1234", address: "1 Smith St", suburb: "Drummoyne", state: "NSW", postcode: "2047", totalLots: 10, totalEntitlement: 1000, name: "Old name" };

  it("lets the display name, ABN and financial year end change", () => {
    expect(changedLockedFields(LOCKED_SCHEME_FIELDS, scheme, { ...scheme, name: "New name", abnNumber: "1", financialYearEnd: "12-31" } as never)).toEqual([]);
  });

  it("finds a change to the plan number, address, lots or entitlement", () => {
    expect(changedLockedFields(LOCKED_SCHEME_FIELDS, scheme, { ...scheme, planNumber: "SP 9999", totalEntitlement: 999 })).toEqual(["planNumber", "totalEntitlement"]);
  });

  it("ignores case and spacing only", () => {
    expect(changedLockedFields(LOCKED_SCHEME_FIELDS, scheme, { ...scheme, planNumber: " sp 1234 " })).toEqual([]);
  });

  it("finds a change to a lot's number or entitlement", () => {
    const lot = { lotNumber: "3", entitlement: 25 };
    expect(changedLockedFields(LOCKED_LOT_FIELDS, lot, { lotNumber: "3", entitlement: 25 })).toEqual([]);
    expect(changedLockedFields(LOCKED_LOT_FIELDS, lot, { lotNumber: "3", entitlement: 30 })).toEqual(["entitlement"]);
  });
});
