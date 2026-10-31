/**
 * An issued certificate reads as it did on the day it was issued (NSW s 184,
 * the Queensland body corporate certificate; fix approved by Matthew
 * Wrigley on 31 Oct 2026). Before, its PDF was laid out from the building's
 * current pack and details each time it was opened, so a later change to the
 * pack's wording or the building silently altered a certificate already
 * given to a buyer. Here the pack's wording and the building change after
 * issue: the issued PDF and page are unchanged, while a draft follows the new
 * wording. Also: the SHA-256 kept at issue and the check against it, the
 * fonts, the issue's checks as held, and the backfill.
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
// The PDF renderer, so a test can make the fonts unavailable.
vi.mock("@/lib/pdf/document", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/document")>();
  return { ...actual, renderPdf: vi.fn(actual.renderPdf) };
});
vi.mock("@/lib/log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/log")>()), logError: vi.fn() }));
vi.mock("@/lib/jurisdiction/scheme-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/jurisdiction/scheme-time")>()), schemeToday: async () => "2026-10-27" }));

const { sharedFake } = await import("@/test/fake-orm");
const { NextRequest } = await import("next/server");
const { RULE_PACKS, QLD_RULE_PACK } = await import("@/config/statutory");
const { GET } = await import("@/app/api/records/certificate/[certificateId]/route");
const store = await import("./records-store");
const { backfillIssuedCertificateContent, BackfillPackMismatchError } = await import("./issued-certificate-backfill");
const { certificateDocument, keepCertificate, keptContent, IssuedContentError } = await import("./issued-certificate");
const pdfDocument = await import("@/lib/pdf/document");
const { logError } = await import("@/lib/log");
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
  // Stored by value, as Postgres stores jsonb, so what is read back is a real round trip.
  sharedFake.setJsonColumns({ SaleCertificate: ["items", "issuedContent"] });
  vi.mocked(logError).mockClear();
  fontsAvailable(true);
});

/**
 * Make the Inter fonts unavailable to the PDF renderer, or available again.
 * Unavailable: a PDF that requires them is refused, as the renderer does
 * (src/lib/pdf/certificate-layout.test.ts covers the renderer itself).
 */
function fontsAvailable(yes: boolean) {
  const render = vi.mocked(pdfDocument.renderPdf);
  render.mockReset();
  render.mockImplementation(async (input) => {
    if (!yes && input.requireEmbeddedFonts) throw new pdfDocument.PdfFontsUnavailableError();
    return (await vi.importActual<typeof import("@/lib/pdf/document")>("@/lib/pdf/document")).renderPdf(input);
  });
}
const idOf = (state: State, which: keyof (typeof IDS)["NSW"]) => IDS[state][which];

const get = (state: State, certificateId: string) => GET(new NextRequest(`https://app.test/api/records/certificate/${certificateId}?schemeId=${SCHEME[state]}`), { params: Promise.resolve({ certificateId }) });
async function pdf(state: State, certificateId: string) {
  const r = await get(state, certificateId);
  expect(r.status).toBe(200);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { sha256: createHash("sha256").update(bytes).digest("hex"), text: String((await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true })).text), fileName: r.headers.get("Content-Disposition") };
}
const issue = (state: State, which: "issue" | "draft" = "issue") => store.issueCertificate({ schemeId: SCHEME[state], certificateId: idOf(state, which), actorId: "adviser-1", checkedAll: true });
const page = async (state: State, certificateId: string) => renderToStaticMarkup((await CertificatePage({ params: Promise.resolve({ id: SCHEME[state], lotId: LOT[state], certificateId }) }))!);
const row = (id: string) => sharedFake.tables.SaleCertificate.find((x) => x.id === id)!;

/** After issue: the pack's certificate wording and the building's details change. */
function changeEverything(state: State) {
  packs.override[state] = changedPack(RULES[state]);
  Object.assign(sharedFake.tables.Scheme.find((s) => s.id === SCHEME[state])!, { name: "Renamed", planNumber: "99999" });
  Object.assign(sharedFake.tables.Lot.find((l) => l.id === LOT[state])!, { lotNumber: "70" });
}

