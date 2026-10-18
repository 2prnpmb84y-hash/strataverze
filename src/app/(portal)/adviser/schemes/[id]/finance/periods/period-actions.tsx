"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closePeriodAction,
  lockPeriodAction,
  reopenPeriodAction,
} from "../actions";

export function PeriodActions({
  schemeId,
  periodId,
  status,
}: {
  schemeId: string;
  periodId: string;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAction(
    action: (schemeId: string, periodId: string) => Promise<{ error?: string; success?: boolean }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(schemeId, periodId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {error && (
        <span className="text-xs text-red-600 mr-2">{error}</span>
      )}

      {status === "OPEN" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleAction(closePeriodAction)}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
        >
          {isPending ? "..." : "Close"}
        </button>
      )}

      {status === "CLOSED" && (
        <>
          <a
            href={`/adviser/schemes/${schemeId}/finance/periods/adjust?periodId=${periodId}`}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
          >
            Adjustment
          </a>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAction(reopenPeriodAction)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            {isPending ? "..." : "Reopen"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAction(lockPeriodAction)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isPending ? "..." : "Lock"}
          </button>
        </>
      )}

      {status === "LOCKED" && (
        <span className="text-xs text-ink-muted italic">Locked</span>
      )}
    </div>
  );
}
