"use client";

import { useState, useTransition } from "react";
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

/**
 * Where the building's votes are counted at conduct (Queensland), what the
 * chair records them against: plain data from the server page
 * (conductVotingView). Absent or null: outcomes are recorded as before.
 */
export interface ConductVotingProps {
  lots: { id: string; lotNumber: string }[];
  items: Record<string, { pollAllowed: boolean; proxiesAllowed: boolean }>;
  pollLabel: string;
}

type LotVote = { vote: string; byProxy: boolean };

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
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The votes being recorded, by item then lot, and whether a poll was asked for.
  const [votes, setVotes] = useState<Record<string, Record<string, LotVote>>>({});
  const [polls, setPolls] = useState<Record<string, boolean>>({});

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
                        {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink-muted uppercase">
                        No outcome
                      </span>
                    )}
                    {running && (
                      <div className="flex gap-1">
                        {(["RESOLVED", "MOTION_LOST", "DEFERRED"] as const).map(
                          (o) => (
                            <button
                              key={o}
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  voting
                                    ? recordAgendaOutcomeAction(
                                        schemeId,
                                        meetingId,
                                        item.id,
                                        o,
                                        votesFor(item.id),
                                        polls[item.id] === true,
                                      )
                                    : recordAgendaOutcomeAction(
                                        schemeId,
                                        meetingId,
                                        item.id,
                                        o,
                                      ),
                                )
                              }
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
                {running && voting && (
                  <VoteRecorder
                    lots={voting.lots}
                    choices={voting.items[item.id] ?? { pollAllowed: false, proxiesAllowed: true }}
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
  choices: { pollAllowed: boolean; proxiesAllowed: boolean };
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
