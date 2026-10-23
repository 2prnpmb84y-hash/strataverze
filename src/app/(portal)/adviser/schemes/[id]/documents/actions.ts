"use server";

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
import { createClient } from "@/lib/supabase/server";
import { validateFileUpload } from "@/lib/upload/validate-mime";
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
    const file = formData.get("file") as File | null;

    const errors: Record<string, string> = {};
    if (!title) errors.title = "Title is required.";
    if (!category || !CATEGORIES.includes(category))
      errors.category = "Select a valid category.";
    if (!file || file.size === 0) {
      errors.file = "Please select a file to upload.";
    } else {
      const mimeError = validateFileUpload(file);
      if (mimeError) errors.file = mimeError;
      else if (file.size > 30 * 1024 * 1024)
        errors.file = "File must be smaller than 30 MB.";
    }

    if (Object.keys(errors).length > 0) return { fieldErrors: errors };

    // Upload to Supabase Storage
    const supabase = await createClient();
    const ext = file!.name.split(".").pop() ?? "bin";
    const storagePath = `schemes/${schemeId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file!, {
        contentType: file!.type,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Upload failed: ${uploadError.message}` };
    }

    const doc = await createDocument({
      schemeId,
      title,
      description: description || undefined,
      category,
      fileUrl: storagePath,
      fileName: file!.name,
      fileSize: file!.size,
      mimeType: file!.type || undefined,
      uploadedBy: profile.id,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: doc.id,
      metadata: { title, category, fileName: file!.name },
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

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { id: "", error: "No file provided." };
    }

    const mimeError = validateFileUpload(file);
    if (mimeError) return { id: "", error: mimeError };

    if (file.size > 30 * 1024 * 1024) {
      return { id: "", error: "File must be smaller than 30 MB." };
    }

    const supabase = await createClient();
    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = `schemes/${schemeId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return { id: "", error: `Upload failed: ${uploadError.message}` };
    }

    // Read optional metadata from form data
    const category = (formData.get("category") as string) || "OTHER";
    const documentType = (formData.get("documentType") as string) || undefined;
    const strataPlan = (formData.get("strataPlan") as string) || undefined;
    const schedule = (formData.get("schedule") as string) || undefined;
    const lotNumber = (formData.get("lotNumber") as string) || undefined;
    const supplier = (formData.get("supplier") as string) || undefined;
    const comments = (formData.get("comments") as string) || undefined;
    const title = file.name.replace(/\.[^.]+$/, "");

    const doc = await createDocument({
      schemeId,
      title,
      category,
      documentType,
      fileUrl: storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || undefined,
      uploadedBy: profile.id,
      strataPlan,
      schedule,
      lotNumber,
      supplier,
      comments,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: doc.id,
      metadata: { title, category, fileName: file.name },
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
    await updateDocument(schemeId, documentId, {
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
  try {
    await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE", "OWNER"]);
    const document = await getDocumentById(documentId);
    assertInScheme(document, schemeId, "Document");
    fileUrl = document.fileUrl;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  try {
    const url = await resolveDocumentUrl(fileUrl, 600); // 10 minutes
    return { url };
  } catch {
    return { error: "Failed to generate document URL." };
  }
}
