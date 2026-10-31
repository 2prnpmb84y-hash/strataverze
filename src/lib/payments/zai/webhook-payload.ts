/**
 * Reading a Zai webhook body (pure), from the Webhooks guide
 * (https://developer.hellozai.com/docs/webhooks, read 31 Oct 2026) and the
 * best practices for webhooks page (read 31 Oct 2026):
 *
 * - Each webhook carries the "Show" response of its object. Items, users,
 *   batch transactions, transactions and disbursements are wrapped under a
 *   top-level key named for the object type, e.g. {"transactions": {...}}.
 *   Virtual account, PayID and PayTo payloads are not wrapped; they are kept
 *   but not read at this stage (NOT_CONFIRMED NC-VA-PAYID-EVENTS).
 * - Zai does not guarantee the order of delivery and retries for up to 24
 *   hours, so a payload is applied only if its updated_at is newer than the
 *   one already applied for that object; an older one is discarded.
 * - There is no delivery or event id in the payload (the id is the
 *   object's), so a repeated delivery is recognised by the SHA-256 of its raw
 *   body. Every send has a new signature, but the body is the same.
 * - Creating a webhook sends the test payload { message: 'Zai callback test'}.
 */
import { createHash } from "node:crypto";

/** Object types Zai sends wrapped under their own key (webhooks guide, callbacks guide). */
export const ZAI_WRAPPED_OBJECT_TYPES = ["items", "users", "batch_transactions", "accounts", "transactions", "disbursements", "companies"] as const;
export type ZaiWrappedObjectType = (typeof ZAI_WRAPPED_OBJECT_TYPES)[number];

/**
 * Object types Zai documents that this stage stores and ignores (review L5).
 * transaction_failure_advice: "debited funds that could not be matched to a
 * payer's wallet" (webhooks guide); its payload is not shown
 * (NOT_CONFIRMED NC-FAILURE-ADVICE), and it concerns debits, which
 * StrataVerze never makes.
 */
export const ZAI_KNOWN_IGNORED_TYPES = ["transaction_failure_advice"] as const;

export type ParsedZaiWebhook =
  | { kind: "OBJECT"; objectType: ZaiWrappedObjectType; objectId: string; updatedAt: Date | null; object: Record<string, unknown> }
  | { kind: "KNOWN_IGNORED"; objectType: (typeof ZAI_KNOWN_IGNORED_TYPES)[number]; reason: string }
  | { kind: "TEST" }
  | { kind: "UNRECOGNISED"; reason: string };

/** The dedupe key: the SHA-256 of the raw body, lower-case hex. */
export function webhookDedupeKey(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** An ISO timestamp as Zai sends it (e.g. "2019-12-16T07:19:14.968Z"), or null. */
export function zaiTimestamp(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseZaiWebhook(rawBody: string): ParsedZaiWebhook {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { kind: "UNRECOGNISED", reason: "not JSON" };
  }
  if (!isObject(json)) return { kind: "UNRECOGNISED", reason: "not an object" };
  const keys = Object.keys(json);
  if (keys.length === 1 && keys[0] === "message") return { kind: "TEST" };
  if (keys.length !== 1) return { kind: "UNRECOGNISED", reason: "not one wrapped object" };
  if ((ZAI_KNOWN_IGNORED_TYPES as readonly string[]).includes(keys[0])) {
    return { kind: "KNOWN_IGNORED", objectType: keys[0] as (typeof ZAI_KNOWN_IGNORED_TYPES)[number], reason: `${keys[0]} is not processed at this stage (NC-FAILURE-ADVICE)` };
  }
  const objectType = keys[0] as ZaiWrappedObjectType;
  if (!(ZAI_WRAPPED_OBJECT_TYPES as readonly string[]).includes(objectType)) return { kind: "UNRECOGNISED", reason: `object type ${keys[0].slice(0, 40)}` };
  const object = json[objectType];
  if (!isObject(object)) return { kind: "UNRECOGNISED", reason: "the object is not an object" };
  // A batch transaction's id is a number in the docs' example (31622), with a uuid beside it.
  const rawId = object.id;
  const objectId = typeof rawId === "string" ? rawId : typeof rawId === "number" && Number.isSafeInteger(rawId) ? String(rawId) : null;
  if (!objectId || objectId.length > 100) return { kind: "UNRECOGNISED", reason: "no object id" };
  return { kind: "OBJECT", objectType, objectId, updatedAt: zaiTimestamp(object.updated_at), object };
}

/**
 * Whether a payload is newer than what is already applied for its object.
 * A payload without a readable updated_at is never applied over anything,
 * since it cannot be ordered.
 */
export function isNewerThanApplied(incoming: Date | null, applied: Date | string | null | undefined): boolean {
  if (!incoming) return false;
  if (applied == null) return true;
  const a = applied instanceof Date ? applied : new Date(applied);
  if (Number.isNaN(a.getTime())) return false;
  return incoming.getTime() > a.getTime();
}

// ─── Transactions ──────────────────────────────────────────────────────────

/**
 * A transactions payload, as the webhooks guide's examples give it (NPP payin
 * and BPAY payin, read 31 Oct 2026): id, created_at, updated_at, type,
 * type_method, state, account_id, account_type, amount (cents), currency,
 * debit_credit, and for an NPP payin payin_details with pay_id and
 * remittance_information. The virtual accounts guide says payin details have
 * moved to the Supplementary Data API, so payin_details may be absent
 * (NOT_CONFIRMED NC-PAYIN-DETAILS).
 */
export interface ZaiTransactionPayload {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  type: string;
  typeMethod: string;
  state: string;
  accountId: string;
  accountType: string;
  amountCents: number;
  currency: string;
  debitCredit: string;
  payId: string | null;
  remittanceInformation: string | null;
}

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/** The documented fields of a transactions object, or null if any needed one is missing or of the wrong type. */
export function readZaiTransaction(object: Record<string, unknown>): ZaiTransactionPayload | null {
  const id = str(object.id, 100);
  const createdAt = zaiTimestamp(object.created_at);
  const updatedAt = zaiTimestamp(object.updated_at);
  const type = str(object.type, 40);
  const typeMethod = str(object.type_method, 40);
  const state = str(object.state, 40);
  const accountId = str(object.account_id, 100);
  const accountType = str(object.account_type, 40);
  const currency = str(object.currency, 3);
  const debitCredit = str(object.debit_credit, 10);
  const amount = object.amount;
  if (!id || !createdAt || !updatedAt || !type || !typeMethod || !state || !accountId || !accountType || !currency || !debitCredit) return null;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) return null;
  const details = isObject(object.payin_details) ? object.payin_details : null;
  return {
    id,
    createdAt,
    updatedAt,
    type,
    typeMethod,
    state,
    accountId,
    accountType,
    amountCents: amount,
    currency,
    debitCredit,
    payId: details ? str(details.pay_id) : null,
    remittanceInformation: details ? str(details.remittance_information) : null,
  };
}

