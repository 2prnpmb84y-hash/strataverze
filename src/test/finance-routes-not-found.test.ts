/**
 * Finance download routes answer another building's record exactly as a
 * missing one (finding S-04, 31 Oct 2026). User A is the Adviser of scheme X
 * only. For each route, a real record of scheme Y gives the same 404 as a
 * random id, nothing is written to Y's activity log, and the refusal is a
 * security event for A. A's own record in X still downloads. The access
 * checks (src/lib/finance/finance-access.ts) and the helper
 * (src/lib/finance/access-denied.ts) run for real against the fake ORM.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const who = vi.hoisted(() => ({ profile: { id: "user-a", isPlatformAdmin: false } as { id: string; isPlatformAdmin: boolean } | null }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => who.profile) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));

const PDF = { bytes: new Uint8Array([37, 80, 68, 70]), fileName: "doc.pdf", documentId: "d" };
vi.mock("@/lib/pdf/generate", () => ({
  generateLevyNoticePdf: vi.fn(async () => PDF),
  generateOwnerStatementPdf: vi.fn(async () => PDF),
  generateRemittancePdf: vi.fn(async () => PDF),
  generateCommitteePackPdf: vi.fn(async () => PDF),
  generateStatutoryPackPdf: vi.fn(async () => PDF),
}));
vi.mock("@/lib/pdf/generate-payment-plan", () => ({ generatePaymentPlanReplyPdf: vi.fn(async () => PDF) }));
vi.mock("@/lib/jurisdiction/scheme-rules", () => ({
  rulesForScheme: vi.fn(async () => ({
    rules: { FEATURES: { keyFinancialInformation: true, statutoryPaymentPlans: true, strataInformationCertificate: true, bodyCorporateCertificate: false } },
  })),
}));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeTimeZone: vi.fn(async () => "Australia/Sydney"), schemeToday: vi.fn(async () => "2026-10-31") }));
vi.mock("@/lib/pdf/certificate", () => ({ renderCertificatePdf: vi.fn(async () => PDF.bytes) }));
vi.mock("@/lib/records/issued-certificate", () => ({
  certificateDocument: vi.fn(() => ({})),
  certificateFileStem: vi.fn(() => "certificate"),
  keptContent: vi.fn(() => null),
  renderKeptCertificate: vi.fn(),
}));
vi.mock("@/lib/queries/document-url", () => ({ resolveDocumentUrl: vi.fn(async () => "https://storage.test/signed") }));

const { sharedFake } = await import("@/test/fake-orm");
const { recordSecurityEventLater } = await import("@/lib/audit/security-audit");
const { logActivity } = await import("@/lib/queries/activity-log");
const levyNotice = await import("@/app/api/finance/pdf/levy-notice/[noticeId]/route");
const remittance = await import("@/app/api/finance/pdf/remittance/[invoiceId]/route");
const documents = await import("@/app/api/finance/documents/[documentId]/route");
const ownerStatement = await import("@/app/api/finance/pdf/owner-statement/route");
const committeePack = await import("@/app/api/finance/pdf/committee-pack/route");
const statutoryPack = await import("@/app/api/finance/pdf/statutory-pack/route");
const paymentPlanReply = await import("@/app/api/debt-recovery/payment-plan-reply/[requestId]/route");
const certificate = await import("@/app/api/records/certificate/[certificateId]/route");

const X = "aaaaaaaa-0000-4000-8000-00000000000a";
const Y = "bbbbbbbb-0000-4000-8000-00000000000b";
const MISSING = "99999999-9999-4999-8999-999999999999";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LOT_X = id(1);
const LOT_X2 = id(2);
const LOT_Y = id(3);

type Get = (req: never, ctx: never) => Promise<Response>;
const req = (path: string) => new NextRequest(`https://app.test${path}`) as unknown as never;
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as unknown as never;

beforeEach(() => {
  vi.clearAllMocks();
  who.profile = { id: "user-a", isPlatformAdmin: false };
  sharedFake.reset({
    SchemeMembership: [
      { id: "m-a", schemeId: X, profileId: "user-a", role: "ADVISER", isActive: true, lotId: null },
      { id: "m-y", schemeId: Y, profileId: "user-y", role: "ADVISER", isActive: true, lotId: null },
    ],
    LevyNotice: [
      { id: id(10), schemeId: X, lotId: LOT_X, status: "ISSUED" },
      { id: id(11), schemeId: Y, lotId: LOT_Y, status: "ISSUED" },
      { id: id(12), schemeId: X, lotId: LOT_X2, status: "ISSUED" },
    ],
    SupplierInvoice: [
      { id: id(20), schemeId: X },
      { id: id(21), schemeId: Y },
    ],
    FinancialDocument: [
      { id: id(30), schemeId: X, documentType: "RECEIPT", lotId: null, fileUrl: `${X}/receipts/r.pdf`, fileName: "r.pdf" },
      { id: id(31), schemeId: Y, documentType: "RECEIPT", lotId: null, fileUrl: `${Y}/receipts/r.pdf`, fileName: "r.pdf" },
      { id: id(32), schemeId: X, documentType: "LEVY_NOTICE", lotId: LOT_X, fileName: "n.pdf", contentHash: "h" },
      { id: id(33), schemeId: Y, documentType: "LEVY_NOTICE", lotId: LOT_Y, fileName: "n.pdf", contentHash: "h" },
    ],
    FinancialDocumentFile: [
      { id: "f32", financialDocumentId: id(32), contentBase64: "JVBERg==" },
      { id: "f33", financialDocumentId: id(33), contentBase64: "JVBERg==" },
    ],
    PaymentPlanRequest: [
      { id: id(40), schemeId: X, lotId: LOT_X },
      { id: id(41), schemeId: Y, lotId: LOT_Y },
    ],
    SaleCertificate: [
      { id: id(50), schemeId: X, lotId: LOT_X, status: "DRAFT", number: "1" },
      { id: id(51), schemeId: Y, lotId: LOT_Y, status: "DRAFT", number: "1" },
    ],
    Scheme: [{ id: X }, { id: Y }],
    Lot: [{ id: LOT_X, schemeId: X }],
  });
});

/** Each route: a request for one of its records (or a building's), by id or scheme. */
const routes: Array<{ name: string; call: (target: { recordId: string; schemeId: string; lotId: string }) => Promise<Response>; x: { recordId: string; lotId: string }; y: { recordId: string; lotId: string } }> = [
  {
    name: "levy notice PDF",
    call: (t) => (levyNotice.GET as Get)(req(`/api/finance/pdf/levy-notice/${t.recordId}`), ctx({ noticeId: t.recordId })),
    x: { recordId: id(10), lotId: LOT_X },
    y: { recordId: id(11), lotId: LOT_Y },
  },
  {
    name: "remittance PDF",
    call: (t) => (remittance.GET as Get)(req(`/api/finance/pdf/remittance/${t.recordId}`), ctx({ invoiceId: t.recordId })),
    x: { recordId: id(20), lotId: "" },
    y: { recordId: id(21), lotId: "" },
  },
  {
    name: "uploaded financial document",
    call: (t) => (documents.GET as Get)(req(`/api/finance/documents/${t.recordId}`), ctx({ documentId: t.recordId })),
    x: { recordId: id(30), lotId: "" },
    y: { recordId: id(31), lotId: "" },
  },
  {
    name: "generated financial document",
    call: (t) => (documents.GET as Get)(req(`/api/finance/documents/${t.recordId}`), ctx({ documentId: t.recordId })),
    x: { recordId: id(32), lotId: LOT_X },
    y: { recordId: id(33), lotId: LOT_Y },
  },
  {
    name: "payment plan reply PDF",
    call: (t) => (paymentPlanReply.GET as Get)(req(`/api/debt-recovery/payment-plan-reply/${t.recordId}?schemeId=${t.schemeId}`), ctx({ requestId: t.recordId })),
    x: { recordId: id(40), lotId: LOT_X },
    y: { recordId: id(41), lotId: LOT_Y },
  },
  {
    name: "information certificate PDF",
    call: (t) => (certificate.GET as unknown as Get)(req(`/api/records/certificate/${t.recordId}?schemeId=${t.schemeId}`), ctx({ certificateId: t.recordId })),
    x: { recordId: id(50), lotId: LOT_X },
    y: { recordId: id(51), lotId: LOT_Y },
  },
  {
    name: "owner statement PDF",
    call: (t) => (ownerStatement.GET as unknown as Get)(req(`/api/finance/pdf/owner-statement?schemeId=${t.schemeId}&lotId=${t.lotId}`), ctx({})),
    x: { recordId: "", lotId: LOT_X },
    y: { recordId: "", lotId: LOT_Y },
  },
  {
    name: "committee pack PDF",
    call: (t) => (committeePack.GET as unknown as Get)(req(`/api/finance/pdf/committee-pack?schemeId=${t.schemeId}&startDate=2026-07-01&endDate=2026-09-30&year=2026`), ctx({})),
    x: { recordId: "", lotId: "" },
    y: { recordId: "", lotId: "" },
  },
  {
    name: "statutory statements PDF",
    call: (t) => (statutoryPack.GET as unknown as Get)(req(`/api/finance/pdf/statutory-pack?schemeId=${t.schemeId}&year=2026`), ctx({})),
    x: { recordId: "", lotId: "" },
    y: { recordId: "", lotId: "" },
  },
];

