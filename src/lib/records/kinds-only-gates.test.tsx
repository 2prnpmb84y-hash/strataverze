/**
 * A pack with only the draft packs' switches (certificateKinds and
 * recordsAccess on, the NSW and Queensland ones off, no CERTIFICATE or
 * INSPECTIONS), as 10b to 10d will give VIC, ACT and WA: every NSW and
 * Queensland entry point refuses it cleanly, as not available or not found,
 * and none reaches needRule (RuleNotInPackError). PR 10a review, L5.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adviser-1", isPlatformAdmin: false })) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}), recordActionInvocation: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async (id: string) => ({ id, state: "WA", memberships: [{ profileId: "adviser-1", role: "ADVISER" }] })) }));
vi.mock("@/lib/queries/bylaws", () => ({ getBylawsForScheme: async () => [] }));
vi.mock("@/lib/auth/require-membership", () => {
  class AuthorisationError extends Error {}
  return { AuthorisationError, requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser-1" }, membership: {}, roles: ["ADVISER"] })) };
});
// The draft WA pack (no CERTIFICATE or INSPECTIONS) with only the draft packs' switches on.
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const wa = PENDING_RULE_PACKS.WA as unknown as { code: string; rules: import("@/config/statutory").StatutoryRules };
  const FEATURES = { ...Object.fromEntries(Object.keys(wa.rules.FEATURES).map((k) => [k, false])), certificateKinds: true, recordsAccess: true } as unknown as typeof wa.rules.FEATURES;
  const r = { pack: wa as never, rules: { ...wa.rules, FEATURES }, label: `${wa.code} kinds-only` };
  return { ...actual, rulesForScheme: async () => r, rulesForState: () => r, schemeHasFeature: async (_s: string, f: string) => FEATURES[f as "recordsAccess"] === true };
});
vi.mock("@/lib/jurisdiction/scheme-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/jurisdiction/scheme-time")>()), schemeToday: async () => "2026-10-27" }));

const { sharedFake } = await import("@/test/fake-orm");
const { NextRequest } = await import("next/server");
const store = await import("./records-store");
const actions = await import("@/lib/actions/records");
const { GET } = await import("@/app/api/records/certificate/[certificateId]/route");
const { default: CertificatesPage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/certificates/page");
const { default: CertificatePage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/certificates/[certificateId]/page");
const { default: InspectionsPage } = await import("@/app/(portal)/adviser/schemes/[id]/governance/inspections/page");
const { default: GovernancePage } = await import("@/app/(portal)/adviser/schemes/[id]/governance/page");

const SCHEME = "aaaaaaaa-0000-4000-8000-000000000009";
const LOT = "bbbbbbbb-0000-4000-8000-000000000009";
const DRAFT = "cccccccc-0000-4000-8000-000000000091";
const ISSUED = "cccccccc-0000-4000-8000-000000000092";
const INSPECTION = "dddddddd-0000-4000-8000-000000000009";
const NOT_AVAILABLE = "This is not available for this building.";

const cert = (id: string, status: string) => ({ id, schemeId: SCHEME, lotId: LOT, number: 1, status, requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "1 St", authorisedByType: null, authorisedByName: null, authorisedByAddress: null, items: [{ no: "1", title: "One", text: "Nil" }], draftedOn: "2026-10-27", certificateDate: status === "ISSUED" ? "2026-10-27" : null, feeCents: null, feeRepeat: false, feePaidOn: null, rulePack: null, issuedContent: null, createdBy: "adviser-1", issuedBy: null });

beforeEach(() => {
  sharedFake.reset({
    Scheme: [{ id: SCHEME, name: "River View", planNumber: "77", state: "WA", timeZone: "Australia/Perth" }],
    Lot: [{ id: LOT, schemeId: SCHEME, lotNumber: "4" }],
    SchemeMembership: [{ id: "m1", schemeId: SCHEME, profileId: "adviser-1", role: "ADVISER", isActive: true }],
    SaleCertificate: [cert(DRAFT, "DRAFT"), cert(ISSUED, "ISSUED")],
    RecordsInspection: [{ id: INSPECTION, schemeId: SCHEME, lotId: LOT, inspectorType: "OWNER", inspectorName: "Jo", authorisedBy: null, requestedOn: "2026-10-20", status: "REQUESTED", scheduledFor: null, setByNotice: false, place: null, minutes: null, feeCents: null, feePaidOn: null }],
  });
});

/** What a call ends in: its value, or the error it threw (name and message). */
const outcome = async (p: Promise<unknown>) => {
  try {
    return { value: await p };
  } catch (e) {
    return { thrown: (e as Error).name, message: (e as Error).message };
  }
};

