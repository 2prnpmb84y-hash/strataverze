import { formatLotLabel } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  LEVY_CREATED: "created a levy",
  LEVY_ISSUED: "issued a levy",
  LEVIES_GENERATED: "generated levies",
  LEVY_PAYMENT_RECORDED: "recorded a levy payment",
  INVITATION_SENT: "sent an invitation",
  INVITATION_ACCEPTED: "accepted an invitation",
  INVITATION_DECLINED: "declined an invitation",
  INVITATION_REVOKED: "revoked an invitation",
  MEMBER_JOINED: "joined the scheme",
  MEMBER_REMOVED: "removed a member",
  DOCUMENT_UPLOADED: "uploaded a document",
  WORK_ORDER_CREATED: "created a work order",
  WORK_ORDER_COMPLETED: "completed a work order",
  MEETING_SCHEDULED: "scheduled a meeting",
  COMPLIANCE_UPDATED: "updated compliance",
  SCHEME_UPDATED: "updated scheme details",
  FUND_CREATED: "created a fund",
  LOT_CREATED: "added a lot",
  STRATA_ROLL_UPDATED: "updated an owner's name on the strata roll",
  OWNER_CHANGED: "recorded a change of owner",
  ONBOARDING_INCOME_BUDGET_SAVED: "entered last year's income and expenditure and this year's budget",
  WORKS_REQUEST_SUBMITTED: "raised a works request",
  WORKS_REQUEST_RESUBMITTED: "sent a works request back to the committee",
  WORKS_DECISION_PROPOSED: "proposed a works decision",
  WORKS_DECISION_VOTED: "voted on a works decision",
  WORKS_DECISION_MADE: "settled a works decision",
  WORKS_DECISION_NOT_AGREED: "closed a works proposal that was not agreed",
  WORKS_DECISION_WITHDRAWN: "withdrew a works proposal",
  WORKS_SETTINGS_UPDATED: "changed the works settings",
  WORKS_PREFERRED_CONTRACTOR_SET: "set a preferred contractor",
  WORKS_PREFERRED_CONTRACTOR_REMOVED: "removed a preferred contractor",
  WORKS_ORDER_ISSUED: "issued an urgent work order",
  WORKS_ORDER_NO_CONTRACTOR: "found no contractor for an urgent order",
  WORKS_ORDER_ACCEPTED: "accepted an urgent work order",
  WORKS_ORDER_DECLINED: "declined an urgent work order",
  WORKS_ORDER_CANCELLED: "cancelled an unanswered work order",
};

const ACTION_ICONS: Record<string, string> = {
  LEVY_CREATED: "💰",
  LEVY_ISSUED: "📤",
  LEVIES_GENERATED: "💰",
  LEVY_PAYMENT_RECORDED: "✅",
  INVITATION_SENT: "✉️",
  INVITATION_ACCEPTED: "🤝",
  INVITATION_DECLINED: "❌",
  INVITATION_REVOKED: "🚫",
  MEMBER_JOINED: "👤",
  MEMBER_REMOVED: "👤",
  DOCUMENT_UPLOADED: "📄",
  WORK_ORDER_CREATED: "🔧",
  WORK_ORDER_COMPLETED: "🔧",
  MEETING_SCHEDULED: "📅",
  COMPLIANCE_UPDATED: "📋",
  SCHEME_UPDATED: "⚙️",
  FUND_CREATED: "🏦",
  LOT_CREATED: "🏠",
  STRATA_ROLL_UPDATED: "📜",
  OWNER_CHANGED: "🔑",
  ONBOARDING_INCOME_BUDGET_SAVED: "📊",
  WORKS_REQUEST_SUBMITTED: "🔧",
  WORKS_REQUEST_RESUBMITTED: "🔧",
  WORKS_DECISION_PROPOSED: "🗳️",
  WORKS_DECISION_VOTED: "🗳️",
  WORKS_DECISION_MADE: "✅",
  WORKS_DECISION_NOT_AGREED: "❌",
  WORKS_DECISION_WITHDRAWN: "↩️",
  WORKS_SETTINGS_UPDATED: "⚙️",
  WORKS_PREFERRED_CONTRACTOR_SET: "🔧",
  WORKS_PREFERRED_CONTRACTOR_REMOVED: "🔧",
  WORKS_ORDER_ISSUED: "🔧",
  WORKS_ORDER_NO_CONTRACTOR: "⚠️",
  WORKS_ORDER_ACCEPTED: "✅",
  WORKS_ORDER_DECLINED: "❌",
  WORKS_ORDER_CANCELLED: "⏹️",
};

type ActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: unknown;
  actor: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMetadataDetail(action: string, metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;

  switch (action) {
    case "LEVY_CREATED":
    case "LEVIES_GENERATED":
      if (metadata.title) return String(metadata.title);
      if (metadata.count) return `${metadata.count} levies`;
      return null;
    case "LEVY_PAYMENT_RECORDED":
      if (metadata.amount) return `$${Number(metadata.amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
      return null;
    case "INVITATION_SENT":
      if (metadata.email) return `to ${metadata.email}`;
      return null;
    case "DOCUMENT_UPLOADED":
      if (metadata.title) return String(metadata.title);
      return null;
    case "WORK_ORDER_CREATED":
      if (metadata.title) return String(metadata.title);
      return null;
    case "MEETING_SCHEDULED":
      if (metadata.title) return String(metadata.title);
      return null;
    case "COMPLIANCE_UPDATED":
      if (metadata.status) return String(metadata.status).toLowerCase().replace("_", " ");
      if (metadata.title) return String(metadata.title);
      return null;
    case "FUND_CREATED":
      if (metadata.name) return String(metadata.name);
      return null;
    case "LOT_CREATED":
    case "STRATA_ROLL_UPDATED":
    case "OWNER_CHANGED":
      if (metadata.lotNumber) return formatLotLabel(String(metadata.lotNumber));
      return null;
    default:
      return null;
  }
}

export function ActivityTimeline({ activities }: { activities: ActivityEntry[] }) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No activity recorded yet. Actions taken on this scheme will appear here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {activities.map((activity, i) => {
        const actorName =
          `${activity.actor.firstName} ${activity.actor.lastName}`.trim() ||
          activity.actor.email;
        const label = ACTION_LABELS[activity.action] ?? activity.action.toLowerCase().replace(/_/g, " ");
        const icon = ACTION_ICONS[activity.action] ?? "📌";
        const detail = getMetadataDetail(
          activity.action,
          activity.metadata as Record<string, unknown> | null,
        );
        const isLast = i === activities.length - 1;

        return (
          <div key={activity.id} className="flex gap-3">
            {/* Timeline line and dot */}
            <div className="flex flex-col items-center">
              <span className="text-base leading-6 w-6 text-center" aria-hidden="true">
                {icon}
              </span>
              {!isLast && (
                <div className="w-px flex-1 bg-line min-h-4" />
              )}
            </div>

            {/* Content */}
            <div className="pb-4 min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{actorName}</span>{" "}
                {label}
                {detail ? (
                  <span className="text-ink-muted"> — {detail}</span>
                ) : null}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {formatRelativeTime(String(activity.createdAt))}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
