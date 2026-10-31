/**
 * The monthly StrataVerze invoice run leaves a switched off scheme alone
 * (schemes.is_active = false, 31 Oct 2026): it is not invoiced, nothing is
 * written for it, and the run's results report it as skipped; the other
 * schemes are invoiced as before. Run against the in-memory database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_PRICE_BOOK } from "./test-price-book";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("./capture", () => ({ loadPriceBook: async () => TEST_PRICE_BOOK }));

const { sharedFake } = await import("@/test/fake-orm");
const { runMonthlyInvoices } = await import("./invoice-run");

beforeEach(() => {
  sharedFake.reset({
    Scheme: [{ id: "on" }, { id: "off", isActive: false }],
    // Both subscribed since September, 5 lots each, at the small scheme price ($49 plus GST).
    SchemeSubscription: ["on", "off"].map((schemeId) => ({ id: `sub-${schemeId}`, schemeId, tier: "SMALL", monthlyPrice: null, status: "ACTIVE", promotionEnd: null, createdAt: "2026-09-01T00:00:00.000Z" })),
    Lot: ["on", "off"].flatMap((schemeId) => Array.from({ length: 5 }, (_, i) => ({ id: `${schemeId}-l${i}`, schemeId }))),
    PlatformFeeEvent: [],
    PlatformInvoice: [],
    Fund: [],
    AccountCode: [],
  });
});

const invoicesOf = (schemeId: string) => sharedFake.table("PlatformInvoice").filter((i) => i.schemeId === schemeId);

describe("the monthly invoice run", () => {
  it("does not invoice a switched off scheme, reporting it as skipped, and invoices the others as before", async () => {
    const results = await runMonthlyInvoices("2026-11", new Date("2026-11-01T00:00:00.000Z"));
    expect(results).toEqual([
      expect.objectContaining({ schemeId: "on", outcome: "ISSUED", totalCents: 5390 }),
      { schemeId: "off", outcome: "SKIPPED", reason: "Scheme switched off" },
    ]);
    expect(invoicesOf("on")).toHaveLength(1);
    expect(invoicesOf("off")).toEqual([]);
    expect(sharedFake.table("PlatformFeeEvent").filter((e) => e.schemeId === "off")).toEqual([]);
  });

  it("invoices both while both are active", async () => {
    sharedFake.table("Scheme").find((s) => s.id === "off")!.isActive = true;
    const results = await runMonthlyInvoices("2026-11", new Date("2026-11-01T00:00:00.000Z"));
    expect(results.map((r) => [r.schemeId, r.outcome])).toEqual([["on", "ISSUED"], ["off", "ISSUED"]]);
  });
});
