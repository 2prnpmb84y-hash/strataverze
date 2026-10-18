import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getActivityForScheme } from "@/lib/queries/activity-log";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityTimeline } from "@/components/activity-timeline";

export default async function SchemeActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  // Check adviser membership
  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const activities = await getActivityForScheme(id, 200);

  // Map to the shape ActivityTimeline expects
  const mapped = activities.map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    metadata: a.metadata,
    createdAt: a.createdAt,
    actor: {
      firstName: String(a.actor.firstName),
      lastName: String(a.actor.lastName),
      email: String(a.actor.email),
    },
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        description={`Full audit trail for ${String(scheme.name)}.`}
        backHref={`/adviser/schemes/${id}`}
        backLabel={String(scheme.name)}
      />

      {mapped.length === 0 ? (
        <EmptyState
          title="No activity recorded"
          description="Actions taken on this scheme will appear here as an audit trail."
        />
      ) : (
        <Card>
          <CardHeader
            title={`${mapped.length} events`}
            description="Most recent activity shown first."
          />
          <div className="px-6 pb-6">
            <ActivityTimeline activities={mapped} />
          </div>
        </Card>
      )}
    </div>
  );
}
