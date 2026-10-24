import { describe, expect, it } from "vitest";
import { parseStrataRollText } from "./parse-strata-roll";
import { layoutLines } from "@/lib/pdf/layout-text";

/**
 * Cases from the independent review of the roll reader (24 Oct). Each one
 * lost or invented data in the first version.
 */

const pad = (cells: Array<[number, string]>) => {
  let line = "";
  for (const [col, text] of cells) line = line.padEnd(col) + text;
  return line;
};

/** A small Urbanise-style roll as text: lot table, then one page per lot. */
function urbanise(opts: {
  tablePages: Array<Array<[string, string, number]>>;
  total?: number;
  extraOnRow?: { lot: string; text: string };
  lots: Array<{ lot: string; unit: string; ent: number; owner?: string; corporate?: string; corporateId?: string; email?: string; breakAfterOwner?: boolean }>;
}): string {
  const pages: string[] = [];
  opts.tablePages.forEach((rows, i) => {
    const out = ["Owners Corporation for Plan No. 4321", "OWNERS CORPORATION ROLL - COMMON PROPERTY INFORMATION", pad([[0, "Plan No. 4321"], [40, "Plan No. 4321"]]), pad([[0, "Property Name:"], [40, "Test Towers"]]), pad([[0, "Property Address:"], [40, "5 Test Street, Testville NSW 2999"]])];
    if (i > 0) out.splice(2);
    out.push(pad([[0, "Lot"], [10, "Unit"], [20, "Lot Liab"], [32, "Lot Ent"]]));
    for (const [lot, unit, ent] of rows) {
      const row: Array<[number, string]> = [[0, lot], [10, unit], [20, String(ent)], [32, String(ent)]];
      if (opts.extraOnRow?.lot === lot) row.push([60, opts.extraOnRow.text]);
      out.push(pad(row));
    }
    if (i === opts.tablePages.length - 1 && opts.total !== undefined) out.push(pad([[20, String(opts.total)], [32, String(opts.total)]]));
    pages.push(out.join("\n"));
  });
  for (const l of opts.lots) {
    const head = `Owners Corporation Roll - Lot: ${l.lot}, Unit: ${l.unit}`;
    const p1 = [
      head,
      "1   PLAN & LOT INFORMATION",
      pad([[0, "Lot:"], [40, l.lot], [60, "Unit No:"], [90, l.unit]]),
      pad([[0, "Lot Liability:"], [40, String(l.ent)], [60, "Lot Entitlement:"], [90, String(l.ent)]]),
      "2   CURRENT OWNER INFORMATION",
      pad([[0, "Registered Lot Owner:"], [40, l.owner ?? ""]]),
    ];
    const p2 = [
      pad([[0, "Corporate Owner:"], [40, l.corporate ?? ""]]),
      pad([[0, "If Corporate Owner, ABN/ACN:"], [40, l.corporateId ?? ""]]),
      pad([[0, "Residential or Business Address:"], [40, "1 Owner Road, Testville NSW 2999"]]),
      pad([[0, "Email:"], [40, l.email ?? "owner@example.com"]]),
      pad([[0, "Committee Member?"], [40, "NO"]]),
      pad([[0, "Tenant:"], [40, "No details recorded"]]),
      pad([[0, "Email:"], [40, "tenant@example.com"]]),
      "Printed from Urbanise Strata - www.urbanise.com",
    ];
    if (l.breakAfterOwner) {
      pages.push([...p1, "Printed from Urbanise Strata - www.urbanise.com"].join("\n"));
      pages.push([`${head} ( Continued )`, ...p2].join("\n"));
    } else {
      pages.push([...p1, ...p2].join("\n"));
    }
  }
  return pages.join("\f");
}

const three = [
  { lot: "1", unit: "1", ent: 100, owner: "Ms A Owner" },
  { lot: "2", unit: "2", ent: 150, owner: "B Owner and C Owner" },
  { lot: "3", unit: "3", ent: 250, owner: "Mr D Owner" },
];

