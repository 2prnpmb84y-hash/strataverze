import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getActivityForSchemes } from "@/lib/queries/activity-log";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";

const actionLabels: Record<string, string> = {
  LEVY_CREATED: "New levy created",
  LEVY_ISSUED: "Levy notice issued",
  LEVIES_GENERATED: "Levies generated",
  LEVY_PAYMENT_RECORDED: "Payment recorded",
  LEVY_NOTICES_ISSUED: "Levy notices issued",
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
    await getSelectedSchemeId(),
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
  const activities = await getActivityForSchemes(schemeIds, 100);

  const schemeNames = new Map(schemes.map((s) => [s.id, String(s.name)]));

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
                  actionLabels[item.action] ??
                  item.action.replace(/_/g, " ").toLowerCase();
                const icon = actionIcons[item.action] ?? "📌";
                const schemeName = schemeNames.get(item.schemeId) ?? "";
                const actorName = item.actor
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
                        {schemeName} &middot; {actorName}
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
