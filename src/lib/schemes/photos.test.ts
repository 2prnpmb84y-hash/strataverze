import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

/** Property photos (25 Oct 2026): upload purpose, saving, signing and the list thumbnail. */

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
const authorise = vi.fn();
vi.mock("@/lib/auth/building-lock", () => ({ requireSchemeAccessOrAdmin: (s: string, c: string) => authorise(s, c) }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn() }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
const signed = vi.hoisted(() => ({ calls: [] as string[][] }));
vi.mock("@/lib/storage/server-storage", () => ({
  signUpload: async () => ({ signedUrl: "https://storage.example/upload", token: "tok" }),
  storedObjectInfo: async () => ({ size: 2000, contentType: "image/jpeg" }),
  readObjectHead: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  removeRejectedUpload: async () => {},
  signDownloads: async (paths: string[]) => {
    signed.calls.push(paths);
    return paths.map((p) => `https://signed.example/${p}`);
  },
}));

const { sharedFake } = await import("@/test/fake-orm");
const { prepareUpload } = await import("@/lib/storage/uploads");
const { setSchemePhoto, removeSchemePhoto, signedSchemeImages, schemeThumbnails } = await import("./photos");
const { removeSchemePhotoAction } = await import("@/lib/actions/scheme-photo");
const { photoFileProblem } = await import("./upload-photo");
const { SchemeThumb } = await import("@/components/schemes/scheme-thumb");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  sharedFake.reset({ StorageUpload: [], SchemeImage: [] });
  authorise.mockReset();
  authorise.mockResolvedValue({ profile: { id: "adviser-a" }, isAdmin: false });
  signed.calls = [];
});

describe("the scheme_photo upload purpose", () => {
  it("needs scheme.manage (or StrataVerze staff) and puts the photo in the building's photos folder", async () => {
    const r = await prepareUpload({ schemeId: A, purpose: "scheme_photo", fileName: "Front.JPG", size: 2000 });
    expect(authorise).toHaveBeenCalledWith(A, "scheme.manage");
    expect(r.path).toMatch(new RegExp(`^schemes/${A}/photos/[0-9a-f-]{36}\\.jpg$`));
  });

  it("takes photos browsers can show, up to 10 MB, and nothing else", async () => {
    await expect(prepareUpload({ schemeId: A, purpose: "scheme_photo", fileName: "plan.pdf", size: 10 })).rejects.toThrow();
    await expect(prepareUpload({ schemeId: A, purpose: "scheme_photo", fileName: "front.heic", size: 10 })).rejects.toThrow();
    await expect(prepareUpload({ schemeId: A, purpose: "scheme_photo", fileName: "front.png", size: 11 * 1024 * 1024 })).rejects.toThrow(/10 MB/);
    expect(photoFileProblem({ name: "front.heic", size: 10, type: "image/heic" })).toContain("JPEG, PNG or WebP");
    expect(photoFileProblem({ name: "front.webp", size: 10, type: "image/webp" })).toBeNull();
  });
});

describe("saving a photo", () => {
  async function staged(schemeId: string) {
    const r = await prepareUpload({ schemeId, purpose: "scheme_photo", fileName: "front.jpg", size: 2000 });
    return r.uploadId;
  }

  it("makes it the building's first photo and keeps earlier ones after it", async () => {
    sharedFake.table("SchemeImage").push({ id: "old", schemeId: A, url: `schemes/${A}/photos/old.jpg`, sortOrder: 0 });
    const uploadId = await staged(A);
    const img = await setSchemePhoto({ schemeId: A, uploadId, actorId: "adviser-a", actorRole: "ADVISER" });
    expect(img).toMatchObject({ schemeId: A, sortOrder: -1 });
    expect(String(img.url)).toMatch(new RegExp(`^schemes/${A}/photos/`));
    // Used once only.
    await expect(setSchemePhoto({ schemeId: A, uploadId, actorId: "adviser-a", actorRole: "ADVISER" })).rejects.toThrow();
  });

  it("will not use one building's upload for another building", async () => {
    const uploadId = await staged(A);
    await expect(setSchemePhoto({ schemeId: B, uploadId, actorId: "adviser-a", actorRole: "ADVISER" })).rejects.toThrow(/could not be found/);
    expect(sharedFake.table("SchemeImage")).toHaveLength(0);
  });

  it("will not use someone else's upload", async () => {
    const uploadId = await staged(A);
    await expect(setSchemePhoto({ schemeId: A, uploadId, actorId: "someone-else", actorRole: "ADVISER" })).rejects.toThrow(/could not be found/);
  });
});

