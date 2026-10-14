"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteComplianceAction } from "../actions";

export function DeleteComplianceButton({
  schemeId,
  itemId,
  itemTitle,
}: {
  schemeId: string;
  itemId: string;
  itemTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteComplianceAction(schemeId, itemId);
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete Compliance Item
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-600">
        Delete <strong>{itemTitle}</strong>? This cannot be undone.
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
