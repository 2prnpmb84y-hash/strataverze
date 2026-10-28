/**
 * NSW and Queensland building data, unchanged by the building selectors (VIC,
 * ACT and WA stage 2, PR 2). The snapshots were recorded on feat/dated-rules
 * (adbf709), before the change, and must match byte for byte: what the
 * "Building data missing" notice says for each building, and a building's row
 * after a state or postcode change.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { PENDING_RULE_PACKS, statutoryRulesFor } = await import("@/config/statutory");
const { buildingDataProblems } = await import("./building-data");
const { BuildingDataNotice } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/building-data-notice");
const { sharedFake } = await import("@/test/fake-orm");
const { updateScheme } = await import("@/lib/queries/schemes");

const NSW = statutoryRulesFor("NSW");
const QLD = PENDING_RULE_PACKS.QLD.rules as unknown as typeof NSW;

const lots = (n: number, interest: number | null) => Array.from({ length: n }, (_, i) => ({ lotNumber: String(i + 1), entitlement: 10, interestScheduleEntitlement: interest, lotType: "RESIDENTIAL", occupiable: null }));
const SCHEMES = {
  nothing: { regulationModule: null, planFormat: null },
  standard: { regulationModule: "STANDARD", planFormat: "BUILDING" },
  unsupportedModule: { regulationModule: "COMMERCIAL", planFormat: "VOLUMETRIC" },
  standardFormat: { regulationModule: "STANDARD", planFormat: "STANDARD" },
  unknown: { regulationModule: "NSW", planFormat: "X" },
};
const LOTS = { none: [], oneMissing: [...lots(2, 5), { ...lots(1, null)[0], lotNumber: "3" }], allMissing: lots(12, null), complete: lots(3, 7) };

describe.each([
  ["NSW", NSW],
  ["QLD", QLD],
] as const)("%s building data missing", (_code, rules) => {
  for (const [schemeName, scheme] of Object.entries(SCHEMES)) {
    for (const [lotsName, lotRows] of Object.entries(LOTS)) {
      it(`${schemeName}, lots ${lotsName}`, () => {
        const problems = buildingDataProblems(rules, { ...scheme, totalLots: lotRows.length, servicesOnly: null, replacementCost: null }, lotRows);
        expect({ problems, html: renderToStaticMarkup(<BuildingDataNotice problems={problems} />) }).toMatchSnapshot();
      });
    }
  }
});

describe("NSW and Queensland rows after updateScheme", () => {
  it.each([
    ["QLD to NSW", { id: "s", state: "QLD", postcode: "4000", timeZone: "Australia/Brisbane", regulationModule: "STANDARD", planFormat: "BUILDING" }, { state: "NSW", postcode: "2000" }],
    ["QLD, same state", { id: "s", state: "QLD", postcode: "4000", timeZone: "Australia/Brisbane", regulationModule: "STANDARD", planFormat: "BUILDING" }, { state: "QLD", postcode: "4870", name: "Kept" }],
    ["NSW to QLD", { id: "s", state: "NSW", postcode: "2000", timeZone: "Australia/Sydney" }, { state: "QLD", postcode: "4000" }],
    ["NSW postcode", { id: "s", state: "NSW", postcode: "2000", timeZone: "Australia/Sydney" }, { state: "NSW", postcode: "2880", name: "New" }],
    ["NSW name only", { id: "s", state: "NSW", postcode: "2000", timeZone: "Australia/Sydney" }, { name: "New" }],
  ])("%s", async (_name, row, data) => {
    sharedFake.reset({ Scheme: [row], Lot: [{ id: "l", schemeId: "s", lotNumber: "1", interestScheduleEntitlement: 4 }] });
    await updateScheme("s", data);
    expect({ scheme: sharedFake.table("Scheme"), lots: sharedFake.table("Lot") }).toMatchSnapshot();
  });
});
