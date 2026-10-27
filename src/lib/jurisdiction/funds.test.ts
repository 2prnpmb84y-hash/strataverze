import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";
import { defaultFunds, fundDefinition, fundLabel, fundTypeLabel, fundNameWords, fundShortLabel, fundTypeWords, ledgerFundDefinition, ledgerFundOf } from "./funds";

const NSW = statutoryRulesFor("NSW");
const QLD = PENDING_RULE_PACKS.QLD.rules;

const TYPES = ["ADMINISTRATIVE", "ADMIN", "CAPITAL_WORKS", "SINKING", "SPECIAL", "", null, undefined] as const;

describe("fund names from the pack", () => {
  it("maps every stored fund type to the NSW funds the platform has always shown", () => {
    expect(TYPES.map((t) => fundLabel(NSW, t))).toEqual(["Administrative Fund", "Administrative Fund", "Capital Works Fund", "Capital Works Fund", null, null, null, null]);
    expect(TYPES.map((t) => fundShortLabel(NSW, t))).toEqual(["Admin", "Admin", "Capital Works", "Capital Works", null, null, null, null]);
    expect(TYPES.map((t) => fundDefinition(NSW, t)?.key ?? null)).toEqual(["ADMINISTRATIVE", "ADMINISTRATIVE", "CAPITAL_WORKS", "CAPITAL_WORKS", null, null, null, null]);
  });

  it("maps every stored fund type to the Queensland funds", () => {
    expect(TYPES.map((t) => fundLabel(QLD, t))).toEqual(["Administrative Fund", "Administrative Fund", "Sinking Fund", "Sinking Fund", null, null, null, null]);
    expect(TYPES.map((t) => fundShortLabel(QLD, t))).toEqual(["Admin", "Admin", "Sinking Fund", "Sinking Fund", null, null, null, null]);
    expect(TYPES.map((t) => fundDefinition(QLD, t)?.key ?? null)).toEqual(["ADMINISTRATIVE", "ADMINISTRATIVE", "SINKING", "SINKING", null, null, null, null]);
  });

  it("shows the sinking fund where NSW shows the capital works fund, in the same ledger fund", () => {
    expect(ledgerFundOf("CAPITAL_WORKS")).toBe("CAPITAL_WORKS");
    expect(ledgerFundOf("SPECIAL")).toBeNull();
    expect(fundLabel(NSW, "CAPITAL_WORKS")).toBe("Capital Works Fund");
    expect(fundLabel(QLD, "CAPITAL_WORKS")).toBe("Sinking Fund");
    expect(fundTypeWords(ledgerFundDefinition(NSW, "CAPITAL_WORKS"))).toBe("Capital Works");
    expect(fundTypeWords(ledgerFundDefinition(QLD, "CAPITAL_WORKS"))).toBe("Sinking");
    expect(fundNameWords(ledgerFundDefinition(NSW, "CAPITAL_WORKS"))).toBe("capital works");
    expect(fundNameWords(ledgerFundDefinition(QLD, "CAPITAL_WORKS"))).toBe("sinking");
    expect(fundTypeWords(ledgerFundDefinition(NSW, "ADMINISTRATIVE"))).toBe("Administrative");
    expect(fundNameWords(ledgerFundDefinition(QLD, "ADMINISTRATIVE"))).toBe("administrative");
  });

  it("takes the catalogue itself or the rules", () => {
    expect(fundLabel(QLD.FUND_CATALOGUE, "SINKING")).toBe("Sinking Fund");
    expect(() => ledgerFundDefinition([], "ADMINISTRATIVE")).toThrow(/no fund kept in ADMINISTRATIVE/);
  });

  it("has labels in title case ending in Fund, so the derived words hold", () => {
    for (const rules of [NSW, QLD]) {
      for (const f of rules.FUND_CATALOGUE) {
        expect(f.label).toMatch(/ Fund$/);
        expect(f.label.toLowerCase()).toBe(f.name);
        expect(f.shortLabel.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("default funds", () => {
  it("are the NSW funds every building has been given, in the same order", () => {
    expect(defaultFunds(NSW)).toEqual([
      { name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
      { name: "Capital Works Fund", fundType: "CAPITAL_WORKS" },
    ]);
  });

  it("are the administrative fund and the sinking fund (kept in CAPITAL_WORKS) for Queensland", () => {
    expect(defaultFunds(QLD)).toEqual([
      { name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
      { name: "Sinking Fund", fundType: "CAPITAL_WORKS" },
    ]);
  });

  it("leave out a fund the pack does not require", () => {
    const optional = QLD.FUND_CATALOGUE.map((f) => (f.key === "SINKING" ? { ...f, required: false } : f));
    expect(defaultFunds(optional).map((f) => f.name)).toEqual(["Administrative Fund"]);
  });
});

describe("fund type labels on fund lists and pages", () => {
  const LEGACY = { ADMIN: "Administrative", SINKING: "Capital Works", RESERVE: "Reserve" };

  it("names the current types from the pack instead of showing the stored code", () => {
    expect(fundTypeLabel(NSW, "ADMINISTRATIVE", LEGACY)).toBe("Administrative Fund");
    expect(fundTypeLabel(NSW, "CAPITAL_WORKS", LEGACY)).toBe("Capital Works Fund");
    expect(fundTypeLabel(QLD, "CAPITAL_WORKS", LEGACY)).toBe("Sinking Fund");
  });

  it("keeps the page's own labels for the legacy types, and shows anything else as stored", () => {
    expect(["ADMIN", "SINKING", "RESERVE"].map((t) => fundTypeLabel(NSW, t, LEGACY))).toEqual(["Administrative", "Capital Works", "Reserve"]);
    expect(fundTypeLabel(NSW, "SPECIAL", LEGACY)).toBe("SPECIAL");
  });
});
