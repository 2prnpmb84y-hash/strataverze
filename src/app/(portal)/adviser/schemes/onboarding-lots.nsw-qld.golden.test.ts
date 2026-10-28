/**
 * The Add Property wizard's lots for NSW and Queensland buildings, unchanged
 * by Victoria's second schedule (VIC, ACT and WA stage 2, PR 4). The
 * snapshots were recorded on feat/fund-conditions (2b04048), before the
 * change, and must match byte for byte: what createSchemeAction returns and
 * what it passes to createScheme for each set of lots.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createScheme: vi.fn(async () => ({ id: "scheme-1" })),
  stage: vi.fn(async (): Promise<string | null> => "batch-1"),
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "admin", isPlatformAdmin: true })) }));
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, platformToday: () => "2026-10-27", todayIn: () => "2026-10-27" };
});
vi.mock("@/lib/storage/client-upload", () => ({ stageUpload: vi.fn() }));
vi.mock("@/lib/actions/scheme-photo", () => ({ setSchemePhotoAction: vi.fn() }));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requirePlatformAdmin: vi.fn(async () => ({ id: "admin" })) };
});
vi.mock("@/lib/auth/mfa-enforcement", () => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/schemes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/schemes")>("@/lib/queries/schemes");
  return { createScheme: mocks.createScheme, updateScheme: vi.fn(), deleteScheme: vi.fn(), SchemeDataError: actual.SchemeDataError };
});
vi.mock("@/lib/onboarding/stage-opening-cutover", () => ({ stageOnboardingCutover: mocks.stage }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/prisma/db", () => {
  const chain = { where: () => chain, first: async () => null };
  return { db: { orm: { public: { Scheme: chain } } } };
});
vi.mock("@/config/jurisdictions", async () => {
  const actual = await vi.importActual<typeof import("@/config/jurisdictions")>("@/config/jurisdictions");
  const states = ["NSW", "QLD"] as const;
  return {
    ...actual,
    SUPPORTED_SCHEME_STATES: states,
    SCHEME_STATE_OPTIONS: states.map((s) => ({ value: s, label: actual.STATE_NAMES[s] })),
    schemeStateProblem: (s: string | null | undefined) => (String(s ?? "").toUpperCase() === "QLD" ? null : actual.schemeStateProblem(s)),
    schemeLocationProblems: (next: { state: string | null | undefined; postcode: string | null | undefined }, stored?: never) =>
      String(next.state ?? "").toUpperCase() === "QLD" ? {} : actual.schemeLocationProblems(next, stored),
  };
});
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (state: string | null | undefined) =>
      String(state ?? "").toUpperCase() === "QLD" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(state),
  };
});

const { createSchemeAction } = await import("./actions");

function form(state: "NSW" | "QLD", lots: unknown) {
  const fd = new FormData();
  const all: Record<string, string> = {
    name: "Harbour View",
    planNumber: "12345",
    address: "1 Harbour St",
    suburb: state === "QLD" ? "Brisbane City" : "Sydney",
    state,
    postcode: state === "QLD" ? "4000" : "2000",
    totalLots: "2",
    totalEntitlement: "100",
    financialYearEnd: "2027-06-30",
    ...(state === "QLD" ? { regulationModule: "STANDARD", planFormat: "BUILDING" } : {}),
  };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  fd.set("lotsJson", JSON.stringify(lots));
  const fund = { cashAtBank: "", leviesReceivable: "", leviesInAdvance: "", creditors: "", fundBalance: "" };
  fd.set("balancesJson", JSON.stringify({ takeoverDate: "2026-10-01", totalBalance: "0", admin: fund, capitalWorks: fund }));
  fd.set("lotBalancesJson", JSON.stringify([{ lotNumber: "1" }, { lotNumber: "2" }]));
  return fd;
}

const row = (lotNumber: string, entitlement: string, second?: string, extra: Record<string, string> = {}) => ({
  lotNumber,
  unitNumber: "",
  entitlement,
  ownerName: `Owner ${lotNumber}`,
  ...(second !== undefined ? { interestScheduleEntitlement: second } : {}),
  ...extra,
});

beforeEach(() => mocks.createScheme.mockClear());

describe.each(["NSW", "QLD"] as const)("%s createSchemeAction lots", (state) => {
  it.each([
    ["both values", [row("1", "40", "45"), row("2", "60", "55")]],
    ["no second values", [row("1", "40"), row("2", "60")]],
    ["second values empty and bad", [row("1", "40", ""), row("2", "60", "x")]],
    ["second value 0", [row("1", "40", "0"), row("2", "60", "55")]],
    ["another key", [row("1", "40", undefined, { lotEntitlement: "45" }), row("2", "60", undefined, { lotEntitlement: "55" })]],
  ])("%s", async (_name, lots) => {
    const result = await createSchemeAction({}, form(state, lots)).catch((err: unknown) => String(err));
    expect({ result, calls: mocks.createScheme.mock.calls.map((c) => (c as unknown[])[2]) }).toMatchSnapshot();
  });
});
