/**
 * Tests for the strata roll PDF text parser.
 *
 * These tests exercise the exported `parseStrataRollText` function
 * which extracts scheme-level and per-lot data from raw PDF text.
 * The async `parseStrataRollPDF` is not tested here as it depends
 * on the unpdf library for PDF binary extraction.
 */

import { describe, it, expect } from "vitest";
import { parseStrataRollText } from "./parse-strata-roll";

describe("parseStrataRollText", () => {
  describe("plan number extraction", () => {
    it("extracts SP plan number from standalone format", () => {
      const result = parseStrataRollText("Some header\nSP 12345\nMore text");
      expect(result.scheme.planNumber).toBe("SP 12345");
    });

    it("extracts plan number from S/Plan format", () => {
      const result = parseStrataRollText("S/Plan: 3697\nAddress: 1 Test St");
      expect(result.scheme.planNumber).toBe("SP 3697");
    });

    it("extracts plan number from Strata Plan Number format", () => {
      const result = parseStrataRollText(
        "Strata Plan Number 45678\nSomething else",
      );
      expect(result.scheme.planNumber).toBe("SP 45678");
    });

    it("extracts plan number from Plan Number: SP format", () => {
      const result = parseStrataRollText("Plan Number: SP 9876");
      expect(result.scheme.planNumber).toBe("SP 9876");
    });

    it("extracts PS prefix plan numbers", () => {
      const result = parseStrataRollText("PS 123456");
      expect(result.scheme.planNumber).toBe("PS 123456");
    });

    it("returns null when no plan number found", () => {
      const result = parseStrataRollText("No plan info here");
      expect(result.scheme.planNumber).toBeNull();
    });
  });

  describe("address extraction", () => {
    it("extracts address from Building Address label", () => {
      const result = parseStrataRollText(
        "Building Address: 27 Reynolds Street\nSuburb: Cremorne",
      );
      expect(result.scheme.address).toBe("27 Reynolds Street");
    });

    it("extracts address from Property Address label", () => {
      const result = parseStrataRollText(
        "Property Address: 10 Main Road\nState: NSW",
      );
      expect(result.scheme.address).toBe("10 Main Road");
    });
  });

  describe("state extraction", () => {
    it("extracts state abbreviation from label", () => {
      const result = parseStrataRollText("State: NSW\nPostcode: 2090");
      expect(result.scheme.state).toBe("NSW");
    });

    it("converts full state name to abbreviation", () => {
      const result = parseStrataRollText(
        "State: New South Wales\nPostcode: 2090",
      );
      expect(result.scheme.state).toBe("NSW");
    });

    it("extracts state from state-postcode fallback pattern", () => {
      const result = parseStrataRollText(
        "Address: 27 Reynolds St, Cremorne NSW 2090",
      );
      expect(result.scheme.state).toBe("NSW");
    });

    it("handles all Australian states", () => {
      const states = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
      for (const state of states) {
        const result = parseStrataRollText(`State: ${state}`);
        expect(result.scheme.state).toBe(state);
      }
    });
  });

  describe("postcode extraction", () => {
    it("extracts postcode from label", () => {
      const result = parseStrataRollText("Postcode: 2090\nSomething");
      expect(result.scheme.postcode).toBe("2090");
    });

    it("extracts postcode from state-postcode fallback", () => {
      const result = parseStrataRollText("Cremorne NSW 2090");
      expect(result.scheme.postcode).toBe("2090");
    });
  });

  describe("ABN extraction", () => {
    it("extracts and formats ABN from label", () => {
      const result = parseStrataRollText("ABN: 12345678901\nMore data");
      expect(result.scheme.abnNumber).toBe("12 345 678 901");
    });

    it("extracts ABN with spaces in source", () => {
      const result = parseStrataRollText("ABN: 12 345 678 901");
      expect(result.scheme.abnNumber).toBe("12 345 678 901");
    });

    it("returns null for non-11-digit ABN", () => {
      const result = parseStrataRollText("ABN: 123456");
      expect(result.scheme.abnNumber).toBeNull();
    });
  });

  describe("financial year extraction", () => {
    it("extracts DD/MM/YYYY format", () => {
      const result = parseStrataRollText("Financial Year End: 30/06/2026");
      expect(result.scheme.financialYearEnd).toBe("06-30");
    });

    it("extracts DD/MM format without year", () => {
      const result = parseStrataRollText("Financial Year End: 30/6");
      expect(result.scheme.financialYearEnd).toBe("06-30");
    });

    it("extracts day month-name format", () => {
      const result = parseStrataRollText("Financial Year End: 30 June");
      expect(result.scheme.financialYearEnd).toBe("06-30");
    });

    it("extracts month-name day format", () => {
      const result = parseStrataRollText("FYE: June 30");
      expect(result.scheme.financialYearEnd).toBe("06-30");
    });

    it("extracts abbreviated month names", () => {
      const result = parseStrataRollText("Year End: 31 Mar");
      expect(result.scheme.financialYearEnd).toBe("03-31");
    });
  });

  describe("total lots extraction", () => {
    it("extracts from Total Lots label", () => {
      const result = parseStrataRollText("Total Lots: 24\nEntitlement: 2400");
      expect(result.scheme.totalLots).toBe(24);
    });

    it("extracts from Number of Lots label", () => {
      const result = parseStrataRollText("Number of Lots: 12");
      expect(result.scheme.totalLots).toBe(12);
    });

    it("returns null for non-numeric value", () => {
      const result = parseStrataRollText("Total Lots: unknown");
      expect(result.scheme.totalLots).toBeNull();
    });
  });

  describe("total entitlement extraction", () => {
    it("extracts from Aggregate Units of Entitlement", () => {
      const result = parseStrataRollText(
        "Aggregate Units of Entitlement: 2400",
      );
      expect(result.scheme.totalEntitlement).toBe(2400);
    });

    it("extracts from Total Entitlement label", () => {
      const result = parseStrataRollText("Total Entitlement: 1200");
      expect(result.scheme.totalEntitlement).toBe(1200);
    });

    it("handles comma-separated numbers", () => {
      const result = parseStrataRollText(
        "Aggregate Units of Entitlement: 2,400",
      );
      expect(result.scheme.totalEntitlement).toBe(2400);
    });
  });

  describe("building name extraction", () => {
    it("extracts from Building Name label", () => {
      const result = parseStrataRollText(
        "Building Name: Harbour View Apartments\nAddress: 1 Test St",
      );
      expect(result.scheme.name).toBe("Harbour View Apartments");
    });

    it("extracts from Scheme Name label", () => {
      const result = parseStrataRollText("Scheme Name: Ocean Tower");
      expect(result.scheme.name).toBe("Ocean Tower");
    });
  });

  describe("building type inference", () => {
    it("infers STRATA from SP plan number", () => {
      const result = parseStrataRollText("SP 12345");
      expect(result.scheme.buildingType).toBe("STRATA");
    });

    it("infers STRATA from PS plan number", () => {
      const result = parseStrataRollText("PS 12345");
      expect(result.scheme.buildingType).toBe("STRATA");
    });

    it("returns null buildingType when no plan number", () => {
      const result = parseStrataRollText("No plan number here");
      expect(result.scheme.buildingType).toBeNull();
    });
  });

  describe("lot extraction", () => {
    it("extracts lots from four-column table format", () => {
      const text = `
Contribution Schedule
Lot  Unit  Owner  Entitlement
1    101    John Smith    100
2    102    Jane Doe    150
Aggregate Units of Entitlement: 250
      `;
      const result = parseStrataRollText(text);
      expect(result.lots).toHaveLength(2);
      expect(result.lots[0]).toEqual({
        lotNumber: "1",
        unitNumber: "101",
        entitlement: 100,
        ownerName: "John Smith",
      });
      expect(result.lots[1]).toEqual({
        lotNumber: "2",
        unitNumber: "102",
        entitlement: 150,
        ownerName: "Jane Doe",
      });
    });

    it("extracts lots from three-column table format", () => {
      // The four-column regex matches first when the name has multiple
      // words, treating the first word as unitNumber. Use single-word
      // names or the labelled format for unambiguous three-column data.
      const text = `
Lot Schedule
1    Smith    100
2    Doe    150
Total Entitlement: 250
      `;
      const result = parseStrataRollText(text);
      expect(result.lots).toHaveLength(2);
      expect(result.lots[0].lotNumber).toBe("1");
      expect(result.lots[0].unitNumber).toBeNull();
      expect(result.lots[0].entitlement).toBe(100);
      expect(result.lots[0].ownerName).toBe("Smith");
    });

    it("extracts lots from labelled format", () => {
      const text = `
Lot No  Unit
Lot 1 Unit 201 Bob Jones 75
Lot 2 Unit 202 Alice Brown 125
      `;
      const result = parseStrataRollText(text);
      expect(result.lots).toHaveLength(2);
      expect(result.lots[0]).toEqual({
        lotNumber: "1",
        unitNumber: "201",
        entitlement: 75,
        ownerName: "Bob Jones",
      });
    });

    it("returns empty lots when no schedule section found", () => {
      const result = parseStrataRollText("Just some random text with no lots");
      expect(result.lots).toEqual([]);
    });
  });

  describe("derived fields", () => {
    it("infers totalLots from parsed lots when not explicitly stated", () => {
      const text = `
Contribution Schedule
1    Owner A    100
2    Owner B    100
3    Owner C    100
      `;
      const result = parseStrataRollText(text);
      expect(result.scheme.totalLots).toBe(3);
    });

    it("infers totalEntitlement from parsed lots when not explicitly stated", () => {
      const text = `
Contribution Schedule
1    Owner A    100
2    Owner B    150
      `;
      const result = parseStrataRollText(text);
      expect(result.scheme.totalEntitlement).toBe(250);
    });

    it("infers suburb from address when not explicitly stated", () => {
      const result = parseStrataRollText(
        "Address: 27 Reynolds St, Cremorne NSW 2090",
      );
      expect(result.scheme.suburb).toBe("Cremorne");
    });
  });

  describe("rawTextPreview", () => {
    it("includes rawTextPreview when fewer than 3 fields found", () => {
      const result = parseStrataRollText("Just some random text");
      expect(result.rawTextPreview).toBeDefined();
      expect(result.rawTextPreview).toContain("Just some random text");
    });

    it("does not include rawTextPreview when enough fields found", () => {
      const text = `
Building Name: Test Building
SP 12345
Address: 1 Test Street
Suburb: Sydney
State: NSW
Postcode: 2000
      `;
      const result = parseStrataRollText(text);
      expect(result.rawTextPreview).toBeUndefined();
    });
  });

  describe("full document parsing", () => {
    it("parses a realistic strata roll text extract", () => {
      const text = `
STRATA ROLL

Building Name: Harbour View Apartments
Strata Plan Number 12345
Building Address: 27 Reynolds Street
Suburb: Cremorne
State: NSW
Postcode: 2090
ABN: 98 765 432 101
Total Lots: 4
Financial Year End: 30/06/2026

Contribution Schedule
Lot  Unit  Owner  Entitlement
1    101    J Smith & M Smith    100
2    102    R Jones    100
3    201    A Brown    150
4    202    P Wilson    150

Aggregate Units of Entitlement: 500

Certified by the Secretary
      `;

      const result = parseStrataRollText(text);

      expect(result.scheme.name).toBe("Harbour View Apartments");
      expect(result.scheme.planNumber).toBe("SP 12345");
      expect(result.scheme.address).toBe("27 Reynolds Street");
      expect(result.scheme.suburb).toBe("Cremorne");
      expect(result.scheme.state).toBe("NSW");
      expect(result.scheme.postcode).toBe("2090");
      expect(result.scheme.abnNumber).toBe("98 765 432 101");
      expect(result.scheme.totalLots).toBe(4);
      expect(result.scheme.totalEntitlement).toBe(500);
      expect(result.scheme.financialYearEnd).toBe("06-30");
      expect(result.scheme.buildingType).toBe("STRATA");

      expect(result.lots).toHaveLength(4);
      expect(result.lots[0].lotNumber).toBe("1");
      expect(result.lots[0].unitNumber).toBe("101");
      expect(result.lots[0].ownerName).toBe("J Smith & M Smith");
      expect(result.lots[0].entitlement).toBe(100);

      expect(result.rawTextPreview).toBeUndefined();
    });
  });
});
