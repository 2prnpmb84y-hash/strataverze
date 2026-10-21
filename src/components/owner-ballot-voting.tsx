"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { castBallotVoteAction } from "@/app/(portal)/owner/meetings/actions";

const VOTES = ["FOR", "AGAINST", "ABSTAIN"] as const;

export interface BallotItemView {
  id: string;
  position: number;
  title: string;
  resolutionCategory: string | null;
  myVote: string | null;
}

export interface BallotCardView {
  meetingId: string;
  meetingTitle: string;
  schemeName: string;
  items: BallotItemView[];
}

export function OwnerBallotVoting({ cards }: { cards: BallotCardView[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const c of cards)
      for (const i of c.items) if (i.myVote) seed[i.id] = i.myVote;
    return seed;
  });

  if (cards.length === 0) return null;

  function cast(meetingId: string, itemId: string, value: string) {
    setError(null);
    start(async () => {
      const result = await castBallotVoteAction(meetingId, itemId, value);
      if (result?.error) setError(result.error);
      else setVotes((v) => ({ ...v, [itemId]: value }));
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Pre-meeting voting open"
        description="You can vote on these agenda items before the meeting. Your vote can be changed until the ballot closes, and may be overridden if the motion is amended at the meeting."
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {cards.map((card) => (
          <div key={card.meetingId}>
            <h3 className="font-heading font-semibold text-ink text-sm">
              {card.meetingTitle}
            </h3>
            {card.schemeName && (
              <p className="text-xs text-ink-muted mb-2">{card.schemeName}</p>
            )}
            <ol className="space-y-2">
              {card.items.map((item) => (
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
                    <div className="flex gap-1.5">
                      {VOTES.map((v) => {
                        const active = votes[item.id] === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            disabled={pending}
                            onClick={() => cast(card.meetingId, item.id, v)}
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                              active
                                ? "bg-turquoise text-white border-turquoise"
                                : "border-line text-ink-muted hover:bg-paper-2"
                            }`}
                          >
                            {v === "FOR"
                              ? "For"
                              : v === "AGAINST"
                                ? "Against"
                                : "Abstain"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Card>
  );
}
