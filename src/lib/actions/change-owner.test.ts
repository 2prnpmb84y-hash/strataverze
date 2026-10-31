/**
 * Change of owner (25 Oct 2026) and the committee hold (finding H-1, founder
 * decision 31 Oct 2026). The real access checks run against the in-memory
 * ORM: requireSchemeAccessOrAdmin and requireRolesOrAdmin, through
 * requireSchemeMembership and requirePlatformAdmin, with only the signed-in
 * profile (and its Auth user) and the step-up check stood in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({
  profile: null as null | { id: string; email: string; firstName: string; lastName: string; isPlatformAdmin: boolean },
  user: null as null | { email?: string; new_email?: string; identities?: Array<{ identity_data?: Record<string, unknown> }> },
  stepUpFresh: true,
}));
const sent = vi.hoisted(() => ({ invitations: [] as string[] }));
const audit = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>>, activity: [] as Array<Record<string, unknown>> }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => who.profile) }));
vi.mock("@/lib/auth/current-session", () => ({
  getCurrentSession: vi.fn(async () => (who.profile ? { profile: who.profile, user: who.user ?? { email: who.profile.email } } : null)),
}));
vi.mock("@/lib/auth/mfa-enforcement", async () => {
  const { AuthorisationError } = await import("@/lib/auth/require-membership");
  return {
    requireRecentMfa: vi.fn(async () => {
      if (!who.stepUpFresh) throw new AuthorisationError("For your security, confirm it is you first.");
    }),
  };
});
vi.mock("@/lib/audit/security-audit", () => ({
  recordSecurityEvent: vi.fn(async (e: Record<string, unknown>) => {
    audit.events.push(e);
  }),
  recordSecurityEventLater: vi.fn(async (e: Record<string, unknown>) => {
    audit.events.push(e);
  }),
  recordActionInvocation: vi.fn(async () => {}),
}));
vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(async (a: Record<string, unknown>) => {
    audit.activity.push(a);
  }),
}));
vi.mock("@/lib/notifications", () => ({ notifyInvitation: vi.fn(async (p: { recipientEmail: string }) => { sent.invitations.push(p.recipientEmail); }) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeNameById: async () => "Opera House" }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: async () => "2026-10-25" }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const { statutoryRulesFor } = await import("@/config/statutory");
  return { rulesForScheme: async () => ({ rules: statutoryRulesFor("NSW"), label: "AU-NSW test" }) };
});
vi.mock("@/lib/vault/capture", () => ({ getTrialVault: async () => null }));
vi.mock("@/lib/vault/sources", () => ({ captureLibraryDocument: vi.fn(), captureQuietly: vi.fn(async () => null) }));

const { sharedFake } = await import("@/test/fake-orm");
const { changeOwnerAction } = await import("./change-owner");
const { confirmOwnerChangeAction, rejectOwnerChangeAction } = await import("./change-owner-review");

const CHAIR = { id: "p-chair", email: "chair@x.test", firstName: "Chris", lastName: "Chair", isPlatformAdmin: false };
const ADVISER = { id: "p-adviser", email: "adviser@x.test", firstName: "Ada", lastName: "Adviser", isPlatformAdmin: false };
const OTHER_ADVISER = { id: "p-other-adviser", email: "other@x.test", firstName: "Otto", lastName: "Other", isPlatformAdmin: false };
const ADMIN = { id: "p-admin", email: "staff@strataverze.test", firstName: "Sam", lastName: "Staff", isPlatformAdmin: true };

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const valid = { ownerName: "Mr New Owner", email: "new@x.test", settlementDate: "2026-10-24", invite: "on" };

const as = (p: typeof CHAIR, user?: typeof who.user) => {
  who.profile = p;
  who.user = user ?? null;
};
const requests = () => sharedFake.table("OwnerChangeRequest");
const cateOwner = () => sharedFake.table("SchemeMembership").find((m) => m.id === "m1")!;
const roll = () => sharedFake.table("LotDetail").find((d) => d.lotId === "L1")!;

/** Nothing about the lot's ownership has changed. */
function expectUnchanged() {
  expect(cateOwner().isActive).toBe(true);
  expect(roll().rollOwnerName).toBe("Ms Cate Blanchett");
  expect(roll().ownerEmail).toBe("cate@x.test");
  expect(sharedFake.table("Invitation")).toHaveLength(0);
  expect(sent.invitations).toEqual([]);
  expect(audit.activity.filter((a) => a.action === "OWNER_CHANGED")).toEqual([]);
}

