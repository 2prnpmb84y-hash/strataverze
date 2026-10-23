/**
 * Who may see a library document (security stage S3). Chosen when it is
 * uploaded; existing documents are visible to all members, as before.
 *
 *   ALL_MEMBERS  every owner, the committee and the Adviser
 *   COMMITTEE    the committee and the Adviser
 *   LOT_OWNERS   the owners of the document's lot, the committee and the Adviser
 *   MANAGEMENT   the Adviser only
 *
 * Suppliers and accountants never see the library.
 */

export const DOCUMENT_VISIBILITIES = ["ALL_MEMBERS", "COMMITTEE", "LOT_OWNERS", "MANAGEMENT"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  ALL_MEMBERS: "All owners, committee and manager",
  COMMITTEE: "Committee and manager only",
  LOT_OWNERS: "That lot's owners, committee and manager",
  MANAGEMENT: "Manager only",
};

export function isDocumentVisibility(value: unknown): value is DocumentVisibility {
  return typeof value === "string" && (DOCUMENT_VISIBILITIES as readonly string[]).includes(value);
}

/**
 * The visibility a form chose, checked: LOT_OWNERS needs a lot number. Returns
 * an error message instead when the choice is not valid.
 */
export function parseVisibility(raw: unknown, lotNumber: string | null | undefined): DocumentVisibility | { error: string } {
  const value = raw == null || raw === "" ? "ALL_MEMBERS" : raw;
  if (!isDocumentVisibility(value)) return { error: "Choose who can see this document." };
  if (value === "LOT_OWNERS" && !String(lotNumber ?? "").trim()) {
    return { error: "Enter the lot number for a document only that lot's owners can see." };
  }
  return value;
}

export type DocumentViewer = { roles: readonly string[]; ownLotNumbers: readonly string[] };

/** Whether this viewer (their roles and lots on the document's building) may see it. */
export function canSeeDocument(
  doc: { visibility?: string | null; lotNumber?: string | null },
  viewer: DocumentViewer,
): boolean {
  const roles = new Set(viewer.roles);
  if (roles.has("ADVISER")) return true;
  const visibility = isDocumentVisibility(doc.visibility) ? doc.visibility : "ALL_MEMBERS";
  if (visibility === "MANAGEMENT") return false;
  if (roles.has("COMMITTEE")) return true;
  if (visibility === "COMMITTEE") return false;
  if (!roles.has("OWNER")) return false;
  if (visibility === "ALL_MEMBERS") return true;
  // LOT_OWNERS
  const lot = String(doc.lotNumber ?? "").trim().toLowerCase();
  return !!lot && viewer.ownLotNumbers.some((n) => String(n).trim().toLowerCase() === lot);
}

