/**
 * A typed client for the Zai core API (fetch based, transport injectable).
 *
 * Built only from Zai's public docs, read on 31 Oct 2026 (see ./docs.ts).
 * Each method cites the page its path and fields come from. Where a page
 * gives the path but not the fields, or not the path, the method throws
 * ZaiNotConfirmedError instead of guessing.
 *
 * Refuses to exist while switched off: the constructor checks ZAI_PAYMENTS
 * even when a config is passed in, and otherwise calls requireZaiConfig,
 * which throws ZaiDisabledError unless every setting is present
 * (./config.ts). The config is held in a private field. Tests turn the
 * switch on, pass a config and a mock transport, so no test reaches Zai.
 *
 * Retries and idempotency (Zai documents no idempotency header, so none is
 * sent):
 * - GET requests and the token request are retried on a network error, 429
 *   or 5xx, with exponential backoff. They change nothing at Zai.
 * - Every other request is sent once. A network error or 5xx on it means
 *   the outcome is unknown (ZaiOutcomeUnknownError): the caller finds out
 *   with a GET before doing anything else. On a 401 a GET is asked again
 *   once with a new token; a write is never sent twice: a money movement's
 *   outcome is unknown, and any other write is refused (ZaiApiError 401).
 * - A request that moves money (make_payment, refund, withdraw,
 *   bill_payment) needs an idempotency key and a OnceGuard, which claims the
 *   key durably before the request is sent, so the same key is never sent
 *   twice, even after a crash. Without a guard the client refuses. Where Zai
 *   documents a unique reference (reference_id on withdraw and bill_payment)
 *   the key is also sent as that reference.
 * - Creates carry the id StrataVerze supplies (users, items), which Zai
 *   requires to be unique.
 */
import { requireZaiConfig, ZaiDisabledError, zaiSwitchOn, type ZaiConfig } from "./config";
import { ZaiNotConfirmedError } from "./docs";

// ─── Transport ──────────────────────────────────────────────────────────────

export interface ZaiHttpRequest {
  method: "GET" | "POST" | "PATCH";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ZaiHttpResponse {
  status: number;
  body: string;
}

export type ZaiTransport = (request: ZaiHttpRequest) => Promise<ZaiHttpResponse>;

/** The real transport: fetch, no redirects followed, 20 second timeout. */
export const fetchTransport: ZaiTransport = async (request) => {
  const res = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, body: await res.text() };
};

/**
 * Claims an idempotency key durably (for example a unique row written in its
 * own committed transaction). Resolves true the first time a key is claimed
 * and false ever after.
 */
export interface OnceGuard {
  claim(key: string): Promise<boolean>;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** Zai answered with an error. `errors` is the parsed body, if any; the request body is never included. */
export class ZaiApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly errors: unknown,
  ) {
    super(`Zai answered ${status} to ${path}.`);
    this.name = "ZaiApiError";
  }
}

/** A request that changes something was sent and may or may not have been done. Check with a GET. */
export class ZaiOutcomeUnknownError extends Error {
  constructor(
    readonly path: string,
    readonly idempotencyKey: string | null,
    readonly cause?: unknown,
  ) {
    super(`The outcome of ${path} is unknown${idempotencyKey ? ` (key ${idempotencyKey})` : ""}. Check it at Zai before trying again.`);
    this.name = "ZaiOutcomeUnknownError";
  }
}

/** The idempotency key was already claimed: the request is never sent twice. */
export class ZaiDuplicateRequestError extends Error {
  constructor(readonly idempotencyKey: string) {
    super(`A Zai request with key ${idempotencyKey} was already sent.`);
    this.name = "ZaiDuplicateRequestError";
  }
}

export class ZaiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZaiRequestError";
  }
}

// ─── Inputs (documented fields only) ────────────────────────────────────────

/** POST /users body (createuser reference). Strings only, as documented. */
export interface CreateUserInput {
  /** Platform-supplied unique id; cannot contain "." (createuser). */
  id: string;
  first_name: string;
  last_name: string;
  /** Unique to the platform (createuser). */
  email: string;
  /** ISO 3166-1 alpha-3 (createuser), e.g. "AUS". */
  country: string;
  mobile?: string;
  address_line1?: string;
  address_line2?: string;
  state?: string;
  city?: string;
  zip?: string;
  /** DD/MM/YYYY (createuser). */
  dob?: string;
  authorized_signer_title?: string;
  custom_descriptor?: string;
  /**
   * If given, Zai creates a company for the user (createuser). The fields are
   * the company fields the onboarding guide lists (onboarding a pay-out user);
   * the createuser page does not describe the object, so the confidence is
   * medium (NOT_CONFIRMED NC-COMPANY-OBJECT).
   */
  company?: {
    name: string;
    legal_name: string;
    tax_number?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    country: string;
  };
}

