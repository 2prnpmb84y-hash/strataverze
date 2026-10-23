import { describe, expect, it } from "vitest";
import { COLUMN_TEMPLATES, FIELDS, missingFields, suggestMapping, toRecords } from "./migration-templates";

describe("migration column templates", () => {
  it("are marked as unconfirmed, with a note to check them against sample exports", () => {
    for (const t of Object.values(COLUMN_TEMPLATES)) {
      expect(t.status).toBe("UNCONFIRMED");
      expect(t.note).toMatch(/confirmed against sample/);
    }
  });

  it("cover every field of every file type with names that are all known fields", () => {
    for (const t of Object.values(COLUMN_TEMPLATES)) {
      for (const [dataType, fields] of Object.entries(FIELDS)) {
        const names = t.dataTypes[dataType as keyof typeof FIELDS];
        expect(names, `${t.sourceSystem} ${dataType}`).toBeDefined();
        const known = new Set(fields.map((f) => f.field));
        for (const field of Object.keys(names)) expect(known.has(field), `${t.sourceSystem} ${dataType}.${field}`).toBe(true);
      }
    }
  });

  it("suggests columns by header name, ignoring case and spacing, one field per column", () => {
    const headers = ["Lot No", "Unit No", "DUE DATE", "Fund", "Levy Arrears", "Interest"];
    const m = suggestMapping(headers, "levy_arrears", "stratamax");
    expect(m).toMatchObject({ lotNumber: 0, dueDate: 2, fundName: 3, levyOutstanding: 4, interestCharged: 5 });
    expect(missingFields(m, "levy_arrears")).toEqual([]);
    expect(toRecords([["3", "3A", "01/04/2026", "Admin", "1,000.00", "25.00"]], m, "levy_arrears")[0]).toEqual({
      lotNumber: "3",
      dueDate: "01/04/2026",
      fundName: "Admin",
      levyOutstanding: "1,000.00",
      interestCharged: "25.00",
    });
  });

  it("falls back to the field names when there is no template", () => {
    expect(suggestMapping(["accountCode", "debit", "credit"], "opening_balances", null)).toEqual({ accountCode: 0, debit: 1, credit: 2 });
  });

  it("names what is missing", () => {
    expect(missingFields({ accountCode: 0, debit: 1 }, "opening_balances")).toEqual(["Debit and credit, or a balance"]);
    expect(missingFields({ accountCode: 0, balance: 1 }, "opening_balances")).toEqual([]);
    expect(missingFields({ invoiceNumber: 0, invoiceDate: 1, totalAmount: 2, accountCode: 3 }, "unpaid_invoices")).toEqual(["Supplier or supplier ABN"]);
  });
});
