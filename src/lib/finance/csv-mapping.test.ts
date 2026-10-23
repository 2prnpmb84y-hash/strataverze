import { describe, expect, it } from "vitest";
import { applySavedMapping, parseMoneyCell, parseSavedMapping, toSavedMapping } from "./csv-mapping";

const headers = ["Date", "Narrative", "Debit Amount", "Credit Amount", "Balance"];
const indexes = { date: 0, description: 1, amount: null, debit: 2, credit: 3, balance: 4, reference: null };

describe("saved CSV mapping", () => {
  it("saves by header name and applies to a file with columns moved", () => {
    const saved = toSavedMapping(headers, indexes, "split");
    const moved = ["Balance", "Date", "Credit Amount", "Debit Amount", "Narrative", "Category"];
    expect(applySavedMapping(moved, saved)).toEqual({
      amountFormat: "split",
      mapping: { date: 1, description: 4, amount: null, debit: 3, credit: 2, balance: 0, reference: null },
    });
  });

  it("asks again when a needed column is missing", () => {
    const saved = toSavedMapping(headers, indexes, "split");
    expect(applySavedMapping(["Date", "Narrative", "Amount"], saved)).toBeNull();
  });

  it("round trips through storage and rejects junk", () => {
    const saved = toSavedMapping(headers, indexes, "split");
    expect(parseSavedMapping(JSON.stringify(saved))).toEqual(saved);
    expect(parseSavedMapping("not json")).toBeNull();
    expect(parseSavedMapping(null)).toBeNull();
  });
});

describe("parseMoneyCell", () => {
  it("reads common bank formats and keeps a zero balance", () => {
    expect(parseMoneyCell("$1,234.50")).toBe(123450);
    expect(parseMoneyCell("(12.00)")).toBe(-1200);
    expect(parseMoneyCell("0.00")).toBe(0);
    expect(parseMoneyCell("15.00 DR")).toBe(-1500);
    expect(parseMoneyCell("")).toBeNull();
    expect(parseMoneyCell("n/a")).toBeNull();
  });
});
