import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";
import { noticeTimingWords } from "@/lib/jurisdiction/wording";

vi.mock("../../actions", () => ({
  approveLevyScheduleAction: vi.fn(),
  issueOverdueNoticesAction: vi.fn(),
  issueScheduleNoticesAction: vi.fn(),
  stopPlannedNoticesAction: vi.fn(),
  recordLevyPaymentFormAction: vi.fn(),
}));
const { IssueNoticesForm, OverdueNoticesForm } = await import("./schedule-actions");

const form = (timing: ReturnType<typeof noticeTimingWords>, levyWords = { levy: "levy", levies: "levies" }) =>
  renderToStaticMarkup(<IssueNoticesForm schemeId="s1" scheduleId="sp1" isSpecial noticeCount={2} blocked={false} timing={timing} levyWords={levyWords} />);

describe("the urgent special levy option (stage 2, step 5)", () => {
  it("is offered with the pack's shorter notice", () => {
    const html = form(noticeTimingWords(statutoryRulesFor("NSW").NOTICE_RULES));
    expect(html).toContain('name="urgentSpecialLevy"');
    expect(html).toContain("The minimum notice to pay is 14 days instead of 30.");
    expect(html).toContain("This is an urgent special levy for emergency repairs.");
  });

  it("is not offered where the pack has no shorter notice", () => {
    const html = form(noticeTimingWords(QLD_RULE_PACK.rules.NOTICE_RULES), { levy: "contribution", levies: "contributions" });
    expect(html).not.toContain("urgentSpecialLevy");
    expect(html).toContain("Issue 2 notices");
  });
});

describe("the confirmations with checked notice rules (stage 2, PR 6a)", () => {
  // Plain timing words, as the page passes them (never a pack value in this client component).
  const timing = (extra: Partial<ReturnType<typeof noticeTimingWords>>) => ({ lead: "4 weeks", mark: "4-week mark", minimumDays: 14, urgentDays: null, ...extra });
  const overdue = (t: ReturnType<typeof noticeTimingWords>) => renderToStaticMarkup(<OverdueNoticesForm schemeId="s1" scheduleId="sc1" count={2} timing={t} />);

  it("names a StrataVerze minimum as StrataVerze's, not the law's", () => {
    const t = timing({ maximumDays: 28, minimumIsStatutory: false, dueDateMayMove: true });
    expect(overdue(t)).toContain("fall due 14 days from today instead, the StrataVerze minimum.");
    expect(overdue(t)).toContain("never less than the StrataVerze minimum of 14 days");
    expect(overdue(t)).not.toContain("statutory");
  });

  it("says a notice whose due date cannot move cannot go out", () => {
    const html = overdue(timing({ maximumDays: null, minimumIsStatutory: false, dueDateMayMove: false, lead: "5 weeks", mark: "5-week mark" }));
    expect(html).toContain("Any with fewer than 14 days left cannot go out, because this building&#x27;s rules do not let their due date move.");
    expect(html).not.toContain("fall due");
  });

  it("keeps the statutory words where the minimum is the law's", () => {
    expect(overdue(timing({ minimumDays: 28, maximumDays: null, minimumIsStatutory: true, dueDateMayMove: true }))).toContain("the statutory minimum.");
  });
});
