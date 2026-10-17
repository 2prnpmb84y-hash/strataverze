import { createClient } from "@/lib/supabase/server";

/**
 * Generate a short-lived signed URL for a document in Supabase Storage.
 * Falls back to the raw URL if signing fails (e.g. if the bucket is public).
 *
 * @param storagePath - The path within the "documents" bucket
 * @param expiresIn  - Lifetime in seconds (default 60 = 1 minute)
 */
export async function getSignedDocumentUrl(
  storagePath: string,
  expiresIn = 60,
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    // Fall back to public URL if signing fails
    const {
      data: { publicUrl },
    } = supabase.storage.from("documents").getPublicUrl(storagePath);
    return publicUrl;
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
