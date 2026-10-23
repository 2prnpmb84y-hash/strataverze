import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The owner portal's selected scheme (finding F1, SEC-023): the cookie is a
 * preference, not authority. A cookie naming a scheme the user is not an
 * active owner or committee member of must give nothing.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

const cookieValue = vi.fn();
vi.mock("@/lib/actions/scheme-selection", () => ({
  getSelectedSchemeId: () => cookieValue(),
}));

const currentProfile = vi.fn();
vi.mock("@/lib/queries/profiles", () => ({
  getCurrentProfile: () => currentProfile(),
}));

const membershipRows = vi.fn();
const whereSpy = vi.fn();
vi.mock("@/prisma/db", () => ({
  db: {
    orm: {
      public: {
        SchemeMembership: {
          where: (fn: unknown) => {
            whereSpy(fn);
            return { limit: () => ({ all: () => membershipRows() }) };
          },
        },
      },
    },
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));

const { resolveSelectedScheme, getSelectedOwnerScheme, getVerifiedSelectedSchemeId } = await import("./selected-scheme");

const profile = { id: "owner-1" };

beforeEach(() => {
  vi.clearAllMocks();
  currentProfile.mockResolvedValue(profile);
  cookieValue.mockResolvedValue(SCHEME_A);
});

describe("resolveSelectedScheme", () => {
  it("rejects a cookie for a scheme the user has no membership on", () => {
    expect(
      resolveSelectedScheme(SCHEME_B, [{ schemeId: SCHEME_A, role: "OWNER", isActive: true }]),
    ).toBeNull();
  });

  it("rejects an inactive membership", () => {
    expect(
      resolveSelectedScheme(SCHEME_A, [{ schemeId: SCHEME_A, role: "OWNER", isActive: false }]),
    ).toBeNull();
  });

  it("rejects a role that does not use the owner portal (supplier, accountant)", () => {
    expect(
      resolveSelectedScheme(SCHEME_A, [
        { schemeId: SCHEME_A, role: "SUPPLIER", isActive: true },
        { schemeId: SCHEME_A, role: "ACCOUNTANT", isActive: true },
      ]),
    ).toBeNull();
  });

  it("rejects a malformed cookie", () => {
    expect(resolveSelectedScheme("not-a-uuid", [{ schemeId: "not-a-uuid", role: "OWNER", isActive: true }])).toBeNull();
    expect(resolveSelectedScheme(null, [])).toBeNull();
  });

  it("reports committee only for committee of the selected scheme", () => {
    const memberships = [
      { schemeId: SCHEME_A, role: "OWNER", isActive: true },
      { schemeId: SCHEME_B, role: "COMMITTEE", isActive: true },
    ];
    expect(resolveSelectedScheme(SCHEME_A, memberships)).toEqual({ schemeId: SCHEME_A, roles: ["OWNER"] });
    expect(resolveSelectedScheme(SCHEME_B, memberships)).toEqual({ schemeId: SCHEME_B, roles: ["COMMITTEE"] });
  });

  it("accepts other roles when the caller asks for them", () => {
    const memberships = [{ schemeId: SCHEME_A, role: "PAYMENT_AUTHORISER", isActive: true }];
    expect(resolveSelectedScheme(SCHEME_A, memberships)).toBeNull();
    expect(resolveSelectedScheme(SCHEME_A, memberships, ["COMMITTEE", "PAYMENT_AUTHORISER"])).toEqual({
      schemeId: SCHEME_A,
      roles: ["PAYMENT_AUTHORISER"],
    });
  });
});

describe("getSelectedOwnerScheme", () => {
  it("returns null when the cookie names a scheme the user is not a member of", async () => {
    cookieValue.mockResolvedValue(SCHEME_B);
    membershipRows.mockResolvedValue([]); // no memberships on scheme B
    expect(await getSelectedOwnerScheme()).toBeNull();
    expect(await getVerifiedSelectedSchemeId()).toBeNull();
  });

  it("returns the scheme and the roles held on it for an active owner", async () => {
    membershipRows.mockResolvedValue([
      { schemeId: SCHEME_A, profileId: "owner-1", role: "OWNER", isActive: true, lotId: "lot-1" },
      { schemeId: SCHEME_A, profileId: "owner-1", role: "COMMITTEE", isActive: true, lotId: null },
    ]);
    const selected = await getSelectedOwnerScheme();
    expect(selected?.schemeId).toBe(SCHEME_A);
    expect(selected?.roles.sort()).toEqual(["COMMITTEE", "OWNER"]);
    expect(await getVerifiedSelectedSchemeId()).toBe(SCHEME_A);
  });

  it("does not query with a malformed cookie", async () => {
    cookieValue.mockResolvedValue("'; drop table schemes; --");
    expect(await getSelectedOwnerScheme()).toBeNull();
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("returns null when nobody is signed in", async () => {
    currentProfile.mockResolvedValue(null);
    expect(await getSelectedOwnerScheme()).toBeNull();
  });
});
