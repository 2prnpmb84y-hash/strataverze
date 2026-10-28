/**
 * The levy notice PDF route (ACT stage 2, PR 6b review, 28 Oct 2026): a
 * notice whose required contents (each unit's contribution, the fund total,
 * the proportion) cannot be stated in full is refused with the reason, rather
 * than given as a PDF without them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => ({ impl: null as null | (() => Promise<unknown>) }));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adviser" })) }));
vi.mock("@/lib/finance/finance-access", () => ({ canReadLotDocuments: vi.fn(async () => true) }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/lib/pdf/generate", () => ({ generateLevyNoticePdf: vi.fn(async () => gen.impl!()) }));

const { sharedFake } = await import("@/test/fake-orm");
const { EveryLotUnavailableError } = await import("@/lib/levies/every-lot");
const { GET } = await import("./route");

const ID = "11111111-1111-4111-8111-111111111111";
const call = () => GET(new Request(`https://app.test/api/finance/pdf/levy-notice/${ID}`) as never, { params: Promise.resolve({ noticeId: ID }) });

beforeEach(() => {
  sharedFake.reset({ LevyNotice: [{ id: ID, schemeId: "s", lotId: "l", status: "ISSUED" }] });
});

describe("the levy notice PDF route", () => {
  it("refuses, with the reason, a notice whose required contents cannot be stated in full", async () => {
    gen.impl = async () => {
      throw new EveryLotUnavailableError("This notice's PDF cannot be given. The notice must state the unit's proportion.");
    };
    const r = await call();
    expect(r.status).toBe(409);
    expect(await r.text()).toBe("This notice's PDF cannot be given. The notice must state the unit's proportion.");
  });

  it("gives the PDF otherwise, and passes any other error on", async () => {
    gen.impl = async () => ({ bytes: new Uint8Array([37, 80, 68, 70]), fileName: "Levy-notice-LN-1.pdf", documentId: "d" });
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    gen.impl = async () => {
      throw new Error("boom");
    };
    await expect(call()).rejects.toThrow("boom");
  });
});
