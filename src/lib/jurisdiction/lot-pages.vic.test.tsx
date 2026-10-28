/**
 * The adviser's lot page and the committee's lot page for a Victorian lot
 * (VIC, ACT and WA stage 2, PR 4), with the pending Victorian pack injected:
 * both schedules are named from the pack, the lot entitlement is shown from
 * its own field (never Queensland's), a lot without one is flagged, and the
 * lot form sends it under its own field.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  scheme: { id: "s1", state: "NSW" } as Record<string, unknown>,
  lot: {} as Record<string, unknown>,
  profile: { id: "adviser-1", isPlatformAdmin: false } as Record<string, unknown>,
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({
  db: (await import("@/test/fake-orm")).sharedFake.db,
}));
vi.mock("@/lib/queries/profiles", () => ({
  getCurrentProfile: vi.fn(async () => state.profile),
}));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => null),
  getSelectedOwnerScheme: vi.fn(async () => ({
    schemeId: "s1",
    roles: ["COMMITTEE"],
  })),
}));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async () => state.scheme),
  getSchemesForCommittee: vi.fn(async () => []),
  getSchemesForOwner: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/lots", () => ({
  getLotDetail: vi.fn(async () => state.lot),
  getLotInScheme: vi.fn(async () => state.lot),
  getStrataRollData: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/documents", () => ({
  getDocumentsForScheme: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/document-url", () => ({
  resolveDocumentUrl: vi.fn(async () => null),
}));
vi.mock("@/lib/queries/lot-workflows", () => ({
  getLotDetailExtended: vi.fn(async () => ({
    rollOwnerName: "J CITIZEN",
    ownerEmail: "j@example.com",
    ownerMobile: null,
    ownerPhone: null,
    ownerAddress: null,
    lastSettled: null,
  })),
  getTenantsForLot: vi.fn(async () => []),
  getPropertyManager: vi.fn(async () => null),
  getDeliveryPreferences: vi.fn(async () => []),
  getDebtCollection: vi.fn(async () => null),
}));
vi.mock("@/lib/levies/lot-levy-view", () => ({
  loadLotLevyView: vi.fn(async () => ({
    items: [],
    statement: {
      openingBalance: 0,
      totalCharges: 0,
      totalPayments: 0,
      closingBalance: 0,
      lines: [],
    },
  })),
}));
vi.mock("@/lib/audit/security-audit", () => ({
  recordSecurityEventLater: vi.fn(async () => {}),
}));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27") };
});
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return {
    ...actual,
    todayIn: () => "2026-10-27",
    platformToday: () => "2026-10-27",
  };
});
vi.mock("@/lib/actions/change-owner", () => ({ changeOwnerAction: vi.fn() }));
vi.mock("@/lib/storage/client-upload", () => ({
  stageFormFile: vi.fn(),
  stageUpload: vi.fn(),
}));
vi.mock("@/app/(portal)/adviser/schemes/[id]/lots/actions", () => ({
  createLotAction: vi.fn(),
  updateLotAction: vi.fn(),
  deleteLotAction: vi.fn(),
  assignOwnerAction: vi.fn(),
  removeOwnerAction: vi.fn(),
  searchOwnersAction: vi.fn(),
}));
// Every tab, so the whole page is in the snapshot.
vi.mock("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/lot-detail-tabs", () => ({
  LotDetailTabs: ({ children }: { children: Record<string, ReactNode> }) => (
    <div>
      {Object.entries(children).map(([k, v]) => (
        <section key={k} data-tab={k}>
          {v}
        </section>
      ))}
    </div>
  ),
}));
// The draft Victorian pack defers NOTICE_RULES (DEFERRED_SHARED_SHAPES), which
// the debt case words on the adviser's lot page read, so Queensland's are lent.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string | null | undefined) =>
      s === "VIC"
        ? {
            pack: null,
            rules: {
              ...PENDING_RULE_PACKS.VIC.rules,
              NOTICE_RULES: PENDING_RULE_PACKS.QLD.rules.NOTICE_RULES,
            },
            label: "AU-VIC test",
          }
        : actual.rulesForState(s),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { default: AdviserLotPage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/page");
const { default: CommitteeLotPage } = await import("@/app/(portal)/owner/(scheme)/scheme/lots/[lotId]/page");

const lotRow = (lotEntitlement: number | null) => ({
  id: "l1",
  schemeId: "s1",
  lotNumber: "1",
  unitNumber: "3",
  entitlement: 2,
  interestScheduleEntitlement: 77,
  lotEntitlement,
  floorArea: null,
  lotType: "RESIDENTIAL",
  streetNo: null,
  streetName: null,
  suburb: null,
  accessoryUnit: null,
  uof: null,
  crn: null,
  owners: [],
  isCommitteeMember: false,
  financials: {
    opening: 0,
    annual: 400,
    special: 0,
    interest: 0,
    paid: 300,
    closing: 100,
  },
  levyHistory: [],
});

function seed(lotEntitlement: number | null) {
  state.scheme = {
    id: "s1",
    name: "Collins Place",
    planNumber: "PS 12345",
    state: "VIC",
    timeZone: "Australia/Melbourne",
    address: "1 Collins St",
    suburb: "Melbourne",
    memberships: [{ profileId: "adviser-1", role: "ADVISER" }],
    bankAccounts: [],
  };
  state.lot = lotRow(lotEntitlement);
  sharedFake.reset({
    Scheme: [
      {
        id: "s1",
        name: "Collins Place",
        state: "VIC",
        planNumber: "PS 12345",
        timeZone: "Australia/Melbourne",
      },
    ],
    Lot: [
      {
        id: "l1",
        schemeId: "s1",
        lotNumber: "1",
        unitNumber: "3",
        entitlement: 2,
        interestScheduleEntitlement: 77,
        lotEntitlement,
      },
    ],
    SchemeMembership: [
      {
        id: "m1",
        profileId: "owner-1",
        schemeId: "s1",
        lotId: "l1",
        role: "OWNER",
        isActive: true,
      },
    ],
  });
}

beforeEach(() => {
  state.profile = { id: "adviser-1", isPlatformAdmin: false };
});

const adviserPage = async () =>
  renderToStaticMarkup(
    await AdviserLotPage({
      params: Promise.resolve({ id: "s1", lotId: "l1" }),
    }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("a Victorian lot's pages", () => {
  it("show lot liability and the lot entitlement from its own field, and the form sends it under that field", async () => {
    seed(60);
    const html = await adviserPage();
    expect(text(html)).toContain("Lot Liability 2");
    expect(text(html)).toContain("Lot Entitlement 60");
    expect(html).toMatch(/<input id="lotEntitlement"[^>]*readOnly=""[^>]*name="lotEntitlement" value="60"/);
    expect(html).not.toContain("interestScheduleEntitlement");
    expect(html).not.toContain(">77<");
    expect(html).not.toContain("Building data missing");
    expect(html).not.toContain("Unit Entitlement");
  });

  it("flag a lot without a lot entitlement, never showing another value", async () => {
    seed(null);
    const html = await adviserPage();
    expect(text(html)).toContain("Lot Entitlement Not recorded");
    expect(html).toContain("Building data missing");
    expect(html).toContain("This lot has no lot entitlement recorded. StrataVerze can enter it from the building&#x27;s records.");
    expect(html).toMatch(/<input id="lotEntitlement"[^>]*name="lotEntitlement" value=""/);
  });

  it("show the committee both schedules", async () => {
    seed(60);
    state.profile = { id: "owner-1" };
    const html = renderToStaticMarkup(await CommitteeLotPage({ params: Promise.resolve({ lotId: "l1" }) }));
    expect(text(html)).toMatch(/Lot entitlement\s+60/);
    expect(html).not.toContain(">77<");
  });
});
