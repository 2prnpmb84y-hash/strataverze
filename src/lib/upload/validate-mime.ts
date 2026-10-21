/**
 * Allowed MIME types for document uploads.
 * Extend this list as needed, keeping it restrictive to prevent
 * upload of executables, scripts, etc.
 */
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  "text/plain",
  "text/csv",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

/**
 * Allowed file extensions (without the dot).
 */
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
]);

/**
 * Validates that a file's MIME type and extension are on the allowlist.
 * Returns an error string if invalid, or null if valid.
 */
export function validateFileUpload(file: File): string | null {
  if (!file || file.size === 0) {
    return "Please select a file to upload.";
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `File type ".${ext}" is not allowed. Accepted formats: PDF, Word, Excel, PowerPoint, text, CSV, and common image formats.`;
  }

  if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) {
    return "This file type is not permitted. Please upload a document or image file.";
  }

  return null;
}
