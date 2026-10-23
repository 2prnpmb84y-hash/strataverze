import { beforeEach, describe, expect, it, vi } from "vitest";

/** Prepared uploads (S3): the server chooses the path and checks what arrived. */
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
const authorise = vi.fn();
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: (s: string, c: string) => authorise(s, c) }));
vi.mock("@/lib/auth/require-membership", async () => {
  const errors = await import("@/lib/auth/errors");
  return { AuthorisationError: errors.AuthorisationError, requireSchemeMembership: (s: string, r: string[]) => authorise(s, r) };
});
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
const storage = { info: vi.fn(), head: vi.fn(), removed: [] as string[] };
vi.mock("./server-storage", () => ({
  signUpload: async () => ({ signedUrl: "https://storage.example/upload", token: "tok" }),
  storedObjectInfo: (p: string) => storage.info(p),
  readObjectHead: (p: string) => storage.head(p),
  removeRejectedUpload: async (p: string) => void storage.removed.push(p),
}));

const { sharedFake } = await import("@/test/fake-orm");
const { prepareUpload, verifyUpload, markUploadUsed } = await import("./uploads");

const S = "11111111-1111-4111-8111-111111111111";
const pdf = new TextEncoder().encode("%PDF-1.7 ...");
const rows = () => (sharedFake as unknown as { tables: Record<string, Record<string, unknown>[]> }).tables.StorageUpload;

beforeEach(() => {
  sharedFake.reset({ StorageUpload: [] });
  authorise.mockReset();
  authorise.mockResolvedValue({ profile: { id: "p1" } });
  storage.info.mockReset();
  storage.head.mockReset();
  storage.removed = [];
});

describe("prepareUpload", () => {
  it("authorises for the purpose and chooses the path itself", async () => {
    const r = await prepareUpload({ schemeId: S, purpose: "library", fileName: "../../etc/Minutes.pdf", size: 1000 });
    expect(authorise).toHaveBeenCalledWith(S, "documents.manage");
    expect(r.path).toMatch(new RegExp(`^schemes/${S}/library/[0-9a-f-]{36}\\.pdf$`));
    expect(r.contentType).toBe("application/pdf");
    expect(rows()[0]).toMatchObject({ schemeId: S, purpose: "library", profileId: "p1", declaredSize: 1000 });
  });

  it("puts payment confirmations directly in the payments folder, for owners", async () => {
    const r = await prepareUpload({ schemeId: S, purpose: "payment_confirmation", fileName: "receipt.jpg", size: 10 });
    expect(authorise).toHaveBeenCalledWith(S, ["OWNER"]);
    expect(r.path).toMatch(new RegExp(`^schemes/${S}/payments/[0-9a-f-]{36}\\.jpg$`));
  });

  it("refuses the wrong type, an empty file and an oversized file", async () => {
    await expect(prepareUpload({ schemeId: S, purpose: "library", fileName: "x.svg", size: 10 })).rejects.toThrow(/not accepted/);
    await expect(prepareUpload({ schemeId: S, purpose: "library", fileName: "x.pdf", size: 0 })).rejects.toThrow(/empty/);
    await expect(
      prepareUpload({ schemeId: S, purpose: "payment_confirmation", fileName: "x.pdf", size: 11 * 1024 * 1024 }),
    ).rejects.toThrow(/10 MB/);
    expect(rows()).toHaveLength(0);
  });

  it("refuses someone the purpose's check refuses", async () => {
    authorise.mockRejectedValue(new Error("no"));
    await expect(prepareUpload({ schemeId: S, purpose: "insurance", fileName: "x.pdf", size: 10 })).rejects.toThrow();
    expect(rows()).toHaveLength(0);
  });
});

describe("verifyUpload", () => {
  async function prepared(purpose: "library" | "finance_document" = "library", fileName = "Minutes.pdf") {
    return prepareUpload({ schemeId: S, purpose, fileName, size: 1000 });
  }

  it("accepts a file whose stored bytes match, using the stored size", async () => {
    const r = await prepared();
    storage.info.mockResolvedValue({ size: 2048, contentType: "application/pdf" });
    storage.head.mockResolvedValue(pdf);
    const v = await verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" });
    expect(v).toMatchObject({ path: r.path, fileName: "Minutes.pdf", size: 2048, mimeType: "application/pdf" });
  });

  it("refuses and removes a renamed file", async () => {
    const r = await prepared();
    storage.info.mockResolvedValue({ size: 100, contentType: "application/pdf" });
    storage.head.mockResolvedValue(new TextEncoder().encode("<html><script>x</script>"));
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).rejects.toThrow(/do not match/);
    expect(storage.removed).toEqual([r.path]);
    // And it cannot be tried again.
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).rejects.toThrow(/could not be found/);
  });

  it("refuses a file larger than allowed once stored", async () => {
    const r = await prepared("finance_document", "receipt.pdf");
    storage.info.mockResolvedValue({ size: 11 * 1024 * 1024, contentType: "application/pdf" });
    await expect(
      verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "finance_document", profileId: "p1" }),
    ).rejects.toThrow(/10 MB/);
  });

  it("refuses another person's upload, another building's, another purpose's, and a used one", async () => {
    const r = await prepared();
    storage.info.mockResolvedValue({ size: 10, contentType: null });
    storage.head.mockResolvedValue(pdf);
    for (const wrong of [
      { profileId: "p2" },
      { schemeId: "22222222-2222-4222-8222-222222222222" },
      { purpose: "insurance" as const },
    ]) {
      await expect(
        verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1", ...wrong }),
      ).rejects.toThrow(/could not be found/);
    }
    await markUploadUsed(r.uploadId, "doc-1");
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).rejects.toThrow(/could not be found/);
  });

  it("refuses an expired upload", async () => {
    const r = await prepared();
    rows()[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).rejects.toThrow(/expired/);
  });
});
