/**
 * Victoria's lot entitlement in the Add Property wizard and on the lot form
 * (VIC, ACT and WA stage 2, PR 4). The pending Victorian pack is injected as
 * a supported state, as the Queensland onboarding tests injected theirs. The
 * wizard asks for each lot's lot liability and lot entitlement, sends the
 * lot entitlement under its own field, checks it and passes it on to
 * createScheme. The lot form asks for it under the pack's label.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

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
  return { ...actual, platformToday: () => "2026-10-28", todayIn: () => "2026-10-28" };
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
vi.mock("@/app/(portal)/adviser/schemes/[id]/lots/actions", () => ({ createLotAction: vi.fn(), updateLotAction: vi.fn() }));
// Victoria as a supported state, with the pending Victorian pack.
vi.mock("@/config/jurisdictions", async () => {
  const actual = await vi.importActual<typeof import("@/config/jurisdictions")>("@/config/jurisdictions");
  const states = ["NSW", "VIC"] as const;
  return {
    ...actual,
    SUPPORTED_SCHEME_STATES: states,
    SCHEME_STATE_OPTIONS: states.map((s) => ({ value: s, label: actual.STATE_NAMES[s] })),
    schemeStateProblem: (s: string | null | undefined) => (String(s ?? "").toUpperCase() === "VIC" ? null : actual.schemeStateProblem(s)),
    schemeLocationProblems: (next: { state: string | null | undefined; postcode: string | null | undefined }, stored?: never) =>
      String(next.state ?? "").toUpperCase() === "VIC" ? {} : actual.schemeLocationProblems(next, stored),
  };
});
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (state: string | null | undefined) =>
      String(state ?? "").toUpperCase() === "VIC" ? { pack: null, rules: PENDING_RULE_PACKS.VIC.rules, label: "AU-VIC test" } : actual.rulesForState(state),
  };
});

const { createSchemeAction } = await import("./actions");
const { LotsStep } = await import("./onboarding-steps");
const { LotForm } = await import("./[id]/lots/lot-form");
const { onboardingWordsFor } = await import("@/lib/onboarding/onboarding-words");
const { checkLots } = await import("@/lib/onboarding/property-onboarding");
const { onLotEntitlementWords, separateEntitlement } = await import("@/lib/jurisdiction/building-data");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
type Rules = import("@/config/statutory").StatutoryRules;
const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as Rules;
const words = onboardingWordsFor("VIC", VIC);

const row = (lotNumber: string, entitlement: string, lotEntitlement?: string, extra: Record<string, string> = {}) => ({
  lotNumber,
  unitNumber: "",
  entitlement,
  ownerName: `Owner ${lotNumber}`,
  ...(lotEntitlement !== undefined ? { lotEntitlement } : {}),
  ...extra,
});

function form(lots: unknown) {
  const fd = new FormData();
  const all: Record<string, string> = {
    name: "Collins Place",
    planNumber: "PS 12345",
    address: "1 Collins St",
    suburb: "Melbourne",
    state: "VIC",
    postcode: "3000",
    totalLots: "2",
    totalEntitlement: "2",
    financialYearEnd: "2027-06-30",
  };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  fd.set("lotsJson", JSON.stringify(lots));
  const fund = { cashAtBank: "", leviesReceivable: "", leviesInAdvance: "", creditors: "", fundBalance: "" };
  fd.set("balancesJson", JSON.stringify({ takeoverDate: "2026-10-01", totalBalance: "0", admin: fund, capitalWorks: fund }));
  fd.set("lotBalancesJson", JSON.stringify([{ lotNumber: "1" }, { lotNumber: "2" }]));
  return fd;
}

beforeEach(() => mocks.createScheme.mockClear());

describe("the wizard's words for a Victorian building", () => {
  it("names lot liability on each lot and asks for the lot entitlement under its own field", () => {
    expect(words).toMatchObject({
      entitlement: "lot liability",
      entitlementLabel: "Lot Liability",
      separate: { name: "lot entitlement", label: "Lot Entitlement", field: "lotEntitlement" },
    });
  });

  it("checks each lot's lot entitlement, a whole number of at least 1, and adds them up", () => {
    const ok = checkLots([row("1", "1", "60"), row("2", "1", "40")], 2, 2, words);
    expect(ok).toMatchObject({ ok: true, separateSum: 100, entitlementSum: 2 });
    expect(ok.lots).toEqual([
      { lotNumber: "1", unitNumber: null, entitlement: 1, ownerName: "Owner 1", lotEntitlement: 60 },
      { lotNumber: "2", unitNumber: null, entitlement: 1, ownerName: "Owner 2", lotEntitlement: 40 },
    ]);
    const bad = checkLots([row("1", "1", ""), row("2", "1", "0", { interestScheduleEntitlement: "40" })], 2, 2, words);
    expect(bad.rowErrors).toEqual({ 0: ["Enter the lot entitlement."], 1: ["The lot entitlement must be a whole number of at least 1."] });
  });

  it("shows a lot entitlement column bound to the lot entitlement field", () => {
    const rows = [row("1", "1", "60"), row("2", "1", "")];
    const html = renderToStaticMarkup(
      <LotsStep words={words} lots={rows} onChange={() => {}} totalLots={2} totalEntitlement={2} check={checkLots(rows, 2, 2, words)} showErrors fromRoll={false} />,
    );
    expect(html).toContain("Enter every lot with its lot liability and lot entitlement");
    expect(html).toContain(">Lot Entitlement</th>");
    expect(html).toContain('aria-label="Lot entitlement, row 1"');
    expect(html).toMatch(/aria-label="Lot entitlement, row 1"[^>]*value="60"/);
    expect(html).toContain("Lot Entitlement: From the owners corporation register. Enter a whole number of at least 1.");
  });
});

describe("createSchemeAction for a Victorian building", () => {
  it("refuses a lot without its lot entitlement, in Victorian words, saving nothing", async () => {
    const result = await createSchemeAction({}, form([row("1", "1", ""), row("2", "1", "x")]));
    expect(result.step).toBe("lots");
    expect(result.stepErrors).toEqual(["Row 1: Enter the lot entitlement.", "Row 2: The lot entitlement must be a whole number of at least 1."]);
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("does not read a value sent under Queensland's field as a lot entitlement", async () => {
    const result = await createSchemeAction({}, form([row("1", "1", undefined, { interestScheduleEntitlement: "60" }), row("2", "1", undefined, { interestScheduleEntitlement: "40" })]));
    expect(result.stepErrors).toEqual(["Row 1: Enter the lot entitlement.", "Row 2: Enter the lot entitlement."]);
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("passes each lot's lot entitlement on to createScheme under its own field", async () => {
    await createSchemeAction({}, form([row("1", "1", "60"), row("2", "1", "40")])).catch((err: unknown) => String(err));
    expect(mocks.createScheme).toHaveBeenCalledTimes(1);
    const [, , lots] = mocks.createScheme.mock.calls[0] as unknown as [unknown, string, unknown[]];
    expect(lots).toEqual([
      { lotNumber: "1", unitNumber: null, entitlement: 1, ownerName: "Owner 1", lotEntitlement: 60 },
      { lotNumber: "2", unitNumber: null, entitlement: 1, ownerName: "Owner 2", lotEntitlement: 40 },
    ]);
  });
});

describe("the lot form for a Victorian lot", () => {
  const defaults = { lotNumber: "3", unitNumber: "12", entitlement: 1, floorArea: null, lotType: "RESIDENTIAL" };
  const props = { entitlementWords: onLotEntitlementWords(VIC), separate: separateEntitlement(VIC) };

  it("names lot liability and asks for the lot entitlement on a new lot", () => {
    const html = renderToStaticMarkup(<LotForm mode="create" schemeId="s1" {...props} />);
    expect(html).toContain(">Lot Liability<");
    expect(html).toContain(">Lot Entitlement<");
    expect(html).toMatch(/<input id="lotEntitlement"[^>]*required=""[^>]*name="lotEntitlement"/);
    expect(html).not.toContain("interestScheduleEntitlement");
    expect(html).not.toContain("Unit Entitlement");
  });

  it("shows a lot's lot entitlement, locked for the adviser", () => {
    const html = renderToStaticMarkup(<LotForm mode="edit" schemeId="s1" lotId="l1" lockStructure defaults={{ ...defaults, lotEntitlement: 60, interestScheduleEntitlement: 9 }} {...props} />);
    expect(html).toMatch(/<input id="lotEntitlement"[^>]*readOnly=""[^>]*name="lotEntitlement" value="60"/);
    expect(html).not.toContain('value="9"');
  });
});
