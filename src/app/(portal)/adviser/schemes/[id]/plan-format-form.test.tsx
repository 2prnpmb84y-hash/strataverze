/**
 * The plan format setting (QLD go-live gap, insurance in contributions): shown
 * only where the building's pack has PLAN_FORMAT, with the pack's label, help
 * and options, every format recordable and the standard format marked.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PENDING_RULE_PACKS, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import { planFormatChoices } from "@/lib/jurisdiction/building-data";

vi.mock("../actions", () => ({ savePlanFormatAction: vi.fn() }));

const { PlanFormatForm } = await import("./plan-format-form");

const QLD = PENDING_RULE_PACKS.QLD.rules as unknown as StatutoryRules;

describe("the plan format setting", () => {
  it("has nothing to show for an NSW building", () => {
    expect(planFormatChoices(statutoryRulesFor("NSW"))).toBeNull();
  });

  it("offers every Queensland plan format from the pack, the standard format marked as not supported yet", () => {
    const html = renderToStaticMarkup(<PlanFormatForm schemeId="s1" choices={planFormatChoices(QLD)!} current={null} />);
    expect(html).toContain(">Plan format<");
    expect(html).toContain(QLD.PLAN_FORMAT!.help.replace(/'/g, "&#x27;"));
    expect(html).toContain('<option value="BUILDING">Building format plan</option>');
    expect(html).toContain('<option value="VOLUMETRIC">Volumetric format plan</option>');
    expect(html).toContain('<option value="STANDARD">Standard format plan (not supported yet)</option>');
    expect(html).not.toMatch(/<option value="(BUILDING|VOLUMETRIC|STANDARD)"[^>]*disabled/);
    expect(html).not.toContain("does not work out yet");
  });

  it("says why a recorded standard format plan holds insurance contributions back", () => {
    const html = renderToStaticMarkup(<PlanFormatForm schemeId="s1" choices={planFormatChoices(QLD)!} current="STANDARD" />);
    expect(html).toContain("which StrataVerze does not work out yet. Contributions that include insurance cannot be raised for it until then.");
    expect(renderToStaticMarkup(<PlanFormatForm schemeId="s1" choices={planFormatChoices(QLD)!} current="BUILDING" />)).not.toContain("does not work out yet");
  });
});