beforeEach(() => {
  as(CHAIR);
  who.stepUpFresh = true;
  sent.invitations = [];
  audit.events = [];
  audit.activity = [];
  sharedFake.reset({
    Lot: [{ id: "L1", schemeId: "S1", lotNumber: "1" }, { id: "LX", schemeId: "S2", lotNumber: "9" }],
    LotDetail: [{ id: "ld1", lotId: "L1", rollOwnerName: "Ms Cate Blanchett", ownerEmail: "cate@x.test" }],
    Profile: [CHAIR, ADVISER, OTHER_ADVISER, ADMIN, { id: "p-cate", email: "cate@x.test", firstName: "Cate", lastName: "Blanchett" }],
    SchemeMembership: [
      { id: "m1", schemeId: "S1", lotId: "L1", role: "OWNER", isActive: true, profileId: "p-cate" },
      { id: "m-chair", schemeId: "S1", lotId: null, role: "COMMITTEE", isActive: true, profileId: CHAIR.id },
      { id: "m-chair-owner", schemeId: "S1", lotId: "L9", role: "OWNER", isActive: true, profileId: CHAIR.id },
      { id: "m-adviser", schemeId: "S1", lotId: null, role: "ADVISER", isActive: true, profileId: ADVISER.id },
      { id: "m-other-adviser", schemeId: "S2", lotId: null, role: "ADVISER", isActive: true, profileId: OTHER_ADVISER.id },
    ],
    LotDeliveryPreference: [],
    Invitation: [],
    OwnerChangeRequest: [],
  });
});

describe("the Adviser's own change of owner applies straight away, as before", () => {
  it("ends the old access, updates the roll and invites the new owner", async () => {
    as(ADVISER);
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.error).toBeUndefined();
    expect(r.done).toContain("Mr New Owner is now the owner of Lot 1");
    expect(r.done).toContain("An invitation has been sent to new@x.test");
    expect(cateOwner().isActive).toBe(false);
    expect(roll().rollOwnerName).toBe("Mr New Owner");
    expect(sharedFake.table("Invitation")[0]).toMatchObject({ schemeId: "S1", email: "new@x.test", role: "OWNER", lotId: "L1", invitedById: ADVISER.id });
    expect(sent.invitations).toEqual(["new@x.test"]);
    expect(requests()).toHaveLength(0);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_changed", outcome: "allowed", actorRole: "ADVISER" }));
  });

  it("may record their own address (the own-address rule is for the committee)", async () => {
    as(ADVISER);
    const r = await changeOwnerAction("S1", "L1", {}, form({ ...valid, email: "ADVISER@x.test" }));
    expect(r.done).toContain("is now the owner of Lot 1");
  });

  it("does not send a second invitation when one is waiting", async () => {
    as(ADVISER);
    sharedFake.table("Invitation").push({ id: "i1", schemeId: "S1", email: "new@x.test", role: "OWNER", status: "PENDING" });
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("already has an invitation waiting");
    expect(sent.invitations).toEqual([]);
  });

  it("a platform admin's change applies straight away too, without a role on the building", async () => {
    as(ADMIN);
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("is now the owner of Lot 1");
    expect(cateOwner().isActive).toBe(false);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_changed", actorRole: "platform_admin" }));
  });
});

describe("refusals", () => {
  it("refuses a lot of another building, and changes nothing", async () => {
    as(ADVISER);
    const r = await changeOwnerAction("S1", "LX", {}, form(valid));
    expect(r.error).toBeTruthy();
    expect(sharedFake.table("Invitation")).toHaveLength(0);
  });

  it("refuses someone without the roll permission (an owner only)", async () => {
    sharedFake.table("SchemeMembership").splice(1, 1); // the chair's committee seat
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.error).toContain("permission");
    expectUnchanged();
  });

  it("refuses an Adviser of another building", async () => {
    as(OTHER_ADVISER);
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.error).toContain("permission");
    expectUnchanged();
  });
});

