"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { createDocument } from "@/lib/queries/documents";
import { uploadErrorMessage, consumeUpload, verifyUpload } from "@/lib/storage/uploads";
import { parseVisibility } from "@/lib/documents/visibility";

export type DocumentFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const CATEGORIES = [
  "MINUTES",
  "INSURANCE",
  "BYLAW",
  "FINANCIAL",
  "COMPLIANCE",
  "OTHER",
];

export async function uploadDocumentAction(
  schemeId: string,
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  // Only the committee (and advisers) publish to the scheme library, whatever
  // the category: the upload page is committee-only and every category here
  // is an official record (minutes, by-laws, financial, insurance,
  // compliance). Owners do not upload to the library (finding F8).
  let profile;
  try {
    ({ profile } = await requireSchemeAccess(schemeId, "documents.publish"));
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = formData.get("category") as string;
  const uploadId = String(formData.get("uploadId") ?? "");
  const lotNumber = String(formData.get("lotNumber") ?? "").trim().slice(0, 20) || undefined;
  const visibility = parseVisibility(formData.get("visibility"), lotNumber);

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (typeof visibility === "object") errors.visibility = visibility.error;
  // The committee cannot make a document visible to the manager alone.
  else if (visibility === "MANAGEMENT") errors.visibility = "Choose who can see this document.";
  if (!uploadId) errors.file = "Please select a file to upload.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    // The file went straight to storage through a link the server issued;
    // check what actually arrived before recording it (S3).
    let upload;
    try {
      upload = await verifyUpload({ uploadId, schemeId, purpose: "committee_library", profileId: profile.id });
    } catch (err) {
      const message = uploadErrorMessage(err);
      if (message) return { fieldErrors: { file: message } };
      throw err;
    }

    // Claimed atomically, so the same upload cannot make two records (S3).
    await consumeUpload(
      uploadId,
      () =>
        createDocument({
          schemeId,
          title,
          description: description || undefined,
          category,
          fileUrl: upload.path,
          fileName: upload.fileName,
          fileSize: upload.size,
          mimeType: upload.mimeType,
          uploadedBy: profile.id,
          lotNumber,
          visibility: visibility as string,
        }),
      (d) => `Document:${d.id}`,
    );

    revalidatePath("/owner/documents");
    redirect("/owner/documents");
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to upload document. Please try again." };
  }
}
