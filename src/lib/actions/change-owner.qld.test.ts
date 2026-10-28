/**
 * A change of owner for a Queensland lot (QLD switch-on review, 28 Oct 2026).
 * The building's real pack is used. Queensland's pack has no NSW citations,
 * so the action must not need them: the change is saved, the outgoing owner's
 * committee seat ends as for NSW, and the message gives no provision for it
 * (whether a seat ends on sale in Queensland is not confirmed, FOR_REVIEW).
 * Run for the adviser and for a committee member in the owner portal, the two
 * people who can record it. NSW keeps its citation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ roles: ["ADVISER"] as string[] }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({
  requireSchemeAccess: vi.fn(async () => ({ profile: { id: "p-actor", firstName: "Chris", lastName: "Chair" }, roles: access.roles })),
}));
vi.mock("@/lib/auth/mfa-enforcement", () => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}), recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications", () => ({ notifyInvitation: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeNameById: async () => "Riverside" }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: async () => "2026-10-28" }));
vi.mock("@/lib/vault/capture", () => ({ getTrialVault: async () => null }));
vi.mock("@/lib/vault/sources", () => ({ captureLibraryDocument: vi.fn(), captureQuietly: vi.fn(async () => null) }));

const { sharedFake } = await import("@/test/fake-orm");
const { changeOwnerAction } = await import("./change-owner");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const valid = { ownerName: "Mr New Owner", email: "new@x.test", settlementDate: "2026-10-27", invite: "on" };

function seed(state: string) {
  sharedFake.reset({
    Scheme: [{ id: "S1", state, name: "Riverside" }],
    Lot: [{ id: "L1", schemeId: "S1", lotNumber: "1" }],
    LotDetail: [{ id: "ld1", lotId: "L1", rollOwnerName: "Ms Old Owner" }],
    SchemeMembership: [
      { id: "m1", schemeId: "S1", lotId: "L1", role: "OWNER", isActive: true, profileId: "p-old" },
      { id: "m2", schemeId: "S1", lotId: "L1", role: "COMMITTEE", isActive: true, profileId: "p-old" },
    ],
    Profile: [{ id: "p-old", email: "old@x.test" }],
    LotDeliveryPreference: [],
    Invitation: [],
  });
}

describe.each([
  ["the adviser", ["ADVISER"]],
  ["a committee member, in the owner portal", ["OWNER", "COMMITTEE"]],
])("a change of owner for a Queensland lot, recorded by %s", (_who, roles) => {
  beforeEach(() => {
    access.roles = roles;
    seed("QLD");
  });

  it("is saved, ends the outgoing owner's access and committee seat, and cites no provision", async () => {
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.error).toBeUndefined();
    expect(r.done).toContain("Mr New Owner is now the owner of Lot 1 on the strata roll, settled 27/10/2026.");
    expect(r.done).toContain("Their seat on the committee has ended from the settlement date, as they are no longer an owner.");
    expect(r.done).not.toMatch(/SSMA|s 35/);
    expect(r.done).toContain("An invitation has been sent to new@x.test.");
    expect(sharedFake.table("LotDetail")[0].rollOwnerName).toBe("Mr New Owner");
    expect(sharedFake.table("SchemeMembership").map((m) => [m.role, m.isActive])).toEqual([
      ["OWNER", false],
      ["COMMITTEE", false],
    ]);
    expect(sharedFake.table("Invitation")[0]).toMatchObject({ schemeId: "S1", email: "new@x.test", role: "OWNER", lotId: "L1" });
  });
});

describe("a change of owner for an NSW lot", () => {
  it("still cites the provision that ends the committee seat", async () => {
    access.roles = ["ADVISER"];
    seed("NSW");
    const r = await changeOwnerAction("S1", "L1", {}, form(valid));
    expect(r.done).toContain("Their seat on the strata committee has ended from the settlement date, as they are no longer an owner (s 35(1)(a) SSMA 2015).");
  });
});
