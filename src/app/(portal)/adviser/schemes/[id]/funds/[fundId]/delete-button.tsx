"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteFundAction } from "../actions";

export function DeleteFundButton({
  schemeId,
  fundId,
  fundName,
}: {
  schemeId: string;
  fundId: string;
  fundName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteFundAction(schemeId, fundId);
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete Fund
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-600">
        Delete <strong>{fundName}</strong>? This cannot be undone.
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
