import { describe, it, expect } from "vitest";
import { parseCSVLine, parseDate, parseOFX, parseCsvContent } from "./bank-import-parser";

// ── parseCSVLine ──────────────────────────────────────────────────

describe("parseCSVLine", () => {
  it("splits a simple comma-separated line", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace from values", () => {
    expect(parseCSVLine(" hello , world , test ")).toEqual(["hello", "world", "test"]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCSVLine('"Smith, John",100,Description')).toEqual([
      "Smith, John",
      "100",
      "Description",
    ]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    expect(parseCSVLine('"He said ""hello""",value')).toEqual([
      'He said "hello"',
      "value",
    ]);
  });

  it("handles empty fields", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles a single value with no commas", () => {
    expect(parseCSVLine("hello")).toEqual(["hello"]);
  });

  it("handles an empty string", () => {
    expect(parseCSVLine("")).toEqual([""]);
  });

  it("handles quoted empty field", () => {
    expect(parseCSVLine('"",value')).toEqual(["", "value"]);
  });

  it("handles mixed quoted and unquoted fields", () => {
    expect(parseCSVLine('2024-01-15,"Levy Payment, Q1",1250.00')).toEqual([
      "2024-01-15",
      "Levy Payment, Q1",
      "1250.00",
    ]);
  });
});

// ── parseDate ─────────────────────────────────────────────────────

describe("parseDate", () => {
  it("parses DD/MM/YYYY (Australian format)", () => {
    const result = parseDate("15/06/2024");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5); // June is 0-indexed
    expect(d.getDate()).toBe(15);
  });

  it("parses D/M/YYYY with single digit day and month", () => {
    const result = parseDate("1/3/2024");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(1);
  });

  it("parses DD-MM-YYYY with dash separator", () => {
    const result = parseDate("25-12-2024");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getMonth()).toBe(11); // December
    expect(d.getDate()).toBe(25);
  });

  it("parses DD.MM.YYYY with dot separator", () => {
    const result = parseDate("01.07.2024");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getMonth()).toBe(6); // July
  });

  it("parses YYYY-MM-DD (ISO format)", () => {
    const result = parseDate("2024-06-15");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getFullYear()).toBe(2024);
  });

  it("parses YYYYMMDD (OFX format)", () => {
    const result = parseDate("20240615");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  it("parses YYYYMMDD with trailing time (OFX extended)", () => {
    const result = parseDate("20240615120000");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  it("returns null for garbage input", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for partial date", () => {
    expect(parseDate("2024-06")).toBeNull();
  });
});

// ── parseOFX ──────────────────────────────────────────────────────

describe("parseOFX", () => {
  const sampleOFX = `
OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240615
<TRNAMT>-250.00
<NAME>Body Corp Insurance
<MEMO>Annual premium
<FITID>TXN001
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240701
<TRNAMT>1500.00
<NAME>Levy Payment Lot 1
<FITID>TXN002
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

  it("extracts all transactions from valid OFX", () => {
    const result = parseOFX(sampleOFX);
    expect(result).toHaveLength(2);
  });

  it("parses debit transaction correctly", () => {
    const result = parseOFX(sampleOFX);
    expect(result[0].amount).toBe(-250.0);
    expect(result[0].description).toBe("Body Corp Insurance");
    expect(result[0].reference).toBe("TXN001");
  });

  it("parses credit transaction correctly", () => {
    const result = parseOFX(sampleOFX);
    expect(result[1].amount).toBe(1500.0);
    expect(result[1].description).toBe("Levy Payment Lot 1");
    expect(result[1].reference).toBe("TXN002");
  });

  it("parses transaction dates as ISO strings", () => {
    const result = parseOFX(sampleOFX);
    const d = new Date(result[0].transactionDate);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(15);
  });

  it("skips transactions missing DTPOSTED", () => {
    const ofx = `<STMTTRN>
<TRNAMT>100.00
<NAME>Missing Date
</STMTTRN>`;
    expect(parseOFX(ofx)).toHaveLength(0);
  });

  it("skips transactions missing TRNAMT", () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20240615
<NAME>Missing Amount
</STMTTRN>`;
    expect(parseOFX(ofx)).toHaveLength(0);
  });

  it("skips transactions with non-numeric amount", () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20240615
<TRNAMT>abc
<NAME>Bad Amount
</STMTTRN>`;
    expect(parseOFX(ofx)).toHaveLength(0);
  });

  it("falls back to MEMO when NAME is missing", () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20240615
<TRNAMT>100.00
<MEMO>Memo description
<FITID>TXN999
</STMTTRN>`;
    const result = parseOFX(ofx);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Memo description");
  });

  it("uses MEMO as reference when FITID is missing", () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20240615
<TRNAMT>100.00
<NAME>Some Payment
<MEMO>REF-123
</STMTTRN>`;
    const result = parseOFX(ofx);
    expect(result[0].reference).toBe("REF-123");
  });

  it("returns empty array for content with no STMTTRN blocks", () => {
    expect(parseOFX("<OFX>no transactions here</OFX>")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseOFX("")).toEqual([]);
  });

  it("handles case-insensitive OFX tags", () => {
    const ofx = `<stmttrn>
<dtposted>20240615
<trnamt>50.00
<name>Lowercase Tags
<fitid>LC001
</stmttrn>`;
    const result = parseOFX(ofx);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(50.0);
  });
});

// ── parseCsvContent ───────────────────────────────────────────────

describe("parseCsvContent", () => {
  it("parses CSV with headers and data rows", () => {
    const csv = "Date,Description,Amount\n2024-06-15,Levy Payment,1250.00\n2024-06-16,Insurance,-500.00";
    const result = parseCsvContent(csv);
    expect(result.headers).toEqual(["Date", "Description", "Amount"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(["2024-06-15", "Levy Payment", "1250.00"]);
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const csv = "Date,Amount\r\n2024-06-15,100\r\n2024-06-16,200";
    const result = parseCsvContent(csv);
    expect(result.headers).toEqual(["Date", "Amount"]);
    expect(result.rows).toHaveLength(2);
  });

  it("skips empty lines", () => {
    const csv = "Date,Amount\n\n2024-06-15,100\n\n2024-06-16,200\n";
    const result = parseCsvContent(csv);
    expect(result.rows).toHaveLength(2);
  });

  it("returns empty headers and rows for single-line input", () => {
    const result = parseCsvContent("Date,Amount");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("returns empty headers and rows for empty input", () => {
    const result = parseCsvContent("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});
