import { describe, expect, it, vi } from "vitest";

/**
 * The first credit on a lot creates its balance row (25 Oct 2026 fix). The
 * row must carry only its own columns: Prisma 8 refuses unknown fields
 * ("Unknown column type"), which the in-memory database would not notice.
 */
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { recordCreditMovement } = await import("./owner-credits");

describe("the first owner credit on a lot", () => {
  it("creates the balance row with its own columns only", async () => {
    sharedFake.reset({ OwnerCreditTransaction: [], OwnerCreditBalance: [] });
    await recordCreditMovement(sharedFake.db.orm as never, {
      schemeId: "s1",
      lotId: "l1",
      fundId: "f1",
      ownerId: "o1",
      type: "OVERPAYMENT",
      amountCents: 12345,
      levyNoticeId: "n1",
      createdBy: "adviser",
      effectiveDate: "2026-10-25",
    });
    const [row] = sharedFake.table("OwnerCreditBalance");
    expect(Object.keys(row).sort()).toEqual(["balance", "fundId", "id", "lotId", "ownerId", "schemeId", "updatedAt"]);
    expect(row).toMatchObject({ schemeId: "s1", lotId: "l1", fundId: "f1", ownerId: "o1" });
  });
});