describe("a committee member cannot make themselves the owner (H-1)", () => {
  it.each([
    ["their profile email", "chair@x.test"],
    ["their profile email in another case, with spaces", "  Chair@X.Test "],
  ])("refuses %s", async (_what, email) => {
    const r = await changeOwnerAction("S1", "L1", {}, form({ ...valid, email }));
    expect(r.fieldErrors?.email).toContain("You cannot record yourself as the new owner");
    expectUnchanged();
    expect(requests()).toHaveLength(0);
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_change_refused", outcome: "denied", actorProfileId: CHAIR.id, resourceId: "L1" }));
  });

  it.each([
    ["the sign-in email", { email: "login@x.test" }, "login@x.test"],
    ["an email change waiting for confirmation", { email: "chair@x.test", new_email: "next@x.test" }, "Next@x.test"],
    ["a linked sign-in identity's email", { email: "chair@x.test", identities: [{ identity_data: { email: "google@x.test" } }] }, "google@x.test"],
  ])("refuses %s on their account", async (_what, user, email) => {
    as(CHAIR, user);
    const r = await changeOwnerAction("S1", "L1", {}, form({ ...valid, email }));
    expect(r.fieldErrors?.email).toContain("You cannot record yourself as the new owner");
    expect(requests()).toHaveLength(0);
    expectUnchanged();
  });
});

describe("a committee member's change is held for the Adviser (H-1)", () => {
  it("changes nothing: the old owner keeps access, the roll is unchanged, no invitation exists", async () => {
    const r = await changeOwnerAction("S1", "L1", {}, form({ ...valid, mobile: "0400 111 222" }));
    expect(r.error).toBeUndefined();
    expect(r.done).toContain("The change of owner of Lot 1 to Mr New Owner is waiting for the Adviser to confirm it.");
    expect(r.done).toContain("no invitation has been sent");
    expectUnchanged();
    expect(requests()).toHaveLength(1);
    expect(requests()[0]).toMatchObject({
      schemeId: "S1",
      lotId: "L1",
      status: "PENDING",
      ownerName: "Mr New Owner",
      ownerEmail: "new@x.test",
      ownerMobile: "0400 111 222",
      settlementDate: "2026-10-24",
      invite: true,
      recordedBy: CHAIR.id,
    });
    expect(audit.activity).toContainEqual(expect.objectContaining({ action: "OWNER_CHANGE_HELD", actorId: CHAIR.id, entityId: "L1" }));
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_change_held", outcome: "allowed", actorRole: "COMMITTEE" }));
  });

  it("names StrataVerze as the reviewer when the building has no Adviser", async () => {
    sharedFake.table("SchemeMembership").find((m) => m.id === "m-adviser")!.isActive = false;
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("is waiting for StrataVerze to confirm it");
    expectUnchanged();
  });

  it("allows only one change waiting for a lot, for the committee and the Adviser alike", async () => {
    await changeOwnerAction("S1", "L1", {}, form(valid));
    const again = await changeOwnerAction("S1", "L1", {}, form({ ...valid, ownerName: "Someone Else", email: "else@x.test" }));
    expect(again.error).toContain("already waiting for the Adviser");
    as(ADVISER);
    const adviser = await changeOwnerAction("S1", "L1", {}, form({ ...valid, ownerName: "Someone Else", email: "else@x.test" }));
    expect(adviser.error).toContain("must be confirmed or rejected before another is recorded");
    expect(requests()).toHaveLength(1);
    expectUnchanged();
  });
});

