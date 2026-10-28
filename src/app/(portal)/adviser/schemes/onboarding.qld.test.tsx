/**
 * Adding a Queensland building (QLD wording and onboarding go-live,
 * 27 Oct 2026). Queensland cannot be chosen until its pack is switched on, so
 * the pending Queensland pack is injected here as a supported state, as the
 * earlier Queensland tests inject it. The wizard then asks for the regulation
 * module (the Standard Module only), the plan format and each lot's interest
 * schedule lot entitlement, names the sinking fund, contributions and the
 * penalty, and the server saves the module, the plan format and both
 * entitlements.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const TODAY = "2026-10-27";

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
  return { ...actual, platformToday: () => TODAY, todayIn: () => TODAY };
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
// Queensland as a supported state, with the pending Queensland pack.
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
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (state: string | null | undefined) =>
      String(state ?? "").toUpperCase() === "QLD" ? { pack: null, rules: PENDING_RULE_PACKS.QLD.rules, label: "AU-QLD test" } : actual.rulesForState(state),
  };
});

const { default: NewSchemePage } = await import("./new/page");
const { createSchemeAction } = await import("./actions");

const text = () => document.body.textContent ?? "";
const byName = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const type = (el: Element, value: string) => fireEvent.change(el, { target: { value } });
const next = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));
const visible = () => [...document.querySelectorAll("form > div")].find((d) => !d.classList.contains("hidden"))?.textContent ?? "";

beforeEach(() => {
  cleanup();
  mocks.createScheme.mockClear();
});

describe("the Add Property wizard for a Queensland building", () => {
  it("asks for the module and both lot entitlements, in Queensland words", async () => {
    render(await NewSchemePage());
    expect(text()).toContain("Register a new building.");
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));

    // Where more than one state can be chosen, the state is asked first.
    const stateSelect = byName("state") as unknown as HTMLSelectElement;
    expect(stateSelect.closest(".hidden")).toBeNull();
    expect(visible()).toContain("Enter the core details of the Owners Corporation.");
    fireEvent.change(stateSelect, { target: { value: "QLD" } });
    expect(visible()).toContain("Enter the core details of the Body Corporate.");
    expect(visible()).toContain("Community Titles Scheme Number");
    expect(visible()).toContain("Total Contribution Schedule Lot Entitlement");
    expect(visible()).not.toMatch(/unit entitlement|Plan Number/i);

    type(byName("name"), "Harbour View");
    type(byName("planNumber"), "12345");
    type(byName("totalLots"), "2");
    next(/Next: Address/);
    expect(visible()).toContain("Enter the total contribution schedule lot entitlement (a whole number).");
    type(byName("totalEntitlement"), "100");
    next(/Next: Address/);

    // The module: the Standard Module only.
    const moduleSelect = byName("regulationModule") as unknown as HTMLSelectElement;
    expect([...moduleSelect.options].map((o) => [o.value, o.disabled, o.textContent])).toEqual([
      ["", true, "Select module..."],
      ["STANDARD", false, "Standard Module"],
      ["ACCOMMODATION", true, "Accommodation Module (not available yet)"],
      ["COMMERCIAL", true, "Commercial Module (not available yet)"],
      ["SMALL_SCHEMES", true, "Small Schemes Module (not available yet)"],
      ["SPECIFIED_TWO_LOT", true, "Specified Two-lot Schemes Module (not available yet)"],
    ]);
    expect(visible()).toContain("Include all fees in contribution calculations");
    type(byName("address"), "1 Eagle St");
    type(byName("suburb"), "Brisbane City");
    type(byName("postcode"), "4000");
    next(/Next: Lots/);
    expect(visible()).toContain("Choose the regulation module.");
    expect(visible()).toContain("Choose the plan format.");
    fireEvent.change(moduleSelect, { target: { value: "STANDARD" } });

    // The plan format: every listed format can be chosen, one not supported yet is marked with its note.
    const formatSelect = byName("planFormat") as unknown as HTMLSelectElement;
    expect([...formatSelect.options].map((o) => [o.value, o.disabled, o.textContent])).toEqual([
      ["", true, "Select plan format..."],
      ["BUILDING", false, "Building format plan"],
      ["VOLUMETRIC", false, "Volumetric format plan"],
      ["STANDARD", false, "Standard format plan (not supported yet)"],
    ]);
    expect(visible()).toContain("The kind of plan of subdivision the scheme's lots are on, as registered for the scheme.");
    fireEvent.change(formatSelect, { target: { value: "STANDARD" } });
    expect(visible()).toContain("Contributions that include insurance cannot be raised for it until then.");
    fireEvent.change(formatSelect, { target: { value: "BUILDING" } });
    next(/Next: Lots/);

    // Both lot entitlements, named from the pack.
    expect(visible()).toContain("Contribution Schedule Lot Entitlement");
    expect(visible()).toContain("Interest Schedule Lot Entitlement: From the interest schedule in the community management statement. A whole number, not 0.");
    type(screen.getByLabelText("Contribution schedule lot entitlement, row 1"), "40");
    type(screen.getByLabelText("Contribution schedule lot entitlement, row 2"), "60");
    type(screen.getByLabelText("Owner name as on the strata roll, row 1"), "J CITIZEN");
    type(screen.getByLabelText("Owner name as on the strata roll, row 2"), "ACME PTY LTD");
    type(screen.getByLabelText("Interest schedule lot entitlement, row 1"), "45");
    next(/Next: Opening/);
    expect(visible()).toContain("Enter the interest schedule lot entitlement.");
    type(screen.getByLabelText("Interest schedule lot entitlement, row 2"), "55");
    next(/Next: Opening/);

    // The funds: the administrative fund and the sinking fund.
    expect(visible()).toContain("Sinking fund");
    expect(visible()).toContain("Contributions receivable (including penalty)");
    expect(visible()).not.toMatch(/capital works|levies|interest\)/i);
    type(document.getElementById("takeoverDate")!, "2026-10-01");
    type(document.getElementById("totalBalance")!, "0");
    next(/Next: Lot Balances/);
    expect(visible()).toContain("Sinking fund contributions");
    expect(visible()).toContain("Sinking fund penalty");
    expect(screen.getByLabelText("Sinking fund contributions, lot 1")).toBeTruthy();
    next(/Next: Review/);

    const review = visible();
    expect(review).toContain("Regulation moduleStandard Module");
    expect(review).toContain("Plan formatBuilding format plan");
    expect(review).toContain("Legal NameBody corporate for Harbour View community titles scheme 12345");
    expect(review).toContain("Sinking Fund$0.00");
    expect(review).toContain("Lot Contributions (Admin / Sinking Fund)");
    expect(review).toContain("Lot Penalty (Admin / Sinking Fund)");
    expect(review).toContain("Lots (2, contribution schedule lot entitlement 100, interest schedule lot entitlement 100)");
    expect(review).not.toMatch(/levy|levies|unit entitlement|capital works|owners corporation/i);

    const sent = new FormData(document.querySelector("form")!);
    expect(sent.get("regulationModule")).toBe("STANDARD");
    expect(sent.get("planFormat")).toBe("BUILDING");
    expect(sent.get("state")).toBe("QLD");
    await act(async () => {
      await createSchemeAction({}, sent).catch((err: unknown) => String(err));
    });
    expect(mocks.createScheme).toHaveBeenCalledTimes(1);
    const [data, , lots] = mocks.createScheme.mock.calls[0] as unknown as [Record<string, unknown>, string, unknown[]];
    expect(data).toMatchObject({ state: "QLD", regulationModule: "STANDARD", planFormat: "BUILDING", planNumber: "12345", totalEntitlement: 100 });
    expect(lots).toEqual([
      { lotNumber: "1", unitNumber: null, entitlement: 40, ownerName: "J CITIZEN", interestScheduleEntitlement: 45 },
      { lotNumber: "2", unitNumber: null, entitlement: 60, ownerName: "ACME PTY LTD", interestScheduleEntitlement: 55 },
    ]);
  });
});

function form(fields: Record<string, string> = {}, lots?: unknown) {
  const fd = new FormData();
  const all: Record<string, string> = {
    name: "Harbour View",
    planNumber: "12345",
    address: "1 Eagle St",
    suburb: "Brisbane City",
    state: "QLD",
    postcode: "4000",
    totalLots: "2",
    totalEntitlement: "100",
    financialYearEnd: "2027-06-30",
    regulationModule: "STANDARD",
    planFormat: "BUILDING",
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  fd.set(
    "lotsJson",
    JSON.stringify(
      lots ?? [
        { lotNumber: "1", unitNumber: "", entitlement: "40", ownerName: "A", interestScheduleEntitlement: "45" },
        { lotNumber: "2", unitNumber: "", entitlement: "60", ownerName: "B", interestScheduleEntitlement: "55" },
      ],
    ),
  );
  const fund = { cashAtBank: "", leviesReceivable: "", leviesInAdvance: "", creditors: "", fundBalance: "" };
  fd.set("balancesJson", JSON.stringify({ takeoverDate: "2026-10-01", totalBalance: "0", admin: fund, capitalWorks: fund }));
  fd.set("lotBalancesJson", JSON.stringify([{ lotNumber: "1" }, { lotNumber: "2" }]));
  return fd;
}

describe("createSchemeAction for a Queensland building", () => {
  it("refuses a missing or unsupported module, saving nothing", async () => {
    const missing = await createSchemeAction({}, form({ regulationModule: "" }));
    expect(missing).toEqual({ fieldErrors: { regulationModule: "Choose the regulation module." }, step: "address", stepErrors: ["Choose the regulation module."] });
    const commercial = await createSchemeAction({}, form({ regulationModule: "COMMERCIAL" }));
    expect(commercial.stepErrors).toEqual([
      "StrataVerze applies the Standard Module only for now, so a building under the Commercial Module cannot be managed yet.",
    ]);
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("refuses a lot without its interest schedule lot entitlement, in Queensland words", async () => {
    const result = await createSchemeAction(
      {},
      form({ totalEntitlement: "x" }, [{ lotNumber: "1", unitNumber: "", entitlement: "", ownerName: "A" }]),
    );
    expect(result.fieldErrors?.totalEntitlement).toBe("Total contribution schedule lot entitlement must be a whole number of at least 1.");
    const lots = await createSchemeAction({}, form({}, [{ lotNumber: "1", unitNumber: "", entitlement: "100", ownerName: "A", interestScheduleEntitlement: "" }, { lotNumber: "2", unitNumber: "", entitlement: "", ownerName: "B", interestScheduleEntitlement: "x" }]));
    expect(lots.step).toBe("lots");
    expect(lots.stepErrors).toEqual([
      "Row 1: Enter the interest schedule lot entitlement.",
      "Row 2: Enter the contribution schedule lot entitlement. The interest schedule lot entitlement must be a whole number of at least 1.",
    ]);
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("passes the module, the plan format and both entitlements on to createScheme", async () => {
    await createSchemeAction({}, form()).catch((err: unknown) => String(err));
    const [data, , lots] = mocks.createScheme.mock.calls[0] as unknown as [Record<string, unknown>, string, { interestScheduleEntitlement?: number }[]];
    expect(data.regulationModule).toBe("STANDARD");
    expect(data.planFormat).toBe("BUILDING");
    expect(lots.map((l) => l.interestScheduleEntitlement)).toEqual([45, 55]);
  });

  it("refuses a missing or unknown plan format, and accepts any listed one", async () => {
    const missing = await createSchemeAction({}, form({ planFormat: "" }));
    expect(missing).toEqual({ fieldErrors: { planFormat: "Choose the plan format." }, step: "address", stepErrors: ["Choose the plan format."] });
    const unknown = await createSchemeAction({}, form({ planFormat: "GROUP_TITLE" }));
    expect(unknown.stepErrors).toEqual(["Choose a valid plan format."]);
    expect(mocks.createScheme).not.toHaveBeenCalled();
    // A standard format plan is recorded: contributions that include insurance are refused for it later.
    await createSchemeAction({}, form({ planFormat: "STANDARD" })).catch((err: unknown) => String(err));
    expect((mocks.createScheme.mock.calls[0] as unknown as [Record<string, unknown>])[0].planFormat).toBe("STANDARD");
  });

  it("sends a state problem back to Property Details, where the state is asked when more than one can be chosen", async () => {
    const result = await createSchemeAction({}, form({ state: "TAS", postcode: "7000" }));
    expect(result.step).toBe("details");
    expect(result.fieldErrors?.state).toBeTruthy();
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("shows createScheme's own refusal of the pack's data", async () => {
    const { SchemeDataError } = await import("@/lib/queries/schemes");
    mocks.createScheme.mockRejectedValueOnce(new SchemeDataError("Lot 1: the interest schedule lot entitlement must be a whole number from 1 to 1,000,000."));
    const result = await createSchemeAction({}, form());
    expect(result).toEqual({ error: "Lot 1: the interest schedule lot entitlement must be a whole number from 1 to 1,000,000." });
  });
});
