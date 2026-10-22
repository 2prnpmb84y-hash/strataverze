/**
 * How a StrataVerze transaction fee is settled (Stage 6).
 *
 * Callers (levy receipts, supplier payments) always go through
 * captureTransactionFee, which asks the active PlatformFeeProvider to record
 * the fee. Today that is AccruedFeeProvider: the fee is accrued against the
 * scheme and billed on the monthly StrataVerze invoice. A later
 * ZaiItemFeeProvider will extract the fee atomically inside the Zai Item that
 * moves the money, so the fee never reaches an invoice. Callers do not change.
 *
 * No Zai API is called in this epic.
 */
import type { FeeQuote } from "./fee-engine";
import { recordFeeEvent, type Disclosure, type FeeEventStore, type RecordResult } from "./fee-ledger";

export interface ProviderFeeInput {
  schemeId: string;
  quote: FeeQuote;
  sourceType: string;
  sourceId: string;
  payerProfileId?: string | null;
  actorId?: string | null;
  disclosure: Disclosure | null;
}

export interface PlatformFeeProvider {
  readonly name: "ACCRUED" | "ZAI_ITEM";
  /** Record (and, for a payment provider, collect) the fee for one money movement. */
  recordTransactionFee(store: FeeEventStore, input: ProviderFeeInput): Promise<RecordResult>;
}

/** Current behaviour: accrue the fee for the monthly StrataVerze invoice. */
export class AccruedFeeProvider implements PlatformFeeProvider {
  readonly name = "ACCRUED" as const;
  recordTransactionFee(store: FeeEventStore, input: ProviderFeeInput): Promise<RecordResult> {
    return recordFeeEvent(store, input);
  }
}

export class FeeProviderNotConfiguredError extends Error {}

/**
 * Placeholder for Hello Zai. When built it will add the fee to the Zai Item
 * for the movement, record the event as EXTRACTED with the provider item id,
 * and leave it off the monthly invoice.
 */
export class ZaiItemFeeProvider implements PlatformFeeProvider {
  readonly name = "ZAI_ITEM" as const;
  async recordTransactionFee(): Promise<RecordResult> {
    throw new FeeProviderNotConfiguredError("The Zai fee provider is not configured.");
  }
}

/** The provider chosen by PLATFORM_FEE_PROVIDER (zai, otherwise accrued). */
export function platformFeeProvider(env: Record<string, string | undefined> = process.env): PlatformFeeProvider {
  return env.PLATFORM_FEE_PROVIDER === "zai" ? new ZaiItemFeeProvider() : new AccruedFeeProvider();
}