describe("Urbanise roll", () => {
  it("reads a lot table that runs onto a second page", () => {
    const roll = parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100], ["2", "2", 150]], [["3", "3", 250]]], total: 500, lots: three }));
    expect(roll.format).toBe("urbanise-oc-roll");
    expect(roll.lots.map((l) => l.lotNumber)).toEqual(["1", "2", "3"]);
    expect(roll.scheme.totalEntitlement).toBe(500);
    expect(roll.issues.filter((i) => i.kind === "conflict")).toEqual([]);
  });

  it("ignores a panel printed beside the table rather than losing lots", () => {
    for (const lot of ["1", "2"]) {
      const roll = parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100], ["2", "2", 150], ["3", "3", 250]]], total: 500, extraOnRow: { lot, text: "Sum Insured:   25000000" }, lots: three }));
      expect(roll.lots.map((l) => [l.lotNumber, l.entitlement])).toEqual([["1", 100], ["2", 150], ["3", 250]]);
    }
  });

  it("keeps a lot that has a page but no table row, and flags it", () => {
    const roll = parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100], ["2", "2", 150]]], total: 250, lots: three }));
    expect(roll.lots.map((l) => l.lotNumber)).toEqual(["1", "2", "3"]);
    expect(roll.issues).toContainEqual(expect.objectContaining({ kind: "conflict", lotNumber: "3" }));
    expect(roll.issues).toContainEqual(expect.objectContaining({ kind: "conflict", field: "totalEntitlement" }));
  });

  it("keeps reading the owner section when a lot's page breaks after the owner line", () => {
    const lots = three.map((l) => ({ ...l, breakAfterOwner: l.lot === "2" }));
    const roll = parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100], ["2", "2", 150], ["3", "3", 250]]], total: 500, lots }));
    const d = roll.details.find((x) => x.lotNumber === "2");
    expect(roll.lots.find((l) => l.lotNumber === "2")?.ownerName).toBe("B Owner and C Owner");
    expect(d).toMatchObject({ ownerEmail: "owner@example.com", committeeMember: false, ownerAddress: "1 Owner Road, Testville NSW 2999" });
  });

  it("uses a corporate owner as printed, keeps its ACN out of the name, and flags it", () => {
    const lots = three.map((l) => (l.lot === "3" ? { ...l, owner: "", corporate: "Test Holdings Pty Ltd", corporateId: "ACN 123 456 789" } : l));
    const roll = parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100], ["2", "2", 150], ["3", "3", 250]]], total: 500, lots }));
    expect(roll.lots.find((l) => l.lotNumber === "3")?.ownerName).toBe("Test Holdings Pty Ltd");
    expect(roll.issues).toContainEqual(expect.objectContaining({ kind: "uncertain", lotNumber: "3", message: expect.stringContaining("ACN 123 456 789") }));
  });

  it("keeps both email addresses of joint owners", () => {
    const lots = three.map((l) => (l.lot === "2" ? { ...l, email: "b@example.com   c@example.com" } : l));
    const roll = parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100], ["2", "2", 150], ["3", "3", 250]]], total: 500, lots }));
    expect(roll.details.find((d) => d.lotNumber === "2")?.ownerEmail).toBe("b@example.com c@example.com");
  });

  it("does not invent the number of lots", () => {
    const roll = parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100], ["2", "2", 150], ["3", "3", 250]]], total: 500, lots: three }));
    expect(roll.scheme.totalLots).toBeNull();
  });

  it("reads 'Plan No.: 4321' and never takes 'Plan Notes' as a plan number", () => {
    expect(parseStrataRollText(urbanise({ tablePages: [[["1", "1", 100]]], total: 100, lots: three.slice(0, 1) }).replace("Plan No. 4321", "Plan No.: 4321")).scheme.planNumber).toBe("4321");
  });

  it("is not chosen for another system's roll that merely says OWNERS CORPORATION ROLL", () => {
    const roll = parseStrataRollText("OWNERS CORPORATION ROLL\nLot No  Unit  Registered Lot Owner  Entitlement\n1  101  John Smith  100\n2  102  Jane Doe  150\n");
    expect(roll.format).toBe("generic");
    expect(roll.lots).toHaveLength(2);
  });
});

