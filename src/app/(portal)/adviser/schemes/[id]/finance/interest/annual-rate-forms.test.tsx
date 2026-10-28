/**
 * The interest page's forms for an annual-rate pack (VIC, ACT and WA stage 2,
 * PR 5): the yearly rate field with the pack's range, and the one-case
 * waiver form where the pack gives one.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions", () => ({ saveInterestSettingAction: vi.fn(), recordLateChargeWaiverAction: vi.fn() }));

const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const { lateChargeWaiverWords, lateChargeWords } = await import("@/lib/jurisdiction/wording");
const { InterestSettingForm } = await import("./interest-setting-form");
const { LateChargeWaiverForm } = await import("./late-charge-waiver-form");

const meetings = [{ id: "agm", label: "AGM 2026 (15 Feb 2026)", motions: [{ id: "m1", label: "1. Interest" }] }];

describe("the yearly rate field", () => {
  it("ACT: offers the special resolution rate from 0% to 20%, with the recorded rate", () => {
    const rules = PENDING_RULE_PACKS.ACT.rules;
    const setting = { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 12.5 };
    const html = renderToStaticMarkup(
      <InterestSettingForm schemeId="s" mode={setting.mode} monthlyRatePercent={null} annualRatePercent={12.5} meetingId="agm" motionId="m1" meetings={meetings} words={lateChargeWords(rules as never, setting)} />,
    );
    expect(html).toContain('name="annualRatePercent"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="20"');
    expect(html).toContain('value="12.5"');
    expect(html).toContain("Interest at a yearly rate set by special resolution, from 0% to 20% a year");
    expect(html).not.toContain('name="monthlyRatePercent"');
  });

  it("VIC: the field is shown but cannot be used while the cap is not confirmed", () => {
    const rules = PENDING_RULE_PACKS.VIC.rules;
    const html = renderToStaticMarkup(
      <InterestSettingForm schemeId="s" mode="RESOLVED_ANNUAL_RATE" monthlyRatePercent={null} meetingId={null} motionId={null} meetings={meetings} words={lateChargeWords(rules as never, { mode: "RESOLVED_ANNUAL_RATE" })} />,
    );
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*name="annualRatePercent"/);
    expect(html).toContain("No rate can be recorded yet.");
  });
});

describe("the waiver form", () => {
  it("VIC: asks for the notice, what is waived, the meeting, the motion and the reasons, and lists recorded waivers", () => {
    const words = lateChargeWaiverWords(PENDING_RULE_PACKS.VIC.rules as never)!;
    const html = renderToStaticMarkup(
      <LateChargeWaiverForm
        schemeId="s"
        notices={[{ id: "n1", label: "F-1, lot 1" }]}
        meetings={meetings}
        waivers={[{ id: "w1", notice: "F-2", what: "Interest waived in full", decidedOn: "15 Feb 2026", reasons: "Hardship" }]}
        words={words}
      />,
    );
    for (const name of ["levyNoticeId", "kind", "meetingId", "motionId", "reasons"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain("All the interest on the notice");
    expect(html).toContain("F-2: Interest waived in full, decided 15 Feb 2026. Reasons: Hardship");
    expect(html).toContain("Record waiver");
  });

  it("WA: says why no waiver can be recorded, with no form", () => {
    const words = lateChargeWaiverWords(PENDING_RULE_PACKS.WA.rules as never)!;
    const html = renderToStaticMarkup(<LateChargeWaiverForm schemeId="s" notices={[]} meetings={meetings} waivers={[]} words={words} />);
    expect(html).toContain("Who may waive interest is not confirmed for this building&#x27;s rules yet, so no waiver can be recorded.");
    expect(html).not.toContain("<form");
  });
});