describe.each(["NSW", "QLD"] as const)("%s: an issued certificate after the pack's wording and the building change", (state) => {
  it("its PDF is unchanged, byte for byte, and is the file whose SHA-256 was kept at issue", async () => {
    await issue(state);
    const before = await pdf(state, idOf(state, "issue"));
    expect(before.text.replace(/\s+/g, " ")).toContain(`${RULES[state].CERTIFICATE!.title} (${RULES[state].CERTIFICATE!.section})`);
    expect((row(idOf(state, "issue")).issuedContent as { pdfSha256: string }).pdfSha256).toBe(before.sha256);
    changeEverything(state);
    const after = await pdf(state, idOf(state, "issue"));
    expect(after).toEqual(before);
    expect(after.text).not.toMatch(/CHANGED|Renamed|99999|Lot 70/);
    expect(logError).not.toHaveBeenCalled();
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

  it("its page keeps the words and the lot number it was issued with", async () => {
    await issue(state);
    changeEverything(state);
    const html = await page(state, idOf(state, "issue"));
    const c = RULES[state].CERTIFICATE!;
    expect(html).toContain(`${c.title} 3: Lot ${state === "NSW" ? 7 : 3}</h1>`);
    expect(html).toContain(`${c.execution}. ${c.conclusiveNote}`.replace(/'/g, "&#x27;"));
    expect(html).not.toMatch(/CHANGED|Lot 70|Issued before StrataVerze kept|Reconstructed|no longer matches|cannot be produced/);
  });

  it("opens, named as issued, when the building's pack no longer has the certificate or its state has no pack", async () => {
    await issue(state);
    const before = await pdf(state, idOf(state, "issue"));
    const rules = RULES[state];
    packs.override[state] = { ...rules, FEATURES: { ...rules.FEATURES, strataInformationCertificate: false, bodyCorporateCertificate: false } };
    expect(await pdf(state, idOf(state, "issue"))).toEqual(before);
    expect((await get(state, idOf(state, "draft"))).status).toBe(404);
    Object.assign(sharedFake.tables.Scheme.find((s) => s.id === SCHEME[state])!, { state: "VIC" });
    expect(await pdf(state, idOf(state, "issue"))).toEqual(before);
    expect(before.fileName).toBe(`inline; filename="${state === "NSW" ? "information" : "body-corporate"}-certificate-3.pdf"`);
    expect(await page(state, idOf(state, "issue"))).toContain(`${rules.CERTIFICATE!.title} 3:`);
  });

  it("one issued before the fix (none kept) follows the current wording, and its page says so", async () => {
    changeEverything(state);
    expect((await pdf(state, idOf(state, "legacy"))).text).toContain("CHANGED TITLE");
    const html = await page(state, idOf(state, "legacy"));
    expect(html).toContain("Issued before StrataVerze kept each certificate as issued");
    expect(html).toContain("CHANGED EXECUTION. CHANGED NOTE");
  });
});

describe("the PDF of an issued certificate checked against the one issued", () => {
  it("is still given when it no longer matches, with an error logged and a warning on its page", async () => {
    await issue("NSW");
    const before = await pdf("NSW", idOf("NSW", "issue"));
    (row(idOf("NSW", "issue")).issuedContent as { pdfSha256: string }).pdfSha256 = "0".repeat(64);
    expect(await pdf("NSW", idOf("NSW", "issue"))).toEqual(before);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("no longer matches the one issued"), expect.objectContaining({ issued: "0".repeat(64), now: before.sha256, layout: 1 }));
    expect(await page("NSW", idOf("NSW", "issue"))).toContain("This PDF no longer matches the one issued.");
  });

  it("is refused with a clear error, never drawn in another font, when its fonts are not available; a draft still is", async () => {
    await issue("QLD");
    fontsAvailable(false);
    const r = await get("QLD", idOf("QLD", "issue"));
    expect(r.status).toBe(503);
    expect(await r.text()).toMatch(/fonts it was issued in are not available/);
    expect(await page("QLD", idOf("QLD", "issue"))).toContain("The PDF cannot be produced now");
    expect((await get("QLD", idOf("QLD", "draft"))).status).toBe(200);
  });
});

describe("issuing", () => {
  it("keeps what the PDF reads, its layout and its SHA-256 in the same write that issues it, from the rows it holds", async () => {
    const id = idOf("NSW", "issue");
    await issue("NSW");
    const r = row(id);
    expect(r).toMatchObject({ status: "ISSUED", certificateDate: "2026-10-27", rulePack: "AU-NSW test" });
    const expected = await keepCertificate(certificateDocument({ cert: { ...r, status: "ISSUED" } as never, rules: RULES.NSW, scheme: { name: "Harbour View", planNumber: "12345" }, lot: { lotNumber: "7" }, today: "2026-10-27" }), { source: "ISSUE", rulePack: "AU-NSW test", fileStem: "information-certificate" });
    expect(r.issuedContent).toEqual(expected);
    expect(expected).toMatchObject({ version: 1, layout: 1, source: "ISSUE", fileStem: "information-certificate" });
    expect(sharedFake.locks).toEqual(
      expect.arrayContaining([
        { table: "Lot", ids: [LOT.NSW], inTransaction: true },
        { table: "SaleCertificate", ids: [id], inTransaction: true },
      ]),
    );
  });

  it("keeps nothing when an item changed since the first check asks to be completed", async () => {
    const id = idOf("NSW", "issue");
    const realFirst = row(id);
    let reads = 0;
    const items = realFirst.items as Array<{ no: string; text: string }>;
    Object.defineProperty(realFirst, "items", {
      configurable: true,
      enumerable: true,
      get: () => (reads++ === 0 ? items : items.map((i) => (i.no === "2" ? { ...i, text: "Check and complete." } : i))),
    });
    await expect(issue("NSW")).rejects.toThrow(/Items 2 still say/);
    expect(row(id)).toMatchObject({ status: "DRAFT", issuedContent: null, certificateDate: null });
  });

  /** A save of the draft that lands between issuing's first check and its transaction. */
  function saveLandsFirst(changes: Record<string, unknown>, id: string) {
    const original = sharedFake.db.transaction;
    vi.spyOn(sharedFake.db, "transaction").mockImplementationOnce(async (fn) => {
      Object.assign(row(id), changes);
      return original(fn as never);
    });
  }

  it("charges the fee for the draft as held: the requester saved since the first check", async () => {
    const id = idOf("QLD", "issue");
    Object.assign(row(id), { requesterName: "Pat Other" });
    // The Queensland repeat fee is for the same person: the one issued to Jo Citizen on 2 October.
    saveLandsFirst({ requesterName: "Jo Citizen" }, id);
    expect(await issue("QLD")).toEqual({ cents: 7_390, repeat: true });
    expect((row(id).issuedContent as { document: { requester: { name: string } } }).document.requester.name).toBe("Jo Citizen");
  });

  it("refuses, keeping nothing, when the draft as held has figures from before today", async () => {
    const id = idOf("NSW", "issue");
    saveLandsFirst({ draftedOn: "2026-10-26" }, id);
    await expect(issue("NSW")).rejects.toThrow(/taken from the records on 2026-10-26/);
    expect(row(id)).toMatchObject({ status: "DRAFT", issuedContent: null });
  });

  it("is refused, keeping nothing, when the PDF cannot be drawn in its fonts", async () => {
    fontsAvailable(false);
    await expect(issue("NSW")).rejects.toThrow(/cannot be issued now: StrataVerze cannot produce its PDF in its fonts/);
    expect(row(idOf("NSW", "issue"))).toMatchObject({ status: "DRAFT", issuedContent: null, certificateDate: null });
  });
});

describe("the kept content", () => {
  const issuedDoc = () => certificateDocument({ cert: certificate("NSW", "x", 1, { status: "ISSUED", certificateDate: "2026-10-27" }) as never, rules: RULES.NSW, scheme: { name: "Harbour View", planNumber: null }, lot: { lotNumber: "7" }, today: "2026-10-27" });

  it("is read back as kept, and refused rather than replaced when it cannot be read", async () => {
    expect(keptContent(null)).toBeNull();
    expect(keptContent(undefined)).toBeNull();
    const doc = issuedDoc();
    const kept = await keepCertificate(doc, { source: "ISSUE", rulePack: "AU-NSW test", fileStem: "information-certificate" });
    expect(keptContent(kept)).toEqual(kept);
    expect(keptContent(JSON.stringify(kept))).toEqual(kept);
    expect({ ...kept.document, draft: false }).toEqual(doc);
    for (const bad of [
      { ...kept, version: 2 },
      { ...kept, layout: 2 },
      { ...kept, layout: undefined },
      { ...kept, pdfSha256: undefined },
      { ...kept, pdfSha256: "abc" },
      { ...kept, fileStem: "../x" },
      { ...kept, source: "BACKFILL" },
      { ...kept, document: { ...kept.document, title: undefined } },
      { ...kept, document: { ...kept.document, items: [{ no: "1" }] } },
    ]) expect(() => keptContent(bad)).toThrow(IssuedContentError);
  });

  it("is only for an issued certificate", async () => {
    const draft = certificateDocument({ cert: certificate("NSW", "x", 1) as never, rules: RULES.NSW, scheme: null, lot: null, today: "2026-10-27" });
    await expect(keepCertificate(draft, { source: "ISSUE", rulePack: null, fileStem: "information-certificate" })).rejects.toThrow(/Only an issued certificate/);
  });

  it("makes the issued PDF fail, never fall back to the current wording, when it cannot be read", async () => {
    Object.assign(row(idOf("QLD", "legacy")), { issuedContent: { version: 1, document: { title: "x" } } });
    await expect(get("QLD", idOf("QLD", "legacy"))).rejects.toThrow(IssuedContentError);
  });
});

describe("the backfill for certificates issued before the fix", () => {
  const NOW = new Date("2026-11-30T00:00:00Z");

  it("lists what it would keep on a dry run, with the pack each was issued under and would be kept under, and writes nothing", async () => {
    const out = await backfillIssuedCertificateContent({ apply: false, now: NOW });
    expect(out.map((o) => [o.id, o.rulePack, o.keptUnder, o.packMatches, o.written])).toEqual([
      [idOf("NSW", "legacy"), "AU-OLD 2026.10.7", "AU-NSW test", false, false],
      [idOf("QLD", "legacy"), "AU-OLD 2026.10.7", "AU-QLD test", false, false],
    ]);
    expect(out[0].content).toMatchObject({ version: 1, layout: 1, source: "BACKFILL", rulePack: "AU-OLD 2026.10.7", keptOn: "2026-11-30", keptUnder: "AU-NSW test" });
    expect(sharedFake.tables.SaleCertificate.every((r) => r.issuedContent === null)).toBe(true);
  });

  it("writes nothing while a certificate's pack differs, naming both, unless that is allowed", async () => {
    const refused = backfillIssuedCertificateContent({ apply: true, now: NOW });
    await expect(refused).rejects.toThrow(BackfillPackMismatchError);
    await expect(backfillIssuedCertificateContent({ apply: true, now: NOW })).rejects.toThrow(/issued under AU-OLD 2026\.10\.7, and would be kept under AU-NSW test/);
    expect(sharedFake.tables.SaleCertificate.every((r) => r.issuedContent === null)).toBe(true);
    const out = await backfillIssuedCertificateContent({ apply: true, allowPackMismatch: true, now: NOW });
    expect(out.map((o) => o.written)).toEqual([true, true]);
  });

  it("keeps each such certificate as its PDF reads now, once, and leaves drafts and kept ones alone", async () => {
    Object.assign(row(idOf("NSW", "legacy")), { rulePack: "AU-NSW test" });
    Object.assign(row(idOf("QLD", "legacy")), { rulePack: "AU-QLD test" });
    await issue("NSW");
    const keptAtIssue = row(idOf("NSW", "issue")).issuedContent;
    const before = { NSW: await pdf("NSW", idOf("NSW", "legacy")), QLD: await pdf("QLD", idOf("QLD", "legacy")) };
    const out = await backfillIssuedCertificateContent({ apply: true, now: NOW });
    expect(out.map((o) => [o.id, o.packMatches, o.written])).toEqual([
      [idOf("NSW", "legacy"), true, true],
      [idOf("QLD", "legacy"), true, true],
    ]);
    expect(row(idOf("NSW", "issue")).issuedContent).toEqual(keptAtIssue);
    expect(row(idOf("NSW", "draft")).issuedContent).toBeNull();
    // As read before the backfill, the file whose SHA-256 it kept, and unchanged by a later change.
    expect((row(idOf("NSW", "legacy")).issuedContent as { pdfSha256: string }).pdfSha256).toBe(before.NSW.sha256);
    changeEverything("NSW");
    changeEverything("QLD");
    expect(await pdf("NSW", idOf("NSW", "legacy"))).toEqual(before.NSW);
    expect(await pdf("QLD", idOf("QLD", "legacy"))).toEqual(before.QLD);
    expect(await backfillIssuedCertificateContent({ apply: true })).toEqual([]);
  });

  it("is shown on the page as reconstructed, not as kept at issue", async () => {
    await backfillIssuedCertificateContent({ apply: true, allowPackMismatch: true, now: NOW });
    const html = await page("NSW", idOf("NSW", "legacy"));
    expect(html).toContain("Reconstructed on 2026-11-30 under AU-NSW test; issued under AU-OLD 2026.10.7.");
    expect(html).not.toContain("Issued before StrataVerze kept");
  });
});
