import { getSignedDocumentUrl, extractStoragePath } from "@/lib/storage/signed-url";

/**
 * Whether a string is a plain path inside the documents bucket: relative, no
 * empty, "." or ".." segments, no backslashes, no control characters, no
 * scheme (http:, javascript:, data: ...).
 */
export function isStoragePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (path.length === 0 || path.length > 1024) return false;
  if (path.startsWith("/") || path.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return !path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

/**
 * Why a client-supplied storage path is not acceptable for this scheme, or
 * null. Files for a scheme live under "schemes/<schemeId>/" in the documents
 * bucket; nothing else (another scheme's folder, a web address) is accepted.
 */
export function schemeStoragePathProblem(schemeId: string, path: unknown): string | null {
  const prefix = `schemes/${schemeId}/`;
  if (!schemeId || !isStoragePath(path) || !path.startsWith(prefix) || path.length <= prefix.length) {
    return "The uploaded file is not in this scheme's folder.";
  }
  return null;
}

/**
 * The documents-bucket path a stored fileUrl refers to, or null when it does
 * not refer to one. Accepts a storage path, or a legacy Supabase public URL
 * for the documents bucket (".../storage/v1/object/public/documents/<path>").
 */
export function toStoragePath(fileUrl: unknown): string | null {
  if (typeof fileUrl !== "string") return null;
  const value = fileUrl.trim();
  if (/^https?:\/\//i.test(value)) {
    let pathname: string;
    try {
      pathname = new URL(value).pathname;
    } catch {
      return null;
    }
    const extracted = extractStoragePath(pathname);
    if (!extracted) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(extracted);
    } catch {
      return null;
    }
    return isStoragePath(decoded) ? decoded : null;
  }
  return isStoragePath(value) ? value : null;
}

/**
 * Resolve a document's fileUrl to a short-lived signed URL.
 *
 * Handles both formats:
 *  - Storage path only (new uploads): "schemes/abc/123-file.pdf"
 *  - Full public URL (legacy uploads): "https://xxx.supabase.co/storage/v1/object/public/documents/..."
 *
 * Anything else (another web address, a path with ".." segments) is refused
 * with an error: this never returns a URL it did not sign, so a stored value
 * cannot turn a download link into a redirect elsewhere. With `schemeId`, the
 * path must also be inside that scheme's folder.
 *
 * Returns a signed URL valid for `expiresIn` seconds (default 300 = 5 minutes).
 */
export async function resolveDocumentUrl(
  fileUrl: string,
  expiresIn = 300,
  options: { schemeId?: string } = {},
): Promise<string> {
  const path = toStoragePath(fileUrl);
  if (!path) throw new Error("This document's file cannot be found.");
  if (options.schemeId !== undefined && schemeStoragePathProblem(options.schemeId, path)) {
    throw new Error("This document's file cannot be found.");
  }
  return getSignedDocumentUrl(path, expiresIn);
}
