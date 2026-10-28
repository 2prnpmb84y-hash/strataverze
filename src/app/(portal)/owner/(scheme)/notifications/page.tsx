import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { ALL_FEED_ACTIONS, ownerFeed } from "@/lib/owner/notification-feed";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee, getSchemesForOwner } from "@/lib/queries/schemes";
import { getActivityForSchemes } from "@/lib/queries/activity-log";
import { hiddenDocumentIds } from "@/lib/documents/viewers";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { entryTypeLabel, packWordsFor, type PackWords } from "@/lib/jurisdiction/screen-words";

/** The labels that name a levy, in each building's words. The actions are stored as they are. */
const levyActionLabels = (w: PackWords): Record<string, string> => ({
  LEVY_CREATED: `New ${w.levy} created`,
  LEVY_ISSUED: `${w.Levy} notice issued`,
  LEVIES_GENERATED: `${w.Levies} generated`,
  LEVY_NOTICES_ISSUED: `${w.Levy} notices issued`,
});

const actionLabels: Record<string, string> = {
  LEVY_PAYMENT_RECORDED: "Payment recorded",
  MEETING_SCHEDULED: "Meeting scheduled",
  WORK_ORDER_CREATED: "Work order raised",
  WORK_ORDER_COMPLETED: "Work order completed",
  WORK_ORDER_STATUS_UPDATED: "Work order updated",
  DOCUMENT_UPLOADED: "Document uploaded",
  ANNOUNCEMENT_PUBLISHED: "Announcement published",
  COMPLIANCE_UPDATED: "Compliance updated",
  SCHEME_UPDATED: "Scheme updated",
  BYLAW_CREATED: "New by-law added",
  BYLAW_UPDATED: "By-law updated",
  INSURANCE_CREATED: "Insurance policy added",
  INSURANCE_UPDATED: "Insurance policy updated",
  CONTACT_CREATED: "Contact added",
  FUND_CREATED: "Fund created",
  PAYMENT_CONFIRMATION_UPLOADED: "Payment confirmation uploaded",
  FINANCIAL_DOCUMENT_UPLOADED: "Financial document uploaded",
  FINANCIAL_DOCUMENT_REVIEWED: "Document reviewed",
};

const actionIcons: Record<string, string> = {
  LEVY_CREATED: "💰",
  LEVY_ISSUED: "📄",
  LEVY_PAYMENT_RECORDED: "✅",
  MEETING_SCHEDULED: "📅",
  WORK_ORDER_CREATED: "🔧",
  WORK_ORDER_COMPLETED: "✅",
  DOCUMENT_UPLOADED: "📎",
  ANNOUNCEMENT_PUBLISHED: "📢",
  COMPLIANCE_UPDATED: "📋",
  SCHEME_UPDATED: "🏢",
  BYLAW_CREATED: "📜",
  INSURANCE_CREATED: "🛡️",
  PAYMENT_CONFIRMATION_UPLOADED: "💳",
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OwnerNotificationsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
  );
  if (schemes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Notifications"
          description="Recent activity across your properties."
        />
        <EmptyState
          title="No properties found"
          description="You are not currently registered as an owner in any strata scheme."
        />
      </div>
    );
  }

  const schemeIds = schemes.map((s) => s.id);

  // Only allow-listed, owner-visible activity (F13): scheme-wide notices,
  // events on work orders this owner raised, and committee business for the
  // schemes where they sit on the committee.
  const [committeeSchemes, ownWorkOrders, logged] = await Promise.all([
    getSchemesForCommittee(profile.id),
    db.orm.public.WorkOrder
      .where((wo) => and(wo.schemeId.in(schemeIds), wo.raisedById.eq(profile.id)))
      .limit(2000)
      .all(),
    getActivityForSchemes(schemeIds, 200, ALL_FEED_ACTIONS),
  ]);
  const hiddenDocuments = await hiddenDocumentIds(
    profile.id,
    logged.filter((a) => a.entityType === "Document" && a.entityId).map((a) => a.entityId as string),
  );
  const activities = ownerFeed(logged, {
    profileId: profile.id,
    hiddenDocumentIds: hiddenDocuments,
    committeeSchemeIds: new Set(committeeSchemes.map((s) => s.id).filter((id) => schemeIds.includes(id))),
    ownWorkOrderIds: new Set(ownWorkOrders.map((wo) => wo.id)),
  }).slice(0, 100);

  const schemeNames = new Map(schemes.map((s) => [s.id, String(s.name)]));
  const wordsBy = new Map(schemes.map((s) => [s.id, packWordsFor(rulesForState(s.state).rules)]));
  const labelsBy = new Map([...wordsBy].map(([id, w]) => [id, { ...actionLabels, ...levyActionLabels(w) }]));

  // Group activities by date
  const grouped = new Map<string, typeof activities>();
  for (const activity of activities) {
    const date = new Date(String(activity.createdAt)).toLocaleDateString(
      "en-AU",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    );
    const group = grouped.get(date) ?? [];
    group.push(activity);
    grouped.set(date, group);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Recent activity across your properties."
      />

      {activities.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="There is no recent activity for your properties."
        />
      ) : (
        Array.from(grouped.entries()).map(([date, items]) => (
          <Card key={date}>
            <CardHeader title={date} />
            <div className="divide-y divide-line -mx-6">
              {items.map((item) => {
                const createdAt = new Date(String(item.createdAt));
                const label =
                  (labelsBy.get(item.schemeId) ?? actionLabels)[item.action] ??
                  // Any other action, its levy and late charge parts in the building's words.
                  (wordsBy.has(item.schemeId) ? entryTypeLabel(item.action, wordsBy.get(item.schemeId)!) : item.action).replace(/_/g, " ").toLowerCase();
                const icon = actionIcons[item.action] ?? "📌";
                const schemeName = schemeNames.get(item.schemeId) ?? "";
                // Financial events do not name other people.
                const actorName = !item.showActor
                  ? ""
                  : item.actor
                    ? `${String(item.actor.firstName)} ${String(item.actor.lastName)}`
                    : "System";

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 px-6 py-3"
                  >
                    <span className="text-lg mt-0.5 shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {label}
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {schemeName}
                        {actorName && <> &middot; {actorName}</>}
                      </p>
                    </div>
                    <span className="text-xs text-ink-muted whitespace-nowrap shrink-0">
                      {formatTimeAgo(createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
