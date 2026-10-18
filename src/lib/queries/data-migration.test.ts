import { describe, it, expect } from "vitest";
import {
  parseCSVLine,
  parseCSVContent,
  parseDate,
  detectSourceSystem,
  applyFieldMapping,
  buildDefaultMappings,
  getTemplateKey,
  getTemplate,
  MIGRATION_TEMPLATES,
} from "./data-migration";
import type { FieldMapping, MigrationTemplate } from "./data-migration";

// ─── parseCSVLine ───────────────────────────────────────────

describe("parseCSVLine", () => {
  it("parses simple comma-separated values", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace from fields", () => {
    expect(parseCSVLine("  a , b , c  ")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCSVLine('"hello, world",b,c')).toEqual([
      "hello, world",
      "b",
      "c",
    ]);
  });

  it("handles escaped quotes (double-quote) inside quoted fields", () => {
    expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', "b"]);
  });

  it("returns single empty field for empty string", () => {
    expect(parseCSVLine("")).toEqual([""]);
  });

  it("handles trailing comma", () => {
    expect(parseCSVLine("a,b,")).toEqual(["a", "b", ""]);
  });

  it("handles leading comma", () => {
    expect(parseCSVLine(",a,b")).toEqual(["", "a", "b"]);
  });

  it("handles multiple consecutive commas", () => {
    expect(parseCSVLine("a,,b,,c")).toEqual(["a", "", "b", "", "c"]);
  });

  it("handles single value with no commas", () => {
    expect(parseCSVLine("hello")).toEqual(["hello"]);
  });

  it("handles quoted field with newline characters", () => {
    expect(parseCSVLine('"line1\nline2",b')).toEqual(["line1\nline2", "b"]);
  });
});

// ─── parseCSVContent ────────────────────────────────────────

