import { connection } from "next/server";
import { getAnnouncementsForScheme } from "@/lib/queries/announcements";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AnnouncementsCard } from "../_sections/announcements-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

/** Conversations pill: announcements, with notifications nested here. */
export default async function ConversationsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const announcements = await getAnnouncementsForScheme(id, { includeExpired: true });

  return (
    <div>
      <AnnouncementsCard id={id} announcements={announcements} />
      <Card className="mb-6">
        <CardHeader
          title="Notifications"
          description="Not built yet. Scheme notifications will appear here."
          action={
            <Button href={`/adviser/schemes/${id}/notifications`} variant="secondary">
              Open
            </Button>
          }
        />
      </Card>
    </div>
  );
}
