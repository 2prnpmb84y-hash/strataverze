import { describe, it, expect } from "vitest";
import { buildDocumentViews, type DocRow } from "./documents";

function row(partial: Partial<DocRow> & { id: string; createdAt: string }): DocRow {
  return {
    category: "POLICY_SCHEDULE",
    title: "Doc",
    fileName: `${partial.id}.pdf`,
    fileUrl: `path/${partial.id}`,
    fileSize: 100,
    mimeType: "application/pdf",
    version: 1,
    isCurrent: true,
    supersedesId: null,
    notes: null,
    documentDate: null,
    ...partial,
  };
}

describe("buildDocumentViews", () => {
  it("returns a single current document with one version", () => {
    const views = buildDocumentViews([row({ id: "a", createdAt: "2026-01-01" })]);
    expect(views).toHaveLength(1);
    expect(views[0].versions).toHaveLength(1);
    expect(views[0].version).toBe(1);
  });

  it("builds a version chain newest first", () => {
    const views = buildDocumentViews([
      row({ id: "v1", createdAt: "2026-01-01", version: 1, isCurrent: false }),
      row({ id: "v2", createdAt: "2026-02-01", version: 2, isCurrent: false, supersedesId: "v1" }),
      row({ id: "v3", createdAt: "2026-03-01", version: 3, isCurrent: true, supersedesId: "v2" }),
    ]);
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("v3");
    expect(views[0].version).toBe(3);
    expect(views[0].versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("excludes non-current rows that are not part of a current chain", () => {
    const views = buildDocumentViews([
      row({ id: "orphan", createdAt: "2026-01-01", isCurrent: false }),
      row({ id: "current", createdAt: "2026-02-01", isCurrent: true }),
    ]);
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("current");
  });

  it("sorts multiple current documents newest first", () => {
    const views = buildDocumentViews([
      row({ id: "old", createdAt: "2026-01-01" }),
      row({ id: "new", createdAt: "2026-05-01" }),
    ]);
    expect(views.map((v) => v.id)).toEqual(["new", "old"]);
  });

  it("terminates on a cyclic supersedes reference", () => {
    const views = buildDocumentViews([
      row({ id: "a", createdAt: "2026-01-01", isCurrent: true, supersedesId: "b" }),
      row({ id: "b", createdAt: "2026-01-02", isCurrent: false, supersedesId: "a" }),
    ]);
    expect(views).toHaveLength(1);
    // The chain collects each row at most once and stops.
    expect(views[0].versions.length).toBeLessThanOrEqual(2);
  });
});
