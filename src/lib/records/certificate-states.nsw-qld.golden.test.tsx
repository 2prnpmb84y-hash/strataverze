/**
 * Golden: the certificate's other states and texts, for NSW (the s 184
 * strata information certificate) and Queensland (the body corporate
 * certificate). Recorded on origin/main 557b283 (31 Oct 2026) in a temporary
 * worktree, before PR 10a (certificate kinds and records access for the
 * draft packs) moved the certificate gates.
 *
 * NEVER REGENERATE THESE SNAPSHOTS. Do not run vitest with -u on this file,
 * and do not update an entry to make a change pass: a difference is a change
 * to NSW or Queensland. An entry may change only when the change is
 * deliberate, and the commit says which entry and why.
 *
 * Covered (what certificates.nsw-qld.golden.test.tsx and records.golden.test.tsx
 * do not): the PDF route's refusals (signed out, not an adviser, a bad id,
 * another building's certificate, a cancelled draft, a pack without the
 * certificate); the lot's certificates page with a draft, an issued unpaid,
 * an issued paid and a cancelled certificate; the certificate page for an
 * issued paid certificate and a cancelled draft; both pages refused for a
 * pack without the certificate; the Queensland PDF blocks with and without
 * an agent's principal, draft and issued; the Queensland request fields and
 * editor; the fee and deadline sentences over a grid of dates.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const fx = vi.hoisted(() => ({ off: false, profile: { id: "adviser-1", isPlatformAdmin: false } as { id: string; isPlatformAdmin: boolean } | null }));

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
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => fx.profile) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}), recordActionInvocation: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async (id: string) => ({ id, memberships: [{ profileId: "adviser-1", role: "ADVISER" }] })),
}));
vi.mock("@/lib/auth/require-membership", () => {
  class AuthorisationError extends Error {}
  return { AuthorisationError, requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser-1" }, membership: {}, roles: ["ADVISER"] })) };
});
// The building's real pack, recorded under a fixed label; `fx.off` switches every workflow off.
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { db } = await import("@/prisma/db");
  const rulesForScheme = async (schemeId: string) => {
    const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    const r = actual.rulesForState(scheme?.state);
    const rules = fx.off ? { ...r.rules, FEATURES: Object.fromEntries(Object.keys(r.rules.FEATURES).map((k) => [k, false])) as unknown as typeof r.rules.FEATURES } : r.rules;
    return { ...r, rules, label: `${r.pack.code} golden` };
  };
  return { ...actual, rulesForScheme, schemeHasFeature: async (schemeId: string, feature: string) => (await rulesForScheme(schemeId)).rules.FEATURES[feature as "recordsInspections"] === true };
});
vi.mock("@/lib/jurisdiction/scheme-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/jurisdiction/scheme-time")>()), schemeToday: async () => "2026-10-27" }));

const { sharedFake } = await import("@/test/fake-orm");
const { NextRequest } = await import("next/server");
const { RULE_PACKS, QLD_RULE_PACK } = await import("@/config/statutory");
const { GET } = await import("@/app/api/records/certificate/[certificateId]/route");
const { default: CertificatesPage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/certificates/page");
const { default: CertificatePage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/certificates/[certificateId]/page");
const { certificateBlocks } = await import("@/lib/pdf/certificate");
const { requesterFields } = await import("./requester-fields");
const { CertificateEditor } = await import("@/components/records/records-forms");
const { certificateDueText, certificateFeeText } = await import("./certificate-text");

const NSW = RULE_PACKS.NSW.rules;
const QLD = QLD_RULE_PACK.rules;
const SCHEME = { NSW: "aaaaaaaa-0000-4000-8000-000000000001", QLD: "aaaaaaaa-0000-4000-8000-000000000002" } as const;
const LOT = { NSW: "bbbbbbbb-0000-4000-8000-000000000001", QLD: "bbbbbbbb-0000-4000-8000-000000000002" } as const;
type State = keyof typeof SCHEME;
const STATES: State[] = ["NSW", "QLD"];
const id = (s: State, n: number) => `cccccccc-0000-4000-8000-0000000000${s === "NSW" ? "1" : "2"}${n}`;
const ITEMS = {
  NSW: NSW.CERTIFICATE!.items.map(([no, title]) => ({ no, title, text: `Item ${no}: Nil.` })),
  QLD: QLD.CERTIFICATE.items.map(([no, title]) => ({ no, title, text: `Item ${no}: Nil.` })),
};

const certificate = (s: State, n: number, o: Record<string, unknown>) => ({
  id: id(s, n),
  schemeId: SCHEME[s],
  lotId: LOT[s],
  number: n,
  requestedOn: "2026-10-01",
  requesterType: "OWNER",
  requesterName: "Jo Citizen",
  requesterAddress: "7/1 Example St",
  authorisedByType: null,
  authorisedByName: null,
  authorisedByAddress: null,
  items: ITEMS[s],
  draftedOn: "2026-10-02",
  certificateDate: null,
  feeCents: null,
  feeRepeat: false,
  feePaidOn: null,
  rulePack: `AU-${s} golden`,
  issuedContent: null,
  createdBy: "adviser-1",
  issuedBy: null,
  ...o,
});

beforeEach(() => {
  fx.off = false;
  fx.profile = { id: "adviser-1", isPlatformAdmin: false };
  sharedFake.reset({
    Scheme: [
      { id: SCHEME.NSW, name: "Harbour View", planNumber: "12345", state: "NSW", timeZone: "Australia/Sydney" },
      { id: SCHEME.QLD, name: "Seaview", planNumber: "4567", state: "QLD", timeZone: "Australia/Brisbane", regulationModule: "STANDARD" },
    ],
    Lot: [
      { id: LOT.NSW, schemeId: SCHEME.NSW, lotNumber: "7" },
      { id: LOT.QLD, schemeId: SCHEME.QLD, lotNumber: "3" },
    ],
    SchemeMembership: [
      { id: "m1", schemeId: SCHEME.NSW, profileId: "adviser-1", role: "ADVISER", isActive: true },
      { id: "m2", schemeId: SCHEME.QLD, profileId: "adviser-1", role: "ADVISER", isActive: true },
    ],
    SaleCertificate: STATES.flatMap((s) => [
      certificate(s, 1, { status: "DRAFT", draftedOn: "2026-10-27", requestedOn: "2026-10-26" }),
      certificate(s, 2, { status: "ISSUED", certificateDate: "2026-10-02", feeCents: 10_900, issuedBy: "adviser-1" }),
      certificate(s, 3, { status: "ISSUED", certificateDate: "2026-09-02", requestedOn: "2026-09-01", draftedOn: "2026-09-02", feeCents: 9_400, feeRepeat: true, feePaidOn: "2026-09-05", issuedBy: "adviser-1" }),
      certificate(s, 4, { status: "CANCELLED", requestedOn: "2026-08-01", draftedOn: "2026-08-01" }),
    ]),
  });
});

const html = async (el: Promise<React.ReactElement | null>) => {
  try {
    return renderToStaticMarkup((await el)!);
  } catch (e) {
    return { thrown: (e as Error).message };
  }
};
const route = async (schemeId: string, certificateId: string) => {
  const r = await GET(new NextRequest(`https://app.test/api/records/certificate/${certificateId}?schemeId=${schemeId}`), { params: Promise.resolve({ certificateId }) });
  return { status: r.status, contentType: r.headers.get("Content-Type"), disposition: r.headers.get("Content-Disposition"), body: r.status === 200 ? "(pdf)" : await r.text() };
};

describe.each(STATES)("%s certificate PDF route refusals", (s) => {
  it("are as recorded", async () => {
    const out: Record<string, unknown> = {};
    out.badCertificateId = await route(SCHEME[s], "not-a-uuid");
    out.badSchemeId = await route("nope", id(s, 1));
    out.missing = await route(SCHEME[s], id(s, 9));
    out.otherBuilding = await route(SCHEME[s === "NSW" ? "QLD" : "NSW"], id(s, 1));
    out.cancelled = await route(SCHEME[s], id(s, 4));
    sharedFake.tables.SchemeMembership.length = 0;
    out.notAnAdviser = await route(SCHEME[s], id(s, 1));
    fx.profile = null;
    out.signedOut = await route(SCHEME[s], id(s, 1));
    expect(out).toMatchSnapshot();
  });

  it("refuse a draft, and an issued certificate with nothing kept, for a pack without the certificate", async () => {
    fx.off = true;
    expect({ draft: await route(SCHEME[s], id(s, 1)), issued: await route(SCHEME[s], id(s, 2)) }).toMatchSnapshot();
  });
});

describe.each(STATES)("%s certificate pages", (s) => {
  it("the lot's certificates: a draft, issued unpaid, issued paid and cancelled", async () => {
    expect(await html(CertificatesPage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s] }) }))).toMatchSnapshot();
  });
  it("an issued certificate, paid, with the repeat fee", async () => {
    expect(await html(CertificatePage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s], certificateId: id(s, 3) }) }))).toMatchSnapshot();
  });
  it("a cancelled draft", async () => {
    expect(await html(CertificatePage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s], certificateId: id(s, 4) }) }))).toMatchSnapshot();
  });
  it("a draft whose figures are out of date", async () => {
    sharedFake.tables.SaleCertificate.find((x) => x.id === id(s, 1))!.draftedOn = "2026-10-20";
    expect(await html(CertificatePage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s], certificateId: id(s, 1) }) }))).toMatchSnapshot();
  });
  it("are refused for a pack without the certificate", async () => {
    fx.off = true;
    expect({
      list: await html(CertificatesPage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s] }) })),
      draft: await html(CertificatePage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s], certificateId: id(s, 1) }) })),
      issued: await html(CertificatePage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s], certificateId: id(s, 2) }) })),
      cancelled: await html(CertificatePage({ params: Promise.resolve({ id: SCHEME[s], lotId: LOT[s], certificateId: id(s, 4) }) })),
    }).toMatchSnapshot();
  });
});

describe("the Queensland certificate PDF blocks", () => {
  const c = QLD.CERTIFICATE;
  const doc = (draft: boolean, agent: boolean) => ({
    schemeName: "Seaview",
    planNumber: "4567",
    planLabel: QLD.TERMINOLOGY.planLabel,
    planRowLabel: c.planRowLabel,
    title: c.title,
    section: c.section,
    number: 3,
    draft,
    certificateDate: draft ? null : "2026-10-26",
    lotNumber: "Lot 3",
    requester: agent ? { type: c.requesterTypes.AGENT, name: "Pat Agent", address: "3 Agent Rd" } : { type: c.requesterTypes.BUYER, name: "Sam Buyer", address: "1 Sea St" },
    authorisedBy: agent ? { type: c.requesterTypes.BUYER, name: "Sam Buyer", address: "1 Sea St" } : null,
    ownersCorporation: QLD.TERMINOLOGY.ownersCorporation,
    items: c.items.map(([no, title]) => ({ no, title, text: `Text for ${no}` })),
    execution: c.execution,
    executionLines: c.executionLines,
    conclusiveNote: c.conclusiveNote,
    form: c.form,
    follows: c.follows,
    preparedOn: "2026-10-26",
  });
  it.each([
    ["draft, an agent", true, true],
    ["draft, no agent", true, false],
    ["issued, an agent", false, true],
    ["issued, no agent", false, false],
  ])("%s", (_name, draft, agent) => {
    expect(certificateBlocks(doc(draft, agent))).toMatchSnapshot();
  });
});

describe("the Queensland request fields and editor", () => {
  it("are as recorded", () => {
    const c = QLD.CERTIFICATE;
    const fields = requesterFields({ requesterTypes: c.requesterTypes, agentType: c.agentType, today: "2026-10-27", values: { requestedOn: "2026-10-20", requesterType: "AGENT", requesterName: "Pat Agent", authorisedByType: "BUYER", authorisedByName: "Sam Buyer" } });
    expect(fields).toMatchSnapshot();
    expect(requesterFields({ requesterTypes: c.requesterTypes, agentType: c.agentType, today: "2026-10-27" })).toMatchSnapshot();
    const editor = renderToStaticMarkup(
      <CertificateEditor action={async () => ({})} requesterFields={fields} items={c.items.slice(0, 3).map(([no, title]) => ({ no, title, text: "Check and complete." }))} ownersCorporation={QLD.TERMINOLOGY.ownersCorporation} />,
    );
    expect(editor).toMatchSnapshot();
  });
});

describe("the fee and deadline sentences", () => {
  const DATES = ["2025-06-30", "2025-07-01", "2026-06-30", "2026-07-01", "2026-10-23", "2026-10-24", "2026-12-24", "2027-06-30", "2027-07-01", "2028-02-28"];
  it.each([
    ["NSW", NSW.CERTIFICATE!],
    ["Queensland", QLD.CERTIFICATE],
  ] as const)("%s", (_name, c) => {
    expect(Object.fromEntries(DATES.map((d) => [d, { fee: certificateFeeText(c, d), due: certificateDueText(c, d) }]))).toMatchSnapshot();
  });
});
