/**
 * The Building rules section (VIC, ACT and WA stage 2, PR 2): shown only for
 * a pack with building selectors, with the pack's labels, help and options.
 * Recorded selectors and facts can be chosen. Derived values are read only,
 * with the facts they came from or what is missing. The client file takes no
 * pack values.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PENDING_RULE_PACKS, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import { buildingRulesView } from "@/lib/jurisdiction/building-selectors";

vi.mock("../actions", () => ({ saveBuildingRulesAction: vi.fn() }));

const { BuildingRulesForm } = await import("./building-rules-form");

const WA = PENDING_RULE_PACKS.WA.rules as unknown as StatutoryRules;
const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as StatutoryRules;
const esc = (s: string) => s.replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const lots = (n: number, occupiable: boolean | null = null) => Array.from({ length: n }, (_, i) => ({ id: `lot-${i + 1}`, lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable }));

describe("the Building rules section", () => {
  it("has nothing to show for an NSW or Queensland building", () => {
    const building = { scheme: { totalLots: 1 }, lots: lots(1), recorded: {} };
    expect(buildingRulesView(statutoryRulesFor("NSW"), building)).toBeNull();
    expect(buildingRulesView(PENDING_RULE_PACKS.QLD.rules as unknown as StatutoryRules, building)).toBeNull();
  });

  it("offers a Western Australian building's recorded selectors and the replacement cost from the pack", () => {
    const view = buildingRulesView(WA, { scheme: { totalLots: 4, replacementCost: "4500000.00" }, lots: lots(4), recorded: { tenure: "LEASEHOLD" } })!;
    const html = renderToStaticMarkup(<BuildingRulesForm schemeId="s1" view={view} />);
    expect(html).toContain(">Building rules<");
    expect(html).toContain('name="selector:schemeType"');
    expect(html).toContain('<option value="SURVEY_STRATA">Survey-strata scheme (not supported yet)</option>');
    expect(html).toContain(esc(WA.BUILDING_SELECTORS!.find((s) => s.key === "tenure")!.help));
    // The note on a recorded option not supported yet.
    expect(html).toContain("Researched at headline level only.");
    expect(html).toContain('name="replacementCost"');
    expect(html).toContain('value="4500000.00"');
    // No Victorian facts.
    expect(html).not.toContain('name="servicesOnly"');
    expect(html).not.toContain("occupiable:");
    // Derived values, read only, with the facts they came from or what is missing.
    expect(html).not.toContain('name="selector:schemeSize"');
    expect(html).not.toContain('name="selector:designatedStrataCompany"');
    expect(html).toContain("3, 4 or 5-lot scheme");
    expect(html).toContain("From: Lots: 4");
    expect(html).toContain(esc("The designated strata company cannot be worked out because no scheme type is recorded. Record what is missing in the building rules."));
  });

  it("asks a Victorian building for services only and each lot's occupiable answer, and shows the tier", () => {
    const view = buildingRulesView(VIC, { scheme: { totalLots: 12, servicesOnly: false }, lots: lots(12, true), recorded: { ownersCorporationType: "UNLIMITED", severalOwnersCorporations: "NO" } })!;
    const html = renderToStaticMarkup(<BuildingRulesForm schemeId="s1" view={view} />);
    expect(html).toContain('name="servicesOnly"');
    expect(html).toContain('<option value="NO" selected="">Not services only</option>');
    expect(html).toContain('name="occupiable:lot-12"');
    expect(html).toContain(">Tier 3<");
    expect(html).toContain(
      "From: Owners corporations on the plan: This is the only owners corporation on the plan, Services only owners corporation: Not services only, Occupiable lots: 12, Not occupiable lots: 0",
    );
    expect(html).toContain("Lot 12");
  });

  it("is a client file that takes no pack values", () => {
    const t = readFileSync(join(__dirname, "building-rules-form.tsx"), "utf8");
    expect(t.startsWith('"use client"')).toBe(true);
    for (const m of t.matchAll(/from "(@\/config\/statutory[^"]*)"/g)) expect(m[1]).toBe("@/config/statutory/need-rule");
    expect(t).toMatch(/import type \{ BuildingRulesView \} from "@\/lib\/jurisdiction\/building-selectors"/);
  });
});
