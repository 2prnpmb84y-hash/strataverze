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
      Lot: [
        { id: "L1", schemeId: "S1", lotNumber: "1" },
        { id: "L2", schemeId: "S1", lotNumber: "2" },
        { id: "L15", schemeId: "S1", lotNumber: "15" },
      ],
      Profile: [{ id: "p-cate", email: "cate@profile.test" }],
      LotDetail: [
        { id: "ld1", lotId: "L1", rollOwnerName: "Ms Cate Blanchett", ownerEmail: "cate@old.test", ownerMobile: "0400 000 000", ownerAddress: "Old address", isCommitteeMember: true },
        { id: "ld2", lotId: "L2", rollOwnerName: "Mr Lot Two", ownerEmail: "two@x.test" },
      ],
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
    const r = await applyChangeOwner(sharedFake.db.orm as never, "S1", "L1", { ownerName: "Mr New Owner", email: "new@x.test", mobile: null, phone: null, address: null, settlementDate: "2026-10-24" });
    expect(r).toEqual({ previousOwnerName: "Ms Cate Blanchett", endedMemberships: ["p-cate"], endedCommitteeSeats: ["p-cate"], keptCommitteeSeats: [], deliveryPreferencesUpdated: 1 });
    expect(sharedFake.table("LotDetail")[0]).toMatchObject({ rollOwnerName: "Mr New Owner", ownerEmail: "new@x.test", ownerMobile: null, ownerAddress: null, isCommitteeMember: false, lastSettled: "2026-10-24T00:00:00.000Z" });
    const m = Object.fromEntries(sharedFake.table("SchemeMembership").map((x) => [x.id, x.isActive]));
    // The owner access and the committee seat end; another building and another lot are untouched.
    expect(m).toEqual({ m1: false, m2: false, m3: true, m4: true });
    expect(sharedFake.table("SchemeMembership").find((x) => x.id === "m2")).toMatchObject({ endDate: "2026-10-24T00:00:00.000Z", isTreasurer: false });
    const [owner, agent] = sharedFake.table("LotDeliveryPreference");
    expect(owner).toMatchObject({ recipientName: "Mr New Owner", recipientEmail: "new@x.test", recipientAddress: null, recipientSuburb: null });
    expect(agent).toMatchObject({ recipientName: "Agent", recipientEmail: "agent@x.test" });
  });

  const sale = { ownerName: "Mr New Owner", email: null, mobile: null, phone: null, address: null, settlementDate: "2026-10-24" };

  // Review H1 (founder decision 31 Oct 2026): the roll's names and emails are text the committee can edit, so they never
  // decide who keeps access or a seat. Access is never moved; the Adviser assigns an owner of another lot to it.
  it("never moves the access, and ends the seat, when the roll shows the same owner on another lot", async () => {
    sharedFake.table("LotDetail").push({ id: "ld15", lotId: "L15", rollOwnerName: "  ms cate   BLANCHETT ", ownerEmail: "Cate@Profile.test" });
    const { applyChangeOwner } = await import("./change-owner");
    const r = await applyChangeOwner(sharedFake.db.orm as never, "S1", "L1", sale);
    expect(r).toMatchObject({ endedMemberships: ["p-cate"], endedCommitteeSeats: ["p-cate"], keptCommitteeSeats: [] });
    expect(sharedFake.table("SchemeMembership").find((x) => x.id === "m1")).toMatchObject({ isActive: false, lotId: "L1" });
    expect(sharedFake.table("SchemeMembership").find((x) => x.id === "m2")?.isActive).toBe(false);
  });

  it("keeps a seat recorded against this lot when that member holds owner access to another lot (made by the Adviser)", async () => {
    sharedFake.reset({
      Lot: [{ id: "L1", schemeId: "S1", lotNumber: "1" }, { id: "L2", schemeId: "S1", lotNumber: "2" }],
      Profile: [{ id: "p-a", email: "a@x.test", firstName: "Alex", lastName: "A" }],
      LotDetail: [{ id: "ld1", lotId: "L1", rollOwnerName: "A Owner" }],
      SchemeMembership: [
        { id: "c1", schemeId: "S1", lotId: "L1", role: "COMMITTEE", isActive: true, profileId: "p-a" },
        { id: "o2", schemeId: "S1", lotId: "L2", role: "OWNER", isActive: true, profileId: "p-a" },
      ],
      LotDeliveryPreference: [],
    });
    const { applyChangeOwner, previewChangeOwner } = await import("./change-owner");
    const plan = await previewChangeOwner(sharedFake.db.orm as never, "S1", "L1");
    expect(plan).toMatchObject({ accessEnding: [], seatsEnding: [], seatsKept: [{ membershipId: "c1", name: "Alex A", lotNumbers: ["2"] }] });
    const r = await applyChangeOwner(sharedFake.db.orm as never, "S1", "L1", sale);
    expect(r).toMatchObject({ endedMemberships: [], endedCommitteeSeats: [], keptCommitteeSeats: [{ profileId: "p-a", lotNumbers: ["2"] }] });
    expect(sharedFake.table("SchemeMembership").map((x) => x.isActive)).toEqual([true, true]);
  });

  it("previews exactly what it then does, changing nothing", async () => {
    const { applyChangeOwner, previewChangeOwner } = await import("./change-owner");
    const before = JSON.stringify(sharedFake.table("SchemeMembership"));
    const plan = await previewChangeOwner(sharedFake.db.orm as never, "S1", "L1");
    expect(JSON.stringify(sharedFake.table("SchemeMembership"))).toBe(before);
    expect(plan).toMatchObject({ rollOwnerName: "Ms Cate Blanchett", accessEnding: [{ membershipId: "m1", email: "cate@profile.test" }], seatsEnding: [{ membershipId: "m2" }], seatsKept: [] });
    const r = await applyChangeOwner(sharedFake.db.orm as never, "S1", "L1", sale);
    expect(r.endedMemberships).toEqual(plan.accessEnding.map((a) => a.profileId));
    expect(r.endedCommitteeSeats).toEqual(plan.seatsEnding.map((a) => a.profileId));
  });

  it("ends a seat recorded against this lot even without owner access, and leaves other members alone", async () => {
    sharedFake.reset({
      Lot: [{ id: "L1", schemeId: "S1", lotNumber: "1" }, { id: "L2", schemeId: "S1", lotNumber: "2" }],
      Profile: [{ id: "p-a", email: "a@x.test" }, { id: "p-b", email: "b@x.test" }],
      LotDetail: [{ id: "ld1", lotId: "L1", rollOwnerName: "A Owner" }, { id: "ld2", lotId: "L2", rollOwnerName: "B Owner" }],
      SchemeMembership: [
        { id: "c1", schemeId: "S1", lotId: "L1", role: "COMMITTEE", isActive: true, profileId: "p-a", isTreasurer: true },
        { id: "c2", schemeId: "S1", lotId: "L2", role: "COMMITTEE", isActive: true, profileId: "p-b" },
      ],
      LotDeliveryPreference: [],
    });
    const { applyChangeOwner } = await import("./change-owner");
    const r = await applyChangeOwner(sharedFake.db.orm as never, "S1", "L1", sale);
    expect(r).toMatchObject({ endedMemberships: [], endedCommitteeSeats: ["p-a"], keptCommitteeSeats: [] });
    const m = Object.fromEntries(sharedFake.table("SchemeMembership").map((x) => [x.id, [x.isActive, x.isTreasurer]]));
    expect(m).toEqual({ c1: [false, false], c2: [true, undefined] });
  });
});
