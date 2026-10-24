import { signDownload } from "@/lib/storage/server-storage";

/**
 * Generate a short-lived signed URL for a document in Supabase Storage.
 * Throws if signing fails so that callers never silently fall back to a
 * publicly accessible URL.
 *
 * @param storagePath - The path within the "documents" bucket
 * @param expiresIn  - Lifetime in seconds (default 300 = 5 minutes, S7 SEC-029)
 */
export async function getSignedDocumentUrl(
  storagePath: string,
  expiresIn = 300,
): Promise<string> {
  // Signed on the server with the service role (S3): browsers have no
  // storage access of their own. Callers check the document first.
  return signDownload(storagePath, expiresIn);
}

/**
 * Extract the storage path from a full public URL.
 * Public URLs follow the pattern:
 *   https://<ref>.supabase.co/storage/v1/object/public/documents/<path>
 */
export function extractStoragePath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/documents/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}
