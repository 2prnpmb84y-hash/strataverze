/**
 * An issued certificate reads as it did on the day it was issued (NSW s 184,
 * the Queensland body corporate certificate; fix approved by Matthew
 * Wrigley on 31 Oct 2026). Before, its PDF was laid out from the building's
 * current pack and details each time it was opened, so a later change to the
 * pack's wording or the building silently altered a certificate already
 * given to a buyer. Here the pack's wording and the building change after
 * issue: the issued PDF and page are unchanged, while a draft follows the new
 * wording.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { extractText, getDocumentProxy } from "unpdf";
import type { StatutoryRules } from "@/config/statutory";

const packs = vi.hoisted(() => ({ override: {} as Record<string, unknown> }));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adviser-1", isPlatformAdmin: false })) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}), recordActionInvocation: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async (id: string) => ({ id, memberships: [{ profileId: "adviser-1", role: "ADVISER" }] })) }));
// The building's pack, or the changed one a test puts in its place.
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { db } = await import("@/prisma/db");
  const rulesForState = (state: string | null | undefined) => {
    const r = actual.rulesForState(state);
    return { ...r, rules: (packs.override[String(state)] as StatutoryRules | undefined) ?? r.rules, label: `${r.pack.code} test` };
  };
  const rulesForScheme = async (schemeId: string) => rulesForState((await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first())?.state);
  return { ...actual, rulesForState, rulesForScheme };
});
vi.mock("@/lib/jurisdiction/scheme-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/jurisdiction/scheme-time")>()), schemeToday: async () => "2026-10-27" }));

const { sharedFake } = await import("@/test/fake-orm");
const { NextRequest } = await import("next/server");
const { RULE_PACKS, QLD_RULE_PACK } = await import("@/config/statutory");
const { GET } = await import("@/app/api/records/certificate/[certificateId]/route");
const store = await import("./records-store");
const { backfillIssuedCertificateContent } = await import("./issued-certificate-backfill");
const { certificateDocument, issuedCertificateContent, keptDocument, IssuedContentError } = await import("./issued-certificate");
const { default: CertificatePage } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/certificates/[certificateId]/page");

const SCHEME = { NSW: "aaaaaaaa-0000-4000-8000-000000000001", QLD: "aaaaaaaa-0000-4000-8000-000000000002" } as const;
const LOT = { NSW: "bbbbbbbb-0000-4000-8000-000000000001", QLD: "bbbbbbbb-0000-4000-8000-000000000002" } as const;
/** Per state: a draft to issue, a draft left as a draft, and one issued before the fix (no kept content). */
const IDS = {
  NSW: { issue: "cccccccc-0000-4000-8000-000000000011", draft: "cccccccc-0000-4000-8000-000000000012", legacy: "cccccccc-0000-4000-8000-000000000013" },
  QLD: { issue: "cccccccc-0000-4000-8000-000000000021", draft: "cccccccc-0000-4000-8000-000000000022", legacy: "cccccccc-0000-4000-8000-000000000023" },
} as const;
const RULES = { NSW: RULE_PACKS.NSW.rules, QLD: QLD_RULE_PACK.rules as StatutoryRules } as const;
type State = keyof typeof RULES;

/** The pack with every word the certificate reads changed, as a later pack version might. */
function changedPack(rules: StatutoryRules): StatutoryRules {
  const c = rules.CERTIFICATE!;
  return {
    ...rules,
    TERMINOLOGY: { ...rules.TERMINOLOGY, ownersCorporation: "CHANGED BODY", planLabel: "CHANGED PLAN" },
    CERTIFICATE: {
      ...c,
      title: "CHANGED TITLE",
      section: "CHANGED SECTION",
      planRowLabel: "CHANGED PLAN ROW",
      execution: "CHANGED EXECUTION",
      executionLines: ["CHANGED LINE"],
      conclusiveNote: "CHANGED NOTE",
      follows: "CHANGED LAYOUT",
      form: "CHANGED FORM",
      requesterTypes: Object.fromEntries(Object.keys(c.requesterTypes).map((k) => [k, `CHANGED ${k}`])),
      items: c.items.map(([no]) => [no, `CHANGED HEADING ${no}`] as const),
    },
  };
}

