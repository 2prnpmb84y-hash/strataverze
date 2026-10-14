"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { castVoteAction } from "./actions";

const voteOptions = [
  { value: "FOR", label: "For", variant: "primary" as const },
  { value: "AGAINST", label: "Against", variant: "danger" as const },
  { value: "ABSTAIN", label: "Abstain", variant: "secondary" as const },
];

export function VoteButtons({
  motionId,
  currentVote,
}: {
  motionId: string;
  currentVote: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleVote(voteValue: string) {
    startTransition(async () => {
      await castVoteAction(motionId, voteValue);
    });
  }

  if (currentVote) {
    return (
      <p className="text-xs text-muted-foreground">
        You voted{" "}
        <span className="font-semibold text-foreground">
          {currentVote.charAt(0) + currentVote.slice(1).toLowerCase()}
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {voteOptions.map((option) => (
        <Button
          key={option.value}
          variant={option.variant}
          onClick={() => handleVote(option.value)}
          disabled={isPending}
          className="text-xs px-3 py-1.5"
        >
          {isPending ? "Submitting..." : option.label}
        </Button>
      ))}
    </div>
  );
}
