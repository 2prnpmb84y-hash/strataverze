import { describe, it, expect } from "vitest";
import { premiumTotal, premiumByKind, toAmount, round2, formatMoney } from "./premium";

describe("premiumTotal", () => {
  it("sums line items from numbers and numeric strings", () => {
    expect(
      premiumTotal([
        { amount: 1000 },
        { amount: "100.00" },
        { kind: "DUTY", amount: 55.5 },
      ]),
    ).toBe(1155.5);
  });

  it("is zero for no items", () => {
    expect(premiumTotal([])).toBe(0);
  });

  it("ignores non-numeric amounts rather than producing NaN", () => {
    expect(premiumTotal([{ amount: "abc" }, { amount: 10 }])).toBe(10);
  });
});

describe("premiumByKind", () => {
  it("groups totals by charge kind with labels", () => {
    const byKind = premiumByKind([
      { kind: "BASE", amount: 1000 },
      { kind: "TAX", amount: 100 },
      { kind: "BASE", amount: 200 },
    ]);
    const base = byKind.find((b) => b.kind === "BASE");
    const tax = byKind.find((b) => b.kind === "TAX");
    expect(base?.amount).toBe(1200);
    expect(base?.label).toBe("Base premium");
    expect(tax?.amount).toBe(100);
  });

  it("defaults a missing kind to OTHER", () => {
    const byKind = premiumByKind([{ amount: 50 }]);
    expect(byKind[0].kind).toBe("OTHER");
  });
});

describe("toAmount / round2", () => {
  it("parses and guards", () => {
    expect(toAmount(null)).toBe(0);
    expect(toAmount("12.3")).toBe(12.3);
    expect(toAmount("x")).toBe(0);
  });
  it("rounds to 2dp", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("formatMoney", () => {
  it("formats AUD with a narrow symbol", () => {
    expect(formatMoney(1234.5)).toContain("1,234.50");
  });
  it("returns empty string for null/empty", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney("")).toBe("");
  });
  it("falls back gracefully for an unknown currency code", () => {
    const out = formatMoney(10, "ZZZ");
    expect(out).toContain("10");
  });
});