const items = (state: State) => RULES[state].CERTIFICATE!.items.map(([no, title]) => ({ no, title, text: `Item ${no} as completed.` }));
const certificate = (state: State, id: string, number: number, o: Record<string, unknown> = {}) => ({
  id,
  schemeId: SCHEME[state],
  lotId: LOT[state],
  number,
  status: "DRAFT",
  requestedOn: "2026-10-20",
  requesterType: "OWNER",
  requesterName: "Jo Citizen",
  requesterAddress: "7/1 Example St",
  authorisedByType: null,
  authorisedByName: null,
  authorisedByAddress: null,
  items: items(state),
  draftedOn: "2026-10-27",
  certificateDate: null,
  feeCents: null,
  feeRepeat: false,
  feePaidOn: null,
  rulePack: null,
  issuedContent: null,
  createdBy: "adviser-1",
  issuedBy: null,
  ...o,
});

beforeEach(() => {
  packs.override = {};
  sharedFake.reset({
    Scheme: [
      { id: SCHEME.NSW, name: "Harbour View", planNumber: "12345", state: "NSW", timeZone: "Australia/Sydney" },
      { id: SCHEME.QLD, name: "Seaview", planNumber: "4567", state: "QLD", timeZone: "Australia/Brisbane" },
    ],
    Lot: [
      { id: LOT.NSW, schemeId: SCHEME.NSW, lotNumber: "7" },
      { id: LOT.QLD, schemeId: SCHEME.QLD, lotNumber: "3" },
    ],
    SchemeMembership: [
      { id: "m1", schemeId: SCHEME.NSW, profileId: "adviser-1", role: "ADVISER", isActive: true },
      { id: "m2", schemeId: SCHEME.QLD, profileId: "adviser-1", role: "ADVISER", isActive: true },
    ],
    SaleCertificate: (["NSW", "QLD"] as const).flatMap((s) => [
      certificate(s, IDS[s].issue, 3),
      certificate(s, IDS[s].draft, 4),
      certificate(s, IDS[s].legacy, 1, { status: "ISSUED", certificateDate: "2026-10-02", feeCents: 10_900, rulePack: "AU-OLD 2026.10.7" }),
    ]),
  });
});
const idOf = (state: State, which: keyof (typeof IDS)["NSW"]) => IDS[state][which];

async function pdf(state: State, certificateId: string) {
  const r = await GET(new NextRequest(`https://app.test/api/records/certificate/${certificateId}?schemeId=${SCHEME[state]}`), { params: Promise.resolve({ certificateId }) });
  expect(r.status).toBe(200);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { sha256: createHash("sha256").update(bytes).digest("hex"), text: String((await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true })).text) };
}
const page = async (state: State, certificateId: string) => renderToStaticMarkup((await CertificatePage({ params: Promise.resolve({ id: SCHEME[state], lotId: LOT[state], certificateId }) }))!);
const row = (id: string) => sharedFake.tables.SaleCertificate.find((x) => x.id === id)!;

/** After issue: the pack's certificate wording and the building's details change. */
function changeEverything(state: State) {
  packs.override[state] = changedPack(RULES[state]);
  Object.assign(sharedFake.tables.Scheme.find((s) => s.id === SCHEME[state])!, { name: "Renamed", planNumber: "99999" });
  Object.assign(sharedFake.tables.Lot.find((l) => l.id === LOT[state])!, { lotNumber: "70" });
}

