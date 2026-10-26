"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { completeMeetingAction, cancelMeetingAction } from "../actions";

export function MeetingStatusButton({
  schemeId,
  meetingId,
  action,
}: {
  schemeId: string;
  meetingId: string;
  action: "complete" | "cancel";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result =
        action === "complete"
          ? await completeMeetingAction(schemeId, meetingId)
          : await cancelMeetingAction(schemeId, meetingId);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <span className="flex flex-col gap-1">
      <Button
        variant={action === "complete" ? "primary" : "secondary"}
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending
          ? "Saving..."
          : action === "complete"
            ? "Mark as Completed"
            : "Cancel Meeting"}
      </Button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
