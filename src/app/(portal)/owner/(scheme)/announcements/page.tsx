import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getAnnouncementsForSchemes } from "@/lib/queries/announcements";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";

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

export default async function OwnerAnnouncementsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
  );
  const schemeIds = schemes.map((s) => s.id);

  const announcements = schemeIds.length > 0
    ? await getAnnouncementsForSchemes(schemeIds)
    : [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Announcements"
        description="Notices from your strata schemes."
      />

      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements"
          description="There are no current announcements for your schemes."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {announcements.map((ann) => {
            const publishedDate = new Date(String(ann.publishedAt));
            const schemeName = ann.scheme?.name ?? schemes.find((s) => s.id === ann.schemeId)?.name ?? "";
            const authorName = [ann.author?.firstName, ann.author?.lastName]
              .filter(Boolean)
              .join(" ") || "Scheme manager";

            return (
              <Card key={ann.id}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      {ann.isPinned && "📌 "}
                      {ann.title}
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {schemeName}
                      {" · "}
                      {authorName}
                      {" · "}
                      {publishedDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${priorityStyles[ann.priority] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {priorityLabels[ann.priority] ?? ann.priority}
                  </span>
                </div>
                <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                  {ann.body}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
