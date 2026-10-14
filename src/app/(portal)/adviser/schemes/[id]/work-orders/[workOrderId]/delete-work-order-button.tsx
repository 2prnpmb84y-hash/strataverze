"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteWorkOrderAction } from "../actions";

export function DeleteWorkOrderButton({
  schemeId,
  workOrderId,
  workOrderTitle,
}: {
  schemeId: string;
  workOrderId: string;
  workOrderTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteWorkOrderAction(schemeId, workOrderId);
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete Work Order
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-600">
        Delete <strong>{workOrderTitle}</strong>? This cannot be undone.
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
