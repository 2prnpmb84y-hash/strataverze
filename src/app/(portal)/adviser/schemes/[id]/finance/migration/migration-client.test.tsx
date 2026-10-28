/**
 * The data migration page's lot import, with the props its server page
 * derives from each pack (#122 words, stage 2 PR 4 headings): NSW keeps its
 * words ("unit entitlements", "Entitlement") and Victoria names lot
 * liability and lot entitlement, each matched to its own column. The
 * Victorian description takes a proper plural ("lot liabilities").
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ processMigrationAction: vi.fn(), validateMigrationAction: vi.fn() }));

const { MigrationClient } = await import("./migration-client");
const { PENDING_RULE_PACKS, statutoryRulesFor } = await import("@/config/statutory");
const { onLotImportHeading, onLotSchedule, separateEntitlement } = await import("@/lib/jurisdiction/building-data");
type Rules = import("@/config/statutory").StatutoryRules;

/** The props the server page passes for a building under `rules`. */
function propsFor(rules: Rules) {
  const separate = separateEntitlement(rules);
  return {
    schemeId: "s1",
    schemeName: "Harbour View",
    separateEntitlement: separate?.field ? { field: separate.field, label: separate.label } : null,
    onLotEntitlement: onLotImportHeading(rules),
    entitlement: onLotSchedule(rules).name,
  };
}

async function mapping(rules: Rules, csv: string) {
  cleanup();
  render(<MigrationClient {...propsFor(rules)} />);
  fireEvent.click(screen.getByText("Strata Master"));
  const description = screen.getByText(/^Import lot numbers/).textContent;
  fireEvent.click(screen.getByText("Lots & Units"));
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([csv], "lots.csv", { type: "text/csv" })] } });
  await waitFor(() => expect(document.querySelectorAll("select").length).toBeGreaterThan(0));
  return { description, text: document.body.textContent ?? "" };
}

describe("the lot import on the data migration page", () => {
  it("keeps NSW's words and labels", async () => {
    const { description, text } = await mapping(statutoryRulesFor("NSW"), "Lot Number,Unit Number,Entitlement\n1,101,25\n");
    expect(description).toBe("Import lot numbers, unit entitlements, floor areas and lot types from the source system.");
    expect(text).toContain("Entitlement");
    expect(text).not.toMatch(/Lot Liability|Lot Entitlement|Interest Schedule/);
  });

  it("names Victoria's lot liability and lot entitlement, each from its own column", async () => {
    const vic = PENDING_RULE_PACKS.VIC.rules as unknown as Rules;
    const { description, text } = await mapping(vic, "Lot Number,Lot Entitlement,Lot Liability\n1,60,1\n");
    expect(description).toBe("Import lot numbers, lot liabilities, floor areas and lot types from the source system.");
    expect(text).toContain("Lot Liability");
    expect(text).toContain("Lot Entitlement");
    const selects = [...document.querySelectorAll("select")] as HTMLSelectElement[];
    expect(selects.map((s) => s.value).filter(Boolean).sort()).toEqual(["Lot Entitlement", "Lot Liability", "Lot Number"]);
  });
});
