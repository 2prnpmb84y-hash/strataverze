import { describe, expect, it } from "vitest";
import { csv, csvCell } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Smith, "J"')).toBe('"Smith, ""J"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("keeps negative numbers but defuses formulas", () => {
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@SUM")).toBe("'@SUM");
  });
  it("joins rows with CRLF", () => {
    expect(csv([["a", 1], [null, "b"]])).toBe("a,1\r\n,b\r\n");
  });
});
