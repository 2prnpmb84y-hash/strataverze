"use client";

import { useActionState, useRef, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addCommentAction, deleteCommentAction } from "./actions";

export function CommentForm({
  workOrderId,
}: {
  workOrderId: string;
}) {
  const action = addCommentAction.bind(null, workOrderId);
  const [state, formAction, isPending] = useActionState<
    { error?: string },
    FormData
  >(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const prevPending = useRef(isPending);

  // Clear the textarea after a successful submission
  useEffect(() => {
    if (prevPending.current && !isPending && !state.error) {
      formRef.current?.reset();
    }
    prevPending.current = isPending;
  }, [isPending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      {state.error && (
        <p className="text-xs text-red-500">{state.error}</p>
      )}
      <textarea
        name="content"
        required
        rows={2}
        placeholder="Add a comment..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors resize-y"
      />
      <div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Posting..." : "Post Comment"}
        </Button>
      </div>
    </form>
  );
}

export function DeleteCommentButton({
  workOrderId,
  commentId,
}: {
  workOrderId: string;
  commentId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    startTransition(async () => {
      await deleteCommentAction(workOrderId, commentId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
      aria-label="Delete comment"
    >
      {isPending ? "..." : "Delete"}
    </button>
  );
}