describe("showing photos", () => {
  it("signs only paths inside the building's own folder", async () => {
    const out = await signedSchemeImages(A, [
      { id: "1", url: `schemes/${A}/photos/a.jpg` },
      { id: "2", url: `schemes/${B}/photos/b.jpg` },
      { id: "3", url: "https://elsewhere.example/c.jpg" },
      { id: "4", url: `schemes/${A}/../${B}/photos/d.jpg` },
    ]);
    expect(out.map((i) => i.id)).toEqual(["1"]);
    expect(out[0].url).toBe(`https://signed.example/schemes/${A}/photos/a.jpg`);
  });

  it("signs every building's first photo in one request, and gives null when there is none", async () => {
    const thumbs = await schemeThumbnails([
      { id: A, images: [{ id: "1", url: `schemes/${A}/photos/a.jpg` }, { id: "2", url: `schemes/${A}/photos/z.jpg` }] },
      { id: B, images: [] },
    ]);
    expect(thumbs).toEqual({ [A]: `https://signed.example/schemes/${A}/photos/a.jpg`, [B]: null });
    expect(signed.calls).toEqual([[`schemes/${A}/photos/a.jpg`]]);
  });

  it("shows a building placeholder in the list when there is no photo", () => {
    const none = renderToStaticMarkup(createElement(SchemeThumb, { url: null, name: "Opera House" }));
    expect(none).toContain('data-placeholder="true"');
    expect(none).toContain("Opera House, no photo yet");
    const withPhoto = renderToStaticMarkup(createElement(SchemeThumb, { url: "https://signed.example/x.jpg", name: "Opera House" }));
    expect(withPhoto).toContain('src="https://signed.example/x.jpg"');
    expect(withPhoto).not.toContain("data-placeholder");
  });
});

describe("removing a photo", () => {
  const seedImages = () =>
    sharedFake.reset({
      StorageUpload: [],
      SchemeImage: [
        { id: "new", schemeId: A, url: `schemes/${A}/photos/new.jpg`, sortOrder: -1 },
        { id: "old", schemeId: A, url: `schemes/${A}/photos/old.jpg`, sortOrder: 0 },
        { id: "other", schemeId: B, url: `schemes/${B}/photos/b.jpg`, sortOrder: 0 },
      ],
    });

  it("removes the photo shown first, so the earlier one takes its place", async () => {
    seedImages();
    const r = await removeSchemePhoto({ schemeId: A, imageId: "new", actorId: "adviser-a", actorRole: "ADVISER" });
    expect(r).toEqual({ removed: true, remaining: 1 });
    expect(sharedFake.table("SchemeImage").map((i) => i.id).sort()).toEqual(["old", "other"]);
  });

  it("never removes another building's photo", async () => {
    seedImages();
    const r = await removeSchemePhoto({ schemeId: A, imageId: "other", actorId: "adviser-a", actorRole: "ADVISER" });
    expect(r.removed).toBe(false);
    expect(sharedFake.table("SchemeImage")).toHaveLength(3);
  });

  it("needs scheme.manage, and says so when the photo has already gone", async () => {
    seedImages();
    expect(await removeSchemePhotoAction(A, "new")).toEqual({ ok: true });
    expect(authorise).toHaveBeenCalledWith(A, "scheme.manage");
    expect(await removeSchemePhotoAction(A, "new")).toEqual({ error: expect.stringContaining("already been removed") });
  });
});
