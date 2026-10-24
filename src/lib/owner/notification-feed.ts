/**
 * What the owner portal's notifications feed may show (pure). Security
 * finding F13: the feed listed the whole activity log of the owner's schemes,
 * including who uploaded payment confirmations, financial document access
 * denials, invitations and debt recovery activity.
 *
 * Only allow-listed action types are shown. Owners see scheme-wide notices and
 * events on work orders they raised; committee members of THAT scheme see
 * committee business too. Actor names on financial events are hidden unless
 * the viewer is the actor.
 */

/** Scheme-wide notices every owner of the scheme may see. */
export const OWNER_FEED_ACTIONS = [
  "ANNOUNCEMENT_PUBLISHED",
  "MEETING_SCHEDULED",
  "DOCUMENT_UPLOADED",
  "LEVY_ISSUED",
  "LEVY_NOTICES_ISSUED",
  "BYLAW_CREATED",
  "BYLAW_UPDATED",
] as const;

/** Work order events: owners see them only for work orders they raised. */
export const WORK_ORDER_FEED_ACTIONS = [
  "WORK_ORDER_CREATED",
  "WORK_ORDER_STATUS_UPDATED",
  "WORK_ORDER_COMPLETED",
] as const;

/** Extra types committee members of the scheme may see. */
export const COMMITTEE_FEED_ACTIONS = [
  "COMPLIANCE_UPDATED",
  "SCHEME_UPDATED",
  "CONTACT_CREATED",
  "INSURANCE_CREATED",
  "INSURANCE_UPDATED",
  "LEVY_CREATED",
  "LEVIES_GENERATED",
  "LEVY_SCHEDULE_CREATED",
  "LEVY_SCHEDULE_APPROVED",
  "SPECIAL_LEVY_CREATED",
  "FUND_CREATED",
  "BUDGET_PROPOSED",
  "BUDGET_ADOPTED",
  "CAPITAL_WORKS_PLAN_ADOPTED",
] as const;

/** Every action type the feed can show, for the database filter. */
export const ALL_FEED_ACTIONS: readonly string[] = [
  ...OWNER_FEED_ACTIONS,
  ...WORK_ORDER_FEED_ACTIONS,
  ...COMMITTEE_FEED_ACTIONS,
];

/** Events about money: the actor is not named to other people. */
const FINANCIAL_ACTIONS = new Set<string>([
  "LEVY_ISSUED",
  "LEVY_NOTICES_ISSUED",
  "LEVY_CREATED",
  "LEVIES_GENERATED",
  "LEVY_SCHEDULE_CREATED",
  "LEVY_SCHEDULE_APPROVED",
  "SPECIAL_LEVY_CREATED",
  "FUND_CREATED",
  "BUDGET_PROPOSED",
  "BUDGET_ADOPTED",
  "CAPITAL_WORKS_PLAN_ADOPTED",
]);

export type FeedActivity = {
  schemeId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
};

export type FeedViewer = {
  profileId: string;
  /** Schemes in view where the viewer sits on the committee. */
  committeeSchemeIds: ReadonlySet<string>;
  /** Work orders the viewer raised. */
  ownWorkOrderIds: ReadonlySet<string>;
};

/** Whether the viewer may see this activity in their feed. */
export function isFeedVisible(activity: FeedActivity, viewer: FeedViewer): boolean {
  const a = activity.action;
  if ((OWNER_FEED_ACTIONS as readonly string[]).includes(a)) return true;
  const committee = viewer.committeeSchemeIds.has(activity.schemeId);
  if ((WORK_ORDER_FEED_ACTIONS as readonly string[]).includes(a)) {
    if (committee) return true;
    return activity.entityType === "WorkOrder" && !!activity.entityId && viewer.ownWorkOrderIds.has(activity.entityId);
  }
  if ((COMMITTEE_FEED_ACTIONS as readonly string[]).includes(a)) return committee;
  return false;
}

/** Whether the feed may name who did it. */
export function showFeedActor(activity: FeedActivity, viewer: FeedViewer): boolean {
  if (activity.actorId === viewer.profileId) return true;
  return !FINANCIAL_ACTIONS.has(activity.action);
}

/** The visible activities, each marked with whether to name the actor. */
export function ownerFeed<T extends FeedActivity>(
  activities: readonly T[],
  viewer: FeedViewer,
): Array<T & { showActor: boolean }> {
  return activities
    .filter((a) => isFeedVisible(a, viewer))
    .map((a) => ({ ...a, showActor: showFeedActor(a, viewer) }));
}
