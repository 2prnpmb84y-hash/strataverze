/**
 * Queensland conduct screen markup, golden (VIC, ACT and WA stage 2, PR
 * 8a-ii-b, 29 Oct 2026). Recorded on origin/main (5ed1d29) in a temporary
 * worktree, before the quorum and units present questions were added to the
 * conduct screen. Queensland (and NSW, with no voting view) must render
 * exactly the same markup after that change. Never regenerate this snapshot
 * to make a change pass: a difference is a change to the Queensland screen.
 *
 * The voting props are literal objects, not conductVotingView, so the golden
 * does not depend on how the view is built (for example which lot rows it
 * leaves out). Covered: a poll allowed item, a proxies barred item and an
 * item the view does not know, for each status the section shows, with the
 * voting view given, null and left out.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./conduct-actions", () => ({
  startMeetingAction: vi.fn(),
  finishMeetingAction: vi.fn(),
  recordAgendaOutcomeAction: vi.fn(),
}));

const { ConductSection } = await import("./conduct-section");

const ITEMS = [
  { id: "i1", position: 1, title: "Adopt the budget", outcome: null },
  { id: "i2", position: 2, title: "Approve the new by-law", outcome: "RESOLVED" },
  { id: "i3", position: 3, title: "Election of the committee", outcome: "DEFERRED" },
];

// As the server page passes it for a Queensland general meeting: lots only, no common property row.
const QLD_VOTING = {
  lots: [
    { id: "l1", lotNumber: "1" },
    { id: "l2", lotNumber: "2" },
    { id: "l10", lotNumber: "10" },
  ],
  items: {
    // An ordinary resolution: a poll may be asked for, a proxy may vote.
    i1: { pollAllowed: true, proxiesAllowed: true },
    // A majority resolution: no poll, proxies barred.
    i2: { pollAllowed: false, proxiesAllowed: false },
    // i3 is left out: the screen falls back to no poll, proxies allowed.
  },
  pollLabel: "Poll asked for, counted by contribution schedule lot entitlement",
};

function render(status: string, voting: typeof QLD_VOTING | null | undefined) {
  return renderToStaticMarkup(
    <ConductSection
      schemeId="s1"
      meetingId="m1"
      status={status}
      openedAt={status === "NOTICE_ISSUED" ? null : "2026-11-20T08:00:00.000Z"}
      closedAt={status === "MINUTES_DRAFT" || status === "PUBLISHED" ? "2026-11-20T09:30:00.000Z" : null}
      items={ITEMS}
      timeZone="Australia/Brisbane"
      voting={voting}
    />,
  );
}

describe("Queensland conduct section (golden)", () => {
  it("renders as before", () => {
    const html: Record<string, string> = {};
    for (const status of ["NOTICE_ISSUED", "IN_PROGRESS", "MINUTES_DRAFT", "PUBLISHED"]) {
      html[`${status}/voting`] = render(status, QLD_VOTING);
      html[`${status}/null`] = render(status, null);
      html[`${status}/undefined`] = render(status, undefined);
    }
    expect(html).toMatchSnapshot();
  });
});
