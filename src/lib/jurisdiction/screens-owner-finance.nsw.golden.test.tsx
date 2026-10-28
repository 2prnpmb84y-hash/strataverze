/**
 * The owner finance screens and the pages that list several buildings are
 * unchanged for NSW (golden; QLD finance wording go-live, 28 Oct 2026).
 * Recorded against origin/feat/qld-two-year-reminder before they took their
 * levy, late charge and owners corporation words from the buildings' rule
 * packs: the owner finance, treasurer, payment and notifications pages, the
 * owner platform fees page, the owner home's property cards, the portal
 * navigation, the adviser schemes list, home and reporting pages, the owner
 * scheme page, the vault's issued-by card and the document library. The
 * props marked "words" were added after the snapshots were recorded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ ownerSchemes: [] as unknown[], notices: [] as unknown[], adviserSchemes: [] as unknown[], activity: [] as unknown[] }));

vi.mock("next/server", () => ({ connection: async () => {} }));
// A plain image in tests.
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/owner/levies",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", async (orig) => ({ ...(await orig()), getCurrentProfile: vi.fn(async () => ({ id: "owner-1", firstName: "Ann", isPlatformAdmin: false })) }));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => null),
  getSelectedOwnerScheme: vi.fn(async () => ({ schemeId: "s1", roles: ["COMMITTEE"], memberships: [{ role: "COMMITTEE", isTreasurer: true }] })),
}));
const SCHEME = {
  id: "s1",
  name: "Harbour View",
  planNumber: "SP 12345",
  address: "1 Harbour St",
  suburb: "Sydney",
  postcode: "2000",
  totalLots: 2,
  state: "NSW",
  timeZone: "Australia/Sydney",
  memberships: [{ profileId: "owner-1", role: "OWNER", lotId: "l1", isTreasurer: false, lot: { lotNumber: "1", unitNumber: "3" } }],
  images: [],
};
vi.mock("@/lib/queries/schemes", async (orig) => ({
  ...(await orig()),
  getSchemesForOwner: vi.fn(async () => state.ownerSchemes),
  getSchemesForCommittee: vi.fn(async () => []),
  getSchemesForAdviser: vi.fn(async () => state.adviserSchemes),
  getSchemeNotificationCounts: vi.fn(async () => new Map([["s1", { pendingLevies: 2, activeWorkOrders: 0, upcomingMeetings: 0 }]])),
}));
vi.mock("@/lib/schemes/photos", () => ({ schemeThumbnails: vi.fn(async () => ({})) }));
vi.mock("@/lib/queries/levies", () => ({ getLevyNoticesForLots: vi.fn(async () => state.notices) }));
vi.mock("@/lib/queries/funds", async (orig) => ({ ...(await orig()), getFundsForSchemes: vi.fn(async () => [{ id: "f1", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 1000 }]) }));
vi.mock("@/lib/queries/levy-schedules", async (orig) => ({ ...(await orig()), getLevyNoticesForSchemes: vi.fn(async () => state.notices) }));
vi.mock("@/lib/queries/work-orders", async (orig) => ({ ...(await orig()), getWorkOrdersForSchemes: vi.fn(async () => []) }));
vi.mock("@/lib/queries/compliance", async (orig) => ({ ...(await orig()), getComplianceForSchemes: vi.fn(async () => []) }));
vi.mock("@/lib/queries/lots", async (orig) => ({ ...(await orig()), getLotsForScheme: vi.fn(async () => []), getStrataRollData: vi.fn(async () => []) }));
vi.mock("@/lib/queries/platform-billing", async (orig) => ({ ...(await orig()), getPlatformFeesData: vi.fn(async () => null) }));
vi.mock("@/components/billing/platform-fees-view", () => ({ PlatformFeesView: () => <div>fees</div> }));
vi.mock("@/lib/queries/activity-log", async (orig) => ({ ...(await orig()), getActivityForSchemes: vi.fn(async () => state.activity) }));
vi.mock("@/lib/owner/notification-feed", async (orig) => ({ ...(await orig()), ownerFeed: vi.fn((logged: unknown[]) => logged) }));
vi.mock("@/lib/documents/viewers", () => ({ hiddenDocumentIds: vi.fn(async () => new Set()) }));
vi.mock("@/lib/finance/treasurer-home-data", () => ({
  getTreasurerMonth: vi.fn(async () => ({
    month: { label: "October 2026" },
    attention: 1,
    unmatched: { count: 0, thisMonth: 0, receiptsCents: 0, paymentsCents: 0, oldestDate: null, items: [] },
    approvals: { count: 0, totalCents: 0, overdueCount: 0, items: [] },
    overdue: { count: 1, lots: 1, totalCents: 30500, items: [{ id: "n1", lotNumber: "1", noticeNumber: "LN-1", dueDate: "2026-08-01", daysOverdue: 87, balanceCents: 30500 }] },
    suspense: { count: 0, netCents: 0, items: [] },
    periods: { current: null, endedOpen: [] },
  })),
}));
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, todayIn: () => "2026-10-27", platformToday: () => "2026-10-27" };
});
vi.mock("@/app/(portal)/owner/(scheme)/finance/actions", () => ({ uploadPaymentConfirmationAction: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { default: OwnerFinancePage } = await import("@/app/(portal)/owner/(scheme)/finance/page");
const { default: TreasurerPage } = await import("@/app/(portal)/owner/(scheme)/finance/treasurer/page");
const { default: PaymentPage } = await import("@/app/(portal)/owner/(scheme)/finance/payment/page");
const { default: NotificationsPage } = await import("@/app/(portal)/owner/(scheme)/notifications/page");
const { default: OwnerPlatformFeesPage } = await import("@/app/(portal)/owner/(scheme)/finance/platform-fees/page");
const { default: OwnerHome } = await import("@/app/(portal)/owner/page");
const { default: OwnerSchemePage } = await import("@/app/(portal)/owner/(scheme)/scheme/page");
const { default: AdviserSchemesPage } = await import("@/app/(portal)/adviser/schemes/page");
const { default: AdviserHome } = await import("@/app/(portal)/adviser/page");
const { default: ReportingPage } = await import("@/app/(portal)/adviser/reporting/page");
const { PortalShell } = await import("@/components/portal-shell");
const { IssuedByStrataVerze } = await import("@/components/vault/issued-by-strataverze");
const { DocumentUploadModal } = await import("@/components/documents/document-upload-modal");
const { statutoryRulesFor } = await import("@/config/statutory");
const NSW = statutoryRulesFor("NSW");

const NOTICE = {
  id: "n1",
  lotId: "l1",
  schemeId: "s1",
  noticeNumber: "LN-1",
  status: "ISSUED",
  dueDate: "2026-09-01",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  amountDue: "400",
  amountPaid: "100",
  balanceOutstanding: "305",
  interestCharged: "5",
  fund: { name: "Administrative Fund" },
  levySchedule: { levyType: "ORDINARY", title: null, financialYear: 2026 },
};
const PAID = { ...NOTICE, id: "n2", noticeNumber: "LN-2", amountPaid: "400", balanceOutstanding: "0", interestCharged: "0", status: "PAID" };

beforeEach(() => {
  state.ownerSchemes = [{ ...SCHEME }];
  state.notices = [NOTICE, PAID];
  state.adviserSchemes = [];
  state.activity = [];
  sharedFake.reset({ Scheme: [{ id: "s1", state: "NSW", name: "Harbour View" }], SchemeMembership: [{ id: "m1", profileId: "owner-1", schemeId: "s1", role: "OWNER", isActive: true }] });
});

describe("NSW owner finance (golden)", () => {
  it("the finance page, with no levies and with levies", async () => {
    state.notices = [];
    expect(renderToStaticMarkup(await OwnerFinancePage())).toMatchSnapshot("no levies");
    state.notices = [NOTICE, PAID];
    expect(renderToStaticMarkup(await OwnerFinancePage())).toMatchSnapshot("levies");
    state.ownerSchemes = [];
    expect(renderToStaticMarkup(await OwnerFinancePage())).toMatchSnapshot("no properties");
  });

  it("the treasurer's page", async () => {
    expect(renderToStaticMarkup(await TreasurerPage())).toMatchSnapshot();
  });

  it("the payment upload page", async () => {
    expect(renderToStaticMarkup(await PaymentPage())).toMatchSnapshot();
  });

  it("the notifications page", async () => {
    state.activity = ["LEVY_CREATED", "LEVY_ISSUED", "LEVIES_GENERATED", "LEVY_PAYMENT_RECORDED", "LEVY_NOTICES_ISSUED"].map((action, i) => ({
      id: `a${i}`,
      schemeId: "s1",
      action,
      entityType: "LevySchedule",
      entityId: null,
      metadata: null,
      createdAt: "2026-10-01T00:00:00Z",
      showActor: false,
      actor: { firstName: "Ann", lastName: "Lee", email: "a@x" },
    }));
    expect(renderToStaticMarkup(await NotificationsPage())).toMatchSnapshot();
  });

  it("the platform fees page header", async () => {
    expect(renderToStaticMarkup(await OwnerPlatformFeesPage())).toMatchSnapshot();
  });
});

describe("NSW owner home, scheme page and navigation (golden)", () => {
  it("the owner home's property cards", async () => {
    expect(renderToStaticMarkup(await OwnerHome())).toMatchSnapshot();
  });

  it("the owner scheme page with no property", async () => {
    state.ownerSchemes = [];
    const selected = await import("@/lib/owner/selected-scheme");
    vi.mocked(selected.getSelectedOwnerScheme).mockResolvedValueOnce(null as never);
    expect(renderToStaticMarkup(await OwnerSchemePage())).toMatchSnapshot();
  });

  it("the owner portal navigation, on the levies page", () => {
    const html = renderToStaticMarkup(
      <PortalShell user={{ id: "u1", email: "a@x" } as never} availablePortals={["owner"]} leviesNavLabel="Levies & Finance" /* words */>
        <div />
      </PortalShell>,
    );
    expect(html).toMatchSnapshot();
  });
});

