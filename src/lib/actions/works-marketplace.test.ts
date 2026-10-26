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
const notify = vi.hoisted(() => ({ notifyRequestSubmitted: vi.fn(async () => {}), notifyVoteNeeded: vi.fn(async () => {}), notifyDecision: vi.fn(async () => {}), notifySettingsChanged: vi.fn(async () => {}), notifyOrderIssued: vi.fn(async () => {}), notifyNoContractor: vi.fn(async () => {}), notifyOrderAnswered: vi.fn(async () => {}), notifyOrderCancelled: vi.fn(async () => {}), notifyRfqOpened: vi.fn(async () => {}), notifyInvited: vi.fn(async () => {}), notifyQuotesIn: vi.fn(async () => {}), notifyQuoteVote: vi.fn(async () => {}), notifyQuoteApproved: vi.fn(async () => {}), notifyNotSelected: vi.fn(async () => {}) }));
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

// The signed-in person's contractor businesses (as an active contact).
const contractor = vi.hoisted(() => ({ businesses: [] as string[] }));
vi.mock("@/lib/auth/require-contractor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return {
    requireActiveContractorContact: async (id: string) => {
      if (!contractor.businesses.includes(id)) throw new actual.AuthorisationError("You do not have access to this contractor business.");
      return { profile: { id: "contact" }, contact: {} };
    },
  };
});

vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: caller.id })) }));