/** POST /bank_accounts body (direct credit payout workflow; fields from onboarding a pay-out user). */
export interface CreateBankAccountInput {
  user_id: string;
  bank_name: string;
  account_name: string;
  /** The BSB, for an Australian account. */
  routing_number: string;
  account_number: string;
  /** Allowed values not given in the pages read (NOT_CONFIRMED NC-BANK-ENUMS). */
  account_type: string;
  /** Allowed values not given in the pages read (NOT_CONFIRMED NC-BANK-ENUMS). */
  holder_type: string;
  country: string;
}

/** POST /fees body (createfee). */
export interface CreateFeeInput {
  name: string;
  /** 1 Fixed, 2 Percentage, 3 Percentage with Cap, 4 Percentage with Min (createfee). */
  fee_type_id: 1 | 2 | 3 | 4;
  /** Cents for a fixed fee; hundredths of a percent for a percentage (5 is 0.05%) (createfee). */
  amount: number;
  cap?: string;
  min?: number;
  max?: number;
  /** Who pays: buyer (added on top) or seller (taken from the proceeds) (createfee). cc and int_wire are not explained. */
  to?: "buyer" | "seller";
}

/** POST /items body (createitem). */
export interface CreateItemInput {
  /** Unique; cannot contain "." or "/" (createitem). */
  id: string;
  name: string;
  /** Cents (createitem). */
  amount: number;
  /** Only 2 (Express) is documented (createitem). */
  payment_type: 2;
  buyer_id: string;
  seller_id: string;
  /** Sent as a comma-separated list (createitem). */
  fee_ids?: string[];
  description?: string;
  /** ISO 4217 alpha-3 (createitem). */
  currency?: string;
  custom_descriptor?: string;
  tax_invoice?: boolean;
}

export interface WithdrawInput {
  /** The bank account to pay to, linked to the wallet's user (withdrawfunds). */
  account_id: string;
  /** Cents (withdrawfunds). */
  amount: number;
  custom_descriptor?: string;
}

export interface BillPaymentInput {
  /** A bpay_account id (billpayment). */
  account_id: string;
  /** Cents (billpayment). */
  amount: number;
}

export type ZaiJson = Record<string, unknown>;

// ─── Client ─────────────────────────────────────────────────────────────────

export interface ZaiClientOptions {
  /** Defaults to requireZaiConfig(), which refuses unless switched on and complete. */
  config?: ZaiConfig;
  transport?: ZaiTransport;
  /** Needed for any request that moves money. */
  once?: OnceGuard;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Retries for GET and the token request (default 3). */
  maxRetries?: number;
}

/** A Zai id or key StrataVerze supplies: no "." or "/" (createuser, createitem, withdrawfunds). */
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const assertSafeId = (label: string, v: string) => {
  if (!SAFE_ID.test(v)) throw new ZaiRequestError(`${label} must be 1 to 100 letters, digits, "-" or "_".`);
};
const assertCents = (label: string, v: number) => {
  if (!Number.isSafeInteger(v) || v <= 0) throw new ZaiRequestError(`${label} must be a whole number of cents above zero.`);
};
const seg = (v: string) => {
  if (!v) throw new ZaiRequestError("An id is missing.");
  return encodeURIComponent(v);
};

