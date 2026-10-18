"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteLevyAction } from "../actions";

export function DeleteLevyButton({
  schemeId,
  levyId,
  levyTitle,
}: {
  schemeId: string;
  levyId: string;
  levyTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteLevyAction(schemeId, levyId);
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700 mb-3">
          Are you sure you want to delete <strong>{levyTitle}</strong>? All
          associated levy items will also be removed.
        </p>
        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}
        <div className="flex gap-3">
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Yes, Delete Levy"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setConfirming(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button variant="danger" onClick={() => setConfirming(true)}>
      Delete Levy
    </Button>
  );
}
