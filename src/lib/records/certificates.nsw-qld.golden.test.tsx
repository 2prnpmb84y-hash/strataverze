/**
 * Golden: what a certificate reads, end to end, for NSW (the s 184 strata
 * information certificate) and Queensland (the body corporate certificate).
 * Recorded on origin/main ad229ea (31 Oct 2026), before an issued
 * certificate kept its wording from the day it was issued.
 *
 * NEVER REGENERATE THESE SNAPSHOTS. Do not run vitest with -u on this file,
 * and do not update an entry to make a change pass. An entry may change only
 * when the change is deliberate, and the commit says which entry and why.
 *
 * Covered: the certificate PDF route for a draft and an issued certificate in
 * each state (status, headers, the PDF's text and its SHA-256), the issue
 * action's writes and the PDF of the certificate it issued, the lot's
 * certificates page and the certificate page (draft and issued).
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { extractText, getDocumentProxy } from "unpdf";

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
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async (id: string) => ({ id, memberships: [{ profileId: "adviser-1", role: "ADVISER" }] })),
}));
vi.mock("@/lib/auth/require-membership", () => {
  class AuthorisationError extends Error {}
  return { AuthorisationError, requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser-1" }, membership: {}, roles: ["ADVISER"] })) };
});
// The building's real pack, recorded under a fixed label so a version bump does not move the snapshots.
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { db } = await import("@/prisma/db");
  const rulesForScheme = async (schemeId: string) => {
    const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    const r = actual.rulesForState(scheme?.state);
    return { ...r, label: `${r.pack.code} golden` };
  };
  return { ...actual, rulesForScheme, schemeHasFeature: async (schemeId: string, feature: string) => (await rulesForScheme(schemeId)).rules.FEATURES[feature as "bodyCorporateCertificate"] === true };
});
vi.mock("@/lib/jurisdiction/scheme-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/jurisdiction/scheme-time")>()), schemeToday: async () => "2026-10-27" }));

const { sharedFake } = await import("@/test/fake-orm");
const { NextRequest } = await import("next/server");
const { RULE_PACKS, QLD_RULE_PACK } = await import("@/config/statutory");
const { GET } = await import("@/app/api/records/certificate/[certificateId]/route");
const { issueCertificateAction } = await import("@/lib/actions/records");
const { default: CertificatesPage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/certificates/page");
const { default: CertificatePage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/certificates/[certificateId]/page");

const NSW_SCHEME = "aaaaaaaa-0000-4000-8000-000000000001";
const QLD_SCHEME = "aaaaaaaa-0000-4000-8000-000000000002";
const NSW_LOT = "bbbbbbbb-0000-4000-8000-000000000001";
const QLD_LOT = "bbbbbbbb-0000-4000-8000-000000000002";
const ID = {
  nswDraft: "cccccccc-0000-4000-8000-000000000001",
  nswIssued: "cccccccc-0000-4000-8000-000000000002",
  qldDraft: "cccccccc-0000-4000-8000-000000000003",
  qldIssued: "cccccccc-0000-4000-8000-000000000004",
};

const itemsOf = (items: ReadonlyArray<readonly [string, string]>, extra: string) =>
  items.map(([no, title], i) => ({ no, title, text: i % 3 === 0 ? `Item ${no} for the lot.\nA second line for item ${no}. ${extra}` : `Item ${no}: Nil. ${extra}` }));

const NSW_ITEMS = itemsOf(RULE_PACKS.NSW.rules.CERTIFICATE!.items, "As recorded.");
const QLD_ITEMS = itemsOf(QLD_RULE_PACK.rules.CERTIFICATE.items, "As recorded.");

const certificate = (o: Record<string, unknown>) => ({
  requestedOn: "2026-10-20",
  requesterType: "OWNER",
  requesterName: "Jo Citizen",
  requesterAddress: "7/1 Example St",
  authorisedByType: null,
  authorisedByName: null,
  authorisedByAddress: null,
  draftedOn: "2026-10-27",
  certificateDate: null,
  feeCents: null,
  feeRepeat: false,
  feePaidOn: null,
  rulePack: null,
  createdBy: "adviser-1",
  issuedBy: null,
  ...o,
});

beforeEach(() => {
  sharedFake.reset({
    Scheme: [
      { id: NSW_SCHEME, name: "Harbour View", planNumber: "12345", state: "NSW", timeZone: "Australia/Sydney" },
      { id: QLD_SCHEME, name: "Seaview", planNumber: "4567", state: "QLD", timeZone: "Australia/Brisbane", regulationModule: "STANDARD" },
    ],
    Lot: [
      { id: NSW_LOT, schemeId: NSW_SCHEME, lotNumber: "7" },
      { id: QLD_LOT, schemeId: QLD_SCHEME, lotNumber: "3" },
    ],
    SchemeMembership: [
      { id: "m1", schemeId: NSW_SCHEME, profileId: "adviser-1", role: "ADVISER", isActive: true },
      { id: "m2", schemeId: QLD_SCHEME, profileId: "adviser-1", role: "ADVISER", isActive: true },
    ],
    SaleCertificate: [
      certificate({ id: ID.nswDraft, schemeId: NSW_SCHEME, lotId: NSW_LOT, number: 4, status: "DRAFT", requesterType: "AUTHORISED_PERSON", requesterName: "Sam Agent", requesterAddress: "2 Agent Rd", authorisedByType: "OWNER", authorisedByName: "Jo Citizen", authorisedByAddress: "7/1 Example St", items: NSW_ITEMS, rulePack: "AU-NSW golden" }),
      certificate({ id: ID.nswIssued, schemeId: NSW_SCHEME, lotId: NSW_LOT, number: 3, status: "ISSUED", requestedOn: "2026-10-01", draftedOn: "2026-10-02", certificateDate: "2026-10-02", feeCents: 10_900, items: NSW_ITEMS, rulePack: "AU-NSW golden", issuedBy: "adviser-1" }),
      certificate({ id: ID.qldDraft, schemeId: QLD_SCHEME, lotId: QLD_LOT, number: 2, status: "DRAFT", requesterType: "AGENT", requesterName: "Pat Agent", requesterAddress: "3 Agent Rd", authorisedByType: "BUYER", authorisedByName: "Sam Buyer", authorisedByAddress: "1 Sea St", items: QLD_ITEMS, rulePack: "AU-QLD golden" }),
      certificate({ id: ID.qldIssued, schemeId: QLD_SCHEME, lotId: QLD_LOT, number: 1, status: "ISSUED", requesterType: "BUYER", requesterName: "Sam Buyer", requesterAddress: "1 Sea St", requestedOn: "2026-10-01", draftedOn: "2026-10-02", certificateDate: "2026-10-02", feeCents: 8_695, items: QLD_ITEMS, rulePack: "AU-QLD golden", issuedBy: "adviser-1" }),
    ],
  });
});

/** The PDF route's answer: status, headers, the PDF's text and a hash of its bytes. */
async function pdf(schemeId: string, certificateId: string) {
  const r = await GET(new NextRequest(`https://app.test/api/records/certificate/${certificateId}?schemeId=${schemeId}`), { params: Promise.resolve({ certificateId }) });
  const bytes = new Uint8Array(await r.arrayBuffer());
  const text = r.status === 200 ? String((await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true })).text) : new TextDecoder().decode(bytes);
  return {
    status: r.status,
    contentType: r.headers.get("Content-Type"),
    disposition: r.headers.get("Content-Disposition"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    text,
  };
}

