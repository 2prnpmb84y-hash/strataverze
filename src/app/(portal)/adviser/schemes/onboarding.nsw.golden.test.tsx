/**
 * NSW onboarding is unchanged (golden; QLD wording and onboarding go-live,
 * 27 Oct 2026). Recorded against origin/main before the Add Property wizard
 * took its words from the building's rule pack: the Add Property page as an
 * administrator sees it, then each step as an NSW building is entered, with
 * the problems each step shows, and what the server action refuses and passes
 * on to createScheme.
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
vi.mock("@/lib/queries/schemes", () => ({ createScheme: mocks.createScheme, updateScheme: vi.fn(), deleteScheme: vi.fn() }));
vi.mock("@/lib/onboarding/stage-opening-cutover", () => ({ stageOnboardingCutover: mocks.stage }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/prisma/db", () => {
  const chain = { where: () => chain, first: async () => null };
  return { db: { orm: { public: { Scheme: chain } } } };
});

const { default: NewSchemePage } = await import("./new/page");
const { createSchemeAction } = await import("./actions");

const html = () => document.body.innerHTML;
const byName = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const type = (el: Element, value: string) => fireEvent.change(el, { target: { value } });
const next = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));

beforeEach(() => {
  cleanup();
  mocks.createScheme.mockClear();
  mocks.stage.mockClear();
});

describe("NSW Add Property wizard (golden)", () => {
  it("shows every step as before", async () => {
    render(await NewSchemePage());
    expect(html()).toMatchSnapshot("page");

    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    // Leaving the details step empty shows its problems.
    next(/Next: Address/);
    expect(html()).toMatchSnapshot("details problems");

    type(byName("name"), "Harbour View");
    type(byName("planNumber"), "SP 12345");
    type(byName("totalLots"), "2");
    type(byName("totalEntitlement"), "100");
    next(/Next: Address/);
    expect(html()).toMatchSnapshot("address");

    next(/Next: Lots/);
    expect(html()).toMatchSnapshot("address problems");
    type(byName("address"), "1 Harbour St");
    type(byName("suburb"), "Drummoyne");
    type(byName("postcode"), "2047");
    next(/Next: Lots/);
    expect(html()).toMatchSnapshot("lots");

    next(/Next: Opening/);
    expect(html()).toMatchSnapshot("lots problems");
    type(screen.getByLabelText("Unit entitlement, row 1"), "40");
    type(screen.getByLabelText("Unit entitlement, row 2"), "50");
    type(screen.getByLabelText("Owner name as on the strata roll, row 1"), "J CITIZEN");
    type(screen.getByLabelText("Owner name as on the strata roll, row 2"), "ACME PTY LTD");
    next(/Next: Opening/);
    expect(html()).toMatchSnapshot("lots total wrong");
    type(screen.getByLabelText("Unit entitlement, row 2"), "60");
    next(/Next: Opening/);
    expect(html()).toMatchSnapshot("balances");

    type(document.getElementById("takeoverDate")!, "2026-10-01");
    type(document.getElementById("totalBalance")!, "2,000");
    type(document.getElementById("admin-cash")!, "1,000");
    type(document.getElementById("admin-receivable")!, "300");
    type(document.getElementById("admin-advance")!, "100");
    type(document.getElementById("admin-creditors")!, "200");
    type(document.getElementById("admin-balance")!, "999");
    type(document.getElementById("capitalWorks-cash")!, "900");
    type(document.getElementById("capitalWorks-receivable")!, "100");
    type(document.getElementById("capitalWorks-balance")!, "1,000");
    next(/Next: Lot Balances/);
    expect(html()).toMatchSnapshot("balances problems");
    type(document.getElementById("admin-balance")!, "1,000");
    next(/Next: Lot Balances/);
    expect(html()).toMatchSnapshot("lot balances");

    next(/Next: Review/);
    expect(html()).toMatchSnapshot("lot balances problems");
    for (const [label, value] of [
      ["Administrative fund levies, lot 1", "300"],
      ["Capital works fund levies, lot 1", "60"],
      ["Capital works fund interest, lot 1", "40"],
      ["Unallocated, lot 2", "100"],
      ["Administrative fund interest, lot 2", "x"],
    ] as const)
      type(screen.getByLabelText(label), value);
    expect(html()).toMatchSnapshot("lot balances row problem");
    type(screen.getByLabelText("Administrative fund interest, lot 2"), "");
    next(/Next: Review/);
    expect(html()).toMatchSnapshot("review");

    // What the wizard sends, and what the server then passes to createScheme.
    const sent = new FormData(document.querySelector("form")!);
    expect([...sent.entries()]).toMatchSnapshot("form data");
    await act(async () => {
      await createSchemeAction({}, sent).catch((err: unknown) => String(err));
    });
    expect(mocks.createScheme.mock.calls).toMatchSnapshot("createScheme");
  });
});

function form(fields: Record<string, string> = {}, lots?: unknown) {
  const fd = new FormData();
  const all: Record<string, string> = {
    name: "Harbour View",
    planNumber: "SP 12345",
    address: "1 Harbour St",
    suburb: "Drummoyne",
    state: "NSW",
    postcode: "2047",
    totalLots: "2",
    totalEntitlement: "100",
    financialYearEnd: "2027-06-30",
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  fd.set(
    "lotsJson",
    JSON.stringify(
      lots ?? [
        { lotNumber: "1", unitNumber: "1", entitlement: "40", ownerName: "J CITIZEN" },
        { lotNumber: "2", unitNumber: "2", entitlement: "60", ownerName: "ACME PTY LTD" },
      ],
    ),
  );
  fd.set(
    "balancesJson",
    JSON.stringify({
      takeoverDate: "2026-10-01",
      totalBalance: "2,000",
      admin: { cashAtBank: "1,000", leviesReceivable: "300", leviesInAdvance: "100", creditors: "200", fundBalance: "1,000" },
      capitalWorks: { cashAtBank: "900", leviesReceivable: "100", leviesInAdvance: "", creditors: "", fundBalance: "1,000" },
    }),
  );
  fd.set(
    "lotBalancesJson",
    JSON.stringify([
      { lotNumber: "1", admin: "300", capitalWorks: "60", interestAdmin: "", interestCapitalWorks: "40", unallocated: "" },
      { lotNumber: "2", admin: "", capitalWorks: "", interestAdmin: "", interestCapitalWorks: "", unallocated: "100" },
    ]),
  );
  return fd;
}

describe("NSW createSchemeAction (golden)", () => {
  it("refuses and passes on as before", async () => {
    const results: unknown[] = [];
    const run = async (fd: FormData) => {
      try {
        results.push(await createSchemeAction({}, fd));
      } catch (err) {
        results.push(String(err));
      }
    };
    await run(form({ totalEntitlement: "x", name: "" }));
    await run(form({ regulationModule: "STANDARD" }, [{ lotNumber: "1", unitNumber: "", entitlement: "", ownerName: "A" }]));
    await run(form({ totalEntitlement: "90" }));
    await run(form());
    expect(results).toMatchSnapshot("results");
    expect(mocks.createScheme.mock.calls).toMatchSnapshot("createScheme");
  });
});
