/**
 * Zai's own example payloads, as recorded from the Webhooks guide
 * (https://developer.hellozai.com/docs/webhooks, read 31 Oct 2026), and the
 * signature sample values from "Verify Webhook Signatures"
 * (https://developer.hellozai.com/docs/verify-webhook-signatures, read
 * 31 Oct 2026). Tests use these only; nothing here came from a real
 * account, and no test reaches Zai.
 *
 * One change: the NPP example's pay_id and the batch example's user_email
 * are hidden by the docs site's email protection ("[email protected]"), so
 * an example.com address stands in for each. The links objects are left out
 * (only their names are given in the guide).
 */

/** "NPP Payin via PayID and CRN (Australia)", a transactions webhook. */
export const NPP_PAYIN_EXAMPLE = {
  transactions: {
    id: "49f1cb10-0202-0138-225b-028e897a70a5",
    created_at: "2019-12-16T07:19:14.966Z",
    updated_at: "2019-12-16T07:19:14.968Z",
    description: "Credit of $100,000.00 to Wallet Account by Debit of $100,000.00 from NPP Payin Funding Account",
    payee_name: "ASSEMBLY TEST",
    type: "deposit",
    type_method: "npp_payin",
    state: "successful",
    user_id: "449416d8-ec3c-4c0b-a326-e2cfaadaa3a6",
    user_name: "Neol Buyer",
    account_id: "89290ee0-7510-0137-fdc6-06502c58c658",
    account_type: "wallet_account",
    amount: 10000000,
    currency: "AUD",
    debit_credit: "credit",
    marketplace: { group_name: null, name: "Assembly Production", short_name: null, uuid: "cbec69ee-2153-4ac0-940c-cca51a0ff2e8" },
    related: {
      transactions: [{ id: "49f1b7f0-0202-0138-1aab-028e897a70a5", account_id: "7cfcf2ac-f274-4793-a47c-08c8bc82234f", account_type: "npp_payin_account", user_id: "449416d8-ec3c-4c0b-a326-e2cfaadaa3a6" }],
    },
    payin_details: {
      debtor_name: "ASSEMBLY TEST",
      debtor_legal_name: "ASSEMBLY TEST",
      debtor_bsb: "098765",
      debtor_account: "09876512345678",
      clearing_system_transaction_id: "CTBAAUSNXXXN20191216050126353211111",
      remittance_information: "100014014111111",
      pay_id: "lot7.payid@example.com",
      pay_id_type: "/EMAL",
      end_to_end_id: "NOTPROVIDED",
      npp_payin_internal_id: "5ce94260-1fd4-11ea-bc20-efacc9a3e552",
    },
  },
};

/** "BPAY Payin" (deposit, bpay), a transactions webhook. It has no payin_details. */
export const BPAY_PAYIN_EXAMPLE = {
  transactions: {
    id: "c7dfc660-01d5-0138-f9ed-0292c5a1dee7",
    created_at: "2019-12-16T02:00:38.884Z",
    updated_at: "2019-12-16T02:00:38.886Z",
    description: "Credit of $1,153.46 to Wallet Account by Debit of $1,153.46 from BPAY Funding Account",
    payee_name: null,
    type: "deposit",
    type_method: "bpay",
    state: "successful",
    user_id: "c934dc1e-a646-4972-b1c4-ef0f77337298",
    user_name: "Neol Buyer",
    account_id: "d92296c0-8f32-0137-95dd-06ddcda9b4cc",
    account_type: "wallet_account",
    amount: 115346,
    currency: "AUD",
    debit_credit: "credit",
    marketplace: { group_name: null, name: "Assembly Production", short_name: null, uuid: "7e2f32da-eaaf-41b0-b31d-1a79823de1cf" },
    related: { transactions: [{ id: "c7dfb260-01d5-0138-73ca-0292c5a1dee7", account_id: null, account_type: "bpay_funding_account", user_id: "d5556ed140a90e9fe23575f7e2191072" }] },
  },
};

/** A disbursements webhook, state bank_processing. */
export const DISBURSEMENT_EXAMPLE = {
  disbursements: {
    id: "1c0916c6-e4ef-4d9f-9548-974e2b5cb5cd",
    amount: 100000,
    currency: "AUD",
    batch_id: null,
    cuscal_payment_transaction_id: null,
    created_at: "2019-12-16T04:06:48.329Z",
    updated_at: "2019-12-16T04:06:50.181Z",
    state: "bank_processing",
    to: "Bank Account",
    bank_name: "BWA",
    bank_account_name: "ASSEMBLY TEST",
    bank_account_number: "XXX975",
    bank_routing_number: "XXXXX1",
    npp_payout_state: "trying",
  },
};

/** A batch_transactions webhook (BPAY disbursement, bank_processing), with a numeric id. */
export const BATCH_TRANSACTION_EXAMPLE = {
  batch_transactions: {
    created_at: "2020-07-27T22:50:27.654Z",
    updated_at: "2020-07-27T22:52:41.014Z",
    id: 31622,
    uuid: "486a51f2-099c-4eba-9e83-a854fec01484",
    user_email: "bpay.user@example.com",
    type: "disbursement",
    type_method: "bpay",
    state: "bank_processing",
    status: 12700,
    user_id: "6350f240-b289-0138-1ab1-0a58a9feac37",
    account_id: "6362eb40-b289-0138-e4bd-0a58a9feac37",
    amount: 10005,
    currency: "AUD",
    debit_credit: "credit",
    description: "Debit of $100.05 from Wallet Account for Credit of $100.05 to BPay Disbursement Account",
  },
};

/** The body Zai sends when a webhook is created ({ message: 'Zai callback test'}), as JSON. */
export const WEBHOOK_TEST_EXAMPLE = { message: "Zai callback test" };

/** The values in the signature page's samples. The page gives no expected signature. */
export const SIGNATURE_SAMPLE = { secret: "xPpcHHoAOM", timestamp: "1257894000", payload: '{"event": "status_updated"}' };
