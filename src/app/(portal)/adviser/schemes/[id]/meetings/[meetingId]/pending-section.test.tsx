/**
 * The screens for resolutions decided later (VIC, ACT and WA stage 2, PR
 * 8b-i, 29 Oct 2026): the conduct screen asks the ACT's reduced quorum only
 * after No (D6) and sends it only then; an item decided later shows the
 * server's label and offers no outcome; and the meeting page's "Decided
 * later" panel shows where each stands and records the notice, a petition,
 * the special general meeting notice and a later meeting's decision.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const record = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }));
const actions = vi.hoisted(() => ({
  recordPendingNoticeAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
  recordPendingPetitionAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
  recordSpecialMeetingNoticeAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
  recordPendingConfirmationAction: vi.fn(async (..._a: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string; notice?: string }),
}));

vi.mock("./conduct-actions", () => ({ startMeetingAction: vi.fn(), finishMeetingAction: vi.fn(), recordAgendaOutcomeAction: record }));
vi.mock("./pending-actions", () => actions);

const { ConductSection } = await import("./conduct-section");
const { PendingSection } = await import("./pending-section");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[#\w]+;/g, "");
const itemRow = (title: string) => screen.getByText(title).closest("li") as HTMLElement;

beforeEach(() => {
  record.mockClear();
  for (const f of Object.values(actions)) f.mockClear();
});
afterEach(cleanup);

describe("the conduct screen", () => {
  const WORDS = {
    quorum: { label: "Standard quorum words", help: "Standard quorum help." },
    reduced: { label: "Reduced quorum words", help: "Reduced quorum help." },
  };
  const VOTING = {
    lots: [{ id: "l1", lotNumber: "1" }],
    items: { o: { pollAllowed: false, proxiesAllowed: true, quorumAsked: WORDS.quorum, reducedQuorumAsked: WORDS.reduced } },
    pollLabel: "Poll asked for",
  };
  const BASE = {
    schemeId: "s1",
    meetingId: "m1",
    status: "IN_PROGRESS",
    openedAt: "2026-11-20T08:00:00.000Z",
    closedAt: null,
    timeZone: "Australia/Canberra",
    items: [{ id: "o", position: 1, title: "Adopt the budget", outcome: null }],
  };

  it("asks the reduced quorum only after No, never filled in, and sends it only then", async () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    expect(screen.queryByRole("group", { name: WORDS.reduced.label })).toBeNull();
    const row = itemRow("Adopt the budget");
    fireEvent.click(within(within(row).getByRole("group", { name: WORDS.quorum.label })).getByRole("radio", { name: "No" }));
    const reduced = within(row).getByRole("group", { name: WORDS.reduced.label });
    expect(within(reduced).getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(within(reduced).getByText(/Not answered yet/)).toBeTruthy();
    // Not answered: left out, never sent as No.
    fireEvent.click(within(row).getByRole("button", { name: "Resolved" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][6]).toEqual({ quorumPresent: false });
    fireEvent.click(within(reduced).getByRole("radio", { name: "Yes" }));
    const resolved = within(row).getByRole("button", { name: "Resolved" }) as HTMLButtonElement;
    await waitFor(() => expect(resolved.disabled).toBe(false));
    fireEvent.click(resolved);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    expect(record.mock.calls[1][6]).toEqual({ quorumPresent: false, reducedQuorumPresent: true });
    // Back to Yes: the reduced quorum question goes, and its answer is not sent.
    fireEvent.click(within(within(row).getByRole("group", { name: WORDS.quorum.label })).getByRole("radio", { name: "Yes" }));
    expect(within(row).queryByRole("group", { name: WORDS.reduced.label })).toBeNull();
    await waitFor(() => expect(resolved.disabled).toBe(false));
    fireEvent.click(resolved);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(3));
    expect(record.mock.calls[2][6]).toEqual({ quorumPresent: true });
  });

  it("shows an item decided later by the server's label, with no outcome, answers or votes to record", () => {
    const html = renderToStaticMarkup(
      <ConductSection {...BASE} items={[{ id: "o", position: 1, title: "Adopt the budget", outcome: "INTERIM" }]} voting={VOTING} outcomeLabels={{ INTERIM: "Decided later" }} />,
    );
    expect(text(html)).toContain("Decided later");
    expect(html).not.toContain(">Resolved<");
    expect(html).not.toContain(WORDS.quorum.label);
    expect(html).not.toContain("Vote for lot 1");
    // Without the label the stored value is shown as it is, as before.
    expect(renderToStaticMarkup(<ConductSection {...BASE} items={[{ id: "o", position: 1, title: "A", outcome: "INTERIM" }]} />)).toContain("INTERIM");
  });
});

describe("the Decided later panel", () => {
  const base = {
    id: "p1",
    itemId: "i1",
    itemLabel: "3. Repaint the foyer",
    kindLabel: "Interim special resolution",
    help: "How it is decided, in the words of the pack.",
    status: "PENDING" as const,
    standing: "Pending. Unless it is stopped sooner, it takes effect on 2 December 2026 at the earliest.",
    facts: ["Made on 2 November 2026.", "Its period ends on 1 December 2026."],
    blocker: null,
    canRecordNotice: true,
    petitionWords: "A petition signed for more than a quarter of the lots",
    meetingNoticeWords: null,
    canConfirm: false,
    madeOn: "2026-11-02",
    windowClosesOn: "2026-12-01",
    today: "2026-11-10",
    confirmChoices: [],
  };
  const LOTS = [
    { id: "l1", lotNumber: "1" },
    { id: "l2", lotNumber: "2" },
  ];
  const props = { schemeId: "s1", meetingId: "m1", lots: LOTS, specialMeetings: [{ id: "sgm", label: "Special meeting (10 Dec 2026)" }] };

  it("shows nothing with no item", () => {
    expect(renderToStaticMarkup(<PendingSection {...props} items={[]} />)).toBe("");
  });

  it("shows where each stands, in plain words", () => {
    const html = renderToStaticMarkup(
      <PendingSection
        {...props}
        items={[base, { ...base, id: "p2", status: "CARRIED", standing: "Took effect as a special resolution on 2 December 2026, after its period ended.", canRecordNotice: false, petitionWords: null }]}
      />,
    );
    const words = text(html);
    for (const w of ["Decided later", "3. Repaint the foyer", "Interim special resolution", "Pending", "Took effect", "Made on 2 November 2026.", "How it is decided, in the words of the pack."]) {
      expect(words).toContain(w);
    }
    expect(words).not.toMatch(/[;–—]/);
    // Only the pending one offers anything to record.
    expect(html.match(/Record the notice/g)).toHaveLength(1);
    expect(html.match(/Record the petition/g)).toHaveLength(1);
  });

  it("records the notice, a petition with its lots, the meeting notice and a later meeting's decision", async () => {
    render(
      <PendingSection
        {...props}
        items={[
          base,
          {
            ...base,
            id: "p2",
            itemLabel: "4. Garden",
            canRecordNotice: false,
            petitionWords: null,
            meetingNoticeWords: "Notice of a special general meeting",
            canConfirm: true,
            confirmChoices: [{ meetingId: "sgm", label: "Special meeting (10 Dec 2026)", items: [{ id: "sgm-1", label: "1. Confirm the garden (carried)" }] }],
          },
        ]}
      />,
    );
    const first = itemRow("3. Repaint the foyer");
    fireEvent.change(within(first).getByLabelText("Day the owners were given notice of it"), { target: { value: "2026-11-09" } });
    fireEvent.click(within(first).getByRole("button", { name: "Record the notice" }));
    await waitFor(() => expect(actions.recordPendingNoticeAction).toHaveBeenCalledWith("s1", "m1", "p1", "2026-11-09"));

    fireEvent.change(within(first).getByLabelText("Day it was received"), { target: { value: "2026-11-08" } });
    fireEvent.click(within(first).getByLabelText("Lot 2"));
    const petition = within(first).getByRole("button", { name: "Record the petition (1 lot)" }) as HTMLButtonElement;
    await waitFor(() => expect(petition.disabled).toBe(false));
    fireEvent.click(petition);
    await waitFor(() => expect(actions.recordPendingPetitionAction).toHaveBeenCalledWith("s1", "m1", "p1", "2026-11-08", ["l2"]));

    const second = itemRow("4. Garden");
    expect(within(second).queryByRole("button", { name: "Record the notice" })).toBeNull();
    fireEvent.change(within(second).getByLabelText("Day the notice was given"), { target: { value: "2026-11-09" } });
    fireEvent.change(within(second).getByLabelText("The meeting it called"), { target: { value: "sgm" } });
    fireEvent.click(within(second).getByRole("button", { name: "Record the meeting notice" }));
    await waitFor(() => expect(actions.recordSpecialMeetingNoticeAction).toHaveBeenCalledWith("s1", "m1", "p2", "2026-11-09", "sgm"));

    fireEvent.change(within(second).getByLabelText("Motion"), { target: { value: "sgm-1" } });
    const decide = within(second).getByRole("button", { name: "Record the decision" }) as HTMLButtonElement;
    await waitFor(() => expect(decide.disabled).toBe(false));
    fireEvent.click(decide);
    await waitFor(() => expect(actions.recordPendingConfirmationAction).toHaveBeenCalledWith("s1", "m1", "p2", "sgm", "sgm-1"));
  });

  it("shows a refusal and a notice from the server", async () => {
    actions.recordPendingNoticeAction.mockResolvedValueOnce({ error: "The day the notice was given cannot be after today." });
    render(<PendingSection {...props} items={[base]} />);
    fireEvent.change(screen.getByLabelText("Day the owners were given notice of it"), { target: { value: "2026-11-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Record the notice" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The day the notice was given cannot be after today.");
  });
});