describe("a pack with only certificateKinds and recordsAccess", () => {
  it("is refused by every store step as not available, writing nothing", async () => {
    const before = JSON.stringify(sharedFake.tables);
    const requester = { requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "1 St", authorisedByType: null, authorisedByName: null, authorisedByAddress: null };
    const calls = [
      store.createCertificate({ schemeId: SCHEME, lotId: LOT, requester, actorId: "a1" }),
      store.saveCertificateDraft({ schemeId: SCHEME, certificateId: DRAFT, requester, itemTexts: {} }),
      store.issueCertificate({ schemeId: SCHEME, certificateId: DRAFT, actorId: "a1", checkedAll: true }),
      store.createInspection({ schemeId: SCHEME, lotId: LOT, inspectorType: "OWNER", inspectorName: "Jo", authorisedBy: null, requestedOn: "2026-10-20", notes: null, actorId: "a1" }),
      store.scheduleInspection({ schemeId: SCHEME, id: INSPECTION, when: "2026-10-22T10:00", place: "Office", setByNotice: false }),
      store.completeInspection({ schemeId: SCHEME, id: INSPECTION, minutes: 60, inspected: true, copyPages: 1 }),
    ];
    for (const c of calls) expect(await outcome(c)).toEqual({ thrown: "RecordsError", message: NOT_AVAILABLE });
    expect(JSON.stringify(sharedFake.tables)).toBe(before);
  });

  it("is refused by the start actions as not available", async () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "1 St", lotId: LOT, inspectorType: "OWNER", inspectorName: "Jo" })) f.set(k, v);
    expect((await actions.createCertificateAction(SCHEME, LOT, {}, f)).error).toBe(NOT_AVAILABLE);
    expect((await actions.createInspectionAction(SCHEME, {}, f)).error).toBe(NOT_AVAILABLE);
    expect(sharedFake.tables.SaleCertificate).toHaveLength(2);
    expect(sharedFake.tables.RecordsInspection).toHaveLength(1);
  });

  it("gets not found from the PDF route, for a draft and for an issued certificate with nothing kept", async () => {
    for (const id of [DRAFT, ISSUED]) {
      const r = await GET(new NextRequest(`https://app.test/api/records/certificate/${id}?schemeId=${SCHEME}`), { params: Promise.resolve({ certificateId: id }) });
      expect(r.status, id).toBe(404);
    }
  });

  it("gets not found from the certificate pages and the inspections page, and no inspections card", async () => {
    expect(await outcome(CertificatesPage({ params: Promise.resolve({ id: SCHEME, lotId: LOT }) }))).toEqual({ thrown: "Error", message: "NOT_FOUND" });
    for (const id of [DRAFT, ISSUED]) expect(await outcome(CertificatePage({ params: Promise.resolve({ id: SCHEME, lotId: LOT, certificateId: id }) }))).toEqual({ thrown: "Error", message: "NOT_FOUND" });
    expect(await outcome(InspectionsPage({ params: Promise.resolve({ id: SCHEME }) }))).toEqual({ thrown: "Error", message: "NOT_FOUND" });
    const governance = renderToStaticMarkup((await GovernancePage({ params: Promise.resolve({ id: SCHEME }) }))!);
    expect(governance).not.toContain("Records inspections");
    expect(governance).toContain("Members");
  });
});
