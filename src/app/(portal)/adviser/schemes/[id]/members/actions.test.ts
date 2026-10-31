import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may send an invitation (security stage S2a): the building's Adviser or
 * a StrataVerze platform admin, with a recent authenticator check, enforced
 * in the server action. Synthetic data only (SP 99999).
 */

const SCHEME = "99999999-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  caller: { id: "p-caller", firstName: "Casey", lastName: "Caller", isPlatformAdmin: false },
  roles: {} as Record<string, string[]>,
  stepUpFails: false,
  issued: [] as Record<string, unknown>[],
  emailed: true,
}));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/errors")>("@/lib/auth/errors");
  return {
    AuthorisationError: actual.AuthorisationError,
    requireAuth: vi.fn(async () => state.caller),
    requirePlatformAdmin: vi.fn(async () => {
      if (!state.caller.isPlatformAdmin) throw new actual.AuthorisationError("Only StrataVerze staff can do this.");
      return state.caller;
    }),
  };
});
// AuthorisationError comes from its own module: importing require-membership
// inside these factories would wait on itself (it imports mfa-enforcement).
vi.mock("@/lib/auth/require-access", async () => {
  const { AuthorisationError } = await vi.importActual<typeof import("@/lib/auth/errors")>("@/lib/auth/errors");
  return {
    requireSchemeAccess: vi.fn(async (schemeId: string) => {
      const roles = state.roles[schemeId] ?? [];
      if (!roles.includes("ADVISER")) throw new AuthorisationError("You do not have permission to perform this action.");
      return { profile: state.caller, roles };
    }),
  };
});
vi.mock("@/lib/auth/mfa-enforcement", async () => {
  const { AuthorisationError } = await vi.importActual<typeof import("@/lib/auth/errors")>("@/lib/auth/errors");
  return {
    requireRecentMfa: vi.fn(async () => {
      if (state.stepUpFails) throw new AuthorisationError("For your security, confirm it is you first.");
    }),
  };
});
vi.mock("@/lib/invitations/issue", () => ({
  issueInvitation: vi.fn(async (input: Record<string, unknown>) => {
    state.issued.push(input);
    return { ok: true, invitationId: "inv-1", email: String(input.email).toLowerCase(), role: input.role, expiresAt: new Date("2026-11-16T00:00:00Z"), emailed: state.emailed };
  }),
}));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/invitations", () => ({ revokeInvitation: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/capture", () => ({ quoteUsageFee: vi.fn(async () => null) }));

const { sharedFake } = await import("@/test/fake-orm");
const { sendInvitationAction, revokeInvitationAction } = await import("./actions");
const { revokeInvitation } = await import("@/lib/queries/invitations");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const send = () => sendInvitationAction(SCHEME, {}, form({ email: "new.owner@example.test", role: "OWNER", lotId: "lot-1" }));

beforeEach(() => {
  state.caller = { id: "p-caller", firstName: "Casey", lastName: "Caller", isPlatformAdmin: false };
  state.roles = {};
  state.stepUpFails = false;
  state.issued = [];
  state.emailed = true;
  vi.mocked(revokeInvitation).mockClear();
  sharedFake.reset({
    Scheme: [{ id: SCHEME, name: "SP 99999 Test Towers" }],
    Invitation: [{ id: "inv-1", schemeId: SCHEME, email: "new.owner@example.test", role: "OWNER", status: "PENDING" }],
  });
});

describe("sending an invitation", () => {
  it("lets the building's Adviser send one", async () => {
    state.roles[SCHEME] = ["ADVISER"];
    const r = await send();
    expect(r.success).toContain("Invitation sent to new.owner@example.test");
    expect(state.issued).toEqual([expect.objectContaining({ schemeId: SCHEME, role: "OWNER", lotId: "lot-1", actorRole: "ADVISER" })]);
  });

  it("lets a platform admin send one to a building they are not a member of", async () => {
    state.caller.isPlatformAdmin = true;
    const r = await send();
    expect(r.success).toBeTruthy();
    expect(state.issued[0]).toMatchObject({ actorRole: "platform_admin" });
  });

  it("refuses a platform admin for a building that does not exist", async () => {
    state.caller.isPlatformAdmin = true;
    const r = await sendInvitationAction("00000000-0000-4000-8000-000000000000", {}, form({ email: "a@example.test", role: "OWNER" }));
    expect(r.error).toContain("permission");
    expect(state.issued).toHaveLength(0);
  });

  it("refuses owners, committee members and Advisers of other buildings", async () => {
    for (const roles of [["OWNER"], ["COMMITTEE"], ["ACCOUNTANT"], []]) {
      state.roles = { [SCHEME]: roles, other: ["ADVISER"] };
      const r = await send();
      expect(r.error).toContain("permission");
    }
    expect(state.issued).toHaveLength(0);
  });

  it("needs a recent authenticator check", async () => {
    state.roles[SCHEME] = ["ADVISER"];
    state.stepUpFails = true;
    const r = await send();
    expect(r.error).toContain("confirm it is you");
    expect(state.issued).toHaveLength(0);
  });

  it("says plainly when the email could not be sent", async () => {
    state.roles[SCHEME] = ["ADVISER"];
    state.emailed = false;
    const r = await send();
    expect(r.error).toContain("saved, but the email could not be sent");
  });
});

describe("revoking an invitation", () => {
  it("is open to the same people as sending, and refuses others", async () => {
    state.roles[SCHEME] = ["OWNER"];
    expect((await revokeInvitationAction(SCHEME, "inv-1")).error).toContain("permission");
    expect(revokeInvitation).not.toHaveBeenCalled();
    state.caller.isPlatformAdmin = true;
    expect(await revokeInvitationAction(SCHEME, "inv-1")).toEqual({});
    expect(revokeInvitation).toHaveBeenCalledWith(SCHEME, "inv-1");
  });
});
