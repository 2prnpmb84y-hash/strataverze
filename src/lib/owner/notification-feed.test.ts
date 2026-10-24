import { describe, expect, it } from "vitest";
import { ALL_FEED_ACTIONS, isFeedVisible, ownerFeed, showFeedActor } from "./notification-feed";

/** Finding F13: the owner feed is an allow-list, filtered per viewer. */

const A = "scheme-a";
const B = "scheme-b";

const owner = { profileId: "owner-1", committeeSchemeIds: new Set<string>(), ownWorkOrderIds: new Set(["wo-mine"]) };
const committeeOfA = { profileId: "cm-1", committeeSchemeIds: new Set([A]), ownWorkOrderIds: new Set<string>() };

const act = (action: string, extra: Partial<{ schemeId: string; actorId: string; entityType: string; entityId: string | null }> = {}) => ({
  schemeId: A,
  actorId: "adviser-1",
  action,
  entityType: "Scheme",
  entityId: null,
  ...extra,
});

describe("isFeedVisible", () => {
  it("shows scheme-wide notices to every owner", () => {
    for (const a of ["ANNOUNCEMENT_PUBLISHED", "MEETING_SCHEDULED", "DOCUMENT_UPLOADED", "LEVY_NOTICES_ISSUED", "LEVY_ISSUED"]) {
      expect(isFeedVisible(act(a), owner)).toBe(true);
    }
  });

  it("never shows sensitive activity, to owners or the committee", () => {
    for (const a of [
      "PAYMENT_CONFIRMATION_UPLOADED",
      "PAYMENT_CONFIRMATION_POSSIBLE_DUPLICATE",
      "FINANCIAL_DOCUMENT_ACCESS_DENIED",
      "FINANCIAL_DOCUMENT_UPLOADED",
      "INVITATION_SENT",
      "INVITATION_ACCEPTED",
      "MEMBER_REMOVED",
      "LEVY_PAYMENT_RECORDED",
      "SUPPLIER_BANK_DETAILS_CHANGED",
      "OWNER_CREDIT_REFUND_REQUESTED",
      "AUDIT_EXPORT_DOWNLOADED",
      "SOMETHING_NEW",
    ]) {
      expect(isFeedVisible(act(a), owner)).toBe(false);
      expect(isFeedVisible(act(a), committeeOfA)).toBe(false);
      expect(ALL_FEED_ACTIONS).not.toContain(a);
    }
  });

  it("shows owners work order events only for work orders they raised", () => {
    expect(isFeedVisible(act("WORK_ORDER_STATUS_UPDATED", { entityType: "WorkOrder", entityId: "wo-mine" }), owner)).toBe(true);
    expect(isFeedVisible(act("WORK_ORDER_STATUS_UPDATED", { entityType: "WorkOrder", entityId: "wo-other" }), owner)).toBe(false);
    expect(isFeedVisible(act("WORK_ORDER_CREATED", { entityType: "WorkOrder", entityId: null }), owner)).toBe(false);
  });

  it("shows committee business only to the committee of that scheme", () => {
    expect(isFeedVisible(act("COMPLIANCE_UPDATED"), owner)).toBe(false);
    expect(isFeedVisible(act("COMPLIANCE_UPDATED"), committeeOfA)).toBe(true);
    expect(isFeedVisible(act("COMPLIANCE_UPDATED", { schemeId: B }), committeeOfA)).toBe(false);
    expect(isFeedVisible(act("WORK_ORDER_CREATED", { entityType: "WorkOrder", entityId: "wo-other" }), committeeOfA)).toBe(true);
    expect(isFeedVisible(act("WORK_ORDER_CREATED", { schemeId: B, entityType: "WorkOrder", entityId: "wo-other" }), committeeOfA)).toBe(false);
  });
});

describe("showFeedActor", () => {
  it("does not name other people on financial events", () => {
    expect(showFeedActor(act("LEVY_NOTICES_ISSUED"), owner)).toBe(false);
    expect(showFeedActor(act("LEVY_SCHEDULE_APPROVED"), committeeOfA)).toBe(false);
    expect(showFeedActor(act("LEVY_NOTICES_ISSUED", { actorId: "owner-1" }), owner)).toBe(true);
  });

  it("names the actor on non-financial events", () => {
    expect(showFeedActor(act("ANNOUNCEMENT_PUBLISHED"), owner)).toBe(true);
  });
});

describe("ownerFeed", () => {
  it("filters and marks the actor flag", () => {
    const feed = ownerFeed(
      [act("ANNOUNCEMENT_PUBLISHED"), act("PAYMENT_CONFIRMATION_UPLOADED"), act("LEVY_ISSUED")],
      owner,
    );
    expect(feed.map((f) => [f.action, f.showActor])).toEqual([
      ["ANNOUNCEMENT_PUBLISHED", true],
      ["LEVY_ISSUED", false],
    ]);
  });
});
