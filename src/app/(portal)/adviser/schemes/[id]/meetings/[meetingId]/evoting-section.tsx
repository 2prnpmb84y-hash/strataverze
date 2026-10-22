"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  openBallotAction,
  closeBallotAction,
  type EvotingActionState,
} from "./evoting-actions";
import { FeeDisclosure, useFeeConfirmation } from "@/components/billing/fee-disclosure";
import type { FeeView } from "@/lib/billing/disclosure";

export interface BallotView {
  status: string;
  opensAt: string;
  closesAt: string;
  voteCount: number;
}

export function EvotingSection({
  schemeId,
  meetingId,
  adopted,
  canOpen,
  ballot,
  fee = null,
}: {
  schemeId: string;
  meetingId: string;
  adopted: boolean;
  canOpen: boolean;
  ballot: BallotView | null;
  /** The StrataVerze fee for opening a ballot, if any. */
  fee?: FeeView | null;
}) {
  const [pending, start] = useTransition();
  const feeConfirmation = useFeeConfirmation(fee);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<EvotingActionState>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Pre-meeting electronic voting"
        description="Open a ballot so owners can vote on the agenda before the meeting."
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!adopted ? (
        <p className="text-sm text-ink-muted">
          The owners corporation has not resolved to adopt pre-meeting electronic
          voting, so a ballot cannot be opened. This is a configurable scheme
          setting backed by the adopting resolution (Reg cl 14).
        </p>
      ) : !ballot ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Owners will be able to vote from 7 days before the meeting until the
            close (24 hours before, or at the meeting for a committee meeting).
          </p>
          {canOpen && (
            <FeeDisclosure
              fee={fee}
              scheduleHref={`/adviser/schemes/${schemeId}/finance/platform-fees#fee-schedule`}
              confirmed={feeConfirmation.confirmed}
              onConfirmedChange={feeConfirmation.setConfirmed}
              idSuffix={`-${meetingId}`}
            />
          )}
          <Button
            type="button"
            disabled={!canOpen || pending || !feeConfirmation.ready}
            onClick={() => run(() => openBallotAction(schemeId, meetingId, feeConfirmation.confirmedCents))}
          >
            {pending ? "Opening..." : "Open ballot"}
          </Button>
          {!canOpen && (
            <p className="text-xs text-ink-muted">
              Add agenda items and issue the notice before opening the ballot.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                ballot.status === "OPEN"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {ballot.status}
            </span>
            <span className="text-xs text-ink-muted">
              {ballot.voteCount} vote{ballot.voteCount === 1 ? "" : "s"} cast
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            Opens {new Date(ballot.opensAt).toLocaleString("en-AU")} · Closes{" "}
            {new Date(ballot.closesAt).toLocaleString("en-AU")}
          </p>
          {ballot.status === "OPEN" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => closeBallotAction(schemeId, meetingId))}
            >
              {pending ? "Closing..." : "Close ballot & determine results"}
            </Button>
          ) : (
            <p className="text-xs text-ink-muted">
              The ballot is closed and the results have been applied to the
              agenda outcomes.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
