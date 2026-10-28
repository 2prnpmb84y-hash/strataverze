/**
 * The adviser's lot page is unchanged for an NSW building (golden; QLD
 * finance wording go-live, 28 Oct 2026). Recorded against
 * origin/feat/qld-two-year-reminder before the page's financial snapshot,
 * financials tab, owner's view and lot form took their levy, late charge and
 * entitlement words from the building's rule pack.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ tab: "details" }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/adviser/schemes/s1/lots/l1",
  useSearchParams: () => new URLSearchParams(`tab=${nav.tab}`),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adv-1", isPlatformAdmin: false })) }));
vi.mock("@/lib/queries/schemes", async (orig) => ({
  ...(await orig()),
  getSchemeById: vi.fn(async () => ({
    id: "s1",
    name: "Harbour View",
    planNumber: "SP 12345",
    state: "NSW",
    timeZone: "Australia/Sydney",
    address: "1 Harbour St",
    suburb: "Sydney",
    bankAccounts: [],
    memberships: [{ profileId: "adv-1", role: "ADVISER" }],
  })),
}));
vi.mock("@/lib/queries/lots", async (orig) => ({
  ...(await orig()),
  getLotDetail: vi.fn(async () => ({
    id: "l1",
    schemeId: "s1",
    lotNumber: "1",
    unitNumber: "3",
    lotType: "RESIDENTIAL",
    entitlement: 40,
    interestScheduleEntitlement: null,
    floorArea: null,
    accessoryUnit: null,
    crn: null,
    uof: null,
    streetNo: null,
    streetName: null,
    suburb: null,
    owners: [],
    committeeMembers: [],
    financials: { opening: 10, annual: 400, special: 0, paid: 100, closing: 315, interest: 5 },
    levyHistory: [{ id: "n1", levyTitle: "Administrative Fund levy (LN-1)", levyType: "ORDINARY", dueDate: "2026-09-01", amount: 405, paidAmount: 100, status: "OVERDUE", paidAt: null }],
  })),
}));
vi.mock("@/lib/queries/lot-workflows", () => ({
  getLotDetailExtended: vi.fn(async () => null),
  getTenantsForLot: vi.fn(async () => []),
  getPropertyManager: vi.fn(async () => null),
  getDeliveryPreferences: vi.fn(async () => []),
  getDebtCollection: vi.fn(async () => null),
}));
vi.mock("@/lib/queries/documents", () => ({ getDocumentsForScheme: vi.fn(async () => []) }));
vi.mock("@/lib/levies/lot-levy-view", () => ({ loadLotLevyView: vi.fn(async () => ({ items: [], statement: { openingBalance: 0, totalCharges: 0, totalPayments: 0, closingBalance: 0, lines: [] } })) }));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27") };
});
vi.mock("@/app/(portal)/adviser/schemes/[id]/lots/actions", () => ({ createLotAction: vi.fn(), updateLotAction: vi.fn(), deleteLotAction: vi.fn() }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/lot-workflow-actions", () =>
  Object.fromEntries(
    ["updateLotDetailAction", "updateRollOwnerNameAction", "updateTenantAction", "updatePropertyManagerAction", "updateDeliveryPreferenceAction", "updateDebtCollectionAction", "createPowerOfAttorneyAction", "revokePowerOfAttorneyAction", "createProxyAction", "revokeProxyAction"].map((k) => [k, vi.fn()]),
  ),
);

const { default: LotPage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/page");
const params = { params: Promise.resolve({ id: "s1", lotId: "l1" }) };

describe("NSW adviser lot page (golden)", () => {
  it.each(["details", "financials", "owner", "settings"])("the %s tab", async (tab) => {
    nav.tab = tab;
    expect(renderToStaticMarkup(await LotPage(params))).toMatchSnapshot();
  });
});
