"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  assembleMinutesAction,
  confirmMinutesAction,
  publishMinutesAction,
  type MinutesActionState,
} from "./minutes-actions";

const OUTCOME_LABELS: Record<string, string> = {
  RESOLVED: "Resolved",
  MOTION_LOST: "Motion lost",
  DEFERRED: "Deferred",
};

interface MinutesContent {
  heading?: string;
  meeting?: {
    title?: string;
    openedAt?: string | null;
    closedAt?: string | null;
  };
  items?: {
    position: number;
    title: string;
    resolutionText: string | null;
    outcome: string | null;
  }[];
}

export interface MinutesView {
  state: string;
  version: number;
  confirmedAt: string | null;
  distributedAt: string | null;
  retentionUntil: string | null;
  content: Record<string, unknown>;
}

export function MinutesSection({
  schemeId,
  meetingId,
  canAssemble,
  minutes,
  deadline,
}: {
  schemeId: string;
  meetingId: string;
  canAssemble: boolean;
  minutes: MinutesView | null;
  deadline: { dueDate: string; overdue: boolean } | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<MinutesActionState>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  if (!minutes && !canAssemble) return null;

  const content = (minutes?.content ?? {}) as MinutesContent;

  return (
    <Card className="mb-6">
      <CardHeader
        title="Minutes"
        description="Assemble, confirm and publish the official minutes."
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!minutes ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            The meeting has finished. Assemble the draft minutes from the agenda
            and recorded outcomes.
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => assembleMinutesAction(schemeId, meetingId))}
          >
            {pending ? "Assembling..." : "Assemble draft minutes"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                minutes.state === "CONFIRMED"
                  ? "bg-green-100 text-green-700"
                  : minutes.state === "DRAFT"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {minutes.state}
            </span>
            <span className="text-xs text-ink-muted">Version {minutes.version}</span>
            {minutes.distributedAt && (
              <span className="text-xs text-ink-muted">
                · Published{" "}
                {new Date(minutes.distributedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </div>

          {deadline && minutes.state !== "CONFIRMED" && !minutes.distributedAt && (
            <div
              className={`rounded-[var(--radius-card)] px-4 py-2 text-xs ${
                deadline.overdue
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-turquoise/5 border border-turquoise/20 text-ink-muted"
              }`}
            >
              {deadline.overdue
                ? `Minutes distribution is overdue (was due ${new Date(deadline.dueDate).toLocaleDateString("en-AU")}).`
                : `Minutes must be distributed by ${new Date(deadline.dueDate).toLocaleDateString("en-AU")}.`}
            </div>
          )}

          {/* Assembled minutes preview */}
          <div className="rounded-[var(--radius-card)] border border-line p-4 space-y-3">
            {content.heading && (
              <h3 className="font-heading font-semibold text-ink text-sm">
                {content.heading}
              </h3>
            )}
            {content.meeting?.openedAt && (
              <p className="text-xs text-ink-muted">
                Opened{" "}
                {new Date(content.meeting.openedAt).toLocaleString("en-AU")}
                {content.meeting.closedAt
                  ? ` · Closed ${new Date(content.meeting.closedAt).toLocaleString("en-AU")}`
                  : ""}
              </p>
            )}
            <ol className="space-y-2">
              {(content.items ?? []).map((item) => (
                <li key={item.position} className="text-sm">
                  <span className="font-heading font-semibold text-ink-muted mr-2">
                    {item.position}
                  </span>
                  <span className="text-ink">{item.title}</span>
                  {item.outcome && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                      — {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                    </span>
                  )}
                  {item.resolutionText && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {item.resolutionText}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex gap-3">
            {minutes.state === "DRAFT" && (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => confirmMinutesAction(schemeId, meetingId))
                }
              >
                {pending ? "Confirming..." : "Confirm minutes"}
              </Button>
            )}
            {minutes.state === "CONFIRMED" && !minutes.distributedAt && (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => publishMinutesAction(schemeId, meetingId))
                }
              >
                {pending ? "Publishing..." : "Publish & distribute"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
