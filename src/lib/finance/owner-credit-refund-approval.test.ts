import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nobody approves a refund of credit to a lot they own or co-own (independent
 * review, finding L2). The check runs before any payment policy is applied.
 */

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn() }));
const getPaymentSettings = vi.fn(async () => {
  throw new Error("policy should not be reached");
});
vi.mock("@/lib/queries/payment-controls", () => ({
  getApprovalMembers: vi.fn(async () => []),
  getAuthorisations: vi.fn(async () => []),
  getPaymentSettings: () => getPaymentSettings(),
  hashIp: () => null,
}));

const { sharedFake } = await import("@/test/fake-orm");
const { authoriseOwnerCreditRefund } = await import("./owner-credits");

const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";

beforeEach(() => {
  sharedFake.reset();
  sharedFake.table("OwnerCreditRefund").push({
    id: "refund-1",
    schemeId: SCHEME,
    lotId: "lot-5",
    ownerId: "owner-a",
    amount: "120.00",
    status: "PENDING_APPROVAL",
    preparedById: "adviser",
  });
});

describe("authoriseOwnerCreditRefund", () => {
  it("refuses the owner the refund is paid to", async () => {
    await expect(
      authoriseOwnerCreditRefund({ schemeId: SCHEME, refundId: "refund-1", actorId: "owner-a" }),
    ).rejects.toThrow(/your own lot/);
  });

  it("refuses a co-owner of the lot, such as a treasurer who co-owns it", async () => {
    sharedFake.table("SchemeMembership").push({
      id: "m-b",
      schemeId: SCHEME,
      lotId: "lot-5",
      profileId: "treasurer-b",
      role: "OWNER",
      isActive: true,
    });
    await expect(
      authoriseOwnerCreditRefund({ schemeId: SCHEME, refundId: "refund-1", actorId: "treasurer-b" }),
    ).rejects.toThrow(/your own lot/);
  });

  it("lets an unrelated approver through to the payment policy", async () => {
    await expect(
      authoriseOwnerCreditRefund({ schemeId: SCHEME, refundId: "refund-1", actorId: "treasurer-c" }),
    ).rejects.toThrow(/policy should not be reached/);
  });
});
