import { getSignedDocumentUrl, extractStoragePath } from "@/lib/storage/signed-url";

/**
 * Resolve a document's fileUrl to a short-lived signed URL.
 *
 * Handles both formats:
 *  - Storage path only (new uploads): "schemes/abc/123-file.pdf"
 *  - Full public URL (legacy uploads): "https://xxx.supabase.co/storage/v1/object/public/documents/..."
 *
 * Returns a signed URL valid for `expiresIn` seconds (default 300 = 5 minutes).
 */
export async function resolveDocumentUrl(
  fileUrl: string,
  expiresIn = 300,
): Promise<string> {
  // If it looks like a full URL, extract the storage path first
  if (fileUrl.startsWith("http")) {
    const path = extractStoragePath(fileUrl);
    if (!path) {
      // Cannot extract path; return the original URL as-is
      return fileUrl;
    }
    return getSignedDocumentUrl(path, expiresIn);
  }

  // Already a storage path
  return getSignedDocumentUrl(fileUrl, expiresIn);
}
