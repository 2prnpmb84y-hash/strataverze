import { loadGeneratedPdf } from "@/lib/pdf/store";
import { captureConfirmedMinutes, captureGeneratedPdf, captureLibraryDocument, captureMeetingNotice, captureQuietly, pendingSources } from "./sources";

/**
 * Bring into the vault everything that should be there but is not: the
 * library's documents and StrataVerze's documents from before the vault was
 * opened, and any capture that failed. Each is captured at most once.
 * Their capture time is now; the ledger notes they were added afterwards.
 */
export async function bringInPending(schemeId: string, actorId: string, limit = 100): Promise<{ captured: number; failed: number; remaining: number }> {
  const pending = await pendingSources(schemeId);
  let captured = 0;
  let failed = 0;
  for (const p of pending.slice(0, limit)) {
    let result = null;
    if (p.kind === "library") {
      result = await captureQuietly(schemeId, p.sourceRef, () => captureLibraryDocument(schemeId, p.id, actorId, { addedBeforeVault: true }));
    } else if (p.kind === "financial") {
      const loaded = await loadGeneratedPdf(p.id);
      result = loaded && loaded.doc.schemeId === schemeId
        ? await captureGeneratedPdf({
            schemeId,
            financialDocumentId: p.id,
            documentType: loaded.doc.documentType,
            fileName: loaded.doc.fileName,
            bytes: loaded.bytes,
            actorId,
            documentDate: loaded.doc.documentDate ? String(loaded.doc.documentDate) : null,
          })
        : null;
    } else if (p.kind === "minutes") {
      result = await captureConfirmedMinutes(p.id, actorId);
    } else {
      result = await captureMeetingNotice(p.id, actorId);
    }
    if (result) captured += 1;
    else failed += 1;
  }
  return { captured, failed, remaining: Math.max(0, pending.length - limit) };
}