describe("confirming or rejecting a held change (H-1)", () => {
  async function hold() {
    as(CHAIR);
    await changeOwnerAction("S1", "L1", {}, form(valid));
    return String(requests()[0].id);
  }

  it("the Adviser confirms: it applies exactly as the Adviser's own change does", async () => {
    const id = await hold();
    as(ADVISER);
    const r = await confirmOwnerChangeAction("S1", id);
    expect(r.error).toBeUndefined();
    expect(r.done).toContain("Mr New Owner is now the owner of Lot 1 on the strata roll, settled 24/10/2026.");
    expect(r.done).toContain("The outgoing owner's portal access has ended.");
    expect(r.done).toContain("An invitation has been sent to new@x.test.");
    expect(cateOwner().isActive).toBe(false);
    expect(roll().rollOwnerName).toBe("Mr New Owner");
    expect(roll().ownerEmail).toBe("new@x.test");
    expect(sharedFake.table("Invitation")[0]).toMatchObject({ schemeId: "S1", email: "new@x.test", role: "OWNER", lotId: "L1", invitedById: ADVISER.id });
    expect(sent.invitations).toEqual(["new@x.test"]);
    expect(requests()[0]).toMatchObject({ status: "CONFIRMED", decidedBy: ADVISER.id });
    expect(requests()[0].decidedAt).toBeTruthy();
    expect(audit.activity).toContainEqual(expect.objectContaining({ action: "OWNER_CHANGE_CONFIRMED", actorId: ADVISER.id, entityId: "L1" }));
    expect(audit.activity).toContainEqual(expect.objectContaining({ action: "OWNER_CHANGED", actorId: ADVISER.id }));
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_change_confirmed", outcome: "allowed", actorRole: "ADVISER", resourceId: "L1" }));
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_changed", actorRole: "ADVISER" }));
  });

  it("the Adviser rejects: nothing changes and no invitation is sent", async () => {
    const id = await hold();
    as(ADVISER);
    const r = await rejectOwnerChangeAction("S1", id);
    expect(r.done).toContain("was rejected. Nothing on the strata roll changed");
    expectUnchanged();
    expect(requests()[0]).toMatchObject({ status: "REJECTED", decidedBy: ADVISER.id });
    expect(audit.activity).toContainEqual(expect.objectContaining({ action: "OWNER_CHANGE_REJECTED", actorId: ADVISER.id }));
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_change_rejected", outcome: "allowed", actorRole: "ADVISER" }));
    // A decided change cannot then be confirmed.
    expect((await confirmOwnerChangeAction("S1", id)).error).toContain("no longer waiting");
    expectUnchanged();
  });

  it("a platform admin can confirm, with no role on the building (the reviewer where there is no Adviser)", async () => {
    sharedFake.table("SchemeMembership").find((m) => m.id === "m-adviser")!.isActive = false;
    const id = await hold();
    as(ADMIN);
    const r = await confirmOwnerChangeAction("S1", id);
    expect(r.done).toContain("Mr New Owner is now the owner of Lot 1");
    expect(cateOwner().isActive).toBe(false);
    expect(requests()[0]).toMatchObject({ status: "CONFIRMED", decidedBy: ADMIN.id });
    expect(audit.events).toContainEqual(expect.objectContaining({ action: "lot.owner_change_confirmed", actorRole: "platform_admin" }));
  });

  it("a platform admin can reject", async () => {
    const id = await hold();
    as(ADMIN);
    expect((await rejectOwnerChangeAction("S1", id)).done).toContain("was rejected");
    expectUnchanged();
  });

  it("the committee cannot confirm or reject, its own change included", async () => {
    const id = await hold();
    for (const action of [confirmOwnerChangeAction, rejectOwnerChangeAction]) {
      const r = await action("S1", id);
      expect(r.error).toContain("permission");
    }
    expect(requests()[0].status).toBe("PENDING");
    expectUnchanged();
  });

  it("an Adviser of another building cannot decide it, through either building's id", async () => {
    const id = await hold();
    as(OTHER_ADVISER);
    expect((await confirmOwnerChangeAction("S1", id)).error).toContain("permission");
    expect((await confirmOwnerChangeAction("S2", id)).error).toContain("no longer waiting");
    expect((await rejectOwnerChangeAction("S2", id)).error).toContain("no longer waiting");
    expect(requests()[0].status).toBe("PENDING");
    expectUnchanged();
  });

  it("needs a fresh authenticator check to confirm or reject", async () => {
    const id = await hold();
    as(ADVISER);
    who.stepUpFresh = false;
    expect((await confirmOwnerChangeAction("S1", id)).error).toContain("confirm it is you");
    expect((await rejectOwnerChangeAction("S1", id)).error).toContain("confirm it is you");
    expect(requests()[0].status).toBe("PENDING");
    expectUnchanged();
  });

  it("is applied once: a second confirmation finds nothing waiting", async () => {
    const id = await hold();
    as(ADVISER);
    await confirmOwnerChangeAction("S1", id);
    const again = await confirmOwnerChangeAction("S1", id);
    expect(again.error).toContain("no longer waiting");
    expect(sharedFake.table("Invitation")).toHaveLength(1);
    expect(sent.invitations).toEqual(["new@x.test"]);
  });

  it("a malformed id is simply not found", async () => {
    await hold();
    as(ADVISER);
    expect((await confirmOwnerChangeAction("S1", "not-a-uuid")).error).toContain("no longer waiting");
    expectUnchanged();
  });

  it("once decided, the lot can have a new change recorded", async () => {
    const id = await hold();
    as(ADVISER);
    await rejectOwnerChangeAction("S1", id);
    as(CHAIR);
    const r = await changeOwnerAction("S1", "L1", {}, form({ ...valid, ownerName: "Ms Right Owner" }));
    expect(r.done).toContain("waiting for the Adviser");
    expect(requests().map((q) => q.status)).toEqual(["REJECTED", "PENDING"]);
  });
});
