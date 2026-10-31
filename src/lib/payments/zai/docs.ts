/**
 * The Zai documentation this integration is built from, all read on
 * 31 Oct 2026 (public pages only, no sandbox access). Every endpoint, field,
 * state and header the code uses cites one of these. Where the docs are
 * silent the code throws ZaiNotConfirmedError instead of guessing, so the
 * gap fails closed and is listed in the design (the NOT_CONFIRMED list).
 */

export const ZAI_DOCS_READ_ON = "2026-10-31";

export const ZAI_DOCS = {
  apiOverview: "https://developer.hellozai.com/reference/overview",
  environments: "https://developer.hellozai.com/docs/environments",
  token: "https://developer.hellozai.com/reference/token",
  createUser: "https://developer.hellozai.com/reference/createuser",
  createItem: "https://developer.hellozai.com/reference/createitem",
  makePayment: "https://developer.hellozai.com/reference/makepayment",
  refund: "https://developer.hellozai.com/reference/refund",
  createFee: "https://developer.hellozai.com/reference/createfee",
  withdrawFunds: "https://developer.hellozai.com/reference/withdrawfunds",
  billPayment: "https://developer.hellozai.com/reference/billpayment",
  listSubWallets: "https://developer.hellozai.com/reference/listsubwallets",
  walletAccounts: "https://developer.hellozai.com/docs/wallet-accounts-1",
  storedValue: "https://developer.hellozai.com/docs/stored-value-accounts",
  subWallets: "https://developer.hellozai.com/docs/sub-wallet-accounts",
  bpayPayins: "https://developer.hellozai.com/docs/bpay-payins-workflow",
  bpayPayouts: "https://developer.hellozai.com/docs/bpay-payouts-workflow",
  directCreditPayout: "https://developer.hellozai.com/docs/direct-credit-payout-workflow",
  onboardingPayoutUser: "https://developer.hellozai.com/docs/onboarding-a-pay-out-user",
  virtualAccounts: "https://developer.hellozai.com/docs/virtual-accounts",
  payIds: "https://developer.hellozai.com/docs/payids-1",
  statuses: "https://developer.hellozai.com/docs/statuses",
  webhooks: "https://developer.hellozai.com/docs/webhooks",
  webhooksApi: "https://developer.hellozai.com/reference/webhooks-overview",
  webhookBestPractices: "https://developer.hellozai.com/docs/best-practices-for-webhooks",
  verifyWebhookSignatures: "https://developer.hellozai.com/docs/verify-webhook-signatures",
  callbacks: "https://developer.hellozai.com/docs/callbacks",
} as const;

export type ZaiDocKey = keyof typeof ZAI_DOCS;

/**
 * Something the integration needs that the Zai docs read on 31 Oct 2026 do
 * not confirm. Thrown in place of a guess, so the call fails closed.
 */
export class ZaiNotConfirmedError extends Error {
  readonly code = "ZAI_NOT_CONFIRMED";
  constructor(
    /** A short id, as listed in the design's NOT_CONFIRMED list (e.g. "NC-SUBWALLET-CREATE"). */
    readonly item: string,
    detail: string,
    readonly doc?: ZaiDocKey,
  ) {
    super(`NOT_CONFIRMED ${item}: ${detail}${doc ? ` (${ZAI_DOCS[doc]}, read ${ZAI_DOCS_READ_ON})` : ""}`);
    this.name = "ZaiNotConfirmedError";
  }
}
