/**
 * The Zai client's requests, against the shapes the Zai reference pages
 * document (read 31 Oct 2026), with a mock transport: no test reaches Zai.
 */
import { describe, expect, it, vi } from "vitest";
import { ZaiClient, ZaiApiError, ZaiDuplicateRequestError, ZaiOutcomeUnknownError, ZaiRequestError, createZaiClient, type OnceGuard, type ZaiHttpRequest, type ZaiHttpResponse } from "./client";
import { ZaiDisabledError } from "./config";
import { ZaiNotConfirmedError } from "./docs";
import { TEST_CONFIG } from "./__fixtures__/test-env";

const TOKEN = { status: 200, body: JSON.stringify({ access_token: "tok-1", expires_in: 3600 }) };

/** A transport that answers the token request, then the given responses in order, and records every request. */
function mock(...responses: Array<ZaiHttpResponse | Error>) {
  const requests: ZaiHttpRequest[] = [];
  const queue = [...responses];
  const transport = vi.fn(async (r: ZaiHttpRequest) => {
    requests.push(r);
    if (r.url === TEST_CONFIG.tokenUrl) return TOKEN;
    const next = queue.shift();
    if (!next) throw new Error("no response queued");
    if (next instanceof Error) throw next;
    return next;
  });
  return { transport, requests, api: () => requests.filter((r) => r.url !== TEST_CONFIG.tokenUrl) };
}

const memoryGuard = (): OnceGuard & { keys: Set<string> } => {
  const keys = new Set<string>();
  return { keys, claim: async (k) => (keys.has(k) ? false : (keys.add(k), true)) };
};

const ok = (body: unknown = {}) => ({ status: 200, body: JSON.stringify(body) });
const client = (t: ReturnType<typeof mock>, extra: Partial<ConstructorParameters<typeof ZaiClient>[0]> = {}) =>
  new ZaiClient({ config: TEST_CONFIG, transport: t.transport, sleep: async () => undefined, ...extra });

describe("switched off", () => {
  it("refuses to make a client while ZAI_PAYMENTS is off or a setting is missing", () => {
    vi.stubEnv("ZAI_PAYMENTS", "");
    expect(() => createZaiClient()).toThrow(ZaiDisabledError);
    vi.stubEnv("ZAI_PAYMENTS", "on");
    expect(() => createZaiClient()).toThrow(/ZAI_ENVIRONMENT/);
    vi.unstubAllEnvs();
  });
});

describe("the token (token reference, API overview)", () => {
  it("asks with the client credentials grant and reuses the token until a minute before it expires", async () => {
    let now = 1_000_000;
    const t = mock(ok(), ok(), ok());
    const c = client(t, { now: () => now });
    await c.getUser("u1");
    await c.getUser("u1");
    const tokenRequests = t.requests.filter((r) => r.url === TEST_CONFIG.tokenUrl);
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0].method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(tokenRequests[0].body))).toEqual({
      grant_type: "client_credentials",
      client_id: TEST_CONFIG.clientId,
      client_secret: TEST_CONFIG.clientSecret,
      scope: TEST_CONFIG.scope,
    });
    expect(t.api()[0].headers.Authorization).toBe("Bearer tok-1");
    now += 3600_000 - 59_000;
    await c.getUser("u1");
    expect(t.requests.filter((r) => r.url === TEST_CONFIG.tokenUrl)).toHaveLength(2);
  });

  it("refuses a token response without an access token", async () => {
    const transport = vi.fn(async () => ({ status: 200, body: "{}" }));
    await expect(new ZaiClient({ config: TEST_CONFIG, transport }).getUser("u1")).rejects.toBeInstanceOf(ZaiNotConfirmedError);
  });
});