import { sharedFake } from "@/test/fake-orm";
import {
  proposeWorksRouteAction,
  saveWorksSettingsAction,
  inviteContractorsAction,
  issueUrgentOrderAction,
  setJobInterestAction,
  submitJobQuoteAction,
  respondToWorkOrderAction,
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
  vi.clearAllMocks();
  contractor.businesses = [];
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
    const r = await proposeWorksRouteAction(A, "reqB", {}, form({ outcome: "URGENT", amount: "1500" }));
    expect(r.error).toMatch(/permission/);
  });

  it("a committee member cannot reach another building's request through their own", async () => {
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    const r = await proposeWorksRouteAction(A, "reqB", {}, form({ outcome: "URGENT", amount: "1500" }));
    expect(r.error).toMatch(/not found/);
    expect(sharedFake.table("WorksRequest")[0].status).toBe("SUBMITTED");
  });

  it("a proposal and a second member's vote decide it, then everyone is told", async () => {
    caller.id = "owner";
    caller.roles = { [A]: ["OWNER"] };
    const created = await submitWorksRequestAction(A, {}, form(request));
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    const p = await proposeWorksRouteAction(A, created.requestId!, {}, form({ outcome: "QUOTES", summaryTitle: "Leak", summary: "Water dripping" }));
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

describe("urgent work orders", () => {
  async function urgentRequest() {
    caller.id = "owner";
    caller.roles = { [A]: ["OWNER"] };
    const created = await submitWorksRequestAction(A, {}, form(request));
    sharedFake.table("WorksSettings").push({ schemeId: A, approvalRule: "TWO", urgentLimit: "2000.00", adviserMayDecide: false });
    return created.requestId!;
  }

  it("goes to the preferred contractor as soon as one member decides within the limit", async () => {
    const id = await urgentRequest();
    sharedFake.table("WorksPreferredContractor").push({ schemeId: A, trade: "Plumbing", contractorBusinessId: "c-ok" });
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    const r = await proposeWorksRouteAction(A, id, {}, form({ outcome: "URGENT", amount: "$1,500" }));
    expect(r.done).toMatch(/Decided/);
    expect(sharedFake.table("WorksWorkOrder")).toEqual([expect.objectContaining({ requestId: id, contractorBusinessId: "c-ok", amountLimit: "1500.00" })]);
    expect(notify.notifyOrderIssued).toHaveBeenCalled();
  });

  it("asks the committee to choose when there is no preferred contractor; choosing needs the authenticator", async () => {
    const id = await urgentRequest();
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    await proposeWorksRouteAction(A, id, {}, form({ outcome: "URGENT", amount: "1500" }));
    expect(notify.notifyNoContractor).toHaveBeenCalled();
    expect(sharedFake.table("WorksWorkOrder")).toHaveLength(0);

    caller.id = "owner";
    caller.roles = { [A]: ["OWNER"] };
    expect((await issueUrgentOrderAction(A, id, {}, form({ contractorBusinessId: "c-ok" }))).error).toMatch(/permission/);

    caller.id = "m2";
    caller.roles = { [A]: ["COMMITTEE"] };
    stepUp.requireRecentMfa.mockRejectedValueOnce(new (await import("@/lib/auth/require-membership")).AuthorisationError("For your security, confirm it is you first."));
    expect((await issueUrgentOrderAction(A, id, {}, form({ contractorBusinessId: "c-ok" }))).error).toMatch(/confirm it is you/);
    expect((await issueUrgentOrderAction(A, id, {}, form({ contractorBusinessId: "c-ok" }))).done).toMatch(/WO-0001/);
  });

  it("only a contact of the business it was sent to can answer it", async () => {
    const id = await urgentRequest();
    sharedFake.table("WorksPreferredContractor").push({ schemeId: A, trade: "Plumbing", contractorBusinessId: "c-ok" });
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    await proposeWorksRouteAction(A, id, {}, form({ outcome: "URGENT", amount: "1500" }));
    const orderId = String(sharedFake.table("WorksWorkOrder")[0].id);

    contractor.businesses = ["c-pending"];
    expect((await respondToWorkOrderAction(orderId, {}, form({ answer: "ACCEPT" }))).error).toMatch(/do not have access/);
    contractor.businesses = ["c-ok"];
    expect((await respondToWorkOrderAction(orderId, {}, form({ answer: "ACCEPT" }))).done).toMatch(/Accepted/);
    expect(notify.notifyOrderAnswered).toHaveBeenCalledWith(expect.objectContaining({ accepted: true, contractorName: "Ace Plumbing" }));
    expect(sharedFake.table("WorksRequest").find((r) => r.id === id)?.status).toBe("DELIVERY");
  });
});

describe("marketplace quotes", () => {
  async function quotesDecided() {
    caller.id = "owner";
    caller.roles = { [A]: ["OWNER"] };
    const created = await submitWorksRequestAction(A, {}, form(request));
    sharedFake.table("Scheme").push({ id: A, name: "Opera House", suburb: "Sydney", postcode: "2000", address: "1 Macquarie St", timeZone: "Australia/Sydney" });
    sharedFake.table("WorksSettings").push({ schemeId: A, approvalRule: "ONE", urgentLimit: null, adviserMayDecide: false });
    for (const b of sharedFake.table("ContractorBusiness")) Object.assign(b, { servicePostcodes: ["2000"] });
    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    const r = await proposeWorksRouteAction(A, created.requestId!, {}, form({ outcome: "QUOTES", summaryTitle: "Leaking pipe", summary: "Water from the ceiling" }));
    expect(r.done).toMatch(/Decided/);
    return { requestId: created.requestId!, rfqId: String(sharedFake.table("WorksRfq")[0].id) };
  }

  it("deciding to get quotes opens the job and tells the approved contractors who may quote", async () => {
    await quotesDecided();
    expect(sharedFake.table("WorksRfq")[0]).toMatchObject({ status: "INTEREST", title: "Leaking pipe", description: "Water from the ceiling" });
    expect(notify.notifyRfqOpened).toHaveBeenCalledWith(expect.objectContaining({ businessIds: ["c-ok"] }));
  });

  it("only the committee or the Adviser invite; only a contact of the business acts for it", async () => {
    const { requestId, rfqId } = await quotesDecided();
    caller.id = "owner";
    caller.roles = { [A]: ["OWNER"] };
    expect((await inviteContractorsAction(A, requestId, rfqId, {}, form({ businessId: "c-ok" }))).error).toMatch(/permission/);

    // Someone who is not a contact of any business sees nothing.
    caller.id = "stranger";
    expect((await setJobInterestAction(rfqId, true)).error).toMatch(/not found/);

    // A contact of the approved plumber can say they are interested.
    sharedFake.table("ContractorContact").push({ id: "cc1", contractorBusinessId: "c-ok", profileId: "plumber", status: "ACTIVE" });
    caller.id = "plumber";
    contractor.businesses = ["c-ok"];
    expect((await setJobInterestAction(rfqId, true)).done).toMatch(/Interest recorded/);
    // Not invited yet, so they cannot quote.
    expect((await submitJobQuoteAction(rfqId, {}, form({ total: "900" }))).error).toMatch(/not invited/);

    caller.id = "m1";
    caller.roles = { [A]: ["COMMITTEE"] };
    expect((await inviteContractorsAction(A, requestId, rfqId, {}, form({ businessId: "c-ok" }))).done).toMatch(/Invited 1/);
    expect(notify.notifyInvited).toHaveBeenCalledWith(expect.objectContaining({ businessIds: ["c-ok"] }));

    caller.id = "plumber";
    expect((await submitJobQuoteAction(rfqId, {}, form({ total: "900", gst: "81.82" }))).done).toMatch(/Quote submitted/);
    // The only invited contractor has quoted, so the committee is told straight away.
    expect(notify.notifyQuotesIn).toHaveBeenCalledWith(expect.objectContaining({ allIn: true, quotes: 1 }));
  });
});

