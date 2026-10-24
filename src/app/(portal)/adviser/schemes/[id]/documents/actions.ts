"use server";

import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorisationError, requireSchemeMembership } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import {
  createDocument,
  updateDocument,
  deleteDocument,
  getDocumentById,
} from "@/lib/queries/documents";
import { uploadErrorMessage, consumeUpload, verifyUpload } from "@/lib/storage/uploads";
import { canSeeDocument, parseVisibility } from "@/lib/documents/visibility";
import { documentViewers } from "@/lib/documents/viewers";
import { logActivity } from "@/lib/queries/activity-log";
import { resolveDocumentUrl } from "@/lib/queries/document-url";

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
  try {
    const { profile } = await requireSchemeAccess(schemeId, "documents.manage");

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
    if (!uploadId) errors.file = "Please select a file to upload.";
    if (Object.keys(errors).length > 0) return { fieldErrors: errors };

    // The file went straight to storage through a link the server issued;
    // check what actually arrived before recording it (S3).
    let upload;
    try {
      upload = await verifyUpload({ uploadId, schemeId, purpose: "library", profileId: profile.id });
    } catch (err) {
      const message = uploadErrorMessage(err);
      if (message) return { fieldErrors: { file: message } };
      throw err;
    }

    // Claimed atomically, so the same upload cannot make two records (S3).
    const doc = await consumeUpload(
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

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: doc.id,
      metadata: { title, category, fileName: upload.fileName },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/documents/${doc.id}`);
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
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to upload document. Please try again." };
  }
}

/**
 * Upload a single file to Supabase Storage and create a document record.
 * Used by the multi-file upload flow from the Documents tab.
 */
export async function uploadFileAction(
  schemeId: string,
  formData: FormData,
): Promise<{ id: string; error?: string }> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "documents.manage");

    const uploadId = String(formData.get("uploadId") ?? "");
    if (!uploadId) return { id: "", error: "No file provided." };

    // Read optional metadata from form data
    const category = (formData.get("category") as string) || "OTHER";
    if (!CATEGORIES.includes(category)) return { id: "", error: "Select a valid category." };
    const documentType = (formData.get("documentType") as string) || undefined;
    const strataPlan = (formData.get("strataPlan") as string) || undefined;
    const schedule = (formData.get("schedule") as string) || undefined;
    const lotNumber = (formData.get("lotNumber") as string) || undefined;
    const supplier = (formData.get("supplier") as string) || undefined;
    const comments = (formData.get("comments") as string) || undefined;
    const visibility = parseVisibility(formData.get("visibility"), lotNumber);
    if (typeof visibility === "object") return { id: "", error: visibility.error };

    let upload;
    try {
      upload = await verifyUpload({ uploadId, schemeId, purpose: "library", profileId: profile.id });
    } catch (err) {
      const message = uploadErrorMessage(err);
      if (message) return { id: "", error: message };
      throw err;
    }
    const title = upload.fileName.replace(/\.[^.]+$/, "");

    // Claimed atomically, so the same upload cannot make two records (S3).
    const doc = await consumeUpload(
      uploadId,
      () =>
        createDocument({
          schemeId,
          title,
          category,
          documentType,
          fileUrl: upload.path,
          fileName: upload.fileName,
          fileSize: upload.size,
          mimeType: upload.mimeType,
          uploadedBy: profile.id,
          strataPlan,
          schedule,
          lotNumber,
          supplier,
          comments,
          visibility: visibility as string,
        }),
      (d) => `Document:${d.id}`,
    );

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: doc.id,
      metadata: { title, category, fileName: upload.fileName },
    });

    return { id: doc.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { id: "", error: err.message };
    return { id: "", error: "Failed to upload file. Please try again." };
  }
}

/**
 * Update document metadata from the document viewer form.
 */
export async function updateDocumentMetadataAction(
  schemeId: string,
  documentId: string,
  data: Record<string, string>,
): Promise<{ error?: string }> {
  try {
    await requireSchemeAccess(schemeId, "documents.manage");

    if (!data.title?.trim()) {
      return { error: "Name is required." };
    }

    assertInScheme(await getDocumentById(documentId), schemeId, "Document");
    // Visibility changes only when the form sends it (S3).
    const visibility = data.visibility === undefined ? undefined : parseVisibility(data.visibility, data.lotNumber);
    if (visibility && typeof visibility === "object") return { error: visibility.error };
    await updateDocument(schemeId, documentId, {
      ...(visibility ? { visibility } : {}),
      title: data.title.trim(),
      documentType: data.documentType || null,
      documentDate: data.documentDate || null,
      strataPlan: data.strataPlan || null,
      schedule: data.schedule || null,
      lotNumber: data.lotNumber || null,
      supplier: data.supplier || null,
      comments: data.comments || null,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update document. Please try again." };
  }
}

/**
 * Remove a document (soft delete) from the document viewer.
 */
export async function removeDocumentAction(
  schemeId: string,
  documentId: string,
): Promise<{ error?: string }> {
  try {
    await requireSchemeAccess(schemeId, "documents.manage");
    assertInScheme(await getDocumentById(documentId), schemeId, "Document");
    await deleteDocument(schemeId, documentId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to remove document." };
  }
}

export async function updateDocumentAction(
  schemeId: string,
  documentId: string,
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  try {
    await requireSchemeAccess(schemeId, "documents.manage");

    const title = (formData.get("title") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const category = formData.get("category") as string;

    const errors: Record<string, string> = {};
    if (!title) errors.title = "Title is required.";
    if (!category || !CATEGORIES.includes(category))
      errors.category = "Select a valid category.";

    if (Object.keys(errors).length > 0) return { fieldErrors: errors };

    assertInScheme(await getDocumentById(documentId), schemeId, "Document");
    await updateDocument(schemeId, documentId, {
      title,
      description: description || null,
      category,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/documents/${documentId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update document. Please try again." };
  }
}

export async function deleteDocumentAction(
  schemeId: string,
  documentId: string,
) {
  try {
    await requireSchemeAccess(schemeId, "documents.manage");

    assertInScheme(await getDocumentById(documentId), schemeId, "Document");
    await deleteDocument(schemeId, documentId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete document." };
  }
}

/**
 * Return a short-lived signed URL for a document so the client
 * never needs to construct raw public URLs.
 *
 * Takes the document id, not a storage path (security review L1): the
 * document is loaded scoped to the scheme and only its own fileUrl is
 * signed. Suppliers have no access to the scheme document library.
 */
export async function getDocumentSignedUrlAction(
  schemeId: string,
  documentId: string,
): Promise<{ url?: string; error?: string }> {
  let fileUrl: string;
  let actorId: string;
  try {
    const access = await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE", "OWNER"]);
    actorId = access.profile.id;
    const document = await getDocumentById(documentId);
    assertInScheme(document, schemeId, "Document");
    // Its visibility, for this person's roles and lots on this building (S3).
    const viewer = (await documentViewers(actorId, [schemeId])).get(schemeId);
    if (!viewer || !canSeeDocument(document, viewer)) throw new AuthorisationError("Document not found.");
    fileUrl = document.fileUrl;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  try {
    await recordSecurityEventLater({
      action: "document.download",
      outcome: "allowed",
      actorProfileId: actorId,
      schemeId,
      resourceType: "Document",
      resourceId: documentId,
      metadata: { kind: "library" },
    });
    const url = await resolveDocumentUrl(fileUrl, 600, { schemeId }); // 10 minutes
    return { url };
  } catch {
    return { error: "Failed to generate document URL." };
  }
}