describe("users, wallets and bank accounts", () => {
  it("creates a user with POST /users and the documented fields (createuser)", async () => {
    const t = mock({ status: 201, body: "{}" });
    await client(t).createUser({ id: "sv-oc-sp1234", first_name: "Treasurer", last_name: "Name", email: "oc@example.com", country: "AUS", company: { name: "The Owners SP 1234", legal_name: "The Owners - Strata Plan No 1234", country: "AUS" } });
    const [r] = t.api();
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://test.api.promisepay.com/users");
    expect(r.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(r.body!)).toEqual({ id: "sv-oc-sp1234", first_name: "Treasurer", last_name: "Name", email: "oc@example.com", country: "AUS", company: { name: "The Owners SP 1234", legal_name: "The Owners - Strata Plan No 1234", country: "AUS" } });
  });

  it("refuses a user id with a '.' (createuser)", async () => {
    const t = mock();
    await expect(client(t).createUser({ id: "a.b", first_name: "a", last_name: "b", email: "e@example.com", country: "AUS" })).rejects.toBeInstanceOf(ZaiRequestError);
    expect(t.requests).toHaveLength(0);
  });

  it("reads wallets, BPAY details and sub-wallets at the documented paths", async () => {
    const t = mock(ok(), ok(), ok(), ok());
    const c = client(t);
    await c.listUserWalletAccounts("u 1");
    await c.getWalletAccount("w1");
    await c.getWalletBpayDetails("w1");
    await c.listSubWallets("w1", { offset: 10, limit: 200 });
    expect(t.api().map((r) => `${r.method} ${r.url.replace(TEST_CONFIG.apiBaseUrl, "")}`)).toEqual([
      "GET /users/u%201/wallet_accounts",
      "GET /wallet_accounts/w1",
      "GET /wallet_accounts/w1/bpay_details",
      "GET /sub_wallets/w1?offset=10&limit=200",
    ]);
    await expect(c.listSubWallets("w1", { limit: 201 })).rejects.toBeInstanceOf(ZaiRequestError);
  });

  it("creates a bank account with POST /bank_accounts", async () => {
    const t = mock({ status: 201, body: "{}" });
    const input = { user_id: "sup-1", bank_name: "Bank", account_name: "Supplier Pty Ltd", routing_number: "062000", account_number: "12345678", account_type: "checking", holder_type: "business", country: "AUS" };
    await client(t).createBankAccount(input);
    expect(t.api()[0]).toMatchObject({ method: "POST", url: "https://test.api.promisepay.com/bank_accounts" });
    expect(JSON.parse(t.api()[0].body!)).toEqual(input);
  });

  it("throws NOT_CONFIRMED, sending nothing, where the docs give no path or fields", () => {
    const t = mock();
    const c = client(t);
    for (const call of [() => c.createSubWallet(), () => c.transferToSubWallet(), () => c.createVirtualAccount(), () => c.registerPayId(), () => c.setDisbursementAccount(), () => c.getTransaction()]) {
      expect(call).toThrow(ZaiNotConfirmedError);
    }
    expect(t.requests).toHaveLength(0);
  });
});

describe("fees and items (createfee, createitem)", () => {
  it("creates a fee with fee_type_id, amount and who pays it", async () => {
    const t = mock({ status: 201, body: "{}" });
    await client(t).createFee({ name: "StrataVerze service fee", fee_type_id: 1, amount: 150, to: "buyer" });
    expect(JSON.parse(t.api()[0].body!)).toEqual({ name: "StrataVerze service fee", fee_type_id: 1, amount: 150, to: "buyer" });
    expect(t.api()[0].url).toBe("https://test.api.promisepay.com/fees");
  });

  it("creates an Express item in cents with the fee ids comma separated", async () => {
    const t = mock({ status: 201, body: "{}" });
    await client(t).createItem({ id: "sv-inv-0001", name: "Invoice 0001", amount: 102, payment_type: 2, buyer_id: "sv-oc-sp1234", seller_id: "sv-sup-1", fee_ids: ["fee-a", "fee-b"], currency: "AUD" });
    expect(JSON.parse(t.api()[0].body!)).toEqual({ id: "sv-inv-0001", name: "Invoice 0001", amount: 102, payment_type: 2, buyer_id: "sv-oc-sp1234", seller_id: "sv-sup-1", fee_ids: "fee-a,fee-b", currency: "AUD" });
  });

  it("refuses an item id with '/' or '.', and an amount that is not whole cents", async () => {
    const t = mock();
    const base = { name: "x", amount: 100, payment_type: 2 as const, buyer_id: "b", seller_id: "s" };
    await expect(client(t).createItem({ ...base, id: "a/b" })).rejects.toBeInstanceOf(ZaiRequestError);
    await expect(client(t).createItem({ ...base, id: "a.b" })).rejects.toBeInstanceOf(ZaiRequestError);
    await expect(client(t).createItem({ ...base, id: "ok", amount: 10.5 })).rejects.toBeInstanceOf(ZaiRequestError);
    expect(t.requests).toHaveLength(0);
  });
});

