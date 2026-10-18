import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorisationError } from "./require-membership";

// Mock dependencies before importing the module under test
vi.mock("@/lib/queries/profiles", () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock("@/prisma/db", () => ({
  db: {
    orm: {
      public: {
        SchemeMembership: {
          where: vi.fn(() => ({
            first: vi.fn(),
          })),
        },
      },
    },
  },
}));

vi.mock("@prisma/orm-postgres/orm-client", () => ({
  and: (...conditions: unknown[]) => conditions,
}));

describe("AuthorisationError", () => {
  it("is an instance of Error", () => {
    const err = new AuthorisationError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthorisationError);
  });

  it("carries the correct name", () => {
    const err = new AuthorisationError("test message");
    expect(err.name).toBe("AuthorisationError");
    expect(err.message).toBe("test message");
  });
});

describe("requireSchemeMembership", () => {
  let getCurrentProfile: ReturnType<typeof vi.fn>;
  let membershipFirst: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const profilesModule = await import("@/lib/queries/profiles");
    getCurrentProfile = profilesModule.getCurrentProfile as ReturnType<typeof vi.fn>;

    const dbModule = await import("@/prisma/db");
    membershipFirst = vi.fn();
    (dbModule.db.orm.public.SchemeMembership.where as ReturnType<typeof vi.fn>).mockReturnValue({
      first: membershipFirst,
    });
  });

  it("throws AuthorisationError when user is not authenticated", async () => {
    getCurrentProfile.mockResolvedValue(null);

    const { requireSchemeMembership } = await import("./require-membership");

    await expect(
      requireSchemeMembership("scheme-1", ["ADVISER"]),
    ).rejects.toThrow(AuthorisationError);

    await expect(
      requireSchemeMembership("scheme-1", ["ADVISER"]),
    ).rejects.toThrow("You must be signed in.");
  });

  it("throws AuthorisationError when user has no membership", async () => {
    getCurrentProfile.mockResolvedValue({ id: "profile-1" });
    membershipFirst.mockResolvedValue(null);

    const { requireSchemeMembership } = await import("./require-membership");

    await expect(
      requireSchemeMembership("scheme-1", ["ADVISER"]),
    ).rejects.toThrow(AuthorisationError);
  });

  it("throws AuthorisationError when user has wrong role", async () => {
    getCurrentProfile.mockResolvedValue({ id: "profile-1" });
    membershipFirst.mockResolvedValue({
      schemeId: "scheme-1",
      profileId: "profile-1",
      role: "OWNER",
      isActive: true,
    });

    const { requireSchemeMembership } = await import("./require-membership");

    await expect(
      requireSchemeMembership("scheme-1", ["ADVISER"]),
    ).rejects.toThrow("You do not have permission to perform this action.");
  });

  it("returns profile and membership on success", async () => {
    const mockProfile = { id: "profile-1" };
    const mockMembership = {
      schemeId: "scheme-1",
      profileId: "profile-1",
      role: "ADVISER",
      isActive: true,
    };

    getCurrentProfile.mockResolvedValue(mockProfile);
    membershipFirst.mockResolvedValue(mockMembership);

    const { requireSchemeMembership } = await import("./require-membership");

    const result = await requireSchemeMembership("scheme-1", ["ADVISER"]);
    expect(result.profile).toBe(mockProfile);
    expect(result.membership).toBe(mockMembership);
  });

  it("accepts multiple allowed roles", async () => {
    const mockProfile = { id: "profile-1" };
    const mockMembership = {
      schemeId: "scheme-1",
      profileId: "profile-1",
      role: "COMMITTEE",
      isActive: true,
    };

    getCurrentProfile.mockResolvedValue(mockProfile);
    membershipFirst.mockResolvedValue(mockMembership);

    const { requireSchemeMembership } = await import("./require-membership");

    const result = await requireSchemeMembership("scheme-1", [
      "OWNER",
      "COMMITTEE",
      "ADVISER",
    ]);
    expect(result.membership.role).toBe("COMMITTEE");
  });
});

describe("requireAuth", () => {
  let getCurrentProfile: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const profilesModule = await import("@/lib/queries/profiles");
    getCurrentProfile = profilesModule.getCurrentProfile as ReturnType<typeof vi.fn>;
  });

  it("throws AuthorisationError when user is not authenticated", async () => {
    getCurrentProfile.mockResolvedValue(null);

    const { requireAuth } = await import("./require-membership");

    await expect(requireAuth()).rejects.toThrow(AuthorisationError);
    await expect(requireAuth()).rejects.toThrow("You must be signed in.");
  });

  it("returns profile when authenticated", async () => {
    const mockProfile = { id: "profile-1", email: "test@example.com" };
    getCurrentProfile.mockResolvedValue(mockProfile);

    const { requireAuth } = await import("./require-membership");

    const result = await requireAuth();
    expect(result).toBe(mockProfile);
  });
});
