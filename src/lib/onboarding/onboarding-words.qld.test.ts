/**
 * The Add Property words and checks for a Queensland building (QLD wording
 * and onboarding go-live, 27 Oct 2026), from the pending Queensland pack: its
 * module, both lot entitlements, its funds and its contribution and penalty
 * words. NSW gives the words the wizard has always shown.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import { onboardingWordsByState, onboardingWordsFor, planNumberLabel } from "./onboarding-words";
import { DEFAULT_CHECK_WORDS, checkLotBalances, checkLots, checkOpeningBalances, type FundCents } from "./property-onboarding";

const NSW = statutoryRulesFor("NSW");
const QLD = PENDING_RULE_PACKS.QLD.rules as unknown as StatutoryRules;
const nsw = onboardingWordsFor("NSW", NSW);
const qld = onboardingWordsFor("QLD", QLD);

describe("onboardingWordsFor", () => {
  it("gives NSW the words the checks have always used, and no module or second entitlement", () => {
    expect({ ...DEFAULT_CHECK_WORDS }).toEqual({ entitlement: nsw.entitlement, separate: nsw.separate, levies: nsw.levies, lateCharge: nsw.lateCharge, funds: nsw.funds });
    expect(nsw).toMatchObject({ ownersCorporation: "owners corporation", entitlementLabel: "Unit Entitlement", regulationModule: null, planFormat: null, separate: null });
    expect(nsw.fundWords.capitalWorks).toEqual({ name: "capital works fund", label: "Capital Works Fund", shortLabel: "Capital Works" });
    expect(planNumberLabel(nsw)).toBe("Plan Number");
  });

  it("gives Queensland its own words, its module and its interest schedule", () => {
    expect(qld).toMatchObject({
      ownersCorporation: "body corporate",
      planLabel: "Community titles scheme",
      levy: "contribution",
      levies: "contributions",
      lateCharge: "penalty",
      entitlement: "contribution schedule lot entitlement",
      entitlementLabel: "Contribution Schedule Lot Entitlement",
      separate: { name: "interest schedule lot entitlement", label: "Interest Schedule Lot Entitlement" },
      funds: { admin: "administrative fund", capitalWorks: "sinking fund" },
    });
    expect(qld.fundWords.capitalWorks).toEqual({ name: "sinking fund", label: "Sinking Fund", shortLabel: "Sinking Fund" });
    expect(qld.regulationModule?.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["STANDARD"]);
    // The plan format: every listed format, the standard format plan marked as not supported yet.
    expect(qld.planFormat?.label).toBe("Plan format");
    expect(qld.planFormat?.options.map((o) => [o.value, o.supported])).toEqual([
      ["BUILDING", true],
      ["VOLUMETRIC", true],
      ["STANDARD", false],
    ]);
    expect(planNumberLabel(qld)).toBe("Community Titles Scheme Number");
    const values = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(values) : []);
    expect(values(qld).join(" | ")).not.toMatch(/\b(levy|levies|owners corporation|unit entitlement|capital works)\b/i);
  });

  it("is made for each state from that state's rules", () => {
    const byState = onboardingWordsByState(["NSW", "QLD"], (s) => (s === "QLD" ? QLD : NSW));
    expect(byState.QLD.levies).toBe("contributions");
    expect(byState.NSW.levies).toBe("levies");
  });
});

describe("the checks in Queensland words", () => {
  const rows = [
    { lotNumber: "1", unitNumber: "", entitlement: "40", ownerName: "A", interestScheduleEntitlement: "45" },
    { lotNumber: "2", unitNumber: "", entitlement: "60", ownerName: "B", interestScheduleEntitlement: "" },
    { lotNumber: "3", unitNumber: "", entitlement: "", ownerName: "C", interestScheduleEntitlement: "0" },
  ];

  it("ask for both lot entitlements and keep the interest schedule on each lot", () => {
    const check = checkLots(rows, 3, 100, qld);
    expect(check.rowErrors[1]).toEqual(["Enter the interest schedule lot entitlement."]);
    expect(check.rowErrors[2]).toEqual([
      "Enter the contribution schedule lot entitlement.",
      "The interest schedule lot entitlement must be a whole number of at least 1.",
    ]);
    expect(check.lots).toEqual([{ lotNumber: "1", unitNumber: null, entitlement: 40, ownerName: "A", interestScheduleEntitlement: 45 }]);
    expect(check.separateSum).toBe(45);
    expect(checkLots(rows.slice(0, 2), 2, 90, qld).errors).toEqual([
      "The contribution schedule lot entitlements add up to 100, but the building's total contribution schedule lot entitlement is 90. They must match.",
    ]);
  });

  it("leave NSW lots as before: no second entitlement is read or kept", () => {
    const check = checkLots(rows.slice(0, 2), 2, 100, nsw);
    expect(check.ok).toBe(true);
    expect(check.lots[0]).not.toHaveProperty("interestScheduleEntitlement");
    expect(check).toEqual(checkLots(rows.slice(0, 2), 2, 100));
  });

  it("name the sinking fund, contributions and the penalty in the balance problems", () => {
    const fund = { cashAtBank: "100", leviesReceivable: "10", leviesInAdvance: "5", creditors: "0", fundBalance: "1" };
    const balances = checkOpeningBalances({ takeoverDate: "2026-10-01", totalBalance: "9", admin: fund, capitalWorks: fund }, null, "2026-10-27", qld);
    expect(balances.errors.join(" ")).toContain("Administrative fund: the balance sheet comes to $105.00 (cash at bank $100.00, plus contributions receivable $10.00, less contributions paid in advance $5.00");
    expect(balances.errors.join(" ")).toContain("Sinking fund: the balance sheet comes to $110.00");
    expect(balances.errors.join(" ")).toContain("must equal the administrative fund ($1.00) plus the sinking fund ($1.00)");
    expect(balances.errors.join(" ")).not.toMatch(/levies|capital works/i);

    const sheet = (receivable: number): FundCents => ({ cashAtBank: 0, leviesReceivable: receivable, leviesInAdvance: 0, creditors: 0, fundBalance: 0 });
    const lots = checkLotBalances(
      [{ lotNumber: "1", admin: "x", interestAdmin: "", capitalWorks: "10", interestCapitalWorks: "", unallocated: "" }],
      [{ lotNumber: "1" }],
      { admin: sheet(0), capitalWorks: sheet(0) },
      qld,
    );
    expect(lots.rowErrors[0]).toEqual(['Administrative fund contributions: "x" is not an amount in dollars and cents.']);
    const tie = checkLotBalances(
      [{ lotNumber: "1", admin: "", interestAdmin: "", capitalWorks: "10", interestCapitalWorks: "2", unallocated: "" }],
      [{ lotNumber: "1" }],
      { admin: sheet(0), capitalWorks: sheet(0) },
      qld,
    );
    expect(tie.errors).toEqual([
      "Sinking fund contributions and penalty on the lots come to $12.00, but sinking fund contributions receivable on the balance sheet is $0.00. Difference $12.00.",
    ]);
  });
});