/** The payin methods the examples show: NPP (npp_payin), BPAY (bpay), direct credit (direct_credit). */
export const ZAI_PAYIN_METHODS = ["npp_payin", "bpay", "direct_credit"] as const;

/** A payment received into a wallet: a deposit, credited to a wallet account (webhooks guide examples). */
export function isWalletPayin(t: ZaiTransactionPayload): boolean {
  return t.type === "deposit" && t.debitCredit === "credit" && t.accountType === "wallet_account" && (ZAI_PAYIN_METHODS as readonly string[]).includes(t.typeMethod);
}

/** Settled: the state the examples give a completed payin (successful; statuses page). */
export const isSuccessful = (t: Pick<ZaiTransactionPayload, "state">) => t.state === "successful";

// ─── What is stored ─────────────────────────────────────────────────────────

/** The transactions fields processing reads (readZaiTransaction, isWalletPayin), and nothing else. */
const STORED_TRANSACTION_FIELDS = ["id", "created_at", "updated_at", "type", "type_method", "state", "account_id", "account_type", "amount", "currency", "debit_credit"] as const;
/** For every other object: enough to say what it was. */
const STORED_OTHER_FIELDS = ["id", "updated_at", "state"] as const;

const pick = (o: Record<string, unknown>, fields: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in o) out[f] = o[f];
  return out;
};

/**
 * The copy of a webhook body that is stored (decision D7). An allowlist
 * (second review, LOW-3): for a transactions object only the fields
 * processing reads, with payin_details cut down to the PayID the payment was
 * sent to (StrataVerze's own, registered for the lot); for any other object
 * type, known, ignored or not, only its type, id, updated_at and state. So no
 * payer name or bank details, and none of a user's name, email, mobile, KYC
 * fields, account names or PayTo details, are kept. The test payload keeps
 * its message; a body that is not one wrapped object keeps only its length.
 * The dedupe key is still the SHA-256 of the body as received.
 */
export function bodyToStore(rawBody: string): string {
  const unrecognised = () => JSON.stringify({ unrecognised_body_bytes: Buffer.byteLength(rawBody, "utf8") });
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return unrecognised();
  }
  if (!isObject(json)) return unrecognised();
  const keys = Object.keys(json);
  if (keys.length !== 1) return unrecognised();
  const [type] = keys;
  const inner = json[type];
  if (type === "message" && typeof inner === "string") return JSON.stringify({ message: inner.slice(0, 100) });
  if (!isObject(inner) || type.length > 40) return unrecognised();
  if (type === "transactions") {
    const details = isObject(inner.payin_details) && typeof inner.payin_details.pay_id === "string" ? { payin_details: { pay_id: inner.payin_details.pay_id } } : {};
    return JSON.stringify({ transactions: { ...pick(inner, STORED_TRANSACTION_FIELDS), ...details } });
  }
  return JSON.stringify({ [type]: pick(inner, STORED_OTHER_FIELDS) });
}
