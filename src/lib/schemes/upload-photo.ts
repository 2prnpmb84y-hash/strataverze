"use client";

import { stageUpload } from "@/lib/storage/client-upload";
import { setSchemePhotoAction } from "@/lib/actions/scheme-photo";

/** The photo types and size the server accepts for a property photo. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** A problem with the chosen file, checked before uploading, or null. */
export function photoFileProblem(file: { name: string; size: number; type: string }): string | null {
  if (!file.size) return "The photo is empty.";
  if (file.size > PHOTO_MAX_BYTES) return "The photo must be smaller than 10 MB.";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return "Choose a JPEG, PNG or WebP photo. On an iPhone, a HEIC photo can be saved as JPEG first.";
  return null;
}

/** Upload a photo straight to storage, then make it the building's property photo. */
export async function uploadSchemePhoto(schemeId: string, file: File): Promise<{ ok: true } | { error: string }> {
  const problem = photoFileProblem(file);
  if (problem) return { error: problem };
  const staged = await stageUpload(schemeId, "scheme_photo", file);
  if ("error" in staged) return { error: staged.error };
  const saved = await setSchemePhotoAction(schemeId, staged.uploadId);
  return saved.error ? { error: saved.error } : { ok: true };
}
