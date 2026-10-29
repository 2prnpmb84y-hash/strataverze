/**
 * Western Australia's voting period on the screens (VIC, ACT and WA stage 2,
 * PR 8b-ii, 29 Oct 2026): the conduct screen offers "Record the votes"
 * (sent as Resolved) and Deferred for an item whose vote stays open, with the
 * pack's words from the server, and nothing else changes for any other item;
 * an open item shows "Voting open" and offers nothing more; the "Decided
 * later" panel asks the outcome notice's day in the server's words and
 * records a written vote for a lot, For or Against, with the day received.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import { conductVotingView } from "@/lib/meetings/conduct-tally";

const record = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }));
const actions = vi.hoisted(() => ({
  recordPendingNoticeAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
  recordPendingPetitionAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
  recordSpecialMeetingNoticeAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
  recordPendingConfirmationAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
  recordLateVoteAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
}));

vi.mock("./conduct-actions", () => ({ startMeetingAction: vi.fn(), finishMeetingAction: vi.fn(), recordAgendaOutcomeAction: record }));
vi.mock("./pending-actions", () => actions);

const { ConductSection } = await import("./conduct-section");
const { PendingSection } = await import("./pending-section");

const WA_RULES = PENDING_RULE_PACKS.WA.rules as unknown as StatutoryRules;
const WA = WA_RULES.MEETING_RULES;
const VP = WA.pendingResolutions!.VOTING_PERIOD!;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[#\w]+;/g, "");
const itemRow = (title: string) => screen.getByText(title).closest("li") as HTMLElement;

beforeEach(() => {
  record.mockClear();
  for (const f of Object.values(actions)) f.mockClear();
});
afterEach(cleanup);

describe("the conduct screen", () => {
  const LOTS = [
    { id: "l1", lotNumber: "1" },
    { id: "l2", lotNumber: "2" },
  ];
  const ITEMS = [
    { id: "s", position: 1, title: "New by-law", outcome: null },
    { id: "o", position: 2, title: "Adopt the budget", outcome: null },
  ];
  const voting = conductVotingView(WA, WA_RULES, LOTS, [{ id: "s", resolutionCategory: "SPECIAL" }, { id: "o", resolutionCategory: "ORDINARY" }], "AGM");
  const BASE = { schemeId: "s1", meetingId: "m1", status: "IN_PROGRESS", openedAt: "2026-11-02T02:00:00.000Z", closedAt: null, timeZone: "Australia/Perth", items: ITEMS, voting };

  it("offers Record the votes and Deferred for an item with a voting period, with the pack's words, and the usual three elsewhere", () => {
    render(<ConductSection {...BASE} />);
    const open = itemRow("New by-law");
    expect(within(open).getAllByRole("button").map((b) => b.textContent)).toEqual(["Record the votes", "Deferred"]);
    expect(within(open).getByText(VP.conductHelp!)).toBeTruthy();
    // Its votes are still recorded lot by lot.
    expect(within(open).getByLabelText("Vote for lot 1")).toBeTruthy();
    const ordinary = itemRow("Adopt the budget");
    expect(within(ordinary).getAllByRole("button").map((b) => b.textContent)).toEqual(["Resolved", "Motion lost", "Deferred"]);
    expect(within(ordinary).queryByText(VP.conductHelp!)).toBeNull();
    expect(text(renderToStaticMarkup(<ConductSection {...BASE} />))).not.toMatch(/[;–—]/);
  });

  it("sends Record the votes as Resolved with the votes, and Deferred as Deferred", async () => {
    render(<ConductSection {...BASE} />);
    const open = itemRow("New by-law");
    fireEvent.change(within(open).getByLabelText("Vote for lot 1"), { target: { value: "FOR" } });
    fireEvent.click(within(open).getByRole("button", { name: "Record the votes" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0].slice(0, 6)).toEqual(["s1", "m1", "s", "RESOLVED", [{ lotId: "l1", vote: "FOR", byProxy: false }], false]);
    const deferred = within(open).getByRole("button", { name: "Deferred" }) as HTMLButtonElement;
    await waitFor(() => expect(deferred.disabled).toBe(false));
    fireEvent.click(deferred);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    expect(record.mock.calls[1][3]).toBe("DEFERRED");
  });

  it("shows an open item as Voting open, offering nothing more, and nothing once the meeting is finished", () => {
    const html = renderToStaticMarkup(
      <ConductSection {...BASE} items={[{ ...ITEMS[0], outcome: "OPEN" }]} outcomeLabels={{ INTERIM: "Decided later", OPEN: "Voting open" }} />,
    );
    expect(text(html)).toContain("Voting open");
    expect(html).not.toContain("Record the votes");
    expect(html).not.toContain(VP.conductHelp!);
    expect(html).not.toContain("Vote for lot 1");
    const finished = renderToStaticMarkup(<ConductSection {...BASE} status="MINUTES_DRAFT" closedAt="2026-11-02T04:00:00.000Z" />);
    expect(finished).not.toContain("Record the votes");
    expect(finished).not.toContain(VP.conductHelp!);
  });
});

describe("the Decided later panel", () => {
  const item = {
    id: "p1",
    itemId: "i1",
    itemLabel: "1. New by-law",
    kindLabel: VP.label,
    help: VP.help,
    status: "PENDING" as const,
    standing: "Voting is open until 30 November 2026.",
    facts: ["Made on 2 November 2026.", "Votes at the meeting: 4 for, 1 against."],
    blocker: null,
    canRecordNotice: true,
    petitionWords: null,
    meetingNoticeWords: null,
    canConfirm: false,
    madeOn: "2026-11-02",
    windowClosesOn: "2026-11-30",
    today: "2026-11-20",
    confirmChoices: [],
    noticeLabel: VP.lateVotes!.noticeLabel,
    lateVote: { words: VP.lateVotes!.words, lots: [{ id: "l7", lotNumber: "7" }, { id: "l8", lotNumber: "8" }] },
  };
  const props = { schemeId: "s1", meetingId: "m1", lots: [], specialMeetings: [] };

  it("asks the outcome notice's day in the server's words and records it", async () => {
    render(<PendingSection {...props} items={[item]} />);
    expect(screen.queryByLabelText("Day the owners were given notice of it")).toBeNull();
    fireEvent.change(screen.getByLabelText(VP.lateVotes!.noticeLabel), { target: { value: "2026-11-04" } });
    fireEvent.click(screen.getByRole("button", { name: "Record the notice" }));
    await waitFor(() => expect(actions.recordPendingNoticeAction).toHaveBeenCalledWith("s1", "m1", "p1", "2026-11-04"));
  });

  it("records a written vote for a lot that may vote, For or Against, with the day received, and shows a refusal", async () => {
    actions.recordLateVoteAction.mockResolvedValueOnce({ error: "A written vote for lot 8 is already recorded. Each lot votes once. Nothing was saved." });
    render(<PendingSection {...props} items={[item]} />);
    const row = itemRow("1. New by-law");
    const written = within(row).getByRole("group", { name: "Written vote" });
    expect(within(written).getByText(VP.lateVotes!.words)).toBeTruthy();
    expect(within(written).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose the lot", "Lot 7", "Lot 8", "Choose the vote", "For", "Against"]);
    const button = within(written).getByRole("button", { name: "Record the written vote" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const day = within(written).getByLabelText("Day it was received") as HTMLInputElement;
    expect([day.min, day.max]).toEqual(["2026-11-02", "2026-11-20"]);
    fireEvent.change(day, { target: { value: "2026-11-18" } });
    fireEvent.change(within(written).getByLabelText("Lot"), { target: { value: "l8" } });
    fireEvent.change(within(written).getByLabelText("Vote"), { target: { value: "AGAINST" } });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(actions.recordLateVoteAction).toHaveBeenCalledWith("s1", "m1", "p1", "l8", "AGAINST", "2026-11-18"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "A written vote for lot 8 is already recorded. Each lot votes once. Nothing was saved.");
  });

  it("offers no written vote where none can be recorded, and the day ends at the close", () => {
    const html = renderToStaticMarkup(<PendingSection {...props} items={[{ ...item, lateVote: undefined }]} />);
    expect(html).not.toContain("Record the written vote");
    render(<PendingSection {...props} items={[{ ...item, today: "2026-12-03" }]} />);
    expect((within(screen.getByRole("group", { name: "Written vote" })).getByLabelText("Day it was received") as HTMLInputElement).max).toBe("2026-11-30");
  });
});
