/**
 * Owner payment confirmations (pure). TC-001: a second upload for the same
 * notice, amount and date by the same owner is a possible duplicate. It is
 * accepted, flagged, and the adviser is told; the adviser decides on review.
 */

export interface ConfirmationKey {
  uploadedBy: string;
  levyNoticeId: string | null;
  lotId: string | null;
  amountCents: number | null;
  documentDate: string | null;
}

/** The earlier upload this one matches, or null. Without an amount or a date nothing is matched. */
export function findDuplicateConfirmation<T extends ConfirmationKey & { id: string; documentStatus?: string }>(next: ConfirmationKey, earlier: T[]): T | null {
  if (next.amountCents == null || !next.documentDate) return null;
  return (
    earlier.find(
      (e) =>
        e.documentStatus !== "REJECTED" &&
        e.uploadedBy === next.uploadedBy &&
        (e.levyNoticeId ?? null) === (next.levyNoticeId ?? null) &&
        (next.levyNoticeId ? true : (e.lotId ?? null) === (next.lotId ?? null)) &&
        e.amountCents === next.amountCents &&
        e.documentDate === next.documentDate,
    ) ?? null
  );
}

/** Where an owner's payment confirmation may be stored: their scheme's payments folder. */
export function paymentConfirmationPathProblem(schemeId: string, storagePath: string): string | null {
  const prefix = `schemes/${schemeId}/payments/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes("..") || storagePath.length <= prefix.length) return "The uploaded file is not in this scheme's payments folder.";
  return null;
}
