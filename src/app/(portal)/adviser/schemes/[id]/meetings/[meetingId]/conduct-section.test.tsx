/**
 * The conduct section with vote recording (QLD stage 2, resolution tallies,
 * 27 Oct 2026). With no voting view (NSW) it renders exactly as before; with
 * one (Queensland) each item offers a vote for every lot, a proxy box where a
 * proxy may vote and a poll where one may be asked for.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QLD_RULE_PACK, type StatutoryRules } from "@/config/statutory";
import { conductVotingView } from "@/lib/meetings/conduct-tally";

vi.mock("./conduct-actions", () => ({
  startMeetingAction: vi.fn(),
  finishMeetingAction: vi.fn(),
  recordAgendaOutcomeAction: vi.fn(),
}));

const { ConductSection } = await import("./conduct-section");

const QLD_RULES = QLD_RULE_PACK.rules as unknown as StatutoryRules;
const items = [
  { id: "i1", position: 1, title: "Adopt the budget", outcome: null },
  { id: "i2", position: 2, title: "Approve the new by-law", outcome: null },
  { id: "i3", position: 3, title: "Election of the committee", outcome: null },
];
const props = { schemeId: "s1", meetingId: "m1", status: "IN_PROGRESS", openedAt: "2026-11-20T08:00:00.000Z", closedAt: null, items, timeZone: "Australia/Brisbane" };

describe("the conduct section", () => {
  it("is unchanged with no voting view", () => {
    expect(renderToStaticMarkup(<ConductSection {...props} voting={null} />)).toBe(renderToStaticMarkup(<ConductSection {...props} />));
  });

  it("offers each lot's vote for a Queensland building, with a poll and proxies only where allowed", () => {
    const voting = conductVotingView(
      QLD_RULES.MEETING_RULES,
      QLD_RULES,
      [{ id: "l2", lotNumber: "2" }, { id: "l1", lotNumber: "1" }],
      [
        { id: "i1", resolutionCategory: "ORDINARY" },
        { id: "i2", resolutionCategory: "MAJORITY" },
        { id: "i3", resolutionCategory: null },
      ],
      "AGM",
    );
    const html = renderToStaticMarkup(<ConductSection {...props} voting={voting} />);
    expect(html.match(/Votes \(0 of 2 lots recorded\)/g)).toHaveLength(3);
    expect(html.match(/aria-label="Vote for lot 1"/g)).toHaveLength(3);
    // The poll only on the ordinary resolution.
    expect(html.match(/Poll asked for, counted by contribution schedule lot entitlement/g)).toHaveLength(1);
    // No proxy box on the majority resolution: two items with two lots each.
    expect(html.match(/>Proxy</g)).toHaveLength(4);
    // The new words: no dashes or semicolons (tags and entities set aside).
    expect(html.replace(/<[^>]+>/g, " ").replace(/&[#\w]+;/g, "")).not.toMatch(/[;–—]/);
    // Lot 1 is listed before lot 2.
    expect(html.indexOf("Vote for lot 1")).toBeLessThan(html.indexOf("Vote for lot 2"));
  });

  it("does not offer votes at a Queensland committee meeting", () => {
    const voting = conductVotingView(QLD_RULES.MEETING_RULES, QLD_RULES, [{ id: "l1", lotNumber: "1" }], [{ id: "i1", resolutionCategory: "ORDINARY" }], "COMMITTEE");
    expect(voting).toBeNull();
    expect(renderToStaticMarkup(<ConductSection {...props} voting={voting} />)).toBe(renderToStaticMarkup(<ConductSection {...props} />));
  });

  it("does not offer votes once the meeting has finished", () => {
    const voting = conductVotingView(QLD_RULES.MEETING_RULES, QLD_RULES, [{ id: "l1", lotNumber: "1" }], [{ id: "i1", resolutionCategory: "ORDINARY" }], "AGM");
    const html = renderToStaticMarkup(<ConductSection {...props} status="MINUTES_DRAFT" closedAt="2026-11-20T09:00:00.000Z" voting={voting} />);
    expect(html).not.toContain("Vote for lot 1");
  });
});
