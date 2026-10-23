import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The session register: first sight creates a row, activity is recorded,
 * timeouts and revocations end the session (and set revoked_at, which the
 * database trigger turns into an auth.sessions delete).
 */
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { checkAndTouchSession, revokeAllSessions } = await import("./session-register");

const MIN = 60_000;
const now = Date.UTC(2026, 9, 23, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

type Rows = Record<string, unknown>[];
const rows = (model: string) => (sharedFake as unknown as { tables: Record<string, Rows> }).tables[model] ?? [];

beforeEach(() => {
  sharedFake.reset({
    AppSession: [],
    Profile: [{ id: "p1", authId: "a1", sessionsRevokedAt: null }],
  });
});

const base = { sessionId: "s1", profileId: "p1", authenticatedAtMs: now - 10 * MIN, revokedBefore: null, privileged: true };

describe("checkAndTouchSession", () => {
  it("registers a new session and lets it continue", async () => {
    expect(await checkAndTouchSession({ ...base, nowMs: now })).toMatchObject({ ok: true });
    expect(rows("AppSession")).toHaveLength(1);
    expect(rows("AppSession")[0]).toMatchObject({ id: "s1", profileId: "p1" });
  });

  it("ends a privileged session after 30 minutes idle and records why", async () => {
    await checkAndTouchSession({ ...base, nowMs: now });
    const later = now + 31 * MIN;
    expect(await checkAndTouchSession({ ...base, nowMs: later })).toEqual({ ok: false, reason: "idle" });
    expect(rows("AppSession")[0]).toMatchObject({ revokedAt: iso(later), revokedReason: "idle" });
    // Still ended on the next request.
    expect(await checkAndTouchSession({ ...base, nowMs: later + MIN })).toEqual({ ok: false, reason: "revoked" });
  });

  it("keeps an active session alive by recording activity", async () => {
    await checkAndTouchSession({ ...base, nowMs: now });
    await checkAndTouchSession({ ...base, nowMs: now + 20 * MIN });
    expect(await checkAndTouchSession({ ...base, nowMs: now + 40 * MIN })).toMatchObject({ ok: true });
  });

  it("keeps the first sign-in time, so a later token cannot extend the absolute limit", async () => {
    await checkAndTouchSession({ ...base, nowMs: now });
    const at = now + 12 * 60 * MIN;
    expect(
      await checkAndTouchSession({ ...base, authenticatedAtMs: at - MIN, nowMs: at }),
    ).toEqual({ ok: false, reason: "absolute" });
  });

  it("refuses a session id registered to another profile", async () => {
    await checkAndTouchSession({ ...base, nowMs: now });
    expect(await checkAndTouchSession({ ...base, profileId: "p2", nowMs: now + MIN })).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  it("ends sessions that signed in before sign out everywhere", async () => {
    await checkAndTouchSession({ ...base, nowMs: now });
    await revokeAllSessions("p1", now + MIN);
    const revokedBefore = rows("Profile")[0].sessionsRevokedAt as string;
    expect(revokedBefore).toBe(iso(now + MIN));
    expect(await checkAndTouchSession({ ...base, revokedBefore, nowMs: now + 2 * MIN })).toEqual({
      ok: false,
      reason: "revoked",
    });
    // A new sign-in afterwards is fine.
    expect(
      await checkAndTouchSession({
        ...base,
        sessionId: "s2",
        authenticatedAtMs: now + 3 * MIN,
        revokedBefore,
        nowMs: now + 3 * MIN,
      }),
    ).toMatchObject({ ok: true });
  });
});
