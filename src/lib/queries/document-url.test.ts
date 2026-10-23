import { beforeEach, describe, expect, it, vi } from "vitest";

const sign = vi.fn(async (path: string) => `https://signed.example/${path}?token=t`);
vi.mock("@/lib/storage/signed-url", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/signed-url")>("@/lib/storage/signed-url");
  return { ...actual, getSignedDocumentUrl: (path: string) => sign(path) };
});

const { resolveDocumentUrl, schemeStoragePathProblem, toStoragePath } = await import("./document-url");

const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";

beforeEach(() => vi.clearAllMocks());

describe("resolveDocumentUrl", () => {
  it("refuses a web address that is not a documents-bucket URL (no open redirect)", async () => {
    await expect(resolveDocumentUrl("https://evil.example/phish")).rejects.toThrow();
    await expect(resolveDocumentUrl("http://evil.example/storage/v1/object/public/other/x.pdf")).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });

  it("refuses other schemes and traversal", async () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/etc/passwd", "schemes/../x.pdf", "schemes//x.pdf", "", "schemes\\x.pdf"]) {
      await expect(resolveDocumentUrl(bad)).rejects.toThrow();
    }
    expect(sign).not.toHaveBeenCalled();
  });

  it("signs a storage path", async () => {
    const url = await resolveDocumentUrl(`schemes/${SCHEME}/file.pdf`);
    expect(url).toMatch(/^https:\/\/signed\.example\//);
    expect(sign).toHaveBeenCalledWith(`schemes/${SCHEME}/file.pdf`);
  });

  it("signs the path inside a legacy public URL, never the URL itself", async () => {
    await resolveDocumentUrl(`https://ref.supabase.co/storage/v1/object/public/documents/schemes/${SCHEME}/old%20file.pdf`);
    expect(sign).toHaveBeenCalledWith(`schemes/${SCHEME}/old file.pdf`);
  });

  it("with a scheme, refuses a path in another scheme's folder", async () => {
    await expect(resolveDocumentUrl("schemes/other/file.pdf", 300, { schemeId: SCHEME })).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });
});

describe("toStoragePath and schemeStoragePathProblem", () => {
  it("accepts only paths in the scheme's own folder", () => {
    expect(schemeStoragePathProblem(SCHEME, `schemes/${SCHEME}/123-a.pdf`)).toBeNull();
    expect(schemeStoragePathProblem(SCHEME, "schemes/other/123-a.pdf")).not.toBeNull();
    expect(schemeStoragePathProblem(SCHEME, `schemes/${SCHEME}/../other/a.pdf`)).not.toBeNull();
    expect(schemeStoragePathProblem(SCHEME, `https://x/storage/v1/object/public/documents/schemes/${SCHEME}/a.pdf`)).not.toBeNull();
    expect(schemeStoragePathProblem(SCHEME, `schemes/${SCHEME}/`)).not.toBeNull();
  });

  it("returns null for anything that is not a documents-bucket path", () => {
    expect(toStoragePath("https://evil.example/x")).toBeNull();
    expect(toStoragePath(42)).toBeNull();
    expect(toStoragePath(`schemes/${SCHEME}/a.pdf`)).toBe(`schemes/${SCHEME}/a.pdf`);
  });
});
