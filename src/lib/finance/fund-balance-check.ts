/**
 * The browser side of the fund integrity rule (financials review B1): a
 * journal's lines must balance within each fund. The server checks the same,
 * and also that each account is used for its own fund
 * (src/lib/finance/fund-integrity.ts).
 */

/** Funds whose lines do not balance on their own, with the gap in dollars. */
export function fundImbalances(
  lines: { fundId: string; debit: string; credit: string }[],
  funds: { value: string; label: string }[],
): { label: string; gap: number }[] {
  const byFund = new Map<string, number>();
  for (const l of lines) {
    if (!l.fundId) continue;
    const cents = Math.round((parseFloat(l.debit) || 0) * 100) - Math.round((parseFloat(l.credit) || 0) * 100);
    byFund.set(l.fundId, (byFund.get(l.fundId) ?? 0) + cents);
  }
  return [...byFund]
    .filter(([, c]) => c !== 0)
    .map(([id, c]) => ({ label: funds.find((f) => f.value === id)?.label ?? "A fund", gap: Math.abs(c) / 100 }));
}

/** Accounts both funds use; their balance by fund comes from the line tags. */
export const SHARED_ACCOUNT_SUB_TYPES: readonly string[] = ["BANK", "SUSPENSE", "ACCOUNTS_PAYABLE", "GST_COLLECTED", "GST_PAID"];

/** Whether an account may be used for any fund. */
export function isSharedAccount(a: { accountSubType: string | null; fundId: string | null }): boolean {
  return a.fundId == null || SHARED_ACCOUNT_SUB_TYPES.includes(String(a.accountSubType ?? ""));
}

/** Funds whose opening balance lines do not balance on their own, in cents (debits less credits). */
export function fundGapsCents(lines: { fundId: string; debitCents: number; creditCents: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) out.set(l.fundId, (out.get(l.fundId) ?? 0) + l.debitCents - l.creditCents);
  for (const [k, v] of out) if (v === 0) out.delete(k);
  return out;
}
