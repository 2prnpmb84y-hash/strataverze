/**
 * Which journal entries are in the ledger. Reversing an entry marks the
 * original REVERSED and posts a mirror entry, so both stay in the ledger and
 * net to zero (Financial Management Requirements 4.2: "the original and its
 * reversal are both included"). Drafts are never included.
 */
export const LEDGER_STATUSES: string[] = ["POSTED", "REVERSED"];

export function inLedger(status: unknown): boolean {
  return status === "POSTED" || status === "REVERSED";
}
