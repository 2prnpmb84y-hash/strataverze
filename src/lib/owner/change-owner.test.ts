import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkChangeOwner } from "./change-owner";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const TODAY = "2026-10-25";

describe("checking a change of owner", () => {
  it("needs a name and a settlement date that is not in the future", () => {
    const r = checkChangeOwner({ ownerName: " ", settlementDate: "2026-11-01" }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.ownerName).toContain("as it will appear on the strata roll");
      expect(r.fieldErrors.settlementDate).toContain("cannot be in the future");
    }
  });

  it("accepts a settled change, tidying the details", () => {
    const r = checkChangeOwner({ ownerName: "  Ms Jane Citizen ", email: "Jane@Example.COM", settlementDate: "2026-10-24", mobile: "", address: "1 George St Sydney NSW 2000" }, TODAY);
    expect(r).toEqual({ ok: true, value: { ownerName: "Ms Jane Citizen", email: "jane@example.com", mobile: null, phone: null, address: "1 George St Sydney NSW 2000", settlementDate: "2026-10-24" } });
  });

  it("refuses a bad email and line breaks", () => {
    const r = checkChangeOwner({ ownerName: "A\nB", email: "not-an-email", settlementDate: TODAY }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["email", "ownerName"]);
  });
});

describe("applying a change of owner", () => {
  let sharedFake: Awaited<typeof import("@/test/fake-orm")>["sharedFake"];
  beforeEach(async () => {
    sharedFake = (await import("@/test/fake-orm")).sharedFake;
    sharedFake.reset({
      LotDetail: [{ id: "ld1", lotId: "L1", rollOwnerName: "Ms Cate Blanchett", ownerEmail: "cate@old.test", ownerMobile: "0400 000 000", ownerAddress: "Old address", isCommitteeMember: true }],
      SchemeMembership: [
        { id: "m1", schemeId: "S1", lotId: "L1", role: "OWNER", isActive: true, profileId: "p-cate" },
        { id: "m2", schemeId: "S1", lotId: "L1", role: "COMMITTEE", isActive: true, profileId: "p-cate" },
        { id: "m3", schemeId: "S2", lotId: "L1", role: "OWNER", isActive: true, profileId: "p-other" },
        { id: "m4", schemeId: "S1", lotId: "L2", role: "OWNER", isActive: true, profileId: "p-lot2" },
      ],
      LotDeliveryPreference: [
        { id: "d1", lotId: "L1", recipientType: "OWNER", recipientName: "Cate", recipientEmail: "cate@old.test", recipientAddress: "Old address", recipientSuburb: "Old", recipientState: "NSW", recipientPostcode: "2000" },
        { id: "d2", lotId: "L1", recipientType: "AGENT", recipientName: "Agent", recipientEmail: "agent@x.test" },
      ],
    });
  });

  it("records the new owner, clears the outgoing owner's details, and ends only this lot's owner access", async () => {
    const { applyChangeOwner } = await import("./change-owner");
    const r = await applyChangeOwner("S1", "L1", { ownerName: "Mr New Owner", email: "new@x.test", mobile: null, phone: null, address: null, settlementDate: "2026-10-24" });
    expect(r).toEqual({ previousOwnerName: "Ms Cate Blanchett", endedMemberships: ["p-cate"], deliveryPreferencesUpdated: 1 });
    expect(sharedFake.table("LotDetail")[0]).toMatchObject({ rollOwnerName: "Mr New Owner", ownerEmail: "new@x.test", ownerMobile: null, ownerAddress: null, isCommitteeMember: false, lastSettled: "2026-10-24T00:00:00.000Z" });
    const m = Object.fromEntries(sharedFake.table("SchemeMembership").map((x) => [x.id, x.isActive]));
    // The owner membership ends; the committee seat, another building and another lot are untouched.
    expect(m).toEqual({ m1: false, m2: true, m3: true, m4: true });
    const [owner, agent] = sharedFake.table("LotDeliveryPreference");
    expect(owner).toMatchObject({ recipientName: "Mr New Owner", recipientEmail: "new@x.test", recipientAddress: null, recipientSuburb: null });
    expect(agent).toMatchObject({ recipientName: "Agent", recipientEmail: "agent@x.test" });
  });
});