describe("parseCSVContent", () => {
  it("parses headers and data rows", () => {
    const csv = "Name,Age,City\nAlice,30,Sydney\nBob,25,Melbourne";
    const result = parseCSVContent(csv);
    expect(result.headers).toEqual(["Name", "Age", "City"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(["Alice", "30", "Sydney"]);
    expect(result.rows[1]).toEqual(["Bob", "25", "Melbourne"]);
  });

  it("returns empty headers and rows for empty content", () => {
    const result = parseCSVContent("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("returns headers only when there is just one line", () => {
    const result = parseCSVContent("Name,Age,City");
    expect(result.headers).toEqual(["Name", "Age", "City"]);
    expect(result.rows).toEqual([]);
  });

  it("skips blank lines", () => {
    const csv = "Name,Age\n\nAlice,30\n\nBob,25\n";
    const result = parseCSVContent(csv);
    expect(result.headers).toEqual(["Name", "Age"]);
    expect(result.rows).toHaveLength(2);
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const csv = "Name,Age\r\nAlice,30\r\nBob,25";
    const result = parseCSVContent(csv);
    expect(result.headers).toEqual(["Name", "Age"]);
    expect(result.rows).toHaveLength(2);
  });
});

// ─── parseDate ──────────────────────────────────────────────

describe("parseDate", () => {
  it("parses Australian format DD/MM/YYYY", () => {
    expect(parseDate("15/03/2024")).toBe("2024-03-15");
  });

  it("parses Australian format with single-digit day/month", () => {
    expect(parseDate("5/3/2024")).toBe("2024-03-05");
  });

  it("parses ISO format YYYY-MM-DD", () => {
    expect(parseDate("2024-03-15")).toBe("2024-03-15");
  });

  it("parses compact format YYYYMMDD", () => {
    expect(parseDate("20240315")).toBe("2024-03-15");
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseDate("   ")).toBeNull();
  });

  it("returns null for unrecognised format", () => {
    expect(parseDate("March 15, 2024")).toBeNull();
  });

  it("returns null for invalid date values in AU format", () => {
    // Month 13 does not exist
    expect(parseDate("15/13/2024")).toBeNull();
  });

  it("trims whitespace before parsing", () => {
    expect(parseDate("  2024-03-15  ")).toBe("2024-03-15");
  });

  it("returns null for partial date strings", () => {
    expect(parseDate("2024-03")).toBeNull();
  });
});

// ─── detectSourceSystem ─────────────────────────────────────

describe("detectSourceSystem", () => {
  it("detects strata_master from lot headers", () => {
    const headers = ["LotNumber", "UnitNumber", "Entitlement", "FloorArea"];
    expect(detectSourceSystem(headers)).toBe("strata_master");
  });

  it("detects strata_master from account headers", () => {
    const headers = ["Code", "Name", "AccountType", "SubType"];
    expect(detectSourceSystem(headers)).toBe("strata_master");
  });

  it("detects stratamax from lot headers", () => {
    const headers = ["LotNo", "UnitNo", "Entitlement"];
    expect(detectSourceSystem(headers)).toBe("stratamax");
  });

  it("detects stratamax from account headers", () => {
    const headers = ["AccCode", "AccName", "AccType"];
    expect(detectSourceSystem(headers)).toBe("stratamax");
  });

  it("detects myob from account headers", () => {
    const headers = ["Account Number", "Account Name", "Account Type"];
    expect(detectSourceSystem(headers)).toBe("myob");
  });

  it("detects xero from account headers", () => {
    const headers = ["*Code", "*Name", "*Type", "Description"];
    expect(detectSourceSystem(headers)).toBe("xero");
  });

  it("returns null for unrecognised headers", () => {
    const headers = ["ID", "Value", "Description"];
    expect(detectSourceSystem(headers)).toBeNull();
  });

  it("is case-insensitive", () => {
    const headers = ["LOTNUMBER", "UNITNUMBER", "ENTITLEMENT"];
    expect(detectSourceSystem(headers)).toBe("strata_master");
  });

  it("trims header whitespace", () => {
    const headers = ["  LotNumber  ", " UnitNumber ", " Entitlement "];
    expect(detectSourceSystem(headers)).toBe("strata_master");
  });

  it("returns null when only one header matches (needs at least 2)", () => {
    const headers = ["LotNumber", "Foo", "Bar"];
    expect(detectSourceSystem(headers)).toBeNull();
  });
});

// ─── applyFieldMapping ──────────────────────────────────────

describe("applyFieldMapping", () => {
  const template: MigrationTemplate = {
    sourceSystem: "strata_master",
    dataType: "lots",
    requiredFields: ["lotNumber", "entitlement"],
    optionalFields: ["unitNumber"],
    defaultMappings: { lotNumber: 0, unitNumber: 1, entitlement: 2 },
  };

  const headers = ["LotNumber", "UnitNumber", "Entitlement"];

  it("maps fields from rows using column indices", () => {
    const mappings: FieldMapping[] = [
      { sourceColumn: 0, targetField: "lotNumber" },
      { sourceColumn: 1, targetField: "unitNumber" },
      { sourceColumn: 2, targetField: "entitlement" },
    ];
    const rows = [["1", "A", "100"]];

    const result = applyFieldMapping(headers, rows, mappings, template);
    expect(result).toHaveLength(1);
    expect(result[0].data).toEqual({
      lotNumber: "1",
      unitNumber: "A",
      entitlement: "100",
    });
    expect(result[0].errors).toEqual([]);
    expect(result[0].rowNumber).toBe(2); // row 1 is headers, data starts at 2
  });

  it("reports error when a required field is missing", () => {
    const mappings: FieldMapping[] = [
      { sourceColumn: 0, targetField: "lotNumber" },
      // entitlement not mapped
    ];
    const rows = [["1"]];

    const result = applyFieldMapping(headers, rows, mappings, template);
    expect(result[0].errors.length).toBeGreaterThan(0);
    expect(result[0].errors[0]).toContain("entitlement");
  });

  it("reports error when sourceColumn is out of range", () => {
    const mappings: FieldMapping[] = [
      { sourceColumn: 0, targetField: "lotNumber" },
      { sourceColumn: 99, targetField: "entitlement" },
    ];
    const rows = [["1"]];

    const result = applyFieldMapping(headers, rows, mappings, template);
    expect(result[0].errors.some((e) => e.includes("out of range"))).toBe(true);
  });

  it("applies transform to mapped values", () => {
    const mappings: FieldMapping[] = [
      { sourceColumn: 0, targetField: "lotNumber", transform: "uppercase" },
      { sourceColumn: 1, targetField: "unitNumber", transform: "trim" },
      { sourceColumn: 2, targetField: "entitlement", transform: "currency" },
    ];
    const rows = [["lot-a", "  B  ", "$1,500.00"]];

    const result = applyFieldMapping(headers, rows, mappings, template);
    expect(result[0].data.lotNumber).toBe("LOT-A");
    expect(result[0].data.unitNumber).toBe("B");
    expect(result[0].data.entitlement).toBe("1500.00");
  });

  it("applies date_au transform", () => {
    const mappings: FieldMapping[] = [
      { sourceColumn: 0, targetField: "lotNumber" },
      { sourceColumn: 1, targetField: "unitNumber", transform: "date_au" },
      { sourceColumn: 2, targetField: "entitlement" },
    ];
    const rows = [["1", "15/03/2024", "100"]];

    const result = applyFieldMapping(headers, rows, mappings, template);
    expect(result[0].data.unitNumber).toBe("2024-03-15");
  });

  it("handles multiple rows correctly", () => {
    const mappings: FieldMapping[] = [
      { sourceColumn: 0, targetField: "lotNumber" },
      { sourceColumn: 2, targetField: "entitlement" },
    ];
    const rows = [
      ["1", "A", "100"],
      ["2", "B", "200"],
      ["3", "C", "300"],
    ];

    const result = applyFieldMapping(headers, rows, mappings, template);
    expect(result).toHaveLength(3);
    expect(result[0].rowNumber).toBe(2);
    expect(result[1].rowNumber).toBe(3);
    expect(result[2].rowNumber).toBe(4);
  });
});

// ─── buildDefaultMappings ───────────────────────────────────

describe("buildDefaultMappings", () => {
  it("builds FieldMapping array from template defaultMappings", () => {
    const template: MigrationTemplate = {
      sourceSystem: "strata_master",
      dataType: "lots",
      requiredFields: ["lotNumber", "entitlement"],
      optionalFields: ["unitNumber"],
      defaultMappings: { lotNumber: 0, unitNumber: 1, entitlement: 2 },
    };

    const result = buildDefaultMappings(template);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({
      sourceColumn: 0,
      targetField: "lotNumber",
    });
    expect(result).toContainEqual({
      sourceColumn: 1,
      targetField: "unitNumber",
    });
    expect(result).toContainEqual({
      sourceColumn: 2,
      targetField: "entitlement",
    });
  });
});

// ─── getTemplateKey ─────────────────────────────────────────

describe("getTemplateKey", () => {
  it("combines source system and data type with underscore", () => {
    expect(getTemplateKey("strata_master", "lots")).toBe("strata_master_lots");
  });

  it("works for all source systems", () => {
    expect(getTemplateKey("stratamax", "chart_of_accounts")).toBe(
      "stratamax_chart_of_accounts",
    );
    expect(getTemplateKey("myob", "opening_balances")).toBe(
      "myob_opening_balances",
    );
    expect(getTemplateKey("xero", "lots")).toBe("xero_lots");
  });
});

// ─── getTemplate ────────────────────────────────────────────

describe("getTemplate", () => {
  it("returns the template for a known combination", () => {
    const result = getTemplate("strata_master", "lots");
    expect(result).toBeDefined();
    expect(result?.sourceSystem).toBe("strata_master");
    expect(result?.dataType).toBe("lots");
    expect(result?.requiredFields).toContain("lotNumber");
  });

  it("returns undefined for an unknown combination", () => {
    // "owners" is not a valid data type in any template
    const result = getTemplate("strata_master", "owners");
    expect(result).toBeUndefined();
  });
});

// ─── MIGRATION_TEMPLATES ───────────────────────────────────

describe("MIGRATION_TEMPLATES", () => {
  it("contains strata_master templates", () => {
    expect(MIGRATION_TEMPLATES["strata_master_lots"]).toBeDefined();
    expect(
      MIGRATION_TEMPLATES["strata_master_chart_of_accounts"],
    ).toBeDefined();
    expect(
      MIGRATION_TEMPLATES["strata_master_opening_balances"],
    ).toBeDefined();
  });

  it("contains stratamax templates", () => {
    expect(MIGRATION_TEMPLATES["stratamax_lots"]).toBeDefined();
    expect(
      MIGRATION_TEMPLATES["stratamax_chart_of_accounts"],
    ).toBeDefined();
  });

  it("all templates have requiredFields and defaultMappings", () => {
    for (const [key, template] of Object.entries(MIGRATION_TEMPLATES)) {
      expect(template.requiredFields.length).toBeGreaterThan(0);
      expect(Object.keys(template.defaultMappings).length).toBeGreaterThan(0);
    }
  });
});
