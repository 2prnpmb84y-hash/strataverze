import { notFound } from "next/navigation";
import { getAnnouncementById } from "@/lib/queries/announcements";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { AnnouncementEditForm } from "../announcement-form";
import { DeleteAnnouncementButton } from "./delete-announcement-button";

const priorityLabels: Record<string, string> = {
  NORMAL: "Normal",
  IMPORTANT: "Important",
  URGENT: "Urgent",
};

const priorityStyles: Record<string, string> = {
  NORMAL: "bg-gray-100 text-gray-700",
  IMPORTANT: "bg-amber-100 text-amber-700",
  URGENT: "bg-red-100 text-red-700",
};

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string; announcementId: string }>;
}) {
  const { id, announcementId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const announcement = await getAnnouncementById(announcementId);
  if (!announcement || announcement.schemeId !== id) notFound();

  const publishedDate = new Date(String(announcement.publishedAt));
  const authorName = [announcement.author.firstName, announcement.author.lastName]
    .filter(Boolean)
    .join(" ") || announcement.author.email;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={announcement.title}
        description={announcement.scheme.name}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* Meta info */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            Posted by <span className="font-medium text-foreground">{authorName}</span>
          </span>
          <span>·</span>
          <span>
            {publishedDate.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span>·</span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityStyles[announcement.priority] ?? "bg-gray-100 text-gray-700"}`}
          >
            {priorityLabels[announcement.priority] ?? announcement.priority}
          </span>
          {announcement.isPinned && (
            <>
              <span>·</span>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                Pinned
              </span>
            </>
          )}
          {announcement.expiresAt ? (
            <>
              <span>·</span>
              <span>
                Expires{" "}
                {new Date(String(announcement.expiresAt)).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </span>
            </>
          ) : null}
        </div>
        <div className="mt-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {announcement.body}
        </div>
      </Card>

      {/* Edit form */}
      <Card className="mb-6">
        <CardHeader title="Edit Announcement" />
        <AnnouncementEditForm
          schemeId={id}
          announcementId={announcementId}
          defaults={{
            title: announcement.title,
            body: announcement.body,
            priority: announcement.priority,
            isPinned: announcement.isPinned,
            expiresAt: announcement.expiresAt
              ? String(announcement.expiresAt)
              : null,
          }}
        />
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="This action cannot be undone."
        />
        <DeleteAnnouncementButton
          schemeId={id}
          announcementId={announcementId}
        />
      </Card>
    </div>
  );
}
