import { createClient } from "@/lib/supabase/server";

/**
 * Generate a short-lived signed URL for a document in Supabase Storage.
 * Throws if signing fails so that callers never silently fall back to a
 * publicly accessible URL.
 *
 * @param storagePath - The path within the "documents" bucket
 * @param expiresIn  - Lifetime in seconds (default 3600 = 1 hour)
 */
export async function getSignedDocumentUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("Failed to create signed URL for document:", storagePath, error?.message);
    throw new Error("Could not generate a secure download link for this document.");
  }

  return data.signedUrl;
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
