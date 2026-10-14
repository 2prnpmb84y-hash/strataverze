import { getCurrentProfile } from "@/lib/queries/profiles";
import { getCommentsForWorkOrder } from "@/lib/queries/work-orders";
import { DeleteCommentButton } from "./comment-form";

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function CommentThread({
  schemeId,
  workOrderId,
}: {
  schemeId: string;
  workOrderId: string;
}) {
  const [comments, profile] = await Promise.all([
    getCommentsForWorkOrder(workOrderId),
    getCurrentProfile(),
  ]);

  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No comments yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.map((comment) => {
        const createdAt = new Date(String(comment.createdAt));
        const authorName =
          `${comment.author.firstName} ${comment.author.lastName}`.trim() ||
          comment.author.email;
        const isAuthor = profile?.id === comment.authorId;

        return (
          <div
            key={comment.id}
            className="rounded-lg bg-muted px-4 py-3"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">
                {authorName}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {timeAgo(createdAt)}
                </p>
                {isAuthor && (
                  <DeleteCommentButton
                    schemeId={schemeId}
                    workOrderId={workOrderId}
                    commentId={comment.id}
                  />
                )}
              </div>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {comment.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}
