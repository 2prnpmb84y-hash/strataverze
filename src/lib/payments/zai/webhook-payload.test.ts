/** Reading Zai's own example payloads (webhooks guide, read 31 Oct 2026). */
import { describe, expect, it } from "vitest";
import { bodyToStore, isNewerThanApplied, isSuccessful, isWalletPayin, parseZaiWebhook, readZaiTransaction, webhookDedupeKey } from "./webhook-payload";
import { BATCH_TRANSACTION_EXAMPLE, BPAY_PAYIN_EXAMPLE, DISBURSEMENT_EXAMPLE, NPP_PAYIN_EXAMPLE, WEBHOOK_TEST_EXAMPLE } from "./__fixtures__/zai-doc-examples";

const raw = (o: unknown) => JSON.stringify(o);

describe("parseZaiWebhook", () => {
  it("reads the wrapped object, its id and updated_at", () => {
    const p = parseZaiWebhook(raw(NPP_PAYIN_EXAMPLE));
    expect(p).toMatchObject({ kind: "OBJECT", objectType: "transactions", objectId: "49f1cb10-0202-0138-225b-028e897a70a5", updatedAt: new Date("2019-12-16T07:19:14.968Z") });
    expect(parseZaiWebhook(raw(DISBURSEMENT_EXAMPLE))).toMatchObject({ kind: "OBJECT", objectType: "disbursements", objectId: "1c0916c6-e4ef-4d9f-9548-974e2b5cb5cd" });
    // A batch transaction's id is a number in the example.
    expect(parseZaiWebhook(raw(BATCH_TRANSACTION_EXAMPLE))).toMatchObject({ kind: "OBJECT", objectType: "batch_transactions", objectId: "31622" });
  });

  it("knows transaction_failure_advice, as a type stored and ignored (review L5)", () => {
    expect(parseZaiWebhook(raw({ transaction_failure_advice: { id: "x" } }))).toMatchObject({ kind: "KNOWN_IGNORED", objectType: "transaction_failure_advice" });
  });

  it("recognises the test payload, and refuses anything else", () => {
    expect(parseZaiWebhook(raw(WEBHOOK_TEST_EXAMPLE))).toEqual({ kind: "TEST" });
    for (const body of ["not json", "[]", raw({}), raw({ transactions: {}, items: {} }), raw({ payto_payments: { id: "x" } }), raw({ transactions: [] }), raw({ transactions: { amount: 1 } })]) {
      expect(parseZaiWebhook(body).kind, body).toBe("UNRECOGNISED");
    }
  });
});

describe("readZaiTransaction", () => {
  it("reads the NPP payin example's documented fields, with its PayID", () => {
    const t = readZaiTransaction(NPP_PAYIN_EXAMPLE.transactions)!;
    expect(t).toEqual({
      id: "49f1cb10-0202-0138-225b-028e897a70a5",
      createdAt: new Date("2019-12-16T07:19:14.966Z"),
      updatedAt: new Date("2019-12-16T07:19:14.968Z"),
      type: "deposit",
      typeMethod: "npp_payin",
      state: "successful",
      accountId: "89290ee0-7510-0137-fdc6-06502c58c658",
      accountType: "wallet_account",
      amountCents: 10000000,
      currency: "AUD",
      debitCredit: "credit",
      payId: "lot7.payid@example.com",
      remittanceInformation: "100014014111111",
    });
    expect(isWalletPayin(t)).toBe(true);
    expect(isSuccessful(t)).toBe(true);
  });

  it("reads the BPAY payin example, which has no payer reference", () => {
    const t = readZaiTransaction(BPAY_PAYIN_EXAMPLE.transactions)!;
    expect(t).toMatchObject({ typeMethod: "bpay", amountCents: 115346, payId: null, remittanceInformation: null });
    expect(isWalletPayin(t)).toBe(true);
  });

  it("refuses a transaction missing a documented field, or with an amount that is not whole cents", () => {
    const base = NPP_PAYIN_EXAMPLE.transactions;
    for (const change of [{ amount: 10.5 }, { amount: "100" }, { amount: -1 }, { state: undefined }, { updated_at: "yesterday" }, { account_id: "" }]) {
      expect(readZaiTransaction({ ...base, ...change }), JSON.stringify(change)).toBeNull();
    }
  });

  it("is not a wallet payin when it is a debit, not a deposit, or not to a wallet", () => {
    const t = readZaiTransaction(NPP_PAYIN_EXAMPLE.transactions)!;
    expect(isWalletPayin({ ...t, debitCredit: "debit" })).toBe(false);
    expect(isWalletPayin({ ...t, type: "payment" })).toBe(false);
    expect(isWalletPayin({ ...t, accountType: "npp_payin_account" })).toBe(false);
  });
});

