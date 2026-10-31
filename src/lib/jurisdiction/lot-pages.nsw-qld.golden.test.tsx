/**
 * The adviser's lot page and the committee's lot page for NSW and Queensland
 * lots, unchanged by Victoria's second schedule (VIC, ACT and WA stage 2,
 * PR 4). The snapshots were recorded on feat/fund-conditions (2b04048),
 * before the change, and must match byte for byte. The adviser page's tabs
 * are all rendered, so the details, the flag and the lot form are covered.
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
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => state.profile) }));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => null),
  getSelectedOwnerScheme: vi.fn(async () => ({ schemeId: "s1", roles: ["COMMITTEE"] })),
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
vi.mock("@/lib/queries/documents", () => ({ getDocumentsForScheme: vi.fn(async () => []) }));
vi.mock("@/lib/queries/document-url", () => ({ resolveDocumentUrl: vi.fn(async () => null) }));
vi.mock("@/lib/queries/lot-workflows", () => ({
  getLotDetailExtended: vi.fn(async () => ({ rollOwnerName: "J CITIZEN", ownerEmail: "j@example.com", ownerMobile: null, ownerPhone: null, ownerAddress: null, lastSettled: null })),
  getTenantsForLot: vi.fn(async () => []),
  getPropertyManager: vi.fn(async () => null),
  getDeliveryPreferences: vi.fn(async () => []),
  getDebtCollection: vi.fn(async () => null),
}));
vi.mock("@/lib/levies/lot-levy-view", () => ({
  loadLotLevyView: vi.fn(async () => ({ items: [], statement: { openingBalance: 0, totalCharges: 0, totalPayments: 0, closingBalance: 0, lines: [] } })),
}));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27") };
});
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, todayIn: () => "2026-10-27", platformToday: () => "2026-10-27" };
});
vi.mock("@/lib/actions/change-owner", () => ({ changeOwnerAction: vi.fn() }));
vi.mock("@/lib/storage/client-upload", () => ({ stageFormFile: vi.fn(), stageUpload: vi.fn() }));
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
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string | null | undefined) => (s === "QLD" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(s)),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { default: AdviserLotPage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/page");
const { default: CommitteeLotPage } = await import("@/app/(portal)/owner/(scheme)/scheme/lots/[lotId]/page");

const lotRow = (state: string, interest: number | null) => ({
  id: "l1",
  schemeId: "s1",
  lotNumber: "1",
  unitNumber: "3",
  entitlement: 40,
  interestScheduleEntitlement: interest,
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
  financials: { opening: 0, annual: 400, special: 0, interest: 0, paid: 300, closing: 100 },
  levyHistory: [],
  state,
});

beforeEach(() => {
  state.profile = { id: "adviser-1", isPlatformAdmin: false };
});

describe.each([
  ["NSW", "Australia/Sydney", null],
  ["QLD", "Australia/Brisbane", 45],
  ["QLD", "Australia/Brisbane", null],
] as const)("%s lot pages (%s, second value %s)", (code, timeZone, interest) => {
  beforeEach(() => {
    state.scheme = {
      id: "s1",
      name: "Harbour View",
      planNumber: "SP 12345",
      state: code,
      timeZone,
      address: "1 Harbour St",
      suburb: "Sydney",
      memberships: [{ profileId: "adviser-1", role: "ADVISER" }],
      bankAccounts: [],
    };
    state.lot = lotRow(code, interest);
    sharedFake.reset({
      Scheme: [{ id: "s1", name: "Harbour View", state: code, planNumber: "SP 12345", timeZone }],
      Lot: [{ id: "l1", schemeId: "s1", lotNumber: "1", unitNumber: "3", entitlement: 40, interestScheduleEntitlement: interest }],
      SchemeMembership: [{ id: "m1", profileId: "owner-1", schemeId: "s1", lotId: "l1", role: "OWNER", isActive: true }],
    });
  });

  it.each([false, true])("adviser page (StrataVerze %s)", async (admin) => {
    state.profile = { id: "adviser-1", isPlatformAdmin: admin };
    const html = renderToStaticMarkup(await AdviserLotPage({ params: Promise.resolve({ id: "s1", lotId: "l1" }) }));
    expect(html).toMatchSnapshot();
  });

  it("committee page", async () => {
    state.profile = { id: "owner-1" };
    const html = renderToStaticMarkup(await CommitteeLotPage({ params: Promise.resolve({ lotId: "l1" }) }));
    expect(html).toMatchSnapshot();
  });
});

// H-1 (31 Oct 2026): a committee member's change of owner waits for the Adviser. Not a snapshot: the pages above
// (nothing waiting) must stay byte for byte as they were.
describe("a change of owner waiting for review", () => {
  beforeEach(() => {
    state.scheme = {
      id: "s1",
      name: "Harbour View",
      planNumber: "SP 12345",
      state: "NSW",
      timeZone: "Australia/Sydney",
      address: "1 Harbour St",
      suburb: "Sydney",
      memberships: [{ profileId: "adviser-1", role: "ADVISER" }],
      bankAccounts: [],
    };
    state.lot = lotRow("NSW", null);
    sharedFake.reset({
      Scheme: [{ id: "s1", name: "Harbour View", state: "NSW", planNumber: "SP 12345", timeZone: "Australia/Sydney" }],
      Lot: [{ id: "l1", schemeId: "s1", lotNumber: "1", unitNumber: "3", entitlement: 40 }],
      SchemeMembership: [
        { id: "m1", profileId: "owner-1", schemeId: "s1", lotId: "l1", role: "OWNER", isActive: true },
        { id: "m2", profileId: "chair-1", schemeId: "s1", lotId: null, role: "COMMITTEE", isActive: true },
        { id: "m3", profileId: "adviser-1", schemeId: "s1", lotId: null, role: "ADVISER", isActive: true },
      ],
      Profile: [
        { id: "chair-1", firstName: "Chris", lastName: "Chair", email: "chair@example.com" },
        { id: "owner-1", firstName: "Olive", lastName: "Owner", email: "olive@example.org" },
      ],
      OwnerChangeRequest: [
        {
          id: "9b2f4c3e-0000-4000-8000-000000000001",
          schemeId: "s1",
          lotId: "l1",
          status: "PENDING",
          ownerName: "Mr New Owner",
          ownerEmail: "new@example.com",
          settlementDate: "2026-10-24",
          invite: true,
          noticeDocumentId: null,
          recordedBy: "chair-1",
          recordedAt: "2026-10-25T01:00:00.000Z",
        },
      ],
    });
  });

  it("the Adviser's lot page shows it with Confirm and Reject, in place of Change owner", async () => {
    const html = renderToStaticMarkup(await AdviserLotPage({ params: Promise.resolve({ id: "s1", lotId: "l1" }) }));
    expect(html).toContain("Change of owner waiting for your review");
    expect(html).toContain("Mr New Owner");
    expect(html).toContain("24/10/2026");
    expect(html).toContain("Chris Chair (chair@example.com), 25/10/2026");
    expect(html).toContain("Confirm change of owner");
    expect(html).toContain(">Reject<");
    expect(html).not.toContain("Change owner<");
    // What confirming will do (review M2), and the address check (review L1).
    expect(html).toContain("If you confirm");
    expect(html).toContain("Olive Owner (olive@example.org)");
    expect(html).toContain("Yes: an invitation is sent to new@example.com.");
    expect(html).toContain("is at the same domain as the email of the committee member who recorded this change");
  });

  it("the committee's lot page says it is waiting for the Adviser, with no way to decide it", async () => {
    state.profile = { id: "owner-1" };
    const html = renderToStaticMarkup(await CommitteeLotPage({ params: Promise.resolve({ lotId: "l1" }) }));
    expect(html).toContain("Change of owner waiting for the Adviser");
    expect(html).toContain("Nothing changes until the Adviser confirms it");
    expect(html).not.toContain("Confirm change of owner");
    expect(html).not.toContain("If you confirm");
    expect(html).not.toContain("Change owner<");
  });

  // Review M1: the committee's page data, not only its HTML, carries none of the reviewer's details.
  it("the committee's lot page passes only the reduced view: no owners' or recorder's addresses, seats, invitation state or fingerprint", async () => {
    state.profile = { id: "owner-1" };
    const { PendingOwnerChangeNotice } = await import("@/components/lots/pending-owner-change-notice");
    const { PendingOwnerChange } = await import("@/components/lots/pending-owner-change");
    const tree = await CommitteeLotPage({ params: Promise.resolve({ lotId: "l1" }) });
    // Every element in the page's tree, with its props (client components are not rendered here, so their props are what the browser would get).
    const found: Array<{ type: unknown; props: Record<string, unknown> }> = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const el = node as { type: unknown; props: Record<string, unknown> };
      found.push(el);
      walk(el.props.children);
    };
    walk(tree);
    expect(found.some((e) => e.type === PendingOwnerChange)).toBe(false);
    const notice = found.find((e) => e.type === PendingOwnerChangeNotice);
    expect(notice).toBeDefined();
    const change = notice!.props.change as Record<string, unknown>;
    expect(Object.keys(change).sort()).toEqual(["ownerName", "recordedByName", "recordedOn", "reviewer", "settlementDate"]);
    const data = JSON.stringify(found.map((e) => e.props), (k, v) => (k === "children" || typeof v === "function" ? undefined : v));
    for (const secret of ["olive@example.org", "chair@example.com", "new@example.com", "fingerprint", "effect", "resemblance", "recordedByEmail"]) {
      expect(data).not.toContain(secret);
    }
  });
});
