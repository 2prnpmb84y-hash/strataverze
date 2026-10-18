"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  postJournalEntryAction,
  reverseJournalEntryAction,
} from "../../actions";

interface Props {
  schemeId: string;
  entryId: string;
  currentStatus: string;
}

export function JournalEntryActions({
  schemeId,
  entryId,
  currentStatus,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [confirmReverse, setConfirmReverse] = useState(false);

  async function handlePost() {
    setError(undefined);
    startTransition(async () => {
      const result = await postJournalEntryAction(schemeId, entryId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function handleReverse() {
    if (!confirmReverse) {
      setConfirmReverse(true);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await reverseJournalEntryAction(schemeId, entryId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {currentStatus === "DRAFT" && (
        <Button onClick={handlePost} disabled={isPending}>
          {isPending ? "Posting..." : "Post Entry"}
        </Button>
      )}

      {currentStatus === "POSTED" && (
        <div className="flex items-center gap-3">
          <Button
            variant="danger"
            onClick={handleReverse}
            disabled={isPending}
          >
            {isPending
              ? "Reversing..."
              : confirmReverse
                ? "Confirm Reversal"
                : "Reverse Entry"}
          </Button>
          {confirmReverse && !isPending && (
            <button
              type="button"
              onClick={() => setConfirmReverse(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          )}
          {confirmReverse && (
            <p className="text-xs text-muted-foreground">
              This will create a reversal entry that mirrors all debits and
              credits. This cannot be undone.
            </p>
          )}
        </div>
      )}

      {currentStatus === "REVERSED" && (
        <p className="text-sm text-muted-foreground">
          This entry has been reversed.
        </p>
      )}
    </div>
  );
}
