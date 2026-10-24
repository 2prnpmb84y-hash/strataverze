"use server";

import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import { getDownloadableInsuranceDocument } from "@/lib/queries/insurance-documents";

/**
 * Short-lived signed URL for an owner to download a policy document. Takes the
 * document's id, never a path: only the current version of a document filed
 * against one of the scheme's live policies can be signed, which is what the
 * owner insurance page lists. Claim evidence is not available here.
 */
export async function getOwnerInsuranceDocumentUrlAction(
  schemeId: string,
  documentId: string,
): Promise<{ url?: string; error?: string }> {
  let doc: Awaited<ReturnType<typeof getDownloadableInsuranceDocument>>;
  try {
    await requireSchemeAccess(schemeId, "insurance.read");
    doc = await getDownloadableInsuranceDocument(schemeId, documentId, "member");
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  if (!doc) return { error: "Document not found." };
  try {
    return { url: await resolveDocumentUrl(String(doc.fileUrl), 600, { schemeId }) };
  } catch {
    return { error: "Failed to generate document URL." };
  }
}
