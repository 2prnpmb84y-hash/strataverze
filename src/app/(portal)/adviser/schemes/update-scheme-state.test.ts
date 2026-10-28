/**
 * Editing a building's state and plan number (QLD switch-on review,
 * 28 Oct 2026), on the in-memory database with the real rule packs.
 *
 * - A building's state decides its rule pack, so once it has funds, lots or
 *   notices its state cannot be changed: an NSW building in use cannot be
 *   moved to Queensland. An edit that keeps the state is unchanged.
 * - Plan numbers are unique within each state: a building moved to
 *   Queensland must not take a Queensland building's plan number, and may
 *   take one only an NSW building has.
 */
import { describe, expect, it, vi } from "vitest";
import { currentYearEnd } from "@/lib/onboarding/property-onboarding";
import { todayIn } from "@/lib/jurisdiction/time-zone";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/auth/building-lock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/building-lock")>("@/lib/auth/building-lock");
  // StrataVerze staff, who may change the locked building record.
  return { ...actual, requireRolesOrAdmin: vi.fn(async () => ({ profile: { id: "admin" }, isAdmin: true })) };
});
vi.mock("@/lib/auth/mfa-enforcement", () => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const { sharedFake } = await import("@/test/fake-orm");
const { updateSchemeAction } = await import("./actions");

const NSW_BUILDING = {
  id: "s1",
  name: "Harbour View",
  planNumber: "SP 12345",
  address: "1 Harbour St",
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  timeZone: "Australia/Sydney",
  totalLots: 2,
  totalEntitlement: 100,
  financialYearEnd: "06-30",
};
const QLD_BUILDING = { ...NSW_BUILDING, id: "q1", name: "Riverside", planNumber: "SP 777", state: "QLD", postcode: "4000", timeZone: "Australia/Brisbane" };
const REFUSED =
  "The state cannot be changed, because this building already has funds, lots or notices set up under its current state's rules. If the state is wrong, the building needs to be set up again in the right state.";

function form(fields: Record<string, string> = {}) {
  const state = fields.state ?? "NSW";
  const fd = new FormData();
  const all: Record<string, string> = {
    name: NSW_BUILDING.name,
    planNumber: NSW_BUILDING.planNumber,
    address: NSW_BUILDING.address,
    suburb: NSW_BUILDING.suburb,
    state,
    postcode: NSW_BUILDING.postcode,
    totalLots: "2",
    totalEntitlement: "100",
    financialYearEnd: currentYearEnd("06-30", todayIn(state === "QLD" ? "Australia/Brisbane" : "Australia/Sydney")),
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  return fd;
}

function seed(records: { Fund?: unknown[]; Lot?: unknown[]; LevyNotice?: unknown[] } = {}) {
  sharedFake.reset({
    Scheme: [{ ...NSW_BUILDING }, { ...QLD_BUILDING }],
    Fund: [],
    Lot: [],
    LevyNotice: [],
    SchemeSelectorValue: [],
    ...(records as Record<string, Record<string, unknown>[]>),
  });
  sharedFake.setUniqueKeys({ Scheme: [["state", "planNumber"]] });
}

const building = () => sharedFake.table("Scheme").find((s) => s.id === "s1")!;
const toQld = (fields: Record<string, string> = {}) => updateSchemeAction("s1", {}, form({ state: "QLD", postcode: "4000", ...fields }));

describe("moving a building in use to another state", () => {
  it.each([
    ["funds", { Fund: [{ id: "f1", schemeId: "s1", fundType: "ADMINISTRATIVE" }] }],
    ["lots", { Lot: [{ id: "l1", schemeId: "s1", lotNumber: "1" }] }],
    ["notices", { LevyNotice: [{ id: "n1", schemeId: "s1", lotId: "l1" }] }],
  ])("is refused once it has %s, and nothing changes", async (_what, records) => {
    seed(records);
    expect(await toQld()).toEqual({ fieldErrors: { state: REFUSED } });
    expect(building()).toEqual(NSW_BUILDING);
  });

  it("does not count another building's records", async () => {
    seed({ Fund: [{ id: "f9", schemeId: "q1", fundType: "ADMINISTRATIVE" }] });
    expect(await toQld()).toEqual({});
    expect(building()).toMatchObject({ state: "QLD", postcode: "4000", timeZone: "Australia/Brisbane" });
  });
});

describe("an NSW building's edit that keeps its state", () => {
  it("is saved as before, whatever the building holds", async () => {
    seed({
      Fund: [{ id: "f1", schemeId: "s1", fundType: "ADMINISTRATIVE" }],
      Lot: [{ id: "l1", schemeId: "s1", lotNumber: "1" }],
      LevyNotice: [{ id: "n1", schemeId: "s1", lotId: "l1" }],
    });
    expect(await updateSchemeAction("s1", {}, form({ name: "Harbour View Towers", postcode: "2060" }))).toEqual({});
    expect(building()).toMatchObject({ name: "Harbour View Towers", state: "NSW", postcode: "2060", timeZone: "Australia/Sydney" });
  });
});

describe("the plan number when a building moves from NSW to Queensland", () => {
  it("is refused when a Queensland building already has it", async () => {
    seed();
    expect(await toQld({ planNumber: "SP 777" })).toEqual({
      fieldErrors: { planNumber: "A Queensland building with this plan number is already registered." },
    });
    expect(building()).toEqual(NSW_BUILDING);
  });

  it("is saved when no Queensland building has it, even if an NSW building does", async () => {
    sharedFake.reset({ Scheme: [{ ...NSW_BUILDING }, { ...QLD_BUILDING }, { ...NSW_BUILDING, id: "s2", planNumber: "SP 4000" }], Fund: [], Lot: [], LevyNotice: [], SchemeSelectorValue: [] });
    sharedFake.setUniqueKeys({ Scheme: [["state", "planNumber"]] });
    expect(await toQld({ planNumber: "SP 4000" })).toEqual({});
    expect(building()).toMatchObject({ state: "QLD", planNumber: "SP 4000" });
  });
});
