import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getSchemeNotificationCounts } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getVisibleDocumentsForSchemes } from "@/lib/documents/viewers";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { formatLotLabel } from "@/lib/format";
import { connection } from "next/server";

export default async function OwnerPropertiesPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const ownerSchemes = await getSchemesForOwner(profile.id);

  const ownerLotIds = new Set(
    ownerSchemes.flatMap((s) =>
      s.memberships
        .filter((m) => m.lotId)
        .map((m) => m.lotId as string),
    ),
  );

  const schemeIds = ownerSchemes.map((s) => s.id);

  const [notificationCounts, meetings, workOrders, documents] =
    await Promise.all([
      getSchemeNotificationCounts(schemeIds, ownerLotIds),
      schemeIds.length > 0
        ? getUpcomingMeetingsForOwner(schemeIds, 5)
        : Promise.resolve([]),
      schemeIds.length > 0
        ? getWorkOrdersForSchemes(schemeIds, 5)
        : Promise.resolve([]),
      schemeIds.length > 0
        ? getVisibleDocumentsForSchemes(profile.id, schemeIds, 5)
        : Promise.resolve([]),
    ]);

  const totalProperties = ownerSchemes.length;
  const totalLots = ownerSchemes.reduce((s, c) => s + c.totalLots, 0);

  // Build scheme names map for highlights
  const schemeNames: Record<string, string> = {};
  for (const s of ownerSchemes) {
    schemeNames[s.id] = s.name;
  }

  // Status labels
  const woStatusLabels: Record<string, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };

  return (
    <div className="max-w-5xl">
      {/* Profile card */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-turquoise text-white text-xl font-bold shrink-0">
          {(profile.firstName ?? "U").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-heading text-ink">
            {profile.firstName} {profile.lastName}
          </h1>
          <p className="text-sm text-ink-muted">
            {totalProperties}{" "}
            {totalProperties === 1 ? "property" : "properties"} &middot;{" "}
            {totalLots} total lots
          </p>
        </div>
      </div>

      {/* Main layout: tiles + highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: compact property tiles */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold font-heading text-ink">
              My Properties
            </h2>
            <Button variant="secondary" href="/owner">
              Manage
            </Button>
          </div>

          {ownerSchemes.length === 0 ? (
            <Card>
              <div className="p-6 text-center">
                <p className="text-sm text-ink-muted">
                  No properties registered yet. Contact your strata manager to
                  get connected.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ownerSchemes.map((scheme) => {
                const membership = scheme.memberships[0];
                const counts = notificationCounts.get(scheme.id) ?? {
                  pendingLevies: 0,
                  activeWorkOrders: 0,
                  upcomingMeetings: 0,
                };
                const total =
                  counts.pendingLevies +
                  counts.activeWorkOrders +
                  counts.upcomingMeetings;

                return (
                  <a
                    key={scheme.id}
                    href="/owner/dashboard"
                    className="group rounded-[var(--radius-card)] bg-white border border-line overflow-hidden transition-all hover:shadow-md hover:border-mint"
                  >
                    {/* Colour bar */}
                    <div className="h-1.5 bg-turquoise" />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="inline-flex items-center rounded-md bg-mint-soft px-2 py-0.5 text-[10px] font-semibold text-turquoise">
                          {scheme.planNumber}
                        </span>
                        {total > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                            {total}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-ink leading-snug mb-0.5">
                        {scheme.address}
                      </p>
                      <p className="text-xs text-ink-muted mb-2">
                        {scheme.suburb}, {scheme.state} {scheme.postcode}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                        {membership?.lot?.lotNumber && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                            {formatLotLabel(membership.lot.lotNumber)}
                          </span>
                        )}
                        <span>{scheme.totalLots} lots</span>
                      </div>

                      {/* Notification breakdown */}
                      {total > 0 && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-line text-[11px] text-ink-muted">
                          {counts.pendingLevies > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                              {counts.pendingLevies}
                            </span>
                          )}
                          {counts.activeWorkOrders > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                              {counts.activeWorkOrders}
                            </span>
                          )}
                          {counts.upcomingMeetings > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-turquoise" />
                              {counts.upcomingMeetings}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Highlights panel */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-bold font-heading text-ink mb-4">
            Highlights
          </h2>

          <div className="flex flex-col gap-4">
            {/* Upcoming meetings */}
            <Card>
              <CardHeader
                title="Upcoming Meetings"
                action={
                  <Button variant="ghost" href="/owner/meetings">
                    View
                  </Button>
                }
              />
              {meetings.length === 0 ? (
                <p className="text-xs text-ink-muted px-4 pb-3">
                  No upcoming meetings.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 px-1 pb-2">
                  {meetings
                    .filter((m) => m.status === "SCHEDULED")
                    .slice(0, 3)
                    .map((m) => {
                      const d = new Date(String(m.scheduledAt));
                      return (
                        <div
                          key={m.id}
                          className="rounded-lg bg-muted/60 px-3 py-2"
                        >
                          <p className="text-xs font-medium text-ink truncate">
                            {m.title}
                          </p>
                          <p className="text-[11px] text-ink-muted">
                            {schemeNames[m.schemeId] ?? ""} &middot;{" "}
                            {d.toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                        </div>
                      );
                    })}
                </div>
              )}
            </Card>

            {/* Recent work orders */}
            <Card>
              <CardHeader
                title="Work Orders"
                action={
                  <Button variant="ghost" href="/owner/maintenance">
                    View
                  </Button>
                }
              />
              {workOrders.length === 0 ? (
                <p className="text-xs text-ink-muted px-4 pb-3">
                  No active work orders.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 px-1 pb-2">
                  {workOrders.slice(0, 3).map((wo) => (
                    <div
                      key={wo.id}
                      className="rounded-lg bg-muted/60 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-ink truncate">
                          {wo.title}
                        </p>
                        <StatusChip
                          status={woStatusLabels[wo.status] ?? wo.status}
                        />
                      </div>
                      <p className="text-[11px] text-ink-muted">
                        {schemeNames[wo.schemeId] ?? ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Recent documents */}
            <Card>
              <CardHeader
                title="Recent Documents"
                action={
                  <Button variant="ghost" href="/owner/documents">
                    View
                  </Button>
                }
              />
              {documents.length === 0 ? (
                <p className="text-xs text-ink-muted px-4 pb-3">
                  No documents uploaded yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 px-1 pb-2">
                  {documents.slice(0, 3).map((doc) => {
                    const d = new Date(String(doc.createdAt));
                    return (
                      <div
                        key={doc.id}
                        className="rounded-lg bg-muted/60 px-3 py-2"
                      >
                        <p className="text-xs font-medium text-ink truncate">
                          {doc.title}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {doc.category} &middot;{" "}
                          {d.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
