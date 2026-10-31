import { NextResponse, type NextRequest } from "next/server";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { loadGeneratedPdf } from "@/lib/pdf/store";
import { canReadFinancialDocument } from "@/lib/finance/finance-access";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import { refuseAsNotFound } from "@/lib/finance/access-denied";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/**
 * A financial document. A generated document is served exactly as it was
 * generated. An uploaded one redirects to a short-lived signed link, once the
 * viewer's access to that document has been checked.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const { documentId } = await params;
  if (!UUID.test(documentId)) return notFound();
  const stored = await loadGeneratedPdf(documentId);
  if (stored) {
    if (!(await canReadFinancialDocument(profile, stored.doc))) {
      return refuseAsNotFound({ schemeId: stored.doc.schemeId, actorId: profile.id, entityType: "FinancialDocument", entityId: stored.doc.id, what: String(stored.doc.documentType) });
    }
    await recordSecurityEventLater({
      action: "document.download",
      outcome: "allowed",
      actorProfileId: profile.id,
      schemeId: stored.doc.schemeId,
      resourceType: "FinancialDocument",
      resourceId: stored.doc.id,
      metadata: { kind: String(stored.doc.documentType) },
    });
    return pdfResponse({ bytes: stored.bytes, fileName: String(stored.doc.fileName) }, stored.doc.contentHash);
  }
  const doc = await db.orm.public.FinancialDocument.where((d) => d.id.eq(documentId)).first();
  if (!doc) return notFound();
  if (!(await canReadFinancialDocument(profile, doc))) {
    return refuseAsNotFound({ schemeId: doc.schemeId, actorId: profile.id, entityType: "FinancialDocument", entityId: doc.id, what: String(doc.documentType) });
  }
  const fileUrl = String(doc.fileUrl ?? "");
  // A generated document's own route, with its stored copy missing.
  if (!fileUrl || fileUrl.startsWith("/api/")) return notFound();
  // Only a path in this scheme's folder of the documents bucket is signed.
  const url = await resolveDocumentUrl(fileUrl, 300, { schemeId: doc.schemeId }).catch(() => null);
  if (!url) return notFound();
  await recordSecurityEventLater({
    action: "document.download",
    outcome: "allowed",
    actorProfileId: profile.id,
    schemeId: doc.schemeId,
    resourceType: "FinancialDocument",
    resourceId: doc.id,
    metadata: { kind: String(doc.documentType) },
  });
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