const html = async (el: Promise<React.ReactElement | null>) => renderToStaticMarkup((await el)!);
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const row = (id: string) => ({ ...sharedFake.tables.SaleCertificate.find((x) => x.id === id) });

describe("the certificate PDF route", () => {
  it("NSW draft", async () => {
    expect(await pdf(NSW_SCHEME, ID.nswDraft)).toMatchSnapshot();
  });
  it("NSW issued", async () => {
    expect(await pdf(NSW_SCHEME, ID.nswIssued)).toMatchSnapshot();
  });
  it("Queensland draft", async () => {
    expect(await pdf(QLD_SCHEME, ID.qldDraft)).toMatchSnapshot();
  });
  it("Queensland issued", async () => {
    expect(await pdf(QLD_SCHEME, ID.qldIssued)).toMatchSnapshot();
  });
});

describe("issuing a certificate", () => {
  it("NSW: what the issue action writes, and the PDF of what it issued", async () => {
    const result = await issueCertificateAction(NSW_SCHEME, NSW_LOT, ID.nswDraft, {}, form({ checkedAll: "on" }));
    expect({ result, row: row(ID.nswDraft) }).toMatchSnapshot();
    expect(await pdf(NSW_SCHEME, ID.nswDraft)).toMatchSnapshot();
  });
  it("Queensland: what the issue action writes, and the PDF of what it issued", async () => {
    const result = await issueCertificateAction(QLD_SCHEME, QLD_LOT, ID.qldDraft, {}, form({ checkedAll: "on" }));
    expect({ result, row: row(ID.qldDraft) }).toMatchSnapshot();
    expect(await pdf(QLD_SCHEME, ID.qldDraft)).toMatchSnapshot();
  });
});

describe("the certificate pages", () => {
  it("NSW: the lot's certificates", async () => {
    expect(await html(CertificatesPage({ params: Promise.resolve({ id: NSW_SCHEME, lotId: NSW_LOT }) }))).toMatchSnapshot();
  });
  it("NSW: a draft", async () => {
    expect(await html(CertificatePage({ params: Promise.resolve({ id: NSW_SCHEME, lotId: NSW_LOT, certificateId: ID.nswDraft }) }))).toMatchSnapshot();
  });
  it("NSW: an issued certificate", async () => {
    expect(await html(CertificatePage({ params: Promise.resolve({ id: NSW_SCHEME, lotId: NSW_LOT, certificateId: ID.nswIssued }) }))).toMatchSnapshot();
  });
  it("Queensland: the lot's certificates", async () => {
    expect(await html(CertificatesPage({ params: Promise.resolve({ id: QLD_SCHEME, lotId: QLD_LOT }) }))).toMatchSnapshot();
  });
  it("Queensland: a draft", async () => {
    expect(await html(CertificatePage({ params: Promise.resolve({ id: QLD_SCHEME, lotId: QLD_LOT, certificateId: ID.qldDraft }) }))).toMatchSnapshot();
  });
  it("Queensland: an issued certificate", async () => {
    expect(await html(CertificatePage({ params: Promise.resolve({ id: QLD_SCHEME, lotId: QLD_LOT, certificateId: ID.qldIssued }) }))).toMatchSnapshot();
  });
});
