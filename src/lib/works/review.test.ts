import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

import { sharedFake } from "@/test/fake-orm";
import { proposeRoute, vote, withdraw, awaitingMyVote, WorksDecisionError } from "./review";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const committee = (schemeId: string, ...ids: string[]) => ids.map((profileId) => ({ schemeId, profileId, role: "COMMITTEE", isActive: true }));
const member = (id: string) => ({ profileId: id, roles: ["COMMITTEE"] as string[] });
const adviser = { profileId: "adviser", roles: ["ADVISER"] as string[] };

function seed(opts: { members?: string[]; rule?: string; adviserMayDecide?: boolean; status?: string } = {}) {
  sharedFake.reset({
    SchemeMembership: [...committee(A, ...(opts.members ?? ["m1", "m2", "m3"])), ...committee(B, "other"), { schemeId: A, profileId: "adviser", role: "ADVISER", isActive: true }],
    WorksSettings: opts.rule || opts.adviserMayDecide ? [{ schemeId: A, approvalRule: opts.rule ?? "TWO", adviserMayDecide: !!opts.adviserMayDecide, adviserLimit: opts.adviserMayDecide ? "5000.00" : null }] : [],
    WorksRequest: [
      { id: "req", schemeId: A, status: opts.status ?? "SUBMITTED", raisedById: "owner", deletedAt: null, isEmergency: false, currentVersion: 1 },
      { id: "reqB", schemeId: B, status: "SUBMITTED", raisedById: "owner", deletedAt: null, currentVersion: 1 },
    ],
    WorksDecision: [],
    WorksDecisionVote: [],
    WorksRequestReview: [],
  });
}

const request = () => sharedFake.table("WorksRequest").find((r) => r.id === "req")!;
const reviews = () => sharedFake.table("WorksRequestReview");

