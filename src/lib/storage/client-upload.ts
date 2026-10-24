"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prepareUploadAction } from "@/lib/actions/uploads";
import type { UploadPurpose } from "./uploads";

/**
 * Upload a file the S3 way (browser side): ask the server for a one-time
 * signed upload link, send the file straight to storage with it, and return
 * the upload id for the form to submit instead of the file. The server then
 * checks what arrived before using it.
 */
export async function stageUpload(
  schemeId: string,
  purpose: UploadPurpose,
  file: File,
): Promise<{ uploadId: string } | { error: string }> {
  if (!file || file.size === 0) return { error: "Choose a file to upload." };
  const prepared = await prepareUploadAction({ schemeId, purpose, fileName: file.name, size: file.size });
  if (prepared.error || !prepared.uploadId || !prepared.path || !prepared.token) {
    return { error: prepared.error ?? "Could not prepare the upload. Please try again." };
  }
  // The one-time token is the only authority the upload needs, so no
  // session is sent with it.
  const storage = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage;
  // storage-js sends a File with its own type, so give it the type the
  // server chose from the name (the browser's may be empty or wrong). The
  // server checks the stored type matches.
  const typed = new File([file], file.name, { type: prepared.contentType });
  const { error } = await storage
    .from("documents")
    .uploadToSignedUrl(prepared.path, prepared.token, typed, { contentType: prepared.contentType, upsert: false });
  if (error) return { error: "The upload did not complete. Please try again." };
  return { uploadId: prepared.uploadId };
}

/**
 * For forms that post FormData: replace the chosen file (field `file`) with
 * an `uploadId`. Returns an error message, or null when the form can be
 * submitted. A form with no file chosen is left as it is.
 */
export async function stageFormFile(
  formData: FormData,
  schemeId: string,
  purpose: UploadPurpose,
  field = "file",
): Promise<string | null> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  const staged = await stageUpload(schemeId, purpose, file);
  if ("error" in staged) return staged.error;
  formData.delete(field);
  formData.set("uploadId", staged.uploadId);
  return null;
}
