import { paymentConfirmationPathProblem } from "@/lib/finance/payment-confirmations";

/**
 * Owner payment confirmation uploads (pure). Security finding F16: the action
 * trusted the client's file size and type, and any path inside the scheme's
 * payments folder, so an owner could register another owner's file (or a
 * file in a sub-folder) as their own.
 */

/** Allowed MIME types for payment confirmation uploads. */
export const PAYMENT_ALLOWED_MIME: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/heic",
]);

/** Allowed file extensions for payment confirmation uploads. */
export const PAYMENT_ALLOWED_EXT: ReadonlySet<string> = new Set(["pdf", "png", "jpg", "jpeg", "heic"]);

export const PAYMENT_MAX_BYTES = 10 * 1024 * 1024;

/** A plain file name directly in the folder: no sub-folders, no dot-dot, no odd characters. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

/**
 * Why this storage path may not be registered as a payment confirmation for
 * the scheme, or null. It must be a file directly in
 * `schemes/<schemeId>/payments/` with an allowed extension.
 */
export function paymentUploadPathProblem(schemeId: string, storagePath: unknown): string | null {
  const notInFolder = "The uploaded file is not in this scheme's payments folder.";
  if (typeof storagePath !== "string") return notInFolder;
  const folderProblem = paymentConfirmationPathProblem(schemeId, storagePath);
  if (folderProblem) return folderProblem;
  const name = storagePath.slice(`schemes/${schemeId}/payments/`.length);
  if (!FILE_NAME.test(name) || name.includes("..")) return notInFolder;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!PAYMENT_ALLOWED_EXT.has(ext)) return "This file type is not permitted. Please upload a PDF or image file.";
  return null;
}

/**
 * Why the stored file (as storage reports it, not as the client claims) may
 * not be accepted, or null.
 */
export function storedPaymentFileProblem(stored: { size?: number | null; contentType?: string | null } | null): string | null {
  if (!stored) return "We could not find the uploaded file. Please upload it again.";
  if (typeof stored.size !== "number" || !(stored.size > 0)) return "The uploaded file is empty.";
  if (stored.size > PAYMENT_MAX_BYTES) return "File size exceeds the 10 MB limit.";
  const type = (stored.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!type || !PAYMENT_ALLOWED_MIME.has(type)) {
    return "This file type is not permitted. Please upload a PDF or image file.";
  }
  return null;
}
