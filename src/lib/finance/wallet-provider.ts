/**
 * The payment provider's wallet balance for a scheme, for the three-way
 * reconciliation. There is no provider yet (Zai is not integrated), so the
 * default returns null and the report shows the wallet as not applicable.
 */
export interface WalletBalanceProvider {
  /** The wallet balance in cents at the end of `asAt` (YYYY-MM-DD), or null if there is no wallet. */
  walletBalanceCents(schemeId: string, asAt: string): Promise<number | null>;
}

export const noWalletProvider: WalletBalanceProvider = {
  async walletBalanceCents() {
    return null;
  },
};

/** The provider in use. Swap this for the Zai implementation once it exists. */
export function walletBalanceProvider(): WalletBalanceProvider {
  return noWalletProvider;
}
