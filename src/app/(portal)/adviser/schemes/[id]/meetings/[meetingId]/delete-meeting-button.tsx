"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteMeetingAction } from "../actions";

export function DeleteMeetingButton({
  schemeId,
  meetingId,
  meetingTitle,
}: {
  schemeId: string;
  meetingId: string;
  meetingTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteMeetingAction(schemeId, meetingId);
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete Meeting
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-600">
        Delete <strong>{meetingTitle}</strong>? This cannot be undone.
      </p>
      <Button
        variant="danger"
        onClick={handleDelete}
        disabled={isPending}
      >
        {isPending ? "Deleting..." : "Confirm Delete"}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
