/**
 * The chair's answers on the conduct screen (VIC, ACT and WA stage 2, PR
 * 8a-ii-b, 29 Oct 2026). Where an item's test needs them, the screen asks
 * whether there was a quorum (Yes or No, never filled in) and, for an ACT
 * special resolution, the units present. The words come from the voting view
 * (the pack), the answers go to recordAgendaOutcomeAction as its 7th argument
 * only for items that ask, and an unanswered quorum is left out, never sent as
 * No (Matthew Wrigley's decision of 29 Oct 2026). Queensland and NSW calls are
 * unchanged: 6 and 4 arguments.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, type StatutoryRules } from "@/config/statutory";
import { conductVotingView } from "@/lib/meetings/conduct-tally";

const record = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ ok: true }) as { ok?: boolean; error?: string }));

vi.mock("./conduct-actions", () => ({
  startMeetingAction: vi.fn(),
  finishMeetingAction: vi.fn(),
  recordAgendaOutcomeAction: record,
}));

const { ConductSection } = await import("./conduct-section");

const ITEMS = [
  { id: "q", position: 1, title: "Adopt the budget", outcome: null },
  { id: "s", position: 2, title: "Approve the new rules", outcome: null },
  { id: "n", position: 3, title: "Any other business", outcome: null },
];
const BASE = { schemeId: "s1", meetingId: "m1", status: "IN_PROGRESS", openedAt: "2026-11-20T08:00:00.000Z", closedAt: null, items: ITEMS, timeZone: "Australia/Canberra" };

const WORDS = {
  quorum: { label: "Quorum words from the pack", help: "Help for the quorum from the pack." },
  unitsPresent: { label: "Units present words from the pack", help: "Help for the units present from the pack." },
};
// q asks the quorum, s asks the quorum and the units present, n asks nothing. Each question carries its words.
const VOTING = {
  lots: [
    { id: "l1", lotNumber: "1" },
    { id: "l2", lotNumber: "2" },
    { id: "l3", lotNumber: "3" },
    { id: "l4", lotNumber: "4" },
  ],
  items: {
    q: { pollAllowed: false, proxiesAllowed: true, quorumAsked: WORDS.quorum },
    s: { pollAllowed: false, proxiesAllowed: true, quorumAsked: WORDS.quorum, unitsPresentAsked: WORDS.unitsPresent },
    n: { pollAllowed: false, proxiesAllowed: true },
  },
  pollLabel: "Poll asked for",
};
const UNITS_REFUSAL = `Enter "${WORDS.unitsPresent.label}" as a whole number from 0 to 4. Nothing was saved.`;
/** The ids an element's aria-describedby names, as the texts they hold. */
const describedBy = (el: Element) => (el.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent);

