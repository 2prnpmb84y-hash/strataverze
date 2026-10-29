"use client";

import { useId, useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  startMeetingAction,
  finishMeetingAction,
  recordAgendaOutcomeAction,
  type ConductActionState,
} from "./conduct-actions";

const OUTCOME_LABELS: Record<string, string> = {
  RESOLVED: "Resolved",
  MOTION_LOST: "Motion lost",
  DEFERRED: "Deferred",
};

const OUTCOME_STYLE: Record<string, string> = {
  RESOLVED: "bg-green-100 text-green-700",
  MOTION_LOST: "bg-red-100 text-red-700",
  DEFERRED: "bg-amber-100 text-amber-800",
};

export interface ConductItemView {
  id: string;
  position: number;
  title: string;
  outcome: string | null;
}

/** The words of one of the chair's questions, as the server page passes them (from the building's pack). */
export interface AttestationWords {
  label: string;
  help: string;
}

/**
 * Where the building's votes are counted at conduct (Queensland), what the
 * chair records them against: plain data from the server page
 * (conductVotingView). Absent or null: outcomes are recorded as before.
 *
 * Where an item's test needs them (VIC, ACT and WA stage 2, PR 8a-ii), the
 * item has `quorumAsked` and `unitsPresentAsked`, each carrying the
 * question's words from the pack, so a question cannot be asked without
 * them. Left out otherwise (Queensland).
 */
export interface ConductVotingProps {
  lots: { id: string; lotNumber: string }[];
  items: Record<
    string,
    {
      pollAllowed: boolean;
      proxiesAllowed: boolean;
      quorumAsked?: AttestationWords;
      unitsPresentAsked?: AttestationWords;
      /** After No to the quorum, whether a reduced quorum was present (the ACT; VIC, ACT and WA stage 2, PR 8b-i). */
      reducedQuorumAsked?: AttestationWords;
    }
  >;
  pollLabel: string;
}

/** Outcomes of an item decided later (VIC, ACT and WA stage 2, PR 8b-i): its outcome buttons are not offered. */
const DECIDED_LATER = ["INTERIM", "OPEN"];

type LotVote = { vote: string; byProxy: boolean };

type ItemChoices = ConductVotingProps["items"][string];

/** What the chair answered for an item, as sent to the server: an unanswered question is left out, never false. */
type AttestationAnswers = { quorumPresent?: boolean; unitsPresent?: number; reducedQuorumPresent?: boolean };

/**
 * The units present as the chair typed them: a whole number from 0 to the
 * number of lots, or undefined when left blank. Anything else is null (not
 * a whole number), so a part number or a stray letter is never sent.
 */
function parseUnitsPresent(text: string, lotCount: number): number | undefined | null {
  const t = text.trim();
  if (t === "") return undefined;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= lotCount ? n : null;
}

const VOTE_CHOICES = [
  { value: "", label: "Not voting" },
  { value: "FOR", label: "For" },
  { value: "AGAINST", label: "Against" },
  { value: "ABSTAIN", label: "Abstain" },
];

