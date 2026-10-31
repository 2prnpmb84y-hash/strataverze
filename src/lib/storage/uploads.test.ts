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
const { prepareUpload, verifyUpload, consumeUpload, removeExpiredUploads } = await import("./uploads");

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

  it("refuses a building id that is not in canonical form", async () => {
    const lower = "abcdef12-3456-4789-8abc-def123456789";
    for (const schemeId of [lower.toUpperCase(), `{${lower}}`, lower.replace(/-/g, "")]) {
      await expect(prepareUpload({ schemeId, purpose: "library", fileName: "x.pdf", size: 10 })).rejects.toThrow(/not found/);
    }
    expect(authorise).not.toHaveBeenCalled();
  });

  it("limits how many uploads one person prepares, counted in the database", async () => {
    sharedFake.reset({
      StorageUpload: Array.from({ length: 60 }, (_, i) => ({
        id: `u${i}`,
        profileId: "p1",
        createdAt: new Date().toISOString(),
      })),
    });
    await expect(prepareUpload({ schemeId: S, purpose: "library", fileName: "x.pdf", size: 10 })).rejects.toThrow(/Too many/);
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
    storage.info.mockResolvedValue({ size: 10, contentType: "application/pdf" });
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
    await verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" });
    await consumeUpload(r.uploadId, async () => ({ id: "doc-1" }), (d) => `Document:${d.id}`);
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).rejects.toThrow(/could not be found/);
  });

  it("refuses a file stored with a different type from the one its name implies", async () => {
    const r = await prepared();
    storage.info.mockResolvedValue({ size: 100, contentType: "text/csv" });
    storage.head.mockResolvedValue(pdf);
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).rejects.toThrow(/type does not match/);
    expect(storage.removed).toEqual([r.path]);
  });

  it("accepts a stored type with parameters", async () => {
    const r = await prepared("library", "notes.txt");
    storage.info.mockResolvedValue({ size: 100, contentType: "text/plain;charset=UTF-8" });
    storage.head.mockResolvedValue(new TextEncoder().encode("Minutes of the meeting"));
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).resolves.toMatchObject({
      mimeType: "text/plain",
    });
  });

  it("refuses an expired upload", async () => {
    const r = await prepared();
    rows()[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" })).rejects.toThrow(/expired/);
  });
});

describe("consumeUpload", () => {
  async function verified() {
    const r = await prepareUpload({ schemeId: S, purpose: "library", fileName: "Minutes.pdf", size: 1000 });
    storage.info.mockResolvedValue({ size: 1000, contentType: "application/pdf" });
    storage.head.mockResolvedValue(pdf);
    await verifyUpload({ uploadId: r.uploadId, schemeId: S, purpose: "library", profileId: "p1" });
    return r;
  }

  it("lets an upload make one record only", async () => {
    const r = await verified();
    const create = vi.fn(async () => ({ id: "doc-1" }));
    await consumeUpload(r.uploadId, create, (d) => `Document:${d.id}`);
    await expect(consumeUpload(r.uploadId, create, (d) => `Document:${d.id}`)).rejects.toThrow(/already been used/);
    expect(create).toHaveBeenCalledTimes(1);
    expect(rows()[0]).toMatchObject({ usedFor: "Document:doc-1" });
  });

  it("refuses an upload that has not been checked", async () => {
    const r = await prepareUpload({ schemeId: S, purpose: "library", fileName: "Minutes.pdf", size: 1000 });
    await expect(consumeUpload(r.uploadId, async () => ({ id: "x" }), () => "x")).rejects.toThrow(/already been used/);
  });

  it("releases the upload when the record could not be created", async () => {
    const r = await verified();
    await expect(
      consumeUpload(r.uploadId, async () => {
        throw new Error("database down");
      }, () => "x"),
    ).rejects.toThrow(/database down/);
    expect(rows()[0]).toMatchObject({ usedAt: null, usedFor: null });
    await expect(consumeUpload(r.uploadId, async () => ({ id: "doc-2" }), (d) => d.id)).resolves.toEqual({ id: "doc-2" });
  });
});

describe("removeExpiredUploads", () => {
  it("removes unused uploads whose link has expired, and nothing else", async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    sharedFake.reset({
      StorageUpload: [
        { id: "a", path: "schemes/s/library/a.pdf", usedAt: null, expiresAt: old },
        { id: "b", path: "schemes/s/library/b.pdf", usedAt: old, expiresAt: old },
        { id: "c", path: "schemes/s/library/c.pdf", usedAt: null, expiresAt: fresh },
      ],
    });
    expect(await removeExpiredUploads()).toBe(1);
    expect(storage.removed).toEqual(["schemes/s/library/a.pdf"]);
    expect(rows().find((r) => r.id === "a")).toMatchObject({ usedFor: "expired" });
  });

  it("leaves a switched off scheme's uploads as they are", async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    sharedFake.reset({
      Scheme: [{ id: "on" }, { id: "off", isActive: false }],
      StorageUpload: [
        { id: "a", schemeId: "on", path: "schemes/on/library/a.pdf", usedAt: null, expiresAt: old },
        { id: "z", schemeId: "off", path: "schemes/off/library/z.pdf", usedAt: null, expiresAt: old },
      ],
    });
    expect(await removeExpiredUploads()).toBe(1);
    expect(storage.removed).toEqual(["schemes/on/library/a.pdf"]);
    expect(rows().find((r) => r.id === "a")).toMatchObject({ usedFor: "expired" });
    expect(rows().find((r) => r.id === "z")).toMatchObject({ usedAt: null });
    expect(rows().find((r) => r.id === "z")?.usedFor).toBeUndefined();
  });
});
