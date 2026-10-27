import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";
import { noticeTimingWords } from "@/lib/jurisdiction/wording";

vi.mock("../../actions", () => ({
  approveLevyScheduleAction: vi.fn(),
  issueOverdueNoticesAction: vi.fn(),
  issueScheduleNoticesAction: vi.fn(),
  stopPlannedNoticesAction: vi.fn(),
  recordLevyPaymentFormAction: vi.fn(),
}));
const { IssueNoticesForm } = await import("./schedule-actions");

const form = (timing: ReturnType<typeof noticeTimingWords>) =>
  renderToStaticMarkup(<IssueNoticesForm schemeId="s1" scheduleId="sp1" isSpecial noticeCount={2} blocked={false} timing={timing} />);

describe("the urgent special levy option (stage 2, step 5)", () => {
  it("is offered with the pack's shorter notice", () => {
    const html = form(noticeTimingWords(statutoryRulesFor("NSW").NOTICE_RULES));
    expect(html).toContain('name="urgentSpecialLevy"');
    expect(html).toContain("The minimum notice to pay is 14 days instead of 30.");
  });

  it("is not offered where the pack has no shorter notice", () => {
    const html = form(noticeTimingWords(PENDING_RULE_PACKS.QLD.rules.NOTICE_RULES));
    expect(html).not.toContain("urgentSpecialLevy");
    expect(html).toContain("Issue 2 notices");
  });
});