describe("NSW adviser lists (golden)", () => {
  it("the schemes list, empty and with a building", async () => {
    expect(renderToStaticMarkup(await AdviserSchemesPage({ searchParams: Promise.resolve({}) }))).toMatchSnapshot("empty");
    state.adviserSchemes = [{ ...SCHEME, memberships: [], lots: [] }];
    expect(renderToStaticMarkup(await AdviserSchemesPage({ searchParams: Promise.resolve({}) }))).toMatchSnapshot("a building");
  });

  it("the adviser home with no schemes", async () => {
    expect(renderToStaticMarkup(await AdviserHome())).toMatchSnapshot();
  });

  it("the reporting page with a building", async () => {
    state.adviserSchemes = [{ ...SCHEME, memberships: [], lots: [] }];
    expect(renderToStaticMarkup(await ReportingPage())).toMatchSnapshot();
  });
});

describe("NSW vault card and document library (golden)", () => {
  it("the issued-by card, empty and with a notice", () => {
    expect(renderToStaticMarkup(<IssuedByStrataVerze schemeId="s1" records={[]} timeZone="Australia/Sydney" levy={NSW.TERMINOLOGY.levy} /* words */ />)).toMatchSnapshot("empty");
    const records = [
      { id: "r1", title: "Levy notice LN 1 Lot 1", recordType: "LEVY_NOTICE", createdAt: "2026-10-01T00:00:00Z", label: null },
      { id: "r2", title: "Minutes: AGM (version 1)", recordType: "MINUTES", createdAt: "2026-10-01T00:00:00Z", label: null },
    ];
    expect(renderToStaticMarkup(<IssuedByStrataVerze schemeId="s1" records={records} timeZone="Australia/Sydney" levy={NSW.TERMINOLOGY.levy} /* words */ />)).toMatchSnapshot("records");
  });

  it("the upload modal", () => {
    expect(renderToStaticMarkup(<DocumentUploadModal open onClose={() => {}} onFilesReady={() => {}} schemePlanNumber="12345" levy={NSW.TERMINOLOGY.levy} /* words */ />)).toMatchSnapshot();
  });
});
