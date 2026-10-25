import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The works marketplace server actions, called directly as an attacker
 * would (bypassing the pages): role checks, the building in scope, and the
 * MFA step-up on settings.
 */

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const stepUp = vi.hoisted(() => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/mfa-enforcement", () => ({ requireRecentMfa: stepUp.requireRecentMfa }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
const activity = vi.hoisted(() => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => activity);
const notify = vi.hoisted(() => ({ notifyRequestSubmitted: vi.fn(async () => {}), notifyVoteNeeded: vi.fn(async () => {}), notifyDecision: vi.fn(async () => {}), notifySettingsChanged: vi.fn(async () => {}) }));
vi.mock("@/lib/works/notify", () => notify);
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/storage/server-storage", () => ({ signDownloads: vi.fn(async () => []) }));

// Who is calling, and their roles on each building.
const caller = vi.hoisted(() => ({ id: "owner", roles: {} as Record<string, string[]> }));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return {
    ...actual,
    requireSchemeMembership: async (schemeId: string, allowed: string[]) => {
      const held = (caller.roles[schemeId] ?? []).filter((r) => allowed.includes(r));
      if (!held.length) throw new actual.AuthorisationError("You do not have permission to perform this action.");
      return { profile: { id: caller.id }, membership: {}, roles: held };
    },
  };
});

import { sharedFake } from "@/test/fake-orm";
import {
  proposeWorksRouteAction,
  saveWorksSettingsAction,
  setPreferredContractorAction,
  submitWorksRequestAction,
  voteWorksDecisionAction,
} from "./works-marketplace";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const request = { title: "Leak in the car park", trade: "Plumbing", description: "Water dripping from the ceiling since Monday." };

beforeEach(() => {
  caller.id = "owner";
  caller.roles = { [A]: ["OWNER"] };
  stepUp.requireRecentMfa.mockReset();
  stepUp.requireRecentMfa.mockImplementation(async () => {});
  sharedFake.reset({
    SchemeMembership: [
      { schemeId: A, profileId: "m1", role: "COMMITTEE", isActive: true },
      { schemeId: A, profileId: "m2", role: "COMMITTEE", isActive: true },
      { schemeId: B, profileId: "mB", role: "COMMITTEE", isActive: true },
    ],
    WorksRequest: [{ id: "reqB", schemeId: B, status: "SUBMITTED", raisedById: "x", deletedAt: null, requestNumber: "WR-0001", title: "B" }],
    ContractorBusiness: [
      { id: "c-ok", status: "APPROVED", deletedAt: null, tradingName: "Ace Plumbing", tradeCategories: ["Plumbing"] },
      { id: "c-pending", status: "PENDING", deletedAt: null, tradingName: "New Co", tradeCategories: ["Plumbing"] },
    ],
  });
});

describe("raising a request", () => {
  it("an owner of the building can, and the committee is told", async () => {
    const r = await submitWorksRequestAction(A, {}, form(request));
    expect(r.done).toMatch(/WR-0001/);
    expect(notify.notifyRequestSubmitted).toHaveBeenCalled();
    expect(activity.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "WORKS_REQUEST_SUBMITTED", schemeId: A }));
  });

  it("someone with no owner or committee role on the building cannot", async () => {
    caller.roles = { [A]: ["TENANT"], [B]: ["OWNER"] };
    const r = await submitWorksRequestAction(A, {}, form(request));
    expect(r.error).toMatch(/permission/);
    expect(sharedFake.table("WorksRequest").filter((x) => x.schemeId === A)).toHaveLength(0);
  });

  it("returns the form's problems without saving", async () => {
    const r = await submitWorksRequestAction(A, {}, form({ ...request, trade: "" }));
    expect(r.fieldErrors?.trade).toBeTruthy();
    expect(sharedFake.table("WorksRequest").filter((x) => x.schemeId === A)).toHaveLength(0);
  });
});

