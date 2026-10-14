"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction, declineInvitationAction } from "./actions";

export function InvitationActions({
  invitationId,
}: {
  invitationId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleAccept() {
    startTransition(async () => {
      await acceptInvitationAction(invitationId);
    });
  }

  function handleDecline() {
    startTransition(async () => {
      await declineInvitationAction(invitationId);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleAccept}
        disabled={isPending}
      >
        {isPending ? "Processing..." : "Accept"}
      </Button>
      <Button
        variant="ghost"
        onClick={handleDecline}
        disabled={isPending}
      >
        Decline
      </Button>
    </div>
  );
}
