import type { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { loadGeneratedPdf } from "@/lib/pdf/store";
import { canReadFinancialDocument } from "@/lib/finance/finance-access";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/** A stored generated document, exactly as it was generated. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const { documentId } = await params;
  if (!UUID.test(documentId)) return notFound();
  const stored = await loadGeneratedPdf(documentId);
  if (!stored || !(await canReadFinancialDocument(profile, stored.doc))) return notFound();
  return pdfResponse({ bytes: stored.bytes, fileName: String(stored.doc.fileName) }, stored.doc.contentHash);
}
