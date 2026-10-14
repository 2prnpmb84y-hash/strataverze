"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { issueLevyAction } from "../actions";

export function IssueLevyButton({
  schemeId,
  levyId,
}: {
  schemeId: string;
  levyId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleIssue() {
    startTransition(async () => {
      const result = await issueLevyAction(schemeId, levyId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button onClick={handleIssue} disabled={isPending}>
          {isPending ? "Issuing..." : "Confirm Issue"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
        {error && (
          <span className="text-xs text-red-500">{error}</span>
        )}
      </div>
    );
  }

  return (
    <Button variant="secondary" onClick={() => setConfirming(true)}>
      Issue Levy
    </Button>
  );
}