const parseJson = (body: string): unknown => {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const retryable = (status: number) => status === 429 || status >= 500;

export class ZaiClient {
  // Private: the client secret and webhook secret are not reachable from outside (review L2).
  readonly #config: ZaiConfig;
  private readonly transport: ZaiTransport;
  private readonly once?: OnceGuard;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(options: ZaiClientOptions = {}) {
    // The switch is checked even when a config is passed in (review L1).
    if (!zaiSwitchOn()) throw new ZaiDisabledError("ZAI_PAYMENTS is not on");
    this.#config = options.config ?? requireZaiConfig();
    this.transport = options.transport ?? fetchTransport;
    this.once = options.once;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? Date.now;
    this.maxRetries = options.maxRetries ?? 3;
  }

  // ── Auth ──

  /**
   * An access token, reused until a minute before it expires. Zai: OAuth2
   * client credentials; tokens last 60 minutes; no refresh endpoint, so ask
   * again; reuse tokens, since a token per call hits the auth provider's rate
   * limit (API overview). POST with grant_type=client_credentials,
   * client_id, client_secret and scope (token reference). The token page's
   * examples did not load, so the body encoding and the response field names
   * are the OAuth 2.0 standard's (RFC 6749 s 4.4.2 and s 5.1), which the docs
   * name but do not show (NOT_CONFIRMED NC-AUTH-BODY, NC-AUTH-RESPONSE).
   */
  async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt - 60_000) return this.token.value;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.#config.clientId,
      client_secret: this.#config.clientSecret,
      scope: this.#config.scope,
    }).toString();
    const res = await this.send(
      { method: "POST", url: this.#config.tokenUrl, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body },
      true,
      "/tokens",
    );
    if (res.status !== 200) throw new ZaiApiError(res.status, "/tokens", null);
    const json = parseJson(res.body) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!json || typeof json.access_token !== "string" || !json.access_token) {
      throw new ZaiNotConfirmedError("NC-AUTH-RESPONSE", "the token response has no access_token", "token");
    }
    // 60 minutes when the lifetime is not given (API overview).
    const seconds = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
    this.token = { value: json.access_token, expiresAt: this.now() + seconds * 1000 };
    return this.token.value;
  }

  // ── Users and wallets ──

  /** GET /users/:id (BPAY payin workflow). */
  async getUser(userId: string) {
    return this.get(`/users/${seg(userId)}`);
  }

  /** POST /users (createuser). The id is StrataVerze's, so a retry by the caller uses the same id. */
  async createUser(input: CreateUserInput) {
    assertSafeId("The Zai user id", input.id);
    return this.write("POST", "/users", input, null);
  }

  /** GET /users/:id/wallet_accounts (BPAY payin workflow, virtual accounts guide). */
  async listUserWalletAccounts(userId: string) {
    return this.get(`/users/${seg(userId)}/wallet_accounts`);
  }

  /** GET /wallet_accounts/:id (direct credit payout workflow, step 10). */
  async getWalletAccount(walletAccountId: string) {
    return this.get(`/wallet_accounts/${seg(walletAccountId)}`);
  }

  /**
   * GET /wallet_accounts/:id/bpay_details (BPAY payin workflow). The
   * response's field names are not given in the pages read, so it is
   * returned as Zai sent it (NOT_CONFIRMED NC-BPAY-DETAILS).
   */
  async getWalletBpayDetails(walletAccountId: string) {
    return this.get(`/wallet_accounts/${seg(walletAccountId)}/bpay_details`);
  }

  /** GET /sub_wallets/:account_id with offset (0+) and limit (1 to 200) (listsubwallets). */
  async listSubWallets(walletAccountId: string, page: { offset?: number; limit?: number } = {}) {
    const offset = page.offset ?? 0;
    const limit = page.limit ?? 10;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new ZaiRequestError("offset must be 0 or more and limit 1 to 200.");
    }
    return this.get(`/sub_wallets/${seg(walletAccountId)}?offset=${offset}&limit=${limit}`);
  }

  /** Not documented in the pages read: the create sub-wallet path and fields (listsubwallets sidebar only). */
  createSubWallet(): never {
    throw new ZaiNotConfirmedError("NC-SUBWALLET-CREATE", "the create sub-wallet path and fields are not documented in the pages read", "listSubWallets");
  }

  /** Not documented in the pages read: the fund transfer path and fields between a wallet and its sub-wallets. */
  transferToSubWallet(): never {
    throw new ZaiNotConfirmedError("NC-SUBWALLET-TRANSFER", "the sub-wallet fund transfer path and fields are not documented in the pages read", "subWallets");
  }

  /** POST /wallet_accounts/:id/virtual_accounts is documented, but not its fields (virtual accounts guide). */
  createVirtualAccount(): never {
    throw new ZaiNotConfirmedError("NC-VA-FIELDS", "the virtual account request fields are not documented in the pages read", "virtualAccounts");
  }

  /** POST /virtual_accounts/:id/pay_ids is documented, but not its fields (PayID per user guide). */
  registerPayId(): never {
    throw new ZaiNotConfirmedError("NC-PAYID-FIELDS", "the PayID registration fields are not documented in the pages read", "payIds");
  }

  // ── Bank accounts and fees ──

  /** POST /bank_accounts (direct credit payout workflow, onboarding a pay-out user). */
  async createBankAccount(input: CreateBankAccountInput) {
    return this.write("POST", "/bank_accounts", input, null);
  }

  /**
   * PATCH /users/:id/disbursement_account is named (direct credit payout
   * workflow), not its body. Setting it may also let Zai pay a user's wallet
   * out automatically, which StrataVerze must never allow (no auto-payment),
   * so it stays off until Zai confirms both (NOT_CONFIRMED NC-DISBURSEMENT-ACCOUNT).
   */
  setDisbursementAccount(): never {
    throw new ZaiNotConfirmedError("NC-DISBURSEMENT-ACCOUNT", "the disbursement account body, and whether it pays out automatically, are not documented", "onboardingPayoutUser");
  }

  /** POST /fees (createfee). */
  async createFee(input: CreateFeeInput) {
    if (!Number.isSafeInteger(input.amount) || input.amount < 0) throw new ZaiRequestError("The fee amount must be a whole number.");
    return this.write("POST", "/fees", input, null);
  }

  // ── Items ──

  /** POST /items (createitem): amount in cents, payment_type 2 (Express), fee_ids comma separated. */
  async createItem(input: CreateItemInput) {
    assertSafeId("The Zai item id", input.id);
    assertCents("The item amount", input.amount);
    const { fee_ids, ...rest } = input;
    for (const f of fee_ids ?? []) if (!f || f.includes(",")) throw new ZaiRequestError("A fee id is empty or has a comma.");
    return this.write("POST", "/items", fee_ids?.length ? { ...rest, fee_ids: fee_ids.join(",") } : rest, null);
  }

  /** GET /items/:id (the secondary API call, best practices for webhooks; callbacks guide). */
  async getItem(itemId: string) {
    return this.get(`/items/${seg(itemId)}`);
  }

  /**
   * PATCH /items/:id/make_payment with account_id, the account paying (not
   * the user id) (makepayment). Moves money: sent once for its key.
   */
  async makePayment(itemId: string, input: { account_id: string }, idempotencyKey: string) {
    return this.moneyWrite("PATCH", `/items/${seg(itemId)}/make_payment`, { account_id: input.account_id }, idempotencyKey);
  }

  /**
   * PATCH /items/:id/refund, in full (refund reference). A partial refund
   * needs refund_amount, whose unit the page does not give, so it is refused
   * (NOT_CONFIRMED NC-REFUND-UNITS).
   */
  async refundItem(itemId: string, input: { refund_message: string; account_id?: string; partialAmountCents?: number }, idempotencyKey: string) {
    if (input.partialAmountCents !== undefined) {
      throw new ZaiNotConfirmedError("NC-REFUND-UNITS", "the unit of refund_amount is not documented, so only a full refund is sent", "refund");
    }
    const body: Record<string, string> = { refund_message: input.refund_message };
    if (input.account_id) body.account_id = input.account_id;
    return this.moneyWrite("PATCH", `/items/${seg(itemId)}/refund`, body, idempotencyKey);
  }

  // ── Payouts from a wallet ──

  /**
   * POST /wallet_accounts/:id/withdraw with account_id, amount (cents),
   * custom_descriptor and reference_id, unique and with no "." (withdrawfunds).
   * The idempotency key is sent as reference_id.
   */
  async withdraw(walletAccountId: string, input: WithdrawInput, idempotencyKey: string) {
    assertCents("The withdrawal amount", input.amount);
    return this.moneyWrite("POST", `/wallet_accounts/${seg(walletAccountId)}/withdraw`, { ...input, reference_id: idempotencyKey }, idempotencyKey);
  }

  /**
   * POST /sub_wallets/:id/withdraw with account_id, custom_descriptor and
   * amount (direct credit payout workflow, step 8). No reference_id is
   * documented for it, so none is sent; the guard alone keeps it to once.
   */
  async withdrawFromSubWallet(subWalletId: string, input: WithdrawInput, idempotencyKey: string) {
    assertCents("The withdrawal amount", input.amount);
    return this.moneyWrite("POST", `/sub_wallets/${seg(subWalletId)}/withdraw`, { ...input }, idempotencyKey);
  }

  /** POST /wallet_accounts/:id/bill_payment with a bpay_account id, amount (cents) and reference_id (billpayment). */
  async billPayment(walletAccountId: string, input: BillPaymentInput, idempotencyKey: string) {
    assertCents("The bill amount", input.amount);
    return this.moneyWrite("POST", `/wallet_accounts/${seg(walletAccountId)}/bill_payment`, { ...input, reference_id: idempotencyKey }, idempotencyKey);
  }

  // ── Reading money movements ──

  /** GET /batch_transactions/:id (BPAY payin workflow, step 5). */
  async getBatchTransaction(batchTransactionId: string) {
    return this.get(`/batch_transactions/${seg(batchTransactionId)}`);
  }

  /** The show transaction path is not stated in the pages read (only links under /transactions/:id/...). */
  getTransaction(): never {
    throw new ZaiNotConfirmedError("NC-SHOW-TRANSACTION", "the show transaction path is not stated in the pages read", "webhooks");
  }

  // ── Plumbing ──

  private get(path: string): Promise<ZaiJson> {
    return this.call("GET", path, undefined, true);
  }

  private write(method: "POST" | "PATCH", path: string, body: object, idempotencyKey: string | null): Promise<ZaiJson> {
    return this.call(method, path, body, false, idempotencyKey, false);
  }

  private async moneyWrite(method: "POST" | "PATCH", path: string, body: object, idempotencyKey: string): Promise<ZaiJson> {
    assertSafeId("The idempotency key", idempotencyKey);
    if (!this.once) throw new ZaiRequestError("A request that moves money needs an idempotency guard.");
    // A token first, so a key is not claimed for a request that could not be sent.
    await this.accessToken();
    if (!(await this.once.claim(idempotencyKey))) throw new ZaiDuplicateRequestError(idempotencyKey);
    return this.call(method, path, body, false, idempotencyKey, true);
  }

  private async call(method: ZaiHttpRequest["method"], path: string, body: object | undefined, safe: boolean, idempotencyKey: string | null = null, money = false): Promise<ZaiJson> {
    const build = async (): Promise<ZaiHttpRequest> => ({
      method,
      url: `${this.#config.apiBaseUrl}${path}`,
      headers: {
        // Bearer token in the Authorization header (API overview). JSON bodies (NOT_CONFIRMED NC-CONTENT-TYPE: the reference pages list body fields without the media type).
        Authorization: `Bearer ${await this.accessToken()}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let res: ZaiHttpResponse;
    try {
      res = await this.send(await build(), safe, path);
      if (res.status === 401) {
        this.token = null;
        // A read is asked again once, with a new token. A write is never sent
        // twice: a money movement's outcome is unknown (the caller checks it
        // with a GET), and any other write is refused for the caller to repeat.
        if (safe) res = await this.send(await build(), safe, path);
        else if (money) throw new ZaiOutcomeUnknownError(path, idempotencyKey);
      }
    } catch (err) {
      if (err instanceof ZaiApiError || err instanceof ZaiNotConfirmedError || err instanceof ZaiOutcomeUnknownError) throw err;
      if (safe) throw err;
      throw new ZaiOutcomeUnknownError(path, idempotencyKey, err);
    }
    if (res.status >= 200 && res.status < 300) {
      const json = parseJson(res.body);
      return json && typeof json === "object" && !Array.isArray(json) ? (json as ZaiJson) : {};
    }
    if (!safe && res.status >= 500) throw new ZaiOutcomeUnknownError(path, idempotencyKey);
    throw new ZaiApiError(res.status, path, parseJson(res.body));
  }

  /** One request, retried with backoff only when `safe` (it changes nothing at Zai). */
  private async send(request: ZaiHttpRequest, safe: boolean, path: string): Promise<ZaiHttpResponse> {
    let attempt = 0;
    for (;;) {
      try {
        const res = await this.transport(request);
        if (safe && retryable(res.status) && attempt < this.maxRetries) {
          await this.sleep(250 * 2 ** attempt++);
          continue;
        }
        return res;
      } catch (err) {
        if (safe && attempt < this.maxRetries) {
          await this.sleep(250 * 2 ** attempt++);
          continue;
        }
        if (safe) throw new ZaiApiError(0, path, null);
        throw err;
      }
    }
  }
}

/** The client, or ZaiDisabledError while switched off or not configured. */
export function createZaiClient(options: ZaiClientOptions = {}): ZaiClient {
  return new ZaiClient(options);
}
