/**
 * The lot form and the regulation module setting (QLD stage 2, step 10): an
 * NSW lot form is unchanged, and a Queensland one names both schedules from
 * the pack and asks for the interest schedule lot entitlement.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PENDING_RULE_PACKS, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import { regulationModuleChoices, separateEntitlement } from "@/lib/jurisdiction/building-data";
import { lotFormEntitlementWords } from "@/lib/jurisdiction/screen-words";

vi.mock("./actions", () => ({ createLotAction: vi.fn(), updateLotAction: vi.fn() }));
vi.mock("../../actions", () => ({ saveRegulationModuleAction: vi.fn() }));

const { LotForm } = await import("./lot-form");
const { RegulationModuleForm } = await import("../regulation-module-form");

const NSW = statutoryRulesFor("NSW");
const QLD = PENDING_RULE_PACKS.QLD.rules as unknown as StatutoryRules;
const defaults = { lotNumber: "3", unitNumber: "12", entitlement: 50, floorArea: null, lotType: "RESIDENTIAL" };

describe("the lot form", () => {
  it("is the same for an NSW building with the pack's words as without them", () => {
    // The words the form showed before it took them from the pack.
    const before = renderToStaticMarkup(<LotForm mode="edit" schemeId="s1" lotId="l1" defaults={defaults} entitlementWords={{ label: "Unit Entitlement", help: null }} />);
    const after = renderToStaticMarkup(
      <LotForm mode="edit" schemeId="s1" lotId="l1" defaults={defaults} entitlementWords={lotFormEntitlementWords(NSW)} separate={separateEntitlement(NSW)} />,
    );
    expect(after).toBe(before);
    expect(after).toContain(">Unit Entitlement<");
    expect(after).toContain("Lot entitlement within the scheme");
    expect(after).not.toContain("interestScheduleEntitlement");
  });

  it("names both Queensland schedules and asks for the interest schedule on a new lot", () => {
    const html = renderToStaticMarkup(<LotForm mode="create" schemeId="s1" entitlementWords={lotFormEntitlementWords(QLD)} separate={separateEntitlement(QLD)} />);
    expect(html).toContain(">Contribution Schedule Lot Entitlement<");
    expect(html).toContain(">Interest Schedule Lot Entitlement<");
    expect(html).toContain("From the interest schedule in the community management statement. A whole number, not 0.");
    expect(html).toMatch(/<input id="interestScheduleEntitlement"[^>]*required=""/);
    expect(html).not.toContain(">Unit Entitlement<");
  });

  it("shows a Queensland lot's interest schedule entitlement, locked for the adviser", () => {
    const html = renderToStaticMarkup(
      <LotForm mode="edit" schemeId="s1" lotId="l1" lockStructure defaults={{ ...defaults, interestScheduleEntitlement: 45 }} entitlementWords={lotFormEntitlementWords(QLD)} separate={separateEntitlement(QLD)} />,
    );
    expect(html).toMatch(/<input id="interestScheduleEntitlement"[^>]*readOnly=""[^>]*name="interestScheduleEntitlement" value="45"/);
    // Not required on an existing lot: one saved without it stays flagged.
    expect(html).not.toMatch(/<input id="interestScheduleEntitlement"[^>]*required=""/);
  });
});

describe("the regulation module setting", () => {
  it("offers the Standard Module and lists the others as not available", () => {
    const html = renderToStaticMarkup(<RegulationModuleForm schemeId="s1" choices={regulationModuleChoices(QLD)!} current={null} />);
    expect(html).toContain(QLD.REGULATION_MODULE!.help.replace(/'/g, "&#x27;"));
    expect(html).toContain('<option value="STANDARD">Standard Module</option>');
    expect(html).toContain('<option value="COMMERCIAL" disabled="">Commercial Module (not available yet)</option>');
  });

  it("is not offered for NSW", () => {
    expect(regulationModuleChoices(NSW)).toBeNull();
  });
});