describe("deciding", () => {
  it("an owner who is not on the committee cannot propose", async () => {
    caller.roles = { [A]: ["OWNER"] };
    const r = await proposeWorksRouteAction(A, "reqB", {}, form({ outcome: "URGENT" }));
    expect(r.error).toMatch(/permission/);
  });

  it("a committee member cannot reach another building's request through their own", async () => {
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    const r = await proposeWorksRouteAction(A, "reqB", {}, form({ outcome: "URGENT" }));
    expect(r.error).toMatch(/not found/);
    expect(sharedFake.table("WorksRequest")[0].status).toBe("SUBMITTED");
  });

  it("a proposal and a second member's vote decide it, then everyone is told", async () => {
    caller.id = "owner";
    caller.roles = { [A]: ["OWNER"] };
    const created = await submitWorksRequestAction(A, {}, form(request));
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    const p = await proposeWorksRouteAction(A, created.requestId!, {}, form({ outcome: "QUOTES" }));
    expect(p.done).toMatch(/Proposed/);
    expect(notify.notifyVoteNeeded).toHaveBeenCalled();
    const decisionId = String(sharedFake.table("WorksDecision")[0].id);
    caller.id = "m2";
    const v = await voteWorksDecisionAction(A, created.requestId!, decisionId, {}, form({ vote: "FOR" }));
    expect(v.done).toMatch(/decided/);
    expect(notify.notifyDecision).toHaveBeenCalledWith(expect.objectContaining({ outcome: "QUOTES", status: "DECIDED" }));
  });
});

describe("settings", () => {
  it("are the committee's only, after an authenticator check", async () => {
    caller.roles = { [A]: ["OWNER", "ADVISER"] };
    expect((await saveWorksSettingsAction(A, {}, form({ approvalRule: "ONE" }))).error).toMatch(/permission/);

    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    stepUp.requireRecentMfa.mockRejectedValueOnce(new (await import("@/lib/auth/require-membership")).AuthorisationError("For your security, confirm it is you first."));
    expect((await saveWorksSettingsAction(A, {}, form({ approvalRule: "ONE" }))).error).toMatch(/confirm it is you/);
    expect(sharedFake.table("WorksSettings")).toHaveLength(0);

    expect((await saveWorksSettingsAction(A, {}, form({ approvalRule: "ONE", urgentLimit: "$2,000" }))).done).toBeTruthy();
    expect(sharedFake.table("WorksSettings")[0]).toMatchObject({ schemeId: A, approvalRule: "ONE", urgentLimit: "2000.00", adviserMayDecide: false });
    // Every committee member and the Adviser hear of it.
    expect(notify.notifySettingsChanged).toHaveBeenCalledWith(expect.objectContaining({ schemeId: A, changedById: "m1", after: expect.objectContaining({ approvalRule: "ONE" }) }));
  });

  it("need an Adviser limit when decisions are delegated", async () => {
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    const r = await saveWorksSettingsAction(A, {}, form({ approvalRule: "TWO", adviserMayDecide: "on" }));
    expect(r.fieldErrors?.adviserLimit).toBeTruthy();
  });

  it("a preferred contractor must be approved", async () => {
    caller.id = "adv";
    caller.roles = { [A]: ["ADVISER"] };
    expect((await setPreferredContractorAction(A, {}, form({ trade: "Plumbing", contractorBusinessId: "c-pending" }))).error).toMatch(/approved/);
    expect((await setPreferredContractorAction(A, {}, form({ trade: "Plumbing", contractorBusinessId: "c-ok" }))).done).toBeTruthy();
    expect((await setPreferredContractorAction(A, {}, form({ trade: "Plumbing", contractorBusinessId: "c-ok" }))).done).toBeTruthy();
    expect(sharedFake.table("WorksPreferredContractor")).toEqual([expect.objectContaining({ schemeId: A, trade: "Plumbing", contractorBusinessId: "c-ok" })]);
  });
});
