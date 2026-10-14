"use client";

import { useTransition } from "react";
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

  function handleClick() {
    startTransition(async () => {
      if (action === "complete") {
        await completeMeetingAction(schemeId, meetingId);
      } else {
        await cancelMeetingAction(schemeId, meetingId);
      }
    });
  }

  return (
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
  );
}
