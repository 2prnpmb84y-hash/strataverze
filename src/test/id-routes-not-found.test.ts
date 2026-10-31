/**
 * The statutory snapshot and platform invoice PDF routes (finding S-08, 31
 * Oct 2026): a malformed id is not found, as a missing one is, and never
 * reaches the database. User A, a member of scheme X only, gets the same 404
 * for scheme Y's real record, and A's own record still downloads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "user-a", isPlatformAdmin: false })) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => ({
  ...(await orig()),
  rulesForScheme: vi.fn(async () => ({ rules: { FEATURES: { keyFinancialInformation: true } } })),
}));
vi.mock("@/lib/billing/invoice-pdf", () => ({ renderInvoicePdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const { sharedFake } = await import("@/test/fake-orm");
const snapshotRoute = await import("@/app/api/finance/statutory-pack/[snapshotId]/route");
const invoiceRoute = await import("@/app/api/platform-invoices/[invoiceId]/pdf/route");

const X = "aaaaaaaa-0000-4000-8000-00000000000a";
const Y = "bbbbbbbb-0000-4000-8000-00000000000b";
const SNAP_X = "11111111-0000-4000-8000-000000000001";
const SNAP_Y = "11111111-0000-4000-8000-000000000002";
const INV_X = "22222222-0000-4000-8000-000000000001";
const INV_Y = "22222222-0000-4000-8000-000000000002";
const MISSING = "99999999-9999-4999-8999-999999999999";

const snapshot = (id: string) =>
  snapshotRoute.GET(new NextRequest(`https://app.test/api/finance/statutory-pack/${id}`), { params: Promise.resolve({ snapshotId: id }) });
const invoice = (id: string) =>
  invoiceRoute.GET(new NextRequest(`https://app.test/api/platform-invoices/${id}/pdf`), { params: Promise.resolve({ invoiceId: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  sharedFake.reset({
    SchemeMembership: [{ id: "m-a", schemeId: X, profileId: "user-a", role: "ADVISER", isActive: true }],
    Scheme: [
      { id: X, state: "NSW" },
      { id: Y, state: "NSW" },
    ],
    StatutoryPackSnapshot: [
      { id: SNAP_X, schemeId: X, financialYear: 2026, content: "{}", contentHash: "h" },
      { id: SNAP_Y, schemeId: Y, financialYear: 2026, content: "{}", contentHash: "h" },
    ],
    PlatformInvoice: [
      { id: INV_X, schemeId: X, invoiceNumber: "SV-1" },
      { id: INV_Y, schemeId: Y, invoiceNumber: "SV-2" },
    ],
    PlatformFeeEvent: [],
  });
});

const MALFORMED = ["not-a-uuid", "1", "' OR 1=1 --", `${X}x`];

/**
 * Rows of the caller's own building stored under each malformed id: if the id
 * reached the query, the row would be found and served. (Postgres would
 * instead fail on the uuid cast, a 500.) A 404 shows the id never got there.
 */
function seedMalformed(table: "StatutoryPackSnapshot" | "PlatformInvoice") {
  for (const id of MALFORMED) sharedFake.table(table).push({ id, schemeId: X, financialYear: 2026, content: "{}", contentHash: "h", invoiceNumber: "SV-0" });
}

describe("the statutory snapshot route (S-08)", () => {
  it("answers 404 for a malformed id, which never reaches the query", async () => {
    seedMalformed("StatutoryPackSnapshot");
    for (const id of MALFORMED) expect((await snapshot(id)).status).toBe(404);
  });

  it("answers another building's snapshot as a missing one, and gives the caller's own", async () => {
    const [foreign, missing, own] = [await snapshot(SNAP_Y), await snapshot(MISSING), await snapshot(SNAP_X)];
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
    expect(own.status).toBe(200);
  });
});

describe("the platform invoice PDF route (S-08)", () => {
  it("answers 404 for a malformed id, which never reaches the query", async () => {
    seedMalformed("PlatformInvoice");
    for (const id of MALFORMED) expect((await invoice(id)).status).toBe(404);
  });

  it("answers another building's invoice as a missing one, and gives the caller's own", async () => {
    const [foreign, missing, own] = [await invoice(INV_Y), await invoice(MISSING), await invoice(INV_X)];
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("application/pdf");
  });
});
