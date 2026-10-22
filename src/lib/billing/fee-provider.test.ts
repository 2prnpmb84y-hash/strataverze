import { describe, expect, it } from "vitest";
import {
  AccruedFeeProvider,
  FeeProviderNotConfiguredError,
  ZaiItemFeeProvider,
  platformFeeProvider,
} from "./fee-provider";
import { memoryFeeEventStore } from "./fee-ledger";
import { transactionFee } from "./fee-engine";
import { TEST_PRICE_BOOK } from "./test-price-book";

const quote = transactionFee({
  movement: "LEVY_RECEIPT",
  paymentCents: 120000,
  mode: "TIERED",
  priceBook: TEST_PRICE_BOOK,
  date: "2026-07-01",
})!;
const input = {
  schemeId: "s1",
  quote,
  sourceType: "LevyPayment",
  sourceId: "pay1",
  disclosure: { shownToId: "p1", shownAt: "2026-07-01T00:00:00.000Z", amountCents: quote.totalCents },
};

describe("platform fee providers", () => {
  it("accrues the fee for the monthly invoice today", async () => {
    const store = memoryFeeEventStore();
    const result = await new AccruedFeeProvider().recordTransactionFee(store, input);
    expect(result.outcome).toBe("CREATED");
    expect(result.event.status).toBe("ACCRUED");
    expect(store.rows).toHaveLength(1);
  });

  it("refuses to run the Zai provider until it is configured", async () => {
    const store = memoryFeeEventStore();
    await expect(new ZaiItemFeeProvider().recordTransactionFee()).rejects.toThrow(FeeProviderNotConfiguredError);
    expect(store.rows).toHaveLength(0);
  });

  it("uses the accrued provider unless Zai is chosen", () => {
    expect(platformFeeProvider({}).name).toBe("ACCRUED");
    expect(platformFeeProvider({ PLATFORM_FEE_PROVIDER: "accrued" }).name).toBe("ACCRUED");
    expect(platformFeeProvider({ PLATFORM_FEE_PROVIDER: "zai" }).name).toBe("ZAI_ITEM");
  });
});
