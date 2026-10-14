import { getCommentsForWorkOrder } from "@/lib/queries/work-orders";

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
  workOrderId,
}: {
  workOrderId: string;
}) {
  const comments = await getCommentsForWorkOrder(workOrderId);

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

        return (
          <div
            key={comment.id}
            className="rounded-lg bg-muted px-4 py-3"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">
                {authorName}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(createdAt)}
              </p>
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
