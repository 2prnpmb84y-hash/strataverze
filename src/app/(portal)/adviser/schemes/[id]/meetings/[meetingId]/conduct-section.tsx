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

export function ConductSection({
  schemeId,
  meetingId,
  status,
  openedAt,
  closedAt,
  items,
}: {
  schemeId: string;
  meetingId: string;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  items: ConductItemView[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<ConductActionState>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
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
                {new Date(openedAt).toLocaleString("en-AU", {
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
                {new Date(closedAt).toLocaleString("en-AU", {
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
                                  recordAgendaOutcomeAction(
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