describe.each(["NSW", "QLD"] as const)("%s: an issued certificate after the pack's wording and the building change", (state) => {
  it("its PDF is unchanged, byte for byte", async () => {
    await store.issueCertificate({ schemeId: SCHEME[state], certificateId: idOf(state, "issue"), actorId: "adviser-1", checkedAll: true });
    const before = await pdf(state, idOf(state, "issue"));
    expect(before.text.replace(/\s+/g, " ")).toContain(`${RULES[state].CERTIFICATE!.title} (${RULES[state].CERTIFICATE!.section})`);
    changeEverything(state);
    const after = await pdf(state, idOf(state, "issue"));
    expect(after).toEqual(before);
    expect(after.text).not.toMatch(/CHANGED|Renamed|99999|Lot 70/);
  });

  it("a draft follows the new wording and the building's new details", async () => {
    changeEverything(state);
    const { text } = await pdf(state, idOf(state, "draft"));
    expect(text).toContain("CHANGED TITLE (CHANGED SECTION)");
    expect(text).toContain("CHANGED EXECUTION");
    expect(text).toContain("CHANGED NOTE");
    expect(text).toContain("CHANGED PLAN ROW 99999");
    expect(text).toContain("Renamed");
    expect(text).toContain("Lot 70");
    expect(text).toContain("CHANGED OWNER");
    expect(text).toContain("This is a draft");
  });

  it("its page keeps the words it was issued with", async () => {
    await store.issueCertificate({ schemeId: SCHEME[state], certificateId: idOf(state, "issue"), actorId: "adviser-1", checkedAll: true });
    changeEverything(state);
    const html = await page(state, idOf(state, "issue"));
    const c = RULES[state].CERTIFICATE!;
    expect(html).toContain(`${c.title} 3: Lot 70`);
    expect(html).toContain(`${c.execution}. ${c.conclusiveNote}`.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("CHANGED");
    expect(html).not.toContain("Issued before StrataVerze kept");
  });

  it("one issued before the fix (none kept) follows the current wording, and its page says so", async () => {
    changeEverything(state);
    expect((await pdf(state, idOf(state, "legacy"))).text).toContain("CHANGED TITLE");
    const html = await page(state, idOf(state, "legacy"));
    expect(html).toContain("Issued before StrataVerze kept each certificate as issued");
    expect(html).toContain("CHANGED EXECUTION. CHANGED NOTE");
  });
});

describe("issuing", () => {
  it("keeps what the PDF reads in the same write that issues it, from the certificate row it holds", async () => {
    const id = idOf("NSW", "issue");
    await store.issueCertificate({ schemeId: SCHEME.NSW, certificateId: id, actorId: "adviser-1", checkedAll: true });
    const r = row(id);
    expect(r).toMatchObject({ status: "ISSUED", certificateDate: "2026-10-27", rulePack: "AU-NSW test" });
    expect(r.issuedContent).toEqual(
      issuedCertificateContent(certificateDocument({ cert: { ...r, status: "ISSUED" } as never, rules: RULES.NSW, scheme: { name: "Harbour View", planNumber: "12345" }, lot: { lotNumber: "7" }, today: "2026-10-27" }), { source: "ISSUE", rulePack: "AU-NSW test" }),
    );
    expect(sharedFake.locks).toContainEqual({ table: "SaleCertificate", ids: [id], inTransaction: true });
  });

  it("keeps nothing when the issue fails", async () => {
    const id = idOf("NSW", "issue");
    // Changed between the first check and the transaction: an item asks to be completed again.
    const realFirst = row(id);
    let reads = 0;
    const items = realFirst.items as Array<{ no: string; text: string }>;
    Object.defineProperty(realFirst, "items", {
      configurable: true,
      enumerable: true,
      get: () => (reads++ === 0 ? items : items.map((i) => (i.no === "2" ? { ...i, text: "Check and complete." } : i))),
    });
    await expect(store.issueCertificate({ schemeId: SCHEME.NSW, certificateId: id, actorId: "adviser-1", checkedAll: true })).rejects.toThrow(/Items 2 still say/);
    expect(row(id)).toMatchObject({ status: "DRAFT", issuedContent: null, certificateDate: null });
  });
});

describe("the kept content", () => {
  it("is read back as kept, and refused rather than replaced when it cannot be read", () => {
    expect(keptDocument(null)).toBeNull();
    expect(keptDocument(undefined)).toBeNull();
    const doc = certificateDocument({ cert: certificate("NSW", "x", 1, { status: "ISSUED", certificateDate: "2026-10-27" }) as never, rules: RULES.NSW, scheme: { name: "Harbour View", planNumber: null }, lot: { lotNumber: "7" }, today: "2026-10-27" });
    const kept = issuedCertificateContent(doc, { source: "ISSUE", rulePack: "AU-NSW test" });
    expect({ ...keptDocument(kept), draft: false }).toEqual(doc);
    expect({ ...keptDocument(JSON.stringify(kept)), draft: false }).toEqual(doc);
    expect(() => keptDocument({ ...kept, version: 2 })).toThrow(IssuedContentError);
    expect(() => keptDocument({ ...kept, document: { ...kept.document, title: undefined } })).toThrow(IssuedContentError);
    expect(() => keptDocument({ ...kept, document: { ...kept.document, items: [{ no: "1" }] } })).toThrow(IssuedContentError);
  });

  it("is only for an issued certificate", () => {
    const draft = certificateDocument({ cert: certificate("NSW", "x", 1) as never, rules: RULES.NSW, scheme: null, lot: null, today: "2026-10-27" });
    expect(() => issuedCertificateContent(draft, { source: "ISSUE", rulePack: null })).toThrow(/Only an issued certificate/);
  });

  it("makes the issued PDF fail, never fall back to the current wording, when it cannot be read", async () => {
    Object.assign(row(idOf("QLD", "legacy")), { issuedContent: { version: 1, document: { title: "x" } } });
    await expect(GET(new NextRequest(`https://app.test/api/records/certificate/${idOf("QLD", "legacy")}?schemeId=${SCHEME.QLD}`), { params: Promise.resolve({ certificateId: idOf("QLD", "legacy") }) })).rejects.toThrow(IssuedContentError);
  });
});

describe("the backfill for certificates issued before the fix", () => {
  it("lists what it would keep on a dry run, and writes nothing", async () => {
    const out = await backfillIssuedCertificateContent({ apply: false, now: new Date("2026-11-30T00:00:00Z") });
    expect(out.map((o) => [o.id, o.written])).toEqual([
      [idOf("NSW", "legacy"), false],
      [idOf("QLD", "legacy"), false],
    ]);
    expect(out[0].content).toMatchObject({ version: 1, source: "BACKFILL", rulePack: "AU-OLD 2026.10.7", keptOn: "2026-11-30", keptUnder: "AU-NSW test" });
    expect(sharedFake.tables.SaleCertificate.every((r) => r.issuedContent === null)).toBe(true);
  });

  it("keeps each such certificate as its PDF reads now, once, and leaves drafts and kept ones alone", async () => {
    await store.issueCertificate({ schemeId: SCHEME.NSW, certificateId: idOf("NSW", "issue"), actorId: "adviser-1", checkedAll: true });
    const keptAtIssue = row(idOf("NSW", "issue")).issuedContent;
    const before = { NSW: await pdf("NSW", idOf("NSW", "legacy")), QLD: await pdf("QLD", idOf("QLD", "legacy")) };
    const out = await backfillIssuedCertificateContent({ apply: true, now: new Date("2026-11-30T00:00:00Z") });
    expect(out.map((o) => [o.id, o.written])).toEqual([
      [idOf("NSW", "legacy"), true],
      [idOf("QLD", "legacy"), true],
    ]);
    expect(row(idOf("NSW", "issue")).issuedContent).toBe(keptAtIssue);
    expect(row(idOf("NSW", "draft")).issuedContent).toBeNull();
    // As read before the backfill, and unchanged by a later change.
    changeEverything("NSW");
    changeEverything("QLD");
    expect(await pdf("NSW", idOf("NSW", "legacy"))).toEqual(before.NSW);
    expect(await pdf("QLD", idOf("QLD", "legacy"))).toEqual(before.QLD);
    expect(await backfillIssuedCertificateContent({ apply: true })).toEqual([]);
  });
});
