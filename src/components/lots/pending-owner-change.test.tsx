/**
 * The review card of a held change of owner (H-1): what confirming does with
 * the new owner's invitation, including that the invitee declined an earlier
 * one (merge review L4, 31 Oct 2026). Synthetic data only.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PendingOwnerChangeView } from "@/lib/owner/owner-change-requests";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/change-owner-review", () => ({ confirmOwnerChangeAction: vi.fn(), rejectOwnerChangeAction: vi.fn() }));

const { PendingOwnerChange } = await import("./pending-owner-change");

const view = (effect: Partial<PendingOwnerChangeView["effect"]>): PendingOwnerChangeView => ({
  id: "r1",
  ownerName: "Ms Nia New",
  email: "nia@example.test",
  mobile: null,
  phone: null,
  address: null,
  settlementDate: "2026-10-30",
  invite: true,
  hasNotice: false,
  recordedByName: "Chris Chair",
  recordedByEmail: "chair@example.test",
  recordedOn: "2026-10-30",
  reviewer: "the Adviser",
  effect: {
    rollOwnerName: "Ms Old Owner",
    accessEnding: [],
    seatsEnding: [],
    seatsKept: [],
    invitation: "REFRESH",
    invitationActiveLot: null,
    invitationPreviousStatus: null,
    withdrawnInvitations: [],
    ...effect,
  },
  fingerprint: "0".repeat(64),
  resemblance: null,
});

const render = (effect: Partial<PendingOwnerChangeView["effect"]>) =>
  renderToStaticMarkup(<PendingOwnerChange schemeId="S1" lotLabel="Lot 1" change={view(effect)} />);

describe("the review card's invitation line", () => {
  it("says when the invitee declined the earlier invitation that confirming sends again", () => {
    const html = render({ invitation: "REFRESH", invitationPreviousStatus: "DECLINED" });
    expect(html).toContain("the invitee declined an earlier invitation; confirming sends it again");
  });

  it("does not say so for an expired or revoked one", () => {
    for (const status of ["EXPIRED", "PENDING"]) {
      const html = render({ invitation: "REFRESH", invitationPreviousStatus: status });
      expect(html).not.toContain("declined");
      expect(html).toContain("earlier invitation is sent again");
    }
  });

  it("says when an earlier invitation cannot be reused", () => {
    expect(render({ invitation: "NOT_REUSABLE" })).toContain("earlier invitation cannot be sent again");
  });
});
