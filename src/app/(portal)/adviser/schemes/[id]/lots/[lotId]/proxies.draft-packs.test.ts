/**
 * Proxy caps under the draft packs (VIC, ACT and WA stage 2, PR 8b-iv,
 * 29 Oct 2026). Those states have no buildings yet, so each pack is given
 * here as if it were live.
 * - checkProxyCapsAction warns, never refuses: Victoria's 1 lot owner cap
 *   and its holder in arrears (D15, D17), the ACT's share of the units with
 *   the rounding not confirmed, and nothing for Western Australia, NSW or
 *   Queensland, whose proxies are never read for it.
 * - createProxyAction saves the proxy whatever the caps say, and reads and
 *   writes as before (the NSW and Queensland golden pins that).
 * - The meeting page's warnings list each holder over the cap for the
 *   meeting's day (proxyWarningsForMeeting).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => [] as string[]);
const control = vi.hoisted(() => ({ authFails: false }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  const wrap = (orm: { public: object }) => ({
    public: new Proxy({}, { get: (_t, model: string) => (access.push(model), (orm.public as Record<string, object>)[model]) }),
  });
  return { db: { orm: wrap(sharedFake.db.orm), transaction: sharedFake.db.transaction } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", async () => {
  const { AuthorisationError } = await import("@/lib/auth/require-membership");
  return {
    requireSchemeAccess: vi.fn(async () => {
      if (control.authFails) throw new AuthorisationError("You do not have permission to do this.");
      return { profile: { id: "adviser" } };
    }),
  };
});
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}), recordActionInvocation: vi.fn(async () => {}) }));
// The draft packs, given as if live (they have no buildings yet).
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string) => {
      const pack = PENDING_RULE_PACKS[s as "VIC" | "ACT" | "WA"];
      return pack ? { pack, rules: pack.rules, label: `${pack.code} ${pack.version}` } : actual.rulesForState(s);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { checkProxyCapsAction, createProxyAction } = await import("./lot-workflow-actions");
const { proxyWarningsForMeeting } = await import("@/lib/meetings/proxy-caps-repo");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");

const ZONES: Record<string, string> = { VIC: "Australia/Melbourne", ACT: "Australia/Sydney", WA: "Australia/Perth", NSW: "Australia/Sydney", QLD: "Australia/Brisbane" };
const NO_DASH_OR_SEMICOLON = /[;–—]/;

function seed(state: string, n: number, proxies: Record<string, unknown>[] = [], notices: Record<string, unknown>[] = []) {
  const lots = Array.from({ length: n }, (_, i) => ({ id: `l${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable: true, entitlement: 10 }));
  const memberships = lots.map((l, i) => ({ id: `m${i + 1}`, schemeId: "s1", lotId: l.id, profileId: `p${i + 1}`, role: "OWNER", isActive: true, profile: { email: `owner${i + 1}@example.com` } }));
  sharedFake.reset({
    Scheme: [{ id: "s1", name: "Draft Towers", planNumber: "PS 1", state, timeZone: ZONES[state], totalLots: n, lots, memberships, funds: [], bankAccounts: [], images: [] }],
    Lot: lots,
    SchemeMembership: memberships,
    LotProxy: proxies.map((p, i) => ({ id: `px${i + 1}`, isActive: true, ...p })),
    LevyNotice: notices,
  });
  access.length = 0;
}

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const HOLDER = { proxyName: "Pat Holder", proxyEmail: "holder@example.com", meetingDate: "2026-11-20" };
const overdue = (lotId: string) => ({ id: `n-${lotId}`, schemeId: "s1", lotId, status: "ISSUED", dueDate: "2026-09-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" });

beforeEach(() => {
  control.authFails = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});

describe("checkProxyCapsAction", () => {
  it("Victoria, 20 or fewer occupiable lots: a second proxy for the meeting is over the 1 lot owner cap, warned only", async () => {
    seed("VIC", 15, [{ lotId: "l2", ...HOLDER, proxyEmail: "HOLDER@example.com" }]);
    const result = await checkProxyCapsAction("s1", "l1", form(HOLDER));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(/^Pat Holder holds 2 proxies for the meeting on 20 November 2026, over the limit of 1 proxy where there are 20 or fewer occupiable lots\./);
    for (const w of result.warnings!) expect(w).not.toMatch(NO_DASH_OR_SEMICOLON);
    // A proxy for another meeting does not count, and nothing is written.
    seed("VIC", 15, [{ lotId: "l2", ...HOLDER, meetingDate: "2026-12-20" }]);
    expect(await checkProxyCapsAction("s1", "l1", form(HOLDER))).toEqual({ warnings: [] });
    expect(sharedFake.table("LotProxy")).toHaveLength(1);
  });

  it("Victoria s 89C(10): a holder whose email is an owner's of a lot owing money on the meeting's day (D17)", async () => {
    seed("VIC", 15, [], [overdue("l3")]);
    const result = await checkProxyCapsAction("s1", "l1", form({ ...HOLDER, proxyEmail: " Owner3@Example.com " }));
    expect(result.warnings).toEqual([
      "Pat Holder's email matches the owner of lot 3, which owes the owners corporation money on 20 November 2026. An owner in arrears may not act as a proxy (Owners Corporations Act 2006 (Vic) s 89C(10)).",
    ]);
    // Paid, or owing only after the day: nothing.
    seed("VIC", 15, [], [{ ...overdue("l3"), dueDate: "2026-11-25" }]);
    expect((await checkProxyCapsAction("s1", "l1", form({ ...HOLDER, proxyEmail: "owner3@example.com" }))).warnings).toEqual([]);
  });

  it("the ACT, more than 20 units: a share of the units, rounding not confirmed", async () => {
    seed("ACT", 25, [{ lotId: "l2", ...HOLDER }]);
    const result = await checkProxyCapsAction("s1", "l1", form(HOLDER));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(/may be over the limit of 5% of 25 units, which is 1\.25\. Rounded down the limit is 1 proxy, rounded up 2 proxies\. How the share is rounded is not confirmed\. The limit does not apply to the chair of the meeting/);
  });

  it("Western Australia, NSW and Queensland: no caps, and no proxy is read", async () => {
    for (const state of ["WA", "NSW", "QLD"]) {
      seed(state, 5, [{ lotId: "l2", ...HOLDER }, { lotId: "l3", ...HOLDER }]);
      expect(await checkProxyCapsAction("s1", "l1", form(HOLDER)), state).toEqual({ warnings: [] });
      expect(access, state).toEqual(["Lot", "Scheme"]);
    }
  });

  it("refuses a meeting date that is not a date, and without permission", async () => {
    seed("VIC", 15);
    expect(await checkProxyCapsAction("s1", "l1", form({ ...HOLDER, meetingDate: "20/11/2026" }))).toEqual({ error: "Enter the meeting date as a date." });
    control.authFails = true;
    expect(await checkProxyCapsAction("s1", "l1", form(HOLDER))).toEqual({ error: "You do not have permission to do this." });
  });

  it("createProxyAction saves the proxy whatever the caps say (D15)", async () => {
    seed("VIC", 15, [{ lotId: "l2", ...HOLDER }, { lotId: "l3", ...HOLDER }]);
    expect(await createProxyAction("s1", "l1", form(HOLDER))).toEqual({});
    expect(sharedFake.table("LotProxy")).toHaveLength(3);
    expect(access).toEqual(["Lot", "LotProxy"]);
  });
});

describe("proxyWarningsForMeeting (the meeting page)", () => {
  it("lists each holder over the cap for the meeting's day, counting proxies with no meeting date", async () => {
    seed(
      "VIC",
      15,
      [
        { lotId: "l1", ...HOLDER },
        { lotId: "l2", ...HOLDER, meetingDate: null },
        { lotId: "l3", proxyName: "Sam Other", proxyEmail: null, meetingDate: "2026-11-20" },
        { lotId: "l4", proxyName: " sam  other ", proxyEmail: "", meetingDate: "2026-11-20" },
        { lotId: "l5", proxyName: "Lee Once", proxyEmail: "lee@example.com", meetingDate: "2026-11-20" },
        { lotId: "l6", ...HOLDER, meetingDate: "2026-12-20" },
        { lotId: "l7", ...HOLDER, isActive: false },
      ],
    );
    const scheme = sharedFake.table("Scheme")[0] as never;
    const out = await proxyWarningsForMeeting(PENDING_RULE_PACKS.VIC.rules as never, { ...(scheme as object), timeZone: "Australia/Melbourne" } as never, "2026-11-20");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^Pat Holder holds 2 proxies for the meeting on 20 November 2026, over the limit of 1 proxy/);
    expect(out[1]).toMatch(/^Sam Other holds 2 proxies for the meeting on 20 November 2026, over the limit of 1 proxy/);
  });

  it("reads the debts once for the page, whatever the number of holders (review L7)", async () => {
    seed(
      "VIC",
      15,
      [
        { lotId: "l5", proxyName: "Owner Three", proxyEmail: "owner3@example.com", meetingDate: "2026-11-20" },
        { lotId: "l6", proxyName: "Owner Four", proxyEmail: "owner4@example.com", meetingDate: "2026-11-20" },
        { lotId: "l7", proxyName: "Owner Nine", proxyEmail: "owner9@example.com", meetingDate: "2026-11-20" },
      ],
      [overdue("l3"), overdue("l9")],
    );
    const scheme = sharedFake.table("Scheme")[0] as never;
    const out = await proxyWarningsForMeeting(PENDING_RULE_PACKS.VIC.rules as never, scheme, "2026-11-20");
    expect(out).toEqual([
      expect.stringMatching(/^Owner Three's email matches the owner of lot 3, which owes/),
      expect.stringMatching(/^Owner Nine's email matches the owner of lot 9, which owes/),
    ]);
    expect(access.filter((a) => a === "LevyNotice")).toHaveLength(1);
  });

  it("reads nothing for a pack without caps", async () => {
    seed("WA", 5, [{ lotId: "l1", ...HOLDER }, { lotId: "l2", ...HOLDER }]);
    const scheme = sharedFake.table("Scheme")[0] as never;
    expect(await proxyWarningsForMeeting(PENDING_RULE_PACKS.WA.rules as never, scheme, "2026-11-20")).toEqual([]);
    expect(access).toEqual([]);
  });
});