const deniedEvents = () =>
  vi.mocked(recordSecurityEventLater).mock.calls.map(([e]) => e).filter((e) => e.action === "access.denied");

describe("finance download routes (S-04)", () => {
  for (const r of routes) {
    describe(r.name, () => {
      it("answers another building's record exactly as a missing one", async () => {
        const foreign = await r.call({ ...r.y, schemeId: Y });
        // A missing record: a random id where the route takes one, otherwise a building that does not exist.
        const missing = await r.call(r.y.recordId ? { ...r.y, recordId: MISSING, schemeId: Y } : { ...r.y, schemeId: MISSING, lotId: r.y.lotId && MISSING });
        expect(foreign.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(await foreign.text()).toBe(await missing.text());
        expect(foreign.headers.get("Cache-Control")).toBe(missing.headers.get("Cache-Control"));
      });

      it("writes nothing to the other building's activity log, and records a security event for the caller", async () => {
        await r.call({ ...r.y, schemeId: Y });
        expect(logActivity).not.toHaveBeenCalled();
        const events = deniedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ outcome: "denied", actorProfileId: "user-a", schemeId: Y });
      });

      it("still gives the caller's own building's record", async () => {
        const own = await r.call({ ...r.x, schemeId: X });
        expect([200, 302]).toContain(own.status);
        expect(deniedEvents()).toHaveLength(0);
      });
    });
  }

  it("an owner of X refused another lot's notice in X gets the same 404, and the refusal stays in X's own activity log", async () => {
    sharedFake.reset({
      SchemeMembership: [{ id: "m-o", schemeId: X, profileId: "user-a", role: "OWNER", isActive: true, lotId: LOT_X }],
      LevyNotice: [
        { id: id(10), schemeId: X, lotId: LOT_X, status: "ISSUED" },
        { id: id(12), schemeId: X, lotId: LOT_X2, status: "ISSUED" },
      ],
    });
    const other = await routes[0].call({ recordId: id(12), lotId: LOT_X2, schemeId: X });
    const missing = await routes[0].call({ recordId: MISSING, lotId: LOT_X2, schemeId: X });
    expect(other.status).toBe(404);
    expect(await other.text()).toBe(await missing.text());
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ schemeId: X, actorId: "user-a", action: "FINANCIAL_DOCUMENT_ACCESS_DENIED" }));
    // Their own lot's notice still downloads.
    expect((await routes[0].call({ recordId: id(10), lotId: LOT_X, schemeId: X })).status).toBe(200);
  });
});