describe("money movements: sent once for their key", () => {
  it("makes a payment with PATCH /items/:id/make_payment and account_id (makepayment)", async () => {
    const t = mock(ok());
    const guard = memoryGuard();
    await client(t, { once: guard }).makePayment("sv-inv-0001", { account_id: "wallet-oc" }, "pay-sv-inv-0001");
    expect(t.api()[0]).toMatchObject({ method: "PATCH", url: "https://test.api.promisepay.com/items/sv-inv-0001/make_payment" });
    expect(JSON.parse(t.api()[0].body!)).toEqual({ account_id: "wallet-oc" });
    expect(guard.keys.has("pay-sv-inv-0001")).toBe(true);
  });

  it("withdraws and pays a bill with the key as reference_id (withdrawfunds, billpayment)", async () => {
    const t = mock({ status: 201, body: "{}" }, { status: 201, body: "{}" }, { status: 201, body: "{}" });
    const c = client(t, { once: memoryGuard() });
    await c.withdraw("wallet-sup", { account_id: "bank-sup", amount: 173 }, "wd-1");
    await c.billPayment("wallet-oc", { account_id: "bpay-acc", amount: 1050 }, "bp-1");
    await c.withdrawFromSubWallet("sub-1", { account_id: "bank-sup", amount: 500 }, "wd-2");
    const [w, b, s] = t.api();
    expect(w).toMatchObject({ method: "POST", url: "https://test.api.promisepay.com/wallet_accounts/wallet-sup/withdraw" });
    expect(JSON.parse(w.body!)).toEqual({ account_id: "bank-sup", amount: 173, reference_id: "wd-1" });
    expect(b).toMatchObject({ method: "POST", url: "https://test.api.promisepay.com/wallet_accounts/wallet-oc/bill_payment" });
    expect(JSON.parse(b.body!)).toEqual({ account_id: "bpay-acc", amount: 1050, reference_id: "bp-1" });
    expect(s).toMatchObject({ method: "POST", url: "https://test.api.promisepay.com/sub_wallets/sub-1/withdraw" });
    expect(JSON.parse(s.body!)).toEqual({ account_id: "bank-sup", amount: 500 });
  });

  it("refunds in full only (refund): a partial refund is NOT_CONFIRMED", async () => {
    const t = mock(ok());
    const c = client(t, { once: memoryGuard() });
    await c.refundItem("sv-inv-0001", { refund_message: "Paid twice" }, "rf-1");
    expect(t.api()[0]).toMatchObject({ method: "PATCH", url: "https://test.api.promisepay.com/items/sv-inv-0001/refund" });
    expect(JSON.parse(t.api()[0].body!)).toEqual({ refund_message: "Paid twice" });
    await expect(c.refundItem("sv-inv-0001", { refund_message: "x", partialAmountCents: 100 }, "rf-2")).rejects.toBeInstanceOf(ZaiNotConfirmedError);
  });

  it("refuses without a guard, and never sends the same key twice", async () => {
    const t = mock(ok());
    await expect(client(t).makePayment("i1", { account_id: "a" }, "k1")).rejects.toBeInstanceOf(ZaiRequestError);
    const c = client(t, { once: memoryGuard() });
    await c.makePayment("i1", { account_id: "a" }, "k1");
    await expect(c.makePayment("i1", { account_id: "a" }, "k1")).rejects.toBeInstanceOf(ZaiDuplicateRequestError);
    expect(t.api()).toHaveLength(1);
  });

  it("does not retry a money movement: a 5xx or a network error is an unknown outcome", async () => {
    const t = mock({ status: 503, body: "" }, new Error("socket hang up"));
    const c = client(t, { once: memoryGuard() });
    await expect(c.withdraw("w", { account_id: "a", amount: 100 }, "wd-a")).rejects.toBeInstanceOf(ZaiOutcomeUnknownError);
    await expect(c.withdraw("w", { account_id: "a", amount: 100 }, "wd-b")).rejects.toBeInstanceOf(ZaiOutcomeUnknownError);
    expect(t.api()).toHaveLength(2);
  });

  it("answers a 4xx with ZaiApiError carrying Zai's errors, not the request", async () => {
    const t = mock({ status: 422, body: JSON.stringify({ errors: { amount: ["is invalid"] } }) });
    const err = await client(t, { once: memoryGuard() }).withdraw("w", { account_id: "a", amount: 100 }, "wd-c").catch((e) => e);
    expect(err).toBeInstanceOf(ZaiApiError);
    expect(err.status).toBe(422);
    expect(err.errors).toEqual({ errors: { amount: ["is invalid"] } });
    expect(err.message).not.toMatch(/placeholder/);
  });
});

describe("retries", () => {
  it("retries a GET on 429, 5xx and network errors with backoff, then gives up", async () => {
    const sleeps: number[] = [];
    const t = mock({ status: 503, body: "" }, { status: 429, body: "" }, new Error("ECONNRESET"), ok({ users: { id: "u1" } }));
    const res = await client(t, { sleep: async (ms) => void sleeps.push(ms) }).getUser("u1");
    expect(res).toEqual({ users: { id: "u1" } });
    expect(sleeps).toEqual([250, 500, 1000]);
    const failing = mock({ status: 500, body: "" }, { status: 500, body: "" }, { status: 500, body: "" }, { status: 500, body: "" });
    await expect(client(failing).getUser("u1")).rejects.toBeInstanceOf(ZaiApiError);
    expect(failing.api()).toHaveLength(4);
  });

  it("asks for a new token once on a 401, for any request", async () => {
    const t = mock({ status: 401, body: "" }, ok());
    await client(t, { once: memoryGuard() }).makePayment("i1", { account_id: "a" }, "k-401");
    expect(t.requests.filter((r) => r.url === TEST_CONFIG.tokenUrl)).toHaveLength(2);
    expect(t.api()).toHaveLength(2);
  });
});
