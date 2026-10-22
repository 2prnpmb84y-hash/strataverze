/**
 * Pure document version-chain logic (no DB).
 *
 * A "logical document" is a chain of rows linked by supersedesId. The current
 * head carries isCurrent = true; older versions are reached by following
 * supersedesId backwards. This module turns a flat list of rows into the
 * current documents, each with its full version history.
 */

export interface DocRow {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  version: number;
  isCurrent: boolean;
  supersedesId: string | null;
  notes: string | null;
  createdAt: string;
  documentDate: string | null;
}

export interface DocumentVersionView {
  id: string;
  version: number;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string;
  documentDate: string | null;
}

export interface PolicyDocumentView {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  version: number;
  uploadedAt: string;
  notes: string | null;
  versions: DocumentVersionView[];
}

function toVersion(r: DocRow): DocumentVersionView {
  return {
    id: r.id,
    version: r.version,
    fileName: r.fileName,
    fileUrl: r.fileUrl,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    uploadedAt: r.createdAt,
    documentDate: r.documentDate,
  };
}

/**
 * Build the current documents (newest first), each with its version history
 * (newest first), from a flat list of rows. Cycles are guarded against.
 */
export function buildDocumentViews(rows: DocRow[]): PolicyDocumentView[] {
  const byId = new Map(rows.map((r) => [r.id, r]));

  return rows
    .filter((r) => r.isCurrent)
    .map((head) => {
      const chain: DocumentVersionView[] = [toVersion(head)];
      const seen = new Set<string>([head.id]);
      let cursor = head.supersedesId ? byId.get(head.supersedesId) : undefined;
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        chain.push(toVersion(cursor));
        cursor = cursor.supersedesId ? byId.get(cursor.supersedesId) : undefined;
      }
      return {
        id: head.id,
        category: head.category,
        title: head.title,
        fileName: head.fileName,
        fileUrl: head.fileUrl,
        fileSize: head.fileSize,
        mimeType: head.mimeType,
        version: head.version,
        uploadedAt: head.createdAt,
        notes: head.notes,
        versions: chain,
      };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
