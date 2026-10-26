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