describe("the committee decides a works request by vote", () => {
  beforeEach(() => seed());

  it("needs two members by default: a proposal, then a second vote for it", async () => {
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    expect(p.status).toBe("OPEN");
    expect(request().status).toBe("UNDER_REVIEW");
    expect(reviews()).toHaveLength(0);

    const v = await vote({ schemeId: A, decisionId: p.decisionId, actor: member("m2"), vote: "FOR", comment: null });
    expect(v).toMatchObject({ status: "DECIDED", applied: true });
    expect(request().status).toBe("PROCUREMENT");
    expect(reviews()).toEqual([expect.objectContaining({ requestId: "req", outcome: "APPROVED", procurementRoute: "SELECTIVE_TENDER", reviewerId: "m1" })]);
  });

  it("lets any one member order urgent works", async () => {
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m3"), outcome: "URGENT", note: "Burst pipe" });
    expect(p.status).toBe("DECIDED");
    expect(request()).toMatchObject({ status: "PROCUREMENT", isEmergency: true, isUrgent: true });
    expect(reviews()[0]).toMatchObject({ outcome: "EMERGENCY_APPROVED", procurementRoute: "EMERGENCY" });
  });

  it("fails once enough vote against, and the request waits again", async () => {
    seed({ rule: "MAJORITY" }); // 3 members: 2 needed
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "DECLINE", note: "Lot property" });
    await vote({ schemeId: A, decisionId: p.decisionId, actor: member("m2"), vote: "AGAINST", comment: null });
    const last = await vote({ schemeId: A, decisionId: p.decisionId, actor: member("m3"), vote: "AGAINST", comment: "It is common property" });
    expect(last.status).toBe("NOT_AGREED");
    expect(request().status).toBe("SUBMITTED");
    expect(request().closedAt ?? null).toBeNull();
    // A new proposal can then be made.
    const again = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m3"), outcome: "QUOTES", note: null });
    expect(again.status).toBe("OPEN");
  });

  it("returns a request to the owner with what to add", async () => {
    seed({ rule: "ONE" });
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "RETURN", note: null, returnReason: " " })).rejects.toThrow(/what the owner needs to add/);
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "RETURN", note: null, returnReason: "Which unit?" });
    expect(p.status).toBe("DECIDED");
    expect(request()).toMatchObject({ status: "DRAFT", returnReason: "Which unit?" });
  });

  it("needs a reason to decline, and closes the request", async () => {
    seed({ rule: "ONE" });
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "DECLINE", note: "" })).rejects.toThrow(/reason for declining/);
    await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "DECLINE", note: "Inside lot 4" });
    expect(request().status).toBe("CLOSED");
    expect(request().closedAt).toBeTruthy();
  });

  it("refuses anyone who is not on the committee", async () => {
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: { profileId: "owner", roles: ["OWNER", "COMMITTEE"] }, outcome: "QUOTES", note: null })).rejects.toThrow(/Only the committee/);
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    // A committee member of another building cannot vote here.
    await expect(vote({ schemeId: A, decisionId: p.decisionId, actor: member("other"), vote: "FOR", comment: null })).rejects.toThrow(/Only committee members/);
    expect(request().status).toBe("UNDER_REVIEW");
  });

  it("does not reach another building's request or decision", async () => {
    await expect(proposeRoute({ schemeId: A, requestId: "reqB", actor: member("m1"), outcome: "URGENT", note: null })).rejects.toThrow(/not found/);
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    await expect(vote({ schemeId: B, decisionId: p.decisionId, actor: member("other"), vote: "FOR", comment: null })).rejects.toThrow(/not found/);
  });

  it("allows one open proposal at a time, and one vote each", async () => {
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: member("m2"), outcome: "DECLINE", note: "x" })).rejects.toThrow(/already open/);
    await expect(vote({ schemeId: A, decisionId: p.decisionId, actor: member("m1"), vote: "FOR", comment: null })).rejects.toThrow(/already voted/);
    await expect(vote({ schemeId: A, decisionId: p.decisionId, actor: member("m2"), vote: "MAYBE", comment: null })).rejects.toThrow(/for or against/);
  });

  it("cannot be voted on once decided", async () => {
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    await vote({ schemeId: A, decisionId: p.decisionId, actor: member("m2"), vote: "FOR", comment: null });
    await expect(vote({ schemeId: A, decisionId: p.decisionId, actor: member("m3"), vote: "AGAINST", comment: null })).rejects.toThrow(/already been settled/);
    expect(reviews()).toHaveLength(1);
  });

  it("only decides a request still waiting for the committee", async () => {
    seed({ status: "CLOSED" });
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null })).rejects.toThrow(/not waiting/);
  });

  it("lets only the proposer withdraw, and the request waits again", async () => {
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    await expect(withdraw({ schemeId: A, decisionId: p.decisionId, actor: member("m2") })).rejects.toThrow(/Only the member who proposed/);
    await withdraw({ schemeId: A, decisionId: p.decisionId, actor: member("m1") });
    expect(request().status).toBe("SUBMITTED");
    await expect(vote({ schemeId: A, decisionId: p.decisionId, actor: member("m2"), vote: "FOR", comment: null })).rejects.toThrow(/already been settled/);
  });

  it("lists the proposals waiting on a member's vote", async () => {
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    expect((await awaitingMyVote(A, "m2")).map((d) => d.id)).toEqual([p.decisionId]);
    expect(await awaitingMyVote(A, "m1")).toEqual([]);
  });
});

describe("the Adviser", () => {
  it("cannot decide unless the building delegates it", async () => {
    seed();
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: adviser, outcome: "QUOTES", note: null })).rejects.toThrow(WorksDecisionError);
    expect(request().status).toBe("SUBMITTED");
  });

  it("decides at once under a delegation, recorded as such", async () => {
    seed({ adviserMayDecide: true });
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: adviser, outcome: "QUOTES", note: null });
    expect(p.status).toBe("DECIDED");
    expect(sharedFake.table("WorksDecision")[0]).toMatchObject({ rule: "DELEGATED", byDelegation: true, requiredVotes: 1 });
    expect(request().status).toBe("PROCUREMENT");
  });

  it("does not vote on the committee's proposals", async () => {
    seed({ adviserMayDecide: true });
    const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null });
    await expect(vote({ schemeId: A, decisionId: p.decisionId, actor: adviser, vote: "FOR", comment: null })).rejects.toThrow(/Only committee members/);
  });
});

describe("a building with no committee", () => {
  it("has no one to decide", async () => {
    seed({ members: [] });
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "QUOTES", note: null })).rejects.toThrow(/Only the committee/);
  });
});
