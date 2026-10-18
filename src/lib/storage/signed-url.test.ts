import { describe, it, expect } from "vitest";
import { extractStoragePath } from "./signed-url";

describe("extractStoragePath", () => {
  it("extracts path from a standard Supabase public URL", () => {
    const url =
      "https://vtqovzfywfrizjufsrmj.supabase.co/storage/v1/object/public/documents/schemes/abc123/invoice.pdf";
    expect(extractStoragePath(url)).toBe("schemes/abc123/invoice.pdf");
  });

  it("handles single-level paths", () => {
    const url =
      "https://vtqovzfywfrizjufsrmj.supabase.co/storage/v1/object/public/documents/file.pdf";
    expect(extractStoragePath(url)).toBe("file.pdf");
  });

  it("handles deeply nested paths", () => {
    const url =
      "https://vtqovzfywfrizjufsrmj.supabase.co/storage/v1/object/public/documents/a/b/c/d/e.pdf";
    expect(extractStoragePath(url)).toBe("a/b/c/d/e.pdf");
  });

  it("returns null for URLs without the storage marker", () => {
    const url = "https://example.com/some/other/path/file.pdf";
    expect(extractStoragePath(url)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractStoragePath("")).toBeNull();
  });

  it("handles URL-encoded characters in path", () => {
    const url =
      "https://vtqovzfywfrizjufsrmj.supabase.co/storage/v1/object/public/documents/scheme%20files/doc%201.pdf";
    expect(extractStoragePath(url)).toBe("scheme%20files/doc%201.pdf");
  });

  it("returns empty string when path segment is empty", () => {
    const url =
      "https://vtqovzfywfrizjufsrmj.supabase.co/storage/v1/object/public/documents/";
    expect(extractStoragePath(url)).toBe("");
  });
});
