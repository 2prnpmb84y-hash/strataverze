"use client";

import { useTransition } from "react";
import { revokeInvitationAction } from "./actions";

export function RevokeButton({
  schemeId,
  invitationId,
}: {
  schemeId: string;
  invitationId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    startTransition(async () => {
      await revokeInvitationAction(schemeId, invitationId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleRevoke}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
    >
      {isPending ? "Revoking..." : "Revoke"}
    </button>
  );
}
