import { beforeEach, describe, expect, it, vi } from "vitest";

/** loadSessionState: the shared S4/S5 check used by every request. */
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
const check = vi.fn();
vi.mock("./session-register", () => ({ checkAndTouchSession: (i: unknown) => check(i) }));

const { sharedFake } = await import("@/test/fake-orm");
const { loadSessionState } = await import("./session-state");

const nowS = Math.floor(Date.now() / 1000);
function token(claims: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}
const user = { id: "a1", email: "x@example.invalid", factors: [] } as never;
const goodClaims = { sub: "a1", session_id: "s1", aal: "aal1", amr: [{ method: "password", timestamp: nowS - 60 }] };

beforeEach(() => {
  check.mockReset();
  check.mockResolvedValue({ ok: true, touch: false });
  sharedFake.reset({
    Profile: [{ id: "p1", authId: "a1", isPlatformAdmin: false, sessionsRevokedAt: null }],
    SchemeMembership: [],
  });
});

describe("loadSessionState", () => {
  it("returns the active session", async () => {
    const r = await loadSessionState(user, token(goodClaims), { createProfile: true });
    expect(r.kind).toBe("active");
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s1", profileId: "p1", privileged: false }));
  });

  it("uses the privileged limits for someone MFA is mandatory for", async () => {
    sharedFake.reset({
      Profile: [{ id: "p1", authId: "a1", isPlatformAdmin: false, sessionsRevokedAt: null }],
      SchemeMembership: [{ id: "m1", profileId: "p1", role: "ADVISER", isActive: true }],
    });
    await loadSessionState(user, token(goodClaims), { createProfile: true });
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ privileged: true }));
  });

  it("reports an ended session", async () => {
    check.mockResolvedValue({ ok: false, reason: "idle" });
    expect(await loadSessionState(user, token(goodClaims), { createProfile: true })).toEqual({
      kind: "ended",
      reason: "idle",
    });
  });

  it("fails closed without a session id or sign-in time", async () => {
    for (const claims of [
      { ...goodClaims, session_id: undefined },
      { ...goodClaims, amr: [] },
      { ...goodClaims, sub: "someone-else" },
    ]) {
      expect((await loadSessionState(user, token(claims), { createProfile: true })).kind).toBe("ended");
    }
    expect((await loadSessionState(user, null, { createProfile: true })).kind).toBe("ended");
    expect(check).not.toHaveBeenCalled();
  });

  it("does not create a profile from the proxy", async () => {
    sharedFake.reset({ Profile: [], SchemeMembership: [] });
    expect(await loadSessionState(user, token(goodClaims), { createProfile: false })).toEqual({ kind: "no-profile" });
  });
});
