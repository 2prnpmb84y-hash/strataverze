"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { addCommentAction } from "../actions";

export function CommentSection({
  schemeId,
  workOrderId,
  comments,
}: {
  schemeId: string;
  workOrderId: string;
  comments: {
    id: string;
    content: string;
    createdAt: string;
    authorName: string;
  }[];
}) {
  const action = addCommentAction.bind(null, schemeId, workOrderId);
  const [state, formAction, isPending] = useActionState<
    { error?: string },
    FormData
  >(action, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Existing comments */}
      {comments.length > 0 && (
        <div className="flex flex-col gap-2">
          {comments.map((comment) => {
            const date = new Date(comment.createdAt);
            return (
              <div
                key={comment.id}
                className="rounded-lg bg-muted px-4 py-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-foreground">
                    {comment.authorName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {date.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" at "}
                    {date.toLocaleTimeString("en-AU", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Add comment form */}
      <form action={formAction} className="flex flex-col gap-2">
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
    </div>
  );
}
