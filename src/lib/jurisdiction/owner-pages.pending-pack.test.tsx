/**
 * One building in a state with no live pack never fails a page that lists
 * several (QLD finance wording review, 28 Oct 2026). Queensland's pack is
 * still pending here, so an owner with an NSW lot and a Queensland lot sees
 * every owner page, and the lists and navigation, in the NSW words, as these
 * pages showed before they took their words from the packs.
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
  getSchemeNotificationCounts: vi.fn(async () => new Map([["s1", { pendingLevies: 2, activeWorkOrders: 0, upcomingMeetings: 0 }], ["s2", { pendingLevies: 1, activeWorkOrders: 0, upcomingMeetings: 0 }]])),
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
const { default: AdviserSchemesPage } = await import("@/app/(portal)/adviser/schemes/page");
const { default: AdviserHome } = await import("@/app/(portal)/adviser/page");
const { default: ReportingPage } = await import("@/app/(portal)/adviser/reporting/page");

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


const QLD_SCHEME = {
  ...SCHEME,
  id: "s2",
  name: "Surfers Rise",
  planNumber: "777",
  state: "QLD",
  timeZone: "Australia/Brisbane",
  memberships: [{ profileId: "owner-1", role: "OWNER", lotId: "l2", isTreasurer: false, lot: { lotNumber: "2", unitNumber: null } }],
};
const QLD_NOTICE = { ...NOTICE, id: "n3", lotId: "l2", schemeId: "s2", noticeNumber: "CN-1" };

beforeEach(() => {
  state.ownerSchemes = [{ ...SCHEME }, QLD_SCHEME];
  state.notices = [NOTICE, PAID, QLD_NOTICE];
  state.adviserSchemes = [{ ...SCHEME, memberships: [], lots: [] }, { ...QLD_SCHEME, memberships: [], lots: [] }];
  state.activity = ["LEVY_CREATED", "LEVY_ISSUED"].flatMap((action, i) =>
    ["s1", "s2"].map((schemeId) => ({ id: `a${i}${schemeId}`, schemeId, action, entityType: "LevySchedule", entityId: null, metadata: null, createdAt: "2026-10-01T00:00:00Z", showActor: false, actor: { firstName: "Ann", lastName: "Lee", email: "a@x" } })),
  );
  sharedFake.reset({
    Scheme: [{ id: "s1", state: "NSW", name: "Harbour View" }, { id: "s2", state: "QLD", name: "Surfers Rise" }],
    SchemeMembership: [
      { id: "m1", profileId: "owner-1", schemeId: "s1", role: "OWNER", isActive: true },
      { id: "m2", profileId: "owner-1", schemeId: "s2", role: "OWNER", isActive: true },
    ],
  });
});

const html = async (page: Promise<React.ReactElement | null>) => renderToStaticMarkup((await page) as React.ReactElement);

describe("an owner with a lot in a state with no live pack", () => {
  it("Queensland's pack is still pending here", async () => {
    const { RULE_PACKS } = await import("@/config/statutory");
    expect(RULE_PACKS.QLD).toBeUndefined();
  });

  it("the finance page shows both buildings' notices in the NSW words", async () => {
    const out = await html(OwnerFinancePage());
    expect(out).toContain("Your levy contributions and fund balances.");
    expect(out).toContain("LN-1");
    expect(out).toContain("CN-1");
    expect(out).toContain("Interest Charged");
  });

  it("the payment page lists both buildings' notices", async () => {
    const out = await html(PaymentPage());
    expect(out).toContain("Levy Notice (optional)");
    expect(out).toContain("CN-1");
  });

  it("the notifications page shows both buildings' activity", async () => {
    const out = await html(NotificationsPage());
    expect(out.match(/Levy notice issued/g)?.length).toBe(2);
  });

  it("the treasurer's page for the Queensland building", async () => {
    const selected = await import("@/lib/owner/selected-scheme");
    vi.mocked(selected.getSelectedOwnerScheme).mockResolvedValueOnce({ schemeId: "s2", roles: ["COMMITTEE"], memberships: [{ role: "COMMITTEE", isTreasurer: true }] } as never);
    expect(await html(TreasurerPage())).toContain("Overdue levies");
  });

  it("the platform fees page, the owner home and the navigation label", async () => {
    await expect(html(OwnerPlatformFeesPage())).resolves.toContain("owners corporation");
    await expect(html(OwnerHome())).resolves.toContain("1 levy");
    const { ownerLevyNavLabel } = await import("@/lib/owner/levy-nav");
    await expect(ownerLevyNavLabel("owner-1")).resolves.toBe("Levies & Finance");
  });
});

describe("an adviser with a building in a state with no live pack", () => {
  it("the schemes list, the home and reporting", async () => {
    await expect(html(AdviserSchemesPage({ searchParams: Promise.resolve({}) }))).resolves.toContain("Surfers Rise");
    await expect(html(AdviserHome())).resolves.toBeTruthy();
    await expect(html(ReportingPage())).resolves.toContain("Levy collection across all schemes.");
  });
});
