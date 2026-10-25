import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ roles: ["COMMITTEE"] as string[], deny: false }));
const sent = vi.hoisted(() => ({ invitations: [] as string[] }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", async () => {
  const { AuthorisationError } = await import("@/lib/auth/require-membership");
  return {
    requireSchemeAccess: vi.fn(async () => {
      if (access.deny) throw new AuthorisationError("You do not have permission to perform this action.");
      return { profile: { id: "p-actor", firstName: "Chris", lastName: "Chair" }, roles: access.roles };
    }),
  };
});
vi.mock("@/lib/auth/mfa-enforcement", () => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}), recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications", () => ({ notifyInvitation: vi.fn(async (p: { recipientEmail: string }) => { sent.invitations.push(p.recipientEmail); }) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeNameById: async () => "Opera House" }));
vi.mock("@/lib/finance/interest-setting", () => ({ sydneyToday: () => "2026-10-25" }));
vi.mock("@/lib/vault/capture", () => ({ getTrialVault: async () => null }));
vi.mock("@/lib/vault/sources", () => ({ captureLibraryDocument: vi.fn(), captureQuietly: vi.fn(async () => null) }));

const { sharedFake } = await import("@/test/fake-orm");
const { changeOwnerAction } = await import("./change-owner");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const valid = { ownerName: "Mr New Owner", email: "new@x.test", settlementDate: "2026-10-24", invite: "on" };

beforeEach(() => {
  access.roles = ["COMMITTEE"];
  access.deny = false;
  sent.invitations = [];
  sharedFake.reset({
    Lot: [{ id: "L1", schemeId: "S1", lotNumber: "1" }, { id: "LX", schemeId: "S2", lotNumber: "9" }],
    LotDetail: [{ id: "ld1", lotId: "L1", rollOwnerName: "Ms Cate Blanchett" }],
    SchemeMembership: [{ id: "m1", schemeId: "S1", lotId: "L1", role: "OWNER", isActive: true, profileId: "p-cate" }],
    LotDeliveryPreference: [],
    Invitation: [],
  });
});

describe("change of owner action", () => {
  it("lets the committee record it, ends the old access and invites the new owner", async () => {
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("Mr New Owner is now the owner of Lot 1");
    expect(r.done).toContain("An invitation has been sent to new@x.test");
    expect(sharedFake.table("SchemeMembership")[0].isActive).toBe(false);
    expect(sharedFake.table("Invitation")[0]).toMatchObject({ schemeId: "S1", email: "new@x.test", role: "OWNER", lotId: "L1" });
    expect(sent.invitations).toEqual(["new@x.test"]);
  });

  it("refuses a lot of another building, and changes nothing", async () => {
    const r = await changeOwnerAction("S1", "LX", {}, form(valid));
    expect(r.error).toBeTruthy();
    expect(sharedFake.table("Invitation")).toHaveLength(0);
  });

  it("refuses someone without the roll permission", async () => {
    access.deny = true;
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.error).toContain("permission");
    expect(sharedFake.table("SchemeMembership")[0].isActive).toBe(true);
  });

  it("does not send a second invitation when one is waiting", async () => {
    sharedFake.table("Invitation").push({ id: "i1", schemeId: "S1", email: "new@x.test", role: "OWNER", status: "PENDING" });
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("already has an invitation waiting");
    expect(sent.invitations).toEqual([]);
  });
});
