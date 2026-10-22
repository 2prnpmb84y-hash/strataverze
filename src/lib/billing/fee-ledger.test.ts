import { describe, expect, it } from "vitest";
import { memoryFeeEventStore, recordFeeEvent, reverseFeeEvent } from "./fee-ledger";
import { transactionFee, usageFee } from "./fee-engine";
import { TEST_PRICE_BOOK as book } from "./test-price-book";

const date = "2026-11-01";
const levyFee = transactionFee({ movement: "LEVY_RECEIPT", paymentCents: 82_509, mode: "TIERED", priceBook: book, date })!;

describe("recordFeeEvent", () => {
  it("records one fee event per source", async () => {
    const store = memoryFeeEventStore();
    const a = await recordFeeEvent(store, { schemeId: "s1", quote: levyFee, sourceType: "LevyPayment", sourceId: "p1" });
    const b = await recordFeeEvent(store, { schemeId: "s1", quote: levyFee, sourceType: "LevyPayment", sourceId: "p2" });
    expect(a.outcome).toBe("CREATED");
    expect(b.outcome).toBe("CREATED");
    expect(store.rows).toHaveLength(2);
    expect(store.rows[0]).toMatchObject({ status: "ACCRUED", amountExGstCents: 250, gstCents: 25 });
  });

  it("does not duplicate when the action is replayed", async () => {
    const store = memoryFeeEventStore();
    await recordFeeEvent(store, { schemeId: "s1", quote: levyFee, sourceType: "LevyPayment", sourceId: "p1" });
    const replay = await recordFeeEvent(store, { schemeId: "s1", quote: levyFee, sourceType: "LevyPayment", sourceId: "p1" });
    expect(replay.outcome).toBe("DUPLICATE");
    expect(store.rows).toHaveLength(1);
  });

  it("records who saw the disclosure and what they saw", async () => {
    const store = memoryFeeEventStore();
    const quote = usageFee({ code: "BALLOT", priceBook: book, date })!;
    const { event } = await recordFeeEvent(store, {
      schemeId: "s1", quote, sourceType: "Ballot", sourceId: "b1",
      disclosure: { shownToId: "u1", shownAt: "2026-11-01T01:00:00Z", amountCents: quote.totalCents },
    });
    expect(event).toMatchObject({ disclosureShownToId: "u1", disclosedAmountCents: 2750 });
  });

  it("refuses to charge an amount other than the one disclosed", async () => {
    const store = memoryFeeEventStore();
    const quote = usageFee({ code: "BALLOT", priceBook: book, date })!;
    await expect(
      recordFeeEvent(store, {
        schemeId: "s1", quote, sourceType: "Ballot", sourceId: "b1",
        disclosure: { shownToId: "u1", shownAt: "2026-11-01T01:00:00Z", amountCents: 2500 },
      }),
    ).rejects.toThrow();
    expect(store.rows).toHaveLength(0);
  });
});

describe("reverseFeeEvent", () => {
  it("adds a REVERSED event and keeps the original", async () => {
    const store = memoryFeeEventStore();
    const quote = usageFee({ code: "CLAIM_HANDLING", priceBook: [...book.filter((e) => e.code !== "CLAIM_HANDLING"), { ...book.find((e) => e.code === "CLAIM_HANDLING")!, isActive: true }], date })!;
    await recordFeeEvent(store, { schemeId: "s1", quote, sourceType: "InsuranceClaim", sourceId: "c1" });
    const r = await reverseFeeEvent(store, { code: "CLAIM_HANDLING", sourceType: "InsuranceClaim", sourceId: "c1" });
    expect(r.outcome).toBe("REVERSED");
    expect(store.rows).toHaveLength(2);
    const [original, reversal] = store.rows;
    expect(original.status).toBe("ACCRUED");
    expect(reversal).toMatchObject({ status: "REVERSED", reversalOfId: original.id, amountExGstCents: -10000, gstCents: -1000 });
    expect(original.amountExGstCents + reversal.amountExGstCents).toBe(0);
  });

  it("reverses only once", async () => {
    const store = memoryFeeEventStore();
    await recordFeeEvent(store, { schemeId: "s1", quote: levyFee, sourceType: "LevyPayment", sourceId: "p1" });
    await reverseFeeEvent(store, { code: "TXN_FEE", sourceType: "LevyPayment", sourceId: "p1" });
    const again = await reverseFeeEvent(store, { code: "TXN_FEE", sourceType: "LevyPayment", sourceId: "p1" });
    expect(again.outcome).toBe("ALREADY_REVERSED");
    expect(store.rows).toHaveLength(2);
  });

  it("does nothing when there was no fee", async () => {
    const store = memoryFeeEventStore();
    expect((await reverseFeeEvent(store, { code: "BALLOT", sourceType: "Ballot", sourceId: "x" })).outcome).toBe("NOTHING_TO_REVERSE");
  });
});
