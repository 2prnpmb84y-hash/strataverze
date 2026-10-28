import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";
import { FundsCard } from "./funds-card";

const NSW = statutoryRulesFor("NSW").FUND_CATALOGUE;
const QLD = QLD_RULE_PACK.rules.FUND_CATALOGUE;

const funds = [
  { id: "a", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 100 },
  { id: "c", name: "Capital Works Fund", fundType: "CAPITAL_WORKS", balance: 200 },
  { id: "l", name: "Old sinking fund", fundType: "SINKING", balance: 0 },
  { id: "s", name: "Roof levy", fundType: "SPECIAL", balance: 0 },
];

describe("FundsCard fund types", () => {
  it("shows each fund's type as the pack names it, not the stored code", () => {
    const html = renderToStaticMarkup(<FundsCard id="s1" funds={funds} catalogue={NSW} />);
    expect(html).not.toContain(">ADMINISTRATIVE<");
    expect(html).not.toContain(">CAPITAL_WORKS<");
    expect(html).toContain(">Administrative Fund</p><p class=\"text-xs text-ink-muted\">Administrative Fund<");
    expect(html).toContain("text-ink-muted\">Capital Works Fund<");
    // Legacy types keep the labels they have always had.
    expect(html).toContain("text-ink-muted\">Capital Works<");
    expect(html).toContain("text-ink-muted\">SPECIAL<");
  });

  it("names the Queensland sinking fund", () => {
    const html = renderToStaticMarkup(<FundsCard id="s1" funds={funds.slice(1, 2)} catalogue={QLD} />);
    expect(html).toContain("text-ink-muted\">Sinking Fund<");
  });

  it("names the funds to set up from the pack", () => {
    expect(renderToStaticMarkup(<FundsCard id="s1" funds={[]} catalogue={NSW} />)).toContain("Set up administrative and capital works funds for this scheme.");
    expect(renderToStaticMarkup(<FundsCard id="s1" funds={[]} catalogue={QLD} />)).toContain("Set up administrative and sinking funds for this scheme.");
  });
});
