/**
 * NSW and Queensland lot entitlements, unchanged by Victoria's second
 * schedule (VIC, ACT and WA stage 2, PR 4). The snapshots were recorded on
 * feat/fund-conditions (2b04048), before the change, and must match byte for
 * byte: the lot form, the readers, the CSV import's columns and rows, the
 * onboarding words, lot checks and lots step, and Queensland's insurance
 * shares and the words that describe them.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QLD_RULE_PACK, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";

vi.mock("@/app/(portal)/adviser/schemes/[id]/lots/actions", () => ({ createLotAction: vi.fn(), updateLotAction: vi.fn() }));

const data = await import("./building-data");
const { LotForm } = await import("@/app/(portal)/adviser/schemes/[id]/lots/lot-form");
const fields = await import("@/lib/finance/migration-import-fields");
const { onboardingWordsFor } = await import("@/lib/onboarding/onboarding-words");
const { checkLots } = await import("@/lib/onboarding/property-onboarding");
const { LotsStep } = await import("@/app/(portal)/adviser/schemes/onboarding-steps");
const { insuranceBasis, insuranceSplit } = await import("@/lib/levies/contribution-shares");
const { levySharedBy, levyFormWords, lotFormEntitlementWords, lotWordsFor } = await import("./screen-words");

const NSW = statutoryRulesFor("NSW");
const QLD = QLD_RULE_PACK.rules as unknown as StatutoryRules;
const PACKS = [
  ["NSW", NSW],
  ["QLD", QLD],
] as const;

const attempt = <T,>(f: () => T): { ok: T } | { error: string; name: string } => {
  try {
    return { ok: f() };
  } catch (err) {
    return { error: (err as Error).message, name: (err as Error).name };
  }
};

describe.each(PACKS)("%s lot form", (_code, rules) => {
  // The words the lot page passes since #122 (lotFormEntitlementWords).
  const words = lotFormEntitlementWords(rules);
  const separate = data.separateEntitlement(rules);
  const defaults = { lotNumber: "3", unitNumber: "12", entitlement: 50, floorArea: null, lotType: "RESIDENTIAL" };
  it.each([
    ["create", { mode: "create" as const }],
    ["edit, no second value", { mode: "edit" as const, lotId: "l1", defaults }],
    ["edit, second value", { mode: "edit" as const, lotId: "l1", defaults: { ...defaults, interestScheduleEntitlement: 45 } }],
    ["edit, locked", { mode: "edit" as const, lotId: "l1", lockStructure: true, defaults: { ...defaults, interestScheduleEntitlement: 45 } }],
  ])("%s", (_name, props) => {
    expect(renderToStaticMarkup(<LotForm schemeId="s1" {...props} entitlementWords={words} separate={separate} />)).toMatchSnapshot();
  });
});

describe.each(PACKS)("%s readers", (_code, rules) => {
  const lots = [
    { lotNumber: "1", entitlement: 10, interestScheduleEntitlement: 30 },
    { lotNumber: "2", entitlement: 20, interestScheduleEntitlement: null },
    { lotNumber: "3", entitlement: null, interestScheduleEntitlement: 0 },
  ];
  it("schedules, fields, words and problems", () => {
    const uses = ["CONTRIBUTIONS", "POLL_VOTE", "SPECIAL_RESOLUTION", "COMMON_PROPERTY_SHARE", "INSURANCE_COMMON_PROPERTY", "INSURANCE_BUILDINGS", "TERMINATION_INTEREST", "VALUE_BASED_RATES"] as const;
    const formats = [undefined, "BUILDING", "VOLUMETRIC", "STANDARD", "X"];
    expect({
      separate: data.separateEntitlement(rules),
      onLot: attempt(() => data.onLotSchedule(rules).key),
      onLotWords: data.onLotEntitlementWords(rules),
      fields: rules.ENTITLEMENT_SCHEDULES.map((s) => [s.key, data.entitlementField(s)]),
      scheduleFor: uses.map((use) => [use, formats.map((planFormat) => attempt(() => data.scheduleFor(rules, use, { planFormat }).key))]),
      lotEntitlementFor: lots.map((lot) => uses.map((use) => attempt(() => data.lotEntitlementFor(rules, lot, use, { planFormat: "BUILDING" })))),
      entitlementFor: lots.map((lot) => rules.ENTITLEMENT_SCHEDULES.map((s) => attempt(() => data.entitlementFor(lot, s)))),
      missing: data.lotsMissingEntitlement(rules, lots),
      lotProblems: lots.map((lot) => data.lotEntitlementProblem(rules, lot)),
      lotWords: lotWordsFor(rules),
      levyFormWords: levyFormWords(rules),
      levySharedBy: levySharedBy(rules),
    }).toMatchSnapshot();
  });
});

describe.each(PACKS)("%s CSV lot import columns and rows", (_code, rules) => {
  const separate = data.separateEntitlement(rules);
  const building = separate?.field ? { field: separate.field, label: separate.label } : null;
  const headerSets = [
    ["Lot Number", "Unit Number", "Entitlement", "Floor Area", "Lot Type"],
    ["LotNo", "UnitNo", "Entitlement", "Area", "Lot Type", "Interest Schedule Lot Entitlement"],
    ["Lot", "Unit Entitlement", "Interest Schedule", "Lot Entitlement", "interest_schedule_entitlement"],
    ["lot_number", "entitlement", "lot_entitlement", "Lot Liability"],
  ];
  it("columns, matching and rows", () => {
    expect({
      fields: fields.importFieldsFor("lots", building),
      noBuilding: fields.importFieldsFor("lots"),
      mappings: headerSets.map((h) => fields.autoDetectMapping("lots", h, building)),
      rows: headerSets.map((h) =>
        fields.buildImportRows("lots", h, [h.map((_, i) => String(i + 1)), h.map(() => "")], fields.autoDetectMapping("lots", h, building), building),
      ),
      server: fields.toServerData("lots", { lot_number: "1", entitlement: "10", interest_schedule_entitlement: "12", unknown: "x" }),
      missing: fields.missingRequired("lots", { lotNumber: "", entitlement: "", interestScheduleEntitlement: "" }),
    }).toMatchSnapshot();
  });
});

describe.each(PACKS)("%s onboarding lots", (code, rules) => {
  const words = onboardingWordsFor(code, rules);
  const rows = [
    { lotNumber: "1", unitNumber: "", entitlement: "40", ownerName: "A", interestScheduleEntitlement: "45" },
    { lotNumber: "2", unitNumber: "4", entitlement: "60", ownerName: "B", interestScheduleEntitlement: "" },
    { lotNumber: "3", unitNumber: "", entitlement: "x", ownerName: "C", interestScheduleEntitlement: "0" },
    { lotNumber: "4", unitNumber: "", entitlement: "10", ownerName: "D" },
  ];
  it("words and checks", () => {
    const { fundRules: _fundRules, ...rest } = words as typeof words & { fundRules?: unknown };
    expect({
      words: rest,
      ok: checkLots(rows.slice(0, 1), 1, 40, words),
      bad: checkLots(rows, 4, 110, words),
    }).toMatchSnapshot();
  });
  it("the lots step", () => {
    const check = checkLots(rows, 4, 110, words);
    const html = renderToStaticMarkup(
      <LotsStep words={words} lots={rows} onChange={() => {}} totalLots={4} totalEntitlement={110} check={check} showErrors fromRoll={false} />,
    );
    expect(html).toMatchSnapshot();
  });
});

describe("Queensland insurance shares", () => {
  const lots: { lotId: string; lotNumber: string; entitlement: number; interestScheduleEntitlement: number | null; ownerId: string | null }[] = [
    { lotId: "l1", lotNumber: "1", entitlement: 10, interestScheduleEntitlement: 30, ownerId: "o1" },
    { lotId: "l2", lotNumber: "2", entitlement: 20, interestScheduleEntitlement: 30, ownerId: null },
    { lotId: "l3", lotNumber: "3", entitlement: 30, interestScheduleEntitlement: 40, ownerId: "o3" },
  ];
  const base = { rules: QLD, planFormat: "BUILDING" as string | null, lots, totalCents: 100_000, insuranceCents: 40_001, ledgerFund: "ADMINISTRATIVE", levyType: "ORDINARY" as "ORDINARY" | "SPECIAL" };
  const cases: [string, Partial<typeof base> & { levyType?: "ORDINARY" | "SPECIAL" }][] = [
    ["building", {}],
    ["volumetric", { planFormat: "VOLUMETRIC" }],
    ["standard", { planFormat: "STANDARD" }],
    ["no plan format", { planFormat: null }],
    ["unknown plan format", { planFormat: "X" }],
    ["special", { levyType: "SPECIAL" }],
    ["sinking fund, no insurance", { ledgerFund: "CAPITAL_WORKS", insuranceCents: 0 }],
    ["sinking fund with insurance", { ledgerFund: "CAPITAL_WORKS" }],
    ["no insurance line", { insuranceCents: 0 }],
    ["insurance above the contribution", { insuranceCents: 100_001 }],
    ["one lot missing", { lots: [lots[0], { ...lots[1], interestScheduleEntitlement: null }, lots[2]] }],
    ["lots missing and 0", { lots: [{ ...lots[0], interestScheduleEntitlement: 0 }, { ...lots[1], interestScheduleEntitlement: null }, { ...lots[2], interestScheduleEntitlement: null }] }],
    ["uneven cents", { totalCents: 99_999, insuranceCents: 33_333 }],
    ["all insurance", { insuranceCents: 100_000 }],
  ];
  it.each(cases)("%s", (_name, over) => {
    expect(attempt(() => insuranceSplit({ ...base, ...over }))).toMatchSnapshot();
  });
  it("NSW is never split, and the notice sentence", () => {
    expect({
      nsw: insuranceSplit({ ...base, rules: NSW }),
      basis: [insuranceBasis(QLD), insuranceBasis(NSW)],
    }).toMatchSnapshot();
  });
});