export function ConductSection({
  schemeId,
  meetingId,
  status,
  openedAt,
  closedAt,
  items,
  timeZone,
  voting,
  outcomeLabels,
}: {
  schemeId: string;
  meetingId: string;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  items: ConductItemView[];
  /** The meeting's time zone. */
  timeZone: string;
  /** Where votes are counted at conduct: the lots and each item's choices. */
  voting?: ConductVotingProps | null;
  /** Labels for outcomes beyond the three recorded here, as the server page passes them (an item decided later). */
  outcomeLabels?: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The votes being recorded, by item then lot, and whether a poll was asked for.
  const [votes, setVotes] = useState<Record<string, Record<string, LotVote>>>({});
  const [polls, setPolls] = useState<Record<string, boolean>>({});
  // The chair's answers, by item: whether there was a quorum (unanswered until chosen), and the units present as typed.
  const [quorum, setQuorum] = useState<Record<string, boolean>>({});
  // After No: whether a reduced quorum was present (the ACT), by item, unanswered until chosen.
  const [reduced, setReduced] = useState<Record<string, boolean>>({});
  const [present, setPresent] = useState<Record<string, string>>({});
  // The screen's own refusal of the units present typed, by item, shown beside the field.
  const [unitsError, setUnitsError] = useState<Record<string, string>>({});

  function run(fn: () => Promise<ConductActionState>) {
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      if (result?.notice) setNotice(result.notice);
    });
  }

  function setLotVote(itemId: string, lotId: string, change: Partial<LotVote>) {
    setVotes((all) => {
      const forItem = { ...(all[itemId] ?? {}) };
      const before: LotVote | undefined = forItem[lotId];
      const next: LotVote = { ...(before ?? { vote: "", byProxy: false }), ...change };
      if (!next.vote) delete forItem[lotId];
      else forItem[lotId] = next;
      return { ...all, [itemId]: forItem };
    });
  }

  function votesFor(itemId: string) {
    return Object.entries(votes[itemId] ?? {}).map(([lotId, v]) => ({ lotId, vote: v.vote, byProxy: v.byProxy }));
  }

  const choicesFor = (itemId: string): ItemChoices => voting?.items[itemId] ?? { pollAllowed: false, proxiesAllowed: true };
  const asks = (c: ItemChoices) => !!(c.quorumAsked || c.unitsPresentAsked);

  /**
   * The chair's answers for an item that asks: only what was answered (an
   * unanswered quorum is left out, never sent as No), and whether the units
   * present typed are not a whole number in range.
   */
  function answersFor(itemId: string, choices: ItemChoices, lotCount: number): { answers: AttestationAnswers; unitsUnreadable: boolean } {
    const answers: AttestationAnswers = {};
    let unitsUnreadable = false;
    if (choices.quorumAsked && typeof quorum[itemId] === "boolean") answers.quorumPresent = quorum[itemId];
    // Sent only after No, and only where it is asked.
    if (choices.reducedQuorumAsked && quorum[itemId] === false && typeof reduced[itemId] === "boolean") answers.reducedQuorumPresent = reduced[itemId];
    if (choices.unitsPresentAsked) {
      const units = parseUnitsPresent(present[itemId] ?? "", lotCount);
      if (units === null) unitsUnreadable = true;
      else if (units !== undefined) answers.unitsPresent = units;
    }
    return { answers, unitsUnreadable };
  }

  function clearUnitsError(itemId: string) {
    setUnitsError((all) => {
      if (!(itemId in all)) return all;
      const rest = { ...all };
      delete rest[itemId];
      return rest;
    });
  }

  function recordOutcome(itemId: string, outcome: string) {
    if (!voting) {
      run(() => recordAgendaOutcomeAction(schemeId, meetingId, itemId, outcome));
      return;
    }
    const choices = choicesFor(itemId);
    // Queensland, and any item that asks nothing: exactly the six arguments as before.
    if (!asks(choices)) {
      run(() => recordAgendaOutcomeAction(schemeId, meetingId, itemId, outcome, votesFor(itemId), polls[itemId] === true));
      return;
    }
    const lotCount = voting.lots.length;
    const { answers, unitsUnreadable } = answersFor(itemId, choices, lotCount);
    // Units present that are not a whole number are never sent. A deferral is not counted, so it goes ahead without them.
    if (unitsUnreadable && outcome !== "DEFERRED" && choices.unitsPresentAsked) {
      setError(null);
      setNotice(null);
      const refusal = `Enter "${choices.unitsPresentAsked.label}" as a whole number from 0 to ${lotCount}. Nothing was saved.`;
      setUnitsError((all) => ({ ...all, [itemId]: refusal }));
      return;
    }
    clearUnitsError(itemId);
    run(() => recordAgendaOutcomeAction(schemeId, meetingId, itemId, outcome, votesFor(itemId), polls[itemId] === true, answers));
  }

  const running = status === "IN_PROGRESS";
  const canStart = status === "NOTICE_ISSUED";
  const finished = status === "MINUTES_DRAFT" || status === "PUBLISHED";

  if (!canStart && !running && !finished) return null;

  return (
    <Card className="mb-6">
      <CardHeader
        title="Conduct"
        description="Run the meeting and record the outcome of each agenda item."
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      )}

      {canStart && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            The notice has been issued. Start the meeting to record attendance,
            outcomes and the opening time.
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => startMeetingAction(schemeId, meetingId))}
          >
            {pending ? "Starting..." : "Start meeting"}
          </Button>
        </div>
      )}

      {(running || finished) && (
        <div className="space-y-4">
          <div className="text-xs text-ink-muted">
            {openedAt && (
              <span>
                Opened{" "}
                {new Date(openedAt).toLocaleString("en-AU", { timeZone,
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
            {closedAt && (
              <span>
                {" · Closed "}
                {new Date(closedAt).toLocaleString("en-AU", { timeZone,
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          <ol className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-[var(--radius-card)] border border-line p-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm text-ink">
                    <span className="font-heading font-semibold text-ink-muted mr-2">
                      {item.position}
                    </span>
                    {item.title}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.outcome ? (
                      <span
                        className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${OUTCOME_STYLE[item.outcome] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {outcomeLabels?.[item.outcome] ?? OUTCOME_LABELS[item.outcome] ?? item.outcome}
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink-muted uppercase">
                        No outcome
                      </span>
                    )}
                    {running && !DECIDED_LATER.includes(item.outcome ?? "") && (
                      <div className="flex gap-1">
                        {(["RESOLVED", "MOTION_LOST", "DEFERRED"] as const).map(
                          (o) => (
                            <button
                              key={o}
                              type="button"
                              disabled={pending}
                              onClick={() => recordOutcome(item.id, o)}
                              className="text-[11px] px-2 py-1 rounded-full border border-line hover:bg-paper-2 text-ink-muted"
                            >
                              {OUTCOME_LABELS[o]}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {running && voting && asks(choicesFor(item.id)) && !DECIDED_LATER.includes(item.outcome ?? "") && (
                  <ChairAnswers
                    choices={choicesFor(item.id)}
                    quorum={quorum[item.id]}
                    reduced={reduced[item.id]}
                    onReduced={(yes) => setReduced((all) => ({ ...all, [item.id]: yes }))}
                    present={present[item.id] ?? ""}
                    unitsError={unitsError[item.id] ?? null}
                    disabled={pending}
                    onQuorum={(yes) => setQuorum((all) => ({ ...all, [item.id]: yes }))}
                    onPresent={(text) => {
                      setPresent((all) => ({ ...all, [item.id]: text }));
                      clearUnitsError(item.id);
                    }}
                  />
                )}
                {running && voting && !DECIDED_LATER.includes(item.outcome ?? "") && (
                  <VoteRecorder
                    lots={voting.lots}
                    choices={choicesFor(item.id)}
                    pollLabel={voting.pollLabel}
                    votes={votes[item.id] ?? {}}
                    poll={polls[item.id] === true}
                    disabled={pending}
                    onVote={(lotId, change) => setLotVote(item.id, lotId, change)}
                    onPoll={(on) => setPolls((all) => ({ ...all, [item.id]: on }))}
                  />
                )}
              </li>
            ))}
          </ol>

          {running && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => finishMeetingAction(schemeId, meetingId))}
            >
              {pending ? "Finishing..." : "Finish meeting"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * The chair's answers for one item, where its test needs them (VIC, ACT and
 * WA stage 2, PR 8a-ii; Matthew Wrigley's decision of 29 Oct 2026): whether
 * there was a quorum, as Yes or No, and the units present. Shown above the
 * votes, not folded away, so the chair cannot miss them. Never filled in for
 * the chair: until Yes or No is chosen the quorum is unanswered, and the
 * server refuses the outcome.
 */
function ChairAnswers({
  choices,
  quorum,
  reduced,
  present,
  unitsError,
  disabled,
  onQuorum,
  onReduced,
  onPresent,
}: {
  choices: ItemChoices;
  quorum: boolean | undefined;
  /** After No: whether a reduced quorum was present (the ACT). */
  reduced?: boolean;
  present: string;
  unitsError: string | null;
  disabled: boolean;
  onQuorum: (yes: boolean) => void;
  onReduced?: (yes: boolean) => void;
  onPresent: (text: string) => void;
}) {
  const id = useId();
  const quorumWords = choices.quorumAsked;
  const unitsWords = choices.unitsPresentAsked;
  // Asked only after No to the quorum (VIC, ACT and WA stage 2, PR 8b-i; Matthew Wrigley's decision D6).
  const reducedWords = quorum === false ? choices.reducedQuorumAsked : undefined;
  const unanswered = quorum === undefined;
  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2">
      {quorumWords && (
        <fieldset aria-describedby={unanswered ? `${id}-quorum-help ${id}-quorum-unanswered` : `${id}-quorum-help`}>
          <legend className="text-xs font-medium text-ink">{quorumWords.label}</legend>
          <p id={`${id}-quorum-help`} className="mt-1 text-xs text-ink-muted">
            {quorumWords.help}
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs text-ink">
            {([
              [true, "Yes"],
              [false, "No"],
            ] as const).map(([value, label]) => (
              <label key={label} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`${id}-quorum`}
                  value={value ? "yes" : "no"}
                  checked={quorum === value}
                  disabled={disabled}
                  onChange={() => onQuorum(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {unanswered && (
            <p id={`${id}-quorum-unanswered`} className="mt-1 text-xs text-amber-800">
              Not answered yet. Answer it before recording Resolved or Motion lost.
            </p>
          )}
        </fieldset>
      )}
      {reducedWords && (
        <fieldset aria-describedby={reduced === undefined ? `${id}-reduced-help ${id}-reduced-unanswered` : `${id}-reduced-help`}>
          <legend className="text-xs font-medium text-ink">{reducedWords.label}</legend>
          <p id={`${id}-reduced-help`} className="mt-1 text-xs text-ink-muted">
            {reducedWords.help}
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs text-ink">
            {([
              [true, "Yes"],
              [false, "No"],
            ] as const).map(([value, label]) => (
              <label key={label} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`${id}-reduced`}
                  value={value ? "yes" : "no"}
                  checked={reduced === value}
                  disabled={disabled}
                  onChange={() => onReduced?.(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {reduced === undefined && (
            <p id={`${id}-reduced-unanswered`} className="mt-1 text-xs text-amber-800">
              Not answered yet. Answer it before recording Resolved or Motion lost.
            </p>
          )}
        </fieldset>
      )}
      {unitsWords && (
        <div>
          <label htmlFor={`${id}-units`} className="block text-xs font-medium text-ink">
            {unitsWords.label}
          </label>
          <p id={`${id}-units-help`} className="mt-1 text-xs text-ink-muted">
            {unitsWords.help}
          </p>
          <input
            id={`${id}-units`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={present}
            disabled={disabled}
            aria-invalid={unitsError ? true : undefined}
            aria-describedby={unitsError ? `${id}-units-help ${id}-units-error` : `${id}-units-help`}
            onChange={(e) => onPresent(e.target.value)}
            className="mt-2 w-24 rounded border border-line bg-white px-2 py-1 text-xs"
          />
          {unitsError && (
            <p id={`${id}-units-error`} role="alert" className="mt-1 text-xs text-red-700">
              {unitsError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The votes for one item: each lot's vote, whether by proxy, and a poll where one may be asked for. */
function VoteRecorder({
  lots,
  choices,
  pollLabel,
  votes,
  poll,
  disabled,
  onVote,
  onPoll,
}: {
  lots: ConductVotingProps["lots"];
  choices: ItemChoices;
  pollLabel: string;
  votes: Record<string, LotVote>;
  poll: boolean;
  disabled: boolean;
  onVote: (lotId: string, change: Partial<LotVote>) => void;
  onPoll: (on: boolean) => void;
}) {
  const recorded = Object.keys(votes).length;
  return (
    <details className="mt-3 rounded-[var(--radius-card)] bg-paper-2 px-3 py-2">
      <summary className="cursor-pointer text-xs text-ink-muted">
        Votes ({recorded} of {lots.length} lots recorded)
      </summary>
      <p className="mt-2 text-xs text-ink-muted">
        Record each lot&apos;s vote, then choose the outcome. The outcome is checked against the count of these votes and any cast online.
      </p>
      {choices.pollAllowed && (
        <label className="mt-2 flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={poll} disabled={disabled} onChange={(e) => onPoll(e.target.checked)} />
          {pollLabel}
        </label>
      )}
      <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {lots.map((lot) => {
          const v = votes[lot.id];
          return (
            <li key={lot.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-ink">Lot {lot.lotNumber}</span>
              <span className="flex items-center gap-2">
                <select
                  aria-label={`Vote for lot ${lot.lotNumber}`}
                  value={v?.vote ?? ""}
                  disabled={disabled}
                  onChange={(e) => onVote(lot.id, { vote: e.target.value })}
                  className="rounded border border-line bg-white px-1 py-0.5"
                >
                  {VOTE_CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {choices.proxiesAllowed && (
                  <label className="flex items-center gap-1 text-ink-muted">
                    <input
                      type="checkbox"
                      checked={v?.byProxy ?? false}
                      disabled={disabled || !v?.vote}
                      onChange={(e) => onVote(lot.id, { byProxy: e.target.checked })}
                    />
                    Proxy
                  </label>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
