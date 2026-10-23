import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Supplier work order status (finding F16), called directly as an attacker
 * would: the work order must be awarded to the caller, the caller must hold
 * an active SUPPLIER membership on its scheme, and only forward moves apply.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";

const auth = vi.fn();
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>(
    "@/lib/auth/require-membership",
  );
  return {
    ...actual,
    requireAuth: () => auth(),
    requireSchemeMembership: (...a: unknown[]) => membership(...a),
  };
});

const woFirst = vi.fn();
const woUpdate = vi.fn();
vi.mock("@/prisma/db", () => ({
  db: {
    orm: {
      public: {
        WorkOrder: { where: () => ({ first: woFirst, update: woUpdate }) },
        Invoice: { create: vi.fn() },
      },
    },
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const logActivity = vi.fn();
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const { updateWorkOrderStatusAction } = await import("./actions");
const { AuthorisationError } = await import("@/lib/auth/require-membership");

const awarded = { id: "wo-1", schemeId: SCHEME_A, supplierId: "supplier-me", status: "AWARDED", deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ id: "supplier-me" });
  membership.mockResolvedValue({ profile: { id: "supplier-me" }, membership: {}, roles: ["SUPPLIER"] });
  woFirst.mockResolvedValue(awarded);
});

describe("updateWorkOrderStatusAction (supplier)", () => {
  it("starts an awarded job for its supplier", async () => {
    const r = await updateWorkOrderStatusAction("wo-1", "IN_PROGRESS");
    expect(r).toEqual({});
    expect(membership).toHaveBeenCalledWith(SCHEME_A, ["SUPPLIER"]);
    expect(woUpdate).toHaveBeenCalledWith({ status: "IN_PROGRESS" });
  });

  it("completes a job in progress and stamps the completion time", async () => {
    woFirst.mockResolvedValue({ ...awarded, status: "IN_PROGRESS" });
    const r = await updateWorkOrderStatusAction("wo-1", "COMPLETED");
    expect(r).toEqual({});
    expect(woUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED", completedAt: expect.any(String) }));
  });

  it("rejects a work order awarded to another supplier", async () => {
    woFirst.mockResolvedValue({ ...awarded, supplierId: "rival" });
    const r = await updateWorkOrderStatusAction("wo-1", "IN_PROGRESS");
    expect(r.error).toBe("Work order not found.");
    expect(woUpdate).not.toHaveBeenCalled();
  });

  it("rejects a supplier whose membership on the scheme is no longer active", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    const r = await updateWorkOrderStatusAction("wo-1", "IN_PROGRESS");
    expect(r.error).toMatch(/permission/);
    expect(woUpdate).not.toHaveBeenCalled();
  });

  it("rejects skipping straight to completed", async () => {
    const r = await updateWorkOrderStatusAction("wo-1", "COMPLETED");
    expect(r.error).toMatch(/not allowed/);
    expect(woUpdate).not.toHaveBeenCalled();
  });

  it("rejects re-opening a completed or cancelled job", async () => {
    for (const status of ["COMPLETED", "CANCELLED"]) {
      woFirst.mockResolvedValue({ ...awarded, status });
      const r = await updateWorkOrderStatusAction("wo-1", "IN_PROGRESS");
      expect(r.error).toMatch(/not allowed/);
    }
    expect(woUpdate).not.toHaveBeenCalled();
  });

  it("rejects a missing (or deleted) work order", async () => {
    woFirst.mockResolvedValue(null);
    const r = await updateWorkOrderStatusAction("wo-x", "IN_PROGRESS");
    expect(r.error).toBe("Work order not found.");
  });
});
