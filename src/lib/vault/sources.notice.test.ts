/**
 * An issued meeting notice in the vault (VIC, ACT and WA stage 2, PR 8b-iii
 * review L1, 29 Oct 2026): a notice whose period was not checked (stored as
 * not compliant with no period, decision D12) says so in its vault copy.
 * Every other notice, and so every NSW and Queensland one, is copied with
 * exactly the keys it had before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => [] as Array<{ body: Record<string, unknown>; fileName: string }>);

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn() }));
vi.mock("@/lib/storage/server-storage", () => ({ downloadObject: vi.fn() }));
vi.mock("./capture", () => ({
  appendVaultEvent: vi.fn(),
  getTrialVault: vi.fn(async () => ({ id: "v1" })),
  captureFile: vi.fn(async (a: { bytes: Uint8Array; fileName: string }) => {
    captured.push({ body: JSON.parse(new TextDecoder().decode(a.bytes)), fileName: a.fileName });
    return { ok: true };
  }),
}));

const { sharedFake } = await import("@/test/fake-orm");
const { captureMeetingNotice } = await import("./sources");

const MEETING = { id: "m1", schemeId: "s1", title: "Committee meeting", meetingType: "COMMITTEE", scheduledAt: "2026-11-02T08:00:00.000Z" };
const notice = (compliant: boolean, noticePeriodDays: number | null) => ({
  id: "n1",
  meetingId: "m1",
  version: 1,
  status: "ISSUED",
  issuedAt: "2026-10-05T23:00:00.000Z",
  issuedById: "adviser",
  noticePeriodDays,
  compliant,
  content: { heading: "NOTICE" },
});
const BEFORE_KEYS = ["compliant", "content", "id", "issuedAt", "issuedById", "noticePeriodDays", "status", "version"];

async function copyOf(n: ReturnType<typeof notice>) {
  sharedFake.reset({ Notice: [n], Meeting: [MEETING] });
  captured.length = 0;
  await captureMeetingNotice("n1", "adviser");
  expect(captured).toHaveLength(1);
  return captured[0].body.notice as Record<string, unknown>;
}

beforeEach(() => vi.clearAllMocks());

describe("captureMeetingNotice", () => {
  it("marks a notice whose period was not checked (not compliant, no period)", async () => {
    const copy = await copyOf(notice(false, null));
    expect(copy).toMatchObject({ compliant: false, noticePeriodDays: null, periodNotChecked: true });
    expect(Object.keys(copy).sort()).toEqual([...BEFORE_KEYS, "periodNotChecked"].sort());
  });

  it("copies every other notice with exactly the keys it had before", async () => {
    for (const [compliant, days] of [[true, 14], [false, 14], [true, null], [true, 21], [false, 21]] as const) {
      const copy = await copyOf(notice(compliant, days));
      expect(Object.keys(copy).sort(), `${compliant} ${days}`).toEqual(BEFORE_KEYS);
      expect(copy).toMatchObject({ compliant, noticePeriodDays: days });
    }
  });
});
