import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The documents bucket, reached only from the server (security stage S3,
 * finding SEC-006).
 *
 * Browsers have no storage access of their own: no storage policy lets a
 * signed-in user list, read or write the bucket. Everything goes through
 * here, with the service role, after the app has authorised the request:
 *   - downloads: a short-lived signed link, made only after the document
 *     record and its visibility have been checked;
 *   - uploads: a one-time signed upload link for a path the server chose
 *     (see uploads.ts), then a check of what actually arrived.
 *
 * Callers must authorise first. Never pass a path that came from a browser
 * without checking it belongs to the record being served.
 */

export const DOCUMENTS_BUCKET = "documents";

function bucket() {
  return createAdminClient().storage.from(DOCUMENTS_BUCKET);
}

/** A signed download link, valid for `expiresIn` seconds. Throws on failure. */
export async function signDownload(path: string, expiresIn: number): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    console.error("[storage] could not sign a download:", error?.name ?? "error");
    throw new Error("Could not generate a secure download link for this document.");
  }
  return data.signedUrl;
}

/** A one-time signed upload link for a path the server chose. */
export async function signUpload(path: string): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data?.token) {
    console.error("[storage] could not sign an upload:", error?.name ?? "error");
    throw new Error("Could not prepare the upload. Please try again.");
  }
  return { signedUrl: data.signedUrl, token: data.token };
}

/** What storage holds at a path: its size and stored type, or null. */
export async function storedObjectInfo(path: string): Promise<{ size: number; contentType: string | null } | null> {
  const { data, error } = await bucket().info(path);
  if (error || !data) return null;
  const size = Number(data.size);
  if (!Number.isFinite(size)) return null;
  return { size, contentType: data.contentType ?? null };
}

/** The first `bytes` bytes of a stored object (for checking what it really is). */
export async function readObjectHead(path: string, bytes = 4096): Promise<Uint8Array | null> {
  const url = await signDownload(path, 60);
  const response = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` }, cache: "no-store" });
  if (!response.ok && response.status !== 206) return null;
  const buffer = new Uint8Array(await response.arrayBuffer());
  return buffer.slice(0, bytes);
}

/**
 * Remove an object that was uploaded but refused (wrong type, too large) or
 * never used. Only ever called with a path from the server's own upload
 * record, never with one sent by a browser.
 */
export async function removeRejectedUpload(path: string): Promise<void> {
  const { error } = await bucket().remove([path]);
  if (error) console.error("[storage] could not remove a refused upload:", error.name);
}

/**
 * The whole stored object, or null when it is not there. For the building
 * vault, which fingerprints every byte. Callers must authorise first.
 */
export async function downloadObject(path: string): Promise<Uint8Array | null> {
  const { data, error } = await bucket().download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Write a new object at a path the server chose, never replacing one that
 * is there (the building vault's originals are written once). Returns
 * "exists" when the path is already taken, so the caller can check what is
 * there instead.
 */
export async function writeObjectOnce(path: string, bytes: Uint8Array, contentType: string): Promise<"written" | "exists"> {
  const { error } = await bucket().upload(path, bytes, { contentType, upsert: false });
  if (!error) return "written";
  const e = error as { status?: number; statusCode?: string; code?: string };
  if (e.status === 409 || e.statusCode === "409" || e.code === "ResourceAlreadyExists" || /already exists/i.test(error.message)) return "exists";
  console.error("[storage] could not write a vault object:", error.name);
  throw new Error("Could not store the file. Please try again.");
}
