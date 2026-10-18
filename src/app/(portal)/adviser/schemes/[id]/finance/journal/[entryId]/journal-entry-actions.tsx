"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/form-field";
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
  const [showReverseForm, setShowReverseForm] = useState(false);

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

  async function handleReverse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const description =
      (form.get("reversalDescription") as string)?.trim() || undefined;

    startTransition(async () => {
      const result = await reverseJournalEntryAction(
        schemeId,
        entryId,
        description,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowReverseForm(false);
      router.refresh();
    });
  }

  const canPost = currentStatus === "DRAFT";
  const canReverse = currentStatus === "POSTED";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {canPost && (
          <Button
            variant="primary"
            onClick={handlePost}
            disabled={isPending}
          >
            {isPending ? "Posting..." : "Post Entry"}
          </Button>
        )}

        {canReverse && (
          <Button
            variant="danger"
            onClick={() => setShowReverseForm(true)}
            disabled={isPending || showReverseForm}
          >
            Reverse Entry
          </Button>
        )}
      </div>

      {/* Reverse confirmation form */}
      {showReverseForm && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-red-700">
            Reverse this journal entry?
          </h3>
          <p className="text-sm text-red-600">
            This will create a new reversing entry with opposite debit and
            credit amounts. The original entry will be marked as reversed.
          </p>
          <form onSubmit={handleReverse} className="space-y-4">
            <TextareaField
              label="Reversal Description (optional)"
              name="reversalDescription"
              placeholder="Reason for reversal..."
              rows={2}
            />
            <div className="flex gap-3">
              <Button
                type="submit"
                variant="danger"
                disabled={isPending}
              >
                {isPending ? "Reversing..." : "Yes, Reverse Entry"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowReverseForm(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