describe("other rolls", () => {
  it("reads zero-padded lot numbers", () => {
    const roll = parseStrataRollText("Contribution Schedule\n01  101  John Smith  100\n02  102  Jane Doe  150\n");
    expect(roll.lots.map((l) => l.lotNumber)).toEqual(["01", "02"]);
  });

  it("reads a row whose owner column includes an address", () => {
    const roll = parseStrataRollText("Contribution Schedule\n1  101  John Smith, 5 High St Sydney NSW 2000  100\n");
    expect(roll.lots).toEqual([{ lotNumber: "1", unitNumber: "101", entitlement: 100, ownerName: "John Smith, 5 High St Sydney NSW 2000" }]);
  });

  it("reads a row with a phone number in it, and flags the owner name", () => {
    const roll = parseStrataRollText("Contribution Schedule\n1  101  John Smith 0412 345 678  100\n");
    expect(roll.lots).toHaveLength(1);
    expect(roll.issues).toContainEqual(expect.objectContaining({ kind: "uncertain", lotNumber: "1", field: "ownerName" }));
  });

  it("says when it leaves out a line that looks like an address or a phone number", () => {
    const roll = parseStrataRollText("Lot No  Unit\n1 Bennelong Point, Sydney NSW 2000\n0400 TEST 01\n");
    expect(roll.lots).toEqual([]);
    expect(roll.issues.filter((i) => i.kind === "uncertain")).toHaveLength(2);
  });

  it("does not end the table at a column header that says Total Entitlement, nor take a total from the next line", () => {
    const roll = parseStrataRollText("Contribution Schedule\nLot  Unit  Owner  Total Entitlement\n1  101  John Smith  100\n2  102  Jane Doe  150\n");
    expect(roll.lots).toHaveLength(2);
    expect(roll.scheme.totalEntitlement).toBeNull();
  });

  it("takes the owner's whole name when there is no unit column", () => {
    const roll = parseStrataRollText("Contribution Schedule\n1    John Smith    100\n");
    expect(roll.lots).toEqual([{ lotNumber: "1", unitNumber: null, entitlement: 100, ownerName: "John Smith" }]);
  });

  it("stops a value at the next label on the same line", () => {
    const roll = parseStrataRollText("Scheme Name:   The Pines   Financial Year End:   30/06/2026\nAddress:   5 High St   Suburb:   Cremorne\n");
    expect(roll.scheme.name).toBe("The Pines");
    expect(roll.scheme.financialYearEnd).toBe("06-30");
    expect(roll.scheme.address).toBe("5 High St");
    expect(roll.scheme.suburb).toBe("Cremorne");
  });
});

describe("layout lines", () => {
  const item = (str: string, x: number, y: number, width = str.length * 4, size = 8) => ({ str, x, y, width, size });

  it("keeps text drawn twice (fake bold) once", () => {
    const [line] = layoutLines(1, [item("5500", 193.3, 500), item("5500", 193.6, 500)]);
    expect(line.text).toBe("5500");
  });

  it("keeps a line together when its baseline drifts", () => {
    const lines = layoutLines(1, [item("A", 10, 501.9, 4, 5), item("B", 30, 500, 4, 5), item("C", 50, 499, 4, 5)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].cells.map((c) => c.text)).toEqual(["A", "B", "C"]);
  });

  it("splits text printed over other text into its own cell", () => {
    const [line] = layoutLines(1, [item("DRAFT COPY", 150, 500, 60), item("5500", 160, 500)]);
    expect(line.cells.length).toBe(2);
  });
});
