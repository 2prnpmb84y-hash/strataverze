"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteSchemeAction } from "../actions";

/** `levies` is the building's word for levies (TERMINOLOGY.levies). */
export function DeleteSchemeButton({
  schemeId,
  schemeName,
  levies,
}: {
  schemeId: string;
  schemeName: string;
  levies: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteSchemeAction(schemeId);
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
          Are you sure you want to delete <strong>{schemeName}</strong>? This
          will permanently remove all lots, memberships, {levies}, meetings, and
          documents associated with this scheme. This action cannot be undone.
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
            {isPending ? "Deleting…" : "Yes, Delete Scheme"}
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
      Delete Scheme
    </Button>
  );
}
