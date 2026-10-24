"use server";

import { isUploadPurpose, prepareUpload, uploadErrorMessage } from "@/lib/storage/uploads";

/**
 * Prepare an upload (security stage S3): the server authorises the person
 * for this purpose on this building and returns a one-time signed upload
 * link for a path it chose. See src/lib/storage/uploads.ts.
 */
export async function prepareUploadAction(input: {
  schemeId: string;
  purpose: string;
  fileName: string;
  size: number;
}): Promise<{ uploadId?: string; path?: string; token?: string; contentType?: string; error?: string }> {
  if (!isUploadPurpose(input?.purpose)) return { error: "This upload is not allowed." };
  try {
    return await prepareUpload({
      schemeId: String(input.schemeId ?? ""),
      purpose: input.purpose,
      fileName: String(input.fileName ?? ""),
      size: Number(input.size),
    });
  } catch (err) {
    const message = uploadErrorMessage(err);
    if (message) return { error: message };
    console.error("[uploads] prepare failed:", err instanceof Error ? err.name : "error");
    return { error: "Could not prepare the upload. Please try again." };
  }
}
