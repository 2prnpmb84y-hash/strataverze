import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseStrataRollPDF, type ParsedStrataRoll } from "./parse-strata-roll";

/**
 * Acceptance test (24 Oct): the Urbanise Strata roll for the test building
 * SP 99999 must give exactly the lot register the product owner supplied.
 * Before the fix the reader returned 26 "lots" totalling 22,101, made from
 * street addresses and phone numbers.
 */

const EXPECTED: Array<[lot: string, unit: string, entitlement: number, owner: string]> = [
  ["1", "1", 5500, "Ms Cate Blanchett"],
  ["2", "2", 5325, "Hugo Alexander Weaving and Toni Louise Collette"],
  ["3", "3", 5325, "Mr Chris R Hemsworth"],
  ["4", "4", 5700, "Geoffrey Roy Rush and Judy Frances Davis"],
  ["5", "5", 5450, "Nicole Mary Kidman"],
  ["6", "6", 5450, "Samuel Leroy Jackson"],
  ["7", "7", 5750, "Russell Ira Crowe"],
  ["8", "8", 5500, "Mr and Mrs K Watts"],
  ["9", "9", 5500, "Eric Thomas Bana and Guy Edward Pearce"],
  ["10", "10", 400, "Geoffrey Roy Rush and Judy Frances Davis"],
  ["11", "11", 400, "Mr and Mrs K Watts"],
  ["12", "12", 400, "Russell Ira Crowe"],
  ["13", "13", 400, "Eric Thomas Bana and Guy Edward Pearce"],
  ["14", "14", 400, "Hugo Alexander Weaving and Toni Louise Collette"],
  ["15", "15", 300, "Ms Cate Blanchett"],
];

let roll: ParsedStrataRoll;
beforeAll(async () => {
  const pdf = readFileSync(join(__dirname, "../test/fixtures/handover/sp99999/08_Owners_Corporation_Roll.pdf"));
  roll = await parseStrataRollPDF(pdf);
}, 60_000);

describe("SP 99999 owners corporation roll (Urbanise Strata)", () => {
  it("is read as an Urbanise roll", () => {
    expect(roll.format).toBe("urbanise-oc-roll");
  });

  it("gives all 15 lots with lot number, unit number and unit entitlement as separate fields", () => {
    expect(roll.lots.map((l) => [l.lotNumber, l.unitNumber, l.entitlement])).toEqual(EXPECTED.map(([lot, unit, ent]) => [lot, unit, ent]));
  });

  it("keeps every owner name exactly as recorded, including joint owners and titles", () => {
    expect(roll.lots.map((l) => l.ownerName)).toEqual(EXPECTED.map(([, , , owner]) => owner));
  });

  it("keeps a separate record for each lot of an owner who holds several", () => {
    const lotsOf = (owner: string) => roll.lots.filter((l) => l.ownerName === owner).map((l) => l.lotNumber);
    expect(lotsOf("Ms Cate Blanchett")).toEqual(["1", "15"]);
    expect(lotsOf("Hugo Alexander Weaving and Toni Louise Collette")).toEqual(["2", "14"]);
    expect(lotsOf("Geoffrey Roy Rush and Judy Frances Davis")).toEqual(["4", "10"]);
    expect(lotsOf("Russell Ira Crowe")).toEqual(["7", "12"]);
    expect(lotsOf("Mr and Mrs K Watts")).toEqual(["8", "11"]);
    expect(lotsOf("Eric Thomas Bana and Guy Edward Pearce")).toEqual(["9", "13"]);
  });

  it("totals 51,800 units of entitlement, as the roll prints", () => {
    expect(roll.scheme.totalEntitlement).toBe(51800);
    expect(roll.lots.reduce((s, l) => s + l.entitlement, 0)).toBe(51800);
    expect(roll.scheme.totalLots).toBe(15);
  });

  it("finds no conflict between the roll's lot table and its lot pages", () => {
    expect(roll.issues.filter((i) => i.kind === "conflict")).toEqual([]);
    expect(roll.issues.filter((i) => i.kind === "missing" && i.lotNumber)).toEqual([]);
  });

  it("says where each lot came from", () => {
    expect(roll.details.every((d) => d.tablePage === 1)).toBe(true);
    expect(roll.details.at(0)?.ownerPage).toBe(2);
    expect(roll.details.every((d) => typeof d.ownerPage === "number" && d.ownerPage > 1)).toBe(true);
  });

  it("reads the building's details without guessing what the roll does not say", () => {
    expect(roll.scheme).toMatchObject({ name: "1 Bennelong Point", planNumber: "99999", address: "1 Bennelong Point", suburb: "Sydney", state: "NSW", postcode: "2000", financialYearEnd: null });
    // No "SP" without a source; the plan type, the lot count and the year end are flagged for review.
    expect(roll.issues).toContainEqual(expect.objectContaining({ kind: "uncertain", field: "planNumber" }));
    expect(roll.issues).toContainEqual(expect.objectContaining({ kind: "uncertain", field: "totalLots" }));
    expect(roll.issues).toContainEqual(expect.objectContaining({ kind: "missing", field: "financialYearEnd" }));
  });

  it("reads the owner's address, email and committee membership for later steps", () => {
    expect(roll.details.at(0)).toMatchObject({ ownerAddress: "Unit 1, 1 Bennelong Point, Sydney NSW 2000", ownerEmail: "cblanchett@example.com", committeeMember: false });
    expect(roll.details.filter((d) => d.committeeMember).map((d) => d.lotNumber)).toEqual(["3", "9", "12"]);
  });
});