const itemRow = (title: string) => screen.getByText(title).closest("li") as HTMLElement;
/** Choose an outcome once the previous call has finished (the buttons are disabled while one runs). */
async function click(title: string, outcome: string) {
  const button = within(itemRow(title)).getByRole("button", { name: outcome }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}
/** The words a reader sees: tags and entities set aside. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[#\w]+;/g, "");

beforeEach(() => {
  record.mockReset();
  record.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("the chair's answers on the conduct screen", () => {
  it("asks only on the items that need it, with the words from the view", () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    // The quorum question on q and s only, as a group named by the pack's label and described by its help.
    const groups = screen.getAllByRole("group", { name: WORDS.quorum.label });
    expect(groups).toHaveLength(2);
    expect(within(itemRow("Adopt the budget")).getByRole("group", { name: WORDS.quorum.label })).toBeTruthy();
    expect(within(itemRow("Approve the new rules")).getByRole("group", { name: WORDS.quorum.label })).toBeTruthy();
    expect(itemRow("Any other business").querySelector("fieldset")).toBeNull();
    for (const g of groups) {
      expect(g.tagName).toBe("FIELDSET");
      expect(g.querySelector("legend")?.textContent).toBe(WORDS.quorum.label);
      // Described by the help and, while unanswered, the note saying so.
      expect(describedBy(g)).toEqual([WORDS.quorum.help, "Not answered yet. Answer it before recording Resolved or Motion lost."]);
      expect(within(g).getAllByRole("radio").map((r) => (r.closest("label") as HTMLElement).textContent)).toEqual(["Yes", "No"]);
    }
    // The units present on s only, as a whole number field tied to its label and help.
    const units = screen.getAllByLabelText(WORDS.unitsPresent.label);
    expect(units).toHaveLength(1);
    expect(itemRow("Approve the new rules").contains(units[0])).toBe(true);
    // A text field asking for digits, so whatever is typed reaches the whole number check and a scroll cannot change it.
    expect(units[0].getAttribute("type")).toBe("text");
    expect(units[0].getAttribute("inputmode")).toBe("numeric");
    expect(units[0].getAttribute("pattern")).toBe("[0-9]*");
    expect(units[0].hasAttribute("aria-invalid")).toBe(false);
    expect(describedBy(units[0])).toEqual([WORDS.unitsPresent.help]);
    // Outside the folded votes, so the chair cannot miss them.
    for (const el of [...groups, ...units]) expect(el.closest("details")).toBeNull();
  });

  it("is never filled in for the chair", () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    for (const r of screen.getAllByRole("radio")) expect((r as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(WORDS.unitsPresent.label) as HTMLInputElement).value).toBe("");
    expect(screen.getAllByText(/Not answered yet/)).toHaveLength(2);
    // And not in the server's markup either.
    const html = renderToStaticMarkup(<ConductSection {...BASE} voting={VOTING} />);
    expect(html).toContain('type="radio"');
    expect(html).not.toMatch(/<input[^>]* checked/);
  });

  it("asks nothing once the meeting has finished, or with no voting view", () => {
    const finished = renderToStaticMarkup(<ConductSection {...BASE} status="MINUTES_DRAFT" closedAt="2026-11-20T09:00:00.000Z" voting={VOTING} />);
    expect(finished).not.toContain(WORDS.quorum.label);
    expect(finished).not.toContain(WORDS.unitsPresent.label);
    expect(renderToStaticMarkup(<ConductSection {...BASE} voting={null} />)).not.toContain("fieldset");
  });

  it("sends the answers as the 7th argument only for an item that asks", async () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    fireEvent.click(within(itemRow("Adopt the budget")).getByRole("radio", { name: "Yes" }));
    await click("Adopt the budget", "Resolved");
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]).toEqual(["s1", "m1", "q", "RESOLVED", [], false, { quorumPresent: true }]);

    // An item that asks nothing: exactly the six arguments, as for Queensland.
    await click("Any other business", "Motion lost");
    expect(record.mock.calls[1]).toEqual(["s1", "m1", "n", "MOTION_LOST", [], false]);
    expect(record.mock.calls[1]).toHaveLength(6);
  });

  it("stops describing the quorum as unanswered once it is answered", () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    const group = within(itemRow("Adopt the budget")).getByRole("group", { name: WORDS.quorum.label });
    fireEvent.click(within(group).getByRole("radio", { name: "No" }));
    expect(describedBy(group)).toEqual([WORDS.quorum.help]);
    expect(within(group).queryByText(/Not answered yet/)).toBeNull();
  });

  it("keeps the answers for each item apart", async () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    fireEvent.click(within(itemRow("Adopt the budget")).getByRole("radio", { name: "No" }));
    fireEvent.click(within(itemRow("Approve the new rules")).getByRole("radio", { name: "Yes" }));
    expect((within(itemRow("Adopt the budget")).getByRole("radio", { name: "No" }) as HTMLInputElement).checked).toBe(true);
    expect((within(itemRow("Adopt the budget")).getByRole("radio", { name: "Yes" }) as HTMLInputElement).checked).toBe(false);
    await click("Adopt the budget", "Motion lost");
    await click("Approve the new rules", "Resolved");
    expect(record.mock.calls[0][6]).toEqual({ quorumPresent: false });
    expect(record.mock.calls[1][6]).toEqual({ quorumPresent: true });
  });

  it("leaves an unanswered quorum out, never sending it as No, and shows the server's refusal", async () => {
    const refusal = `Answer "${WORDS.quorum.label}" before recording this item's outcome. Nothing was saved.`;
    record.mockResolvedValueOnce({ error: refusal });
    render(<ConductSection {...BASE} voting={VOTING} />);
    await click("Adopt the budget", "Resolved");
    expect(record.mock.calls[0]).toHaveLength(7);
    expect(record.mock.calls[0][6]).toEqual({});
    expect(record.mock.calls[0][6]).not.toHaveProperty("quorumPresent");
    await waitFor(() => expect(screen.getByText(refusal)).toBeTruthy());
  });

  it("sends the units present only as a whole number from 0 to the number of lots", async () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    const field = screen.getByLabelText(WORDS.unitsPresent.label);
    fireEvent.click(within(itemRow("Approve the new rules")).getByRole("radio", { name: "Yes" }));

    // Left blank: not sent.
    await click("Approve the new rules", "Resolved");
    expect(record.mock.calls[0][6]).toEqual({ quorumPresent: true });

    fireEvent.change(field, { target: { value: "3" } });
    await click("Approve the new rules", "Resolved");
    expect(record.mock.calls[1][6]).toEqual({ quorumPresent: true, unitsPresent: 3 });

    fireEvent.change(field, { target: { value: "0" } });
    await click("Approve the new rules", "Motion lost");
    expect(record.mock.calls[2][6]).toEqual({ quorumPresent: true, unitsPresent: 0 });

    // Letters, a part number, a negative number, a number in another form, or more than the lots: never sent.
    for (const typed of ["abc", "2.5", "-1", "1e1", "5", "3 lots"]) {
      fireEvent.change(field, { target: { value: typed } });
      expect((field as HTMLInputElement).value).toBe(typed);
      await click("Approve the new rules", "Resolved");
      expect(record).toHaveBeenCalledTimes(3);
      // Refused beside the field, in the pack's words, and announced: not in the shared error box.
      const alert = within(itemRow("Approve the new rules")).getByRole("alert");
      expect(alert.textContent).toBe(UNITS_REFUSAL);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(describedBy(field)).toEqual([WORDS.unitsPresent.help, UNITS_REFUSAL]);
      expect(document.querySelector(".bg-red-50")).toBeNull();
    }

    // Editing the field clears the refusal.
    fireEvent.change(field, { target: { value: "2" } });
    expect(within(itemRow("Approve the new rules")).queryByRole("alert")).toBeNull();
    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(describedBy(field)).toEqual([WORDS.unitsPresent.help]);

    // A deferral is not counted, so it goes ahead without them.
    fireEvent.change(field, { target: { value: "2.5" } });
    await click("Approve the new rules", "Deferred");
    expect(record.mock.calls[3]).toEqual(["s1", "m1", "s", "DEFERRED", [], false, { quorumPresent: true }]);
    expect(within(itemRow("Approve the new rules")).queryByRole("alert")).toBeNull();
  });

  it("sends the votes with the answers", async () => {
    render(<ConductSection {...BASE} voting={VOTING} />);
    const row = itemRow("Adopt the budget");
    fireEvent.change(within(row).getByLabelText("Vote for lot 2"), { target: { value: "FOR" } });
    fireEvent.click(within(row).getByRole("radio", { name: "No" }));
    await click("Adopt the budget", "Motion lost");
    expect(record.mock.calls[0]).toEqual(["s1", "m1", "q", "MOTION_LOST", [{ lotId: "l2", vote: "FOR", byProxy: false }], false, { quorumPresent: false }]);
  });

  it("keeps the Queensland and NSW calls as they were", async () => {
    const QLD_RULES = QLD_RULE_PACK.rules as unknown as StatutoryRules;
    const qld = conductVotingView(QLD_RULES.MEETING_RULES, QLD_RULES, [{ id: "l1", lotNumber: "1" }], ITEMS.map((i) => ({ id: i.id, resolutionCategory: "ORDINARY" })), "AGM")!;
    expect(Object.values(qld.items).every((i) => !("quorumAsked" in i) && !("unitsPresentAsked" in i))).toBe(true);
    const { unmount } = render(<ConductSection {...BASE} voting={qld} />);
    expect(document.querySelector("fieldset")).toBeNull();
    await click("Adopt the budget", "Resolved");
    expect(record.mock.calls[0]).toEqual(["s1", "m1", "q", "RESOLVED", [], false]);
    unmount();

    render(<ConductSection {...BASE} />);
    await click("Adopt the budget", "Resolved");
    expect(record.mock.calls[1]).toEqual(["s1", "m1", "q", "RESOLVED"]);
  });

  it("asks with the ACT and VIC packs' own words, in plain words", async () => {
    const lots = [{ id: "l1", lotNumber: "1" }, { id: "l2", lotNumber: "2" }, { id: "l3", lotNumber: "3" }];
    const items = [
      { id: "q", resolutionCategory: "ORDINARY" },
      { id: "s", resolutionCategory: "SPECIAL" },
      { id: "n", resolutionCategory: null },
    ];
    for (const state of ["ACT", "VIC"] as const) {
      const rules = PENDING_RULE_PACKS[state].rules as unknown as StatutoryRules;
      const view = conductVotingView(rules.MEETING_RULES, rules, lots, items, "AGM")!;
      const quorum = view.items.q.quorumAsked;
      expect(quorum?.label).toBe(rules.MEETING_RULES.quorumAttestation?.label);
      const html = renderToStaticMarkup(<ConductSection {...BASE} voting={view} />);
      expect(html.split(`<legend class="text-xs font-medium text-ink">${quorum!.label}</legend>`)).toHaveLength(3);
      expect(html).toContain(quorum!.help.replace(/"/g, "&quot;").slice(0, 40));
      expect(html.includes('inputMode="numeric"')).toBe(state === "ACT");
      if (state === "ACT") expect(html).toContain(view.items.s.unitsPresentAsked!.label);
      expect(text(html)).not.toMatch(/[;–—]/);
    }
    // The screen's own words, as the chair sees them.
    render(<ConductSection {...BASE} voting={VOTING} />);
    fireEvent.change(screen.getByLabelText(WORDS.unitsPresent.label), { target: { value: "2.5" } });
    await click("Approve the new rules", "Resolved");
    expect(text(document.body.innerHTML)).not.toMatch(/[;–—]/);
  });
});
