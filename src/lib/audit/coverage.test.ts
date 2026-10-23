import { beforeEach, describe, expect, it, vi } from "vitest";

/** Refusals and activity-logged writes reach the security audit log (S6). */
const record = vi.fn();
const invocation = vi.fn();
vi.mock("@/lib/audit/security-audit", () => ({
  recordSecurityEvent: (e: unknown) => record(e),
  recordSecurityEventLater: (e: unknown) => record(e),
  recordActionInvocation: (e: unknown) => invocation(e),
}));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
const profile = { id: "p1", isPlatformAdmin: false };
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: async () => profile }));

const { sharedFake } = await import("@/test/fake-orm");
const { requireSchemeMembership, requirePlatformAdmin } = await import("@/lib/auth/require-membership");
const { logActivity } = await import("@/lib/queries/activity-log");

beforeEach(() => {
  record.mockReset();
  invocation.mockReset();
  sharedFake.reset({
    SchemeMembership: [{ id: "m1", schemeId: "s1", profileId: "p1", role: "OWNER", isActive: true }],
    ActivityLog: [],
  });
});

describe("refusals are recorded", () => {
  it("a missing scheme role", async () => {
    await expect(requireSchemeMembership("s1", ["ADVISER"])).rejects.toThrow();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "access.denied", outcome: "denied", actorProfileId: "p1", schemeId: "s1", actorRole: "OWNER" }),
    );
  });

  it("a platform admin action", async () => {
    await expect(requirePlatformAdmin()).rejects.toThrow();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "access.denied", actorProfileId: "p1" }));
  });

  it("but not an allowed request, which is recorded as an action instead", async () => {
    await requireSchemeMembership("s1", ["OWNER"]);
    expect(record).not.toHaveBeenCalled();
    expect(invocation).toHaveBeenCalledWith({ actorProfileId: "p1", actorRole: "OWNER", schemeId: "s1" });
  });
});

describe("activity log entries are mirrored", () => {
  it("with the actor, building and record", async () => {
    await logActivity({ schemeId: "s1", actorId: "p1", action: "MEMBER_REMOVED", entityType: "SchemeMembership", entityId: "m1" });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activity.member_removed",
        outcome: "allowed",
        actorProfileId: "p1",
        schemeId: "s1",
        resourceType: "SchemeMembership",
        resourceId: "m1",
      }),
    );
  });

  it("copying only allowed metadata keys", async () => {
    await logActivity({
      schemeId: "s1",
      actorId: "p1",
      action: "CONTACT_UPDATED",
      entityType: "Contact" as never,
      metadata: { title: "Mrs Smith", amount: 5 },
    });
    const event = record.mock.calls[0][0] as { metadataKeys: Set<string> };
    expect(event.metadataKeys.has("amount")).toBe(true);
    expect(event.metadataKeys.has("title")).toBe(false);
  });

  it("marking refusals as denied", async () => {
    await logActivity({ schemeId: "s1", actorId: "p1", action: "FINANCIAL_DOCUMENT_ACCESS_DENIED", entityType: "Scheme" });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "denied" }));
  });
});
