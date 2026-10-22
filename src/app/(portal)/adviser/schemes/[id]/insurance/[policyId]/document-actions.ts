"use server";

import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { createClient } from "@/lib/supabase/server";
import { validateFileUpload } from "@/lib/upload/validate-mime";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import { logActivity } from "@/lib/queries/activity-log";
import {
  createInsuranceDocument,
  getInsuranceDocumentById,
  markDocumentNotCurrent,
  markDocumentCurrent,
  softDeleteInsuranceDocument,
} from "@/lib/queries/insurance-documents";
import { DOCUMENT_CATEGORIES } from "@/lib/insurance/constants";

const CATEGORY_SET = new Set<string>(DOCUMENT_CATEGORIES);
const MAX_BYTES = 30 * 1024 * 1024;

export interface UploadResult {
  id?: string;
  error?: string;
}

/**
 * Upload one policy document. When `supersedesId` is given it is stored as a new
 * version of that document: the previous version is retained but marked
 * not-current, and the new row's version is incremented. Nothing is overwritten.
 */
export async function uploadInsuranceDocumentAction(
  schemeId: string,
  policyId: string,
  formData: FormData,
): Promise<UploadResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "OTHER";
    const title = ((formData.get("title") as string) ?? "").trim();
    const notes = ((formData.get("notes") as string) ?? "").trim();
    const supersedesId = ((formData.get("supersedesId") as string) ?? "").trim() || null;

    if (!file || file.size === 0) return { error: "No file provided." };
    if (!CATEGORY_SET.has(category)) return { error: "Invalid document category." };
    const mimeError = validateFileUpload(file);
    if (mimeError) return { error: mimeError };
    if (file.size > MAX_BYTES) return { error: "File must be smaller than 30 MB." };

    // Resolve versioning against any superseded document.
    let version = 1;
    let prev: Awaited<ReturnType<typeof getInsuranceDocumentById>> = null;
    if (supersedesId) {
      prev = await getInsuranceDocumentById(supersedesId);
      if (!prev || prev.policyId !== policyId) {
        return { error: "The document being superseded could not be found." };
      }
      version = prev.version + 1;
    }

    const supabase = await createClient();
    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = `schemes/${schemeId}/insurance/${policyId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

    const doc = await createInsuranceDocument({
      schemeId,
      policyId,
      category,
      title: title || file.name.replace(/\.[^.]+$/, ""),
      fileUrl: storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || null,
      uploadedBy: profile.id,
      version,
      supersedesId,
      notes: notes || null,
    });

    if (prev) await markDocumentNotCurrent(prev.id);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_DOCUMENT_UPLOADED",
      entityType: "InsuranceDocument",
      entityId: doc.id,
      metadata: { policyId, category, fileName: file.name, version },
    });

    revalidatePath(`/adviser/schemes/${schemeId}/insurance/${policyId}`);
    return { id: doc.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to upload document. Please try again." };
  }
}

/** Short-lived signed URL for previewing or downloading a policy document. */
export async function getInsuranceDocumentUrlAction(
  schemeId: string,
  fileUrl: string,
): Promise<{ url?: string; error?: string }> {
  try {
    await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
      "OWNER",
    ]);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  try {
    const url = await resolveDocumentUrl(fileUrl, 600);
    return { url };
  } catch {
    return { error: "Failed to generate document URL." };
  }
}

/** Soft-delete the current version of a document. */
export async function deleteInsuranceDocumentAction(
  schemeId: string,
  policyId: string,
  documentId: string,
): Promise<{ error?: string }> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const doc = await getInsuranceDocumentById(documentId);
    if (!doc || doc.policyId !== policyId) return { error: "Document not found." };

    await softDeleteInsuranceDocument(documentId);
    // Promote the immediate previous version to current, if any.
    if (doc.supersedesId) {
      const prev = await getInsuranceDocumentById(doc.supersedesId);
      if (prev) await markDocumentCurrent(prev.id);
    }

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_DOCUMENT_DELETED",
      entityType: "InsuranceDocument",
      entityId: documentId,
      metadata: { policyId },
    });

    revalidatePath(`/adviser/schemes/${schemeId}/insurance/${policyId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete document." };
  }
}
