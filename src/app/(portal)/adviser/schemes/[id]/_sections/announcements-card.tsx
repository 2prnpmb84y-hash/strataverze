import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getAnnouncementsForScheme } from "@/lib/queries/announcements";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function AnnouncementsCard({
  id, announcements,
}: {
  id: string;
  announcements: Awaited<ReturnType<typeof getAnnouncementsForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Announcements"
        description={
          announcements.length === 0
            ? "No announcements published yet."
            : `${announcements.length} announcement${announcements.length === 1 ? "" : "s"} published.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/announcements/new`} variant="secondary">
            New Announcement
          </Button>
        }
      />
      {announcements.length > 0 ? (
        <div className="flex flex-col gap-2">
          {announcements.map((ann) => {
            const publishedDate = new Date(String(ann.publishedAt));
            const isExpired = ann.expiresAt && new Date(String(ann.expiresAt)) < new Date();

            const annPriorityStyle: Record<string, string> = {
              NORMAL: "bg-gray-100 text-gray-700",
              IMPORTANT: "bg-amber-100 text-amber-700",
              URGENT: "bg-red-100 text-red-700",
            };

            return (
              <Link
                key={ann.id}
                href={`/adviser/schemes/${id}/announcements/${ann.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {ann.isPinned && "📌 "}
                    {ann.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {publishedDate.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {isExpired && " · Expired"}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${annPriorityStyle[ann.priority] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {ann.priority.charAt(0) + ann.priority.slice(1).toLowerCase()}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Post announcements to notify all scheme members.
        </p>
      )}
    </Card>
  );
}