describe("ordering and duplicates", () => {
  it("applies only a payload newer than the one applied; one without updated_at never", () => {
    const t = new Date("2019-12-16T07:19:14.968Z");
    expect(isNewerThanApplied(t, null)).toBe(true);
    expect(isNewerThanApplied(t, "2019-12-16T07:19:14.967Z")).toBe(true);
    expect(isNewerThanApplied(t, "2019-12-16T07:19:14.968Z")).toBe(false);
    expect(isNewerThanApplied(t, new Date("2019-12-16T07:19:15.000Z"))).toBe(false);
    expect(isNewerThanApplied(null, null)).toBe(false);
    expect(isNewerThanApplied(t, "not a time")).toBe(false);
  });

  it("keys a delivery by the SHA-256 of its raw body", () => {
    expect(webhookDedupeKey(raw(NPP_PAYIN_EXAMPLE))).toMatch(/^[0-9a-f]{64}$/);
    expect(webhookDedupeKey(raw(NPP_PAYIN_EXAMPLE))).toBe(webhookDedupeKey(raw(NPP_PAYIN_EXAMPLE)));
    expect(webhookDedupeKey(raw(NPP_PAYIN_EXAMPLE))).not.toBe(webhookDedupeKey(raw(BPAY_PAYIN_EXAMPLE)));
  });
});

describe("bodyToStore (second review, LOW-3)", () => {
  it("keeps only type, id, updated_at and state of any object but a transaction", () => {
    const user = { users: { id: "u1", updated_at: "2026-10-31T00:00:00.000Z", state: "approved", first_name: "A", last_name: "B", email: "a@example.com", mobile: "+61400000000", dob: "01/01/1980", government_number: "123", verification_state: "approved" } };
    expect(JSON.parse(bodyToStore(raw(user)))).toEqual({ users: { id: "u1", updated_at: "2026-10-31T00:00:00.000Z", state: "approved" } });
    expect(JSON.parse(bodyToStore(raw(BATCH_TRANSACTION_EXAMPLE)))).toEqual({ batch_transactions: { id: 31622, updated_at: "2020-07-27T22:52:41.014Z", state: "bank_processing" } });
    const account = { accounts: { id: "a1", account_name: "Supplier Pty Ltd", bank: { account_number: "123" } } };
    expect(JSON.parse(bodyToStore(raw(account)))).toEqual({ accounts: { id: "a1" } });
    expect(JSON.parse(bodyToStore(raw({ transaction_failure_advice: { id: "t", debtor_name: "X", account_name: "Y" } })))).toEqual({ transaction_failure_advice: { id: "t" } });
  });

  it("keeps nothing of a body that is not one wrapped object, such as a PayTo or PayID event", () => {
    const payto = { event_type: "agreement.updated", id: "p1", data: { debtor: { name: "X" } }, message: "m" };
    expect(JSON.parse(bodyToStore(raw(payto)))).toEqual({ unrecognised_body_bytes: Buffer.byteLength(raw(payto)) });
    expect(JSON.parse(bodyToStore(raw(WEBHOOK_TEST_EXAMPLE)))).toEqual({ message: "Zai callback test" });
  });
});
