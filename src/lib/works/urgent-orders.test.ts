import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/storage/server-storage", () => ({ signDownloads: vi.fn(async (p: string[]) => p.map(() => "https://signed")) }));

import { sharedFake } from "@/test/fake-orm";
import { proposeRoute } from "./review";
import { cancelUrgentOrder, issueUrgentOrder, myContractorBusinessIds, orderForContractor, orderingState, ordersForContractor, respondToOrder } from "./urgent-orders";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const member = (id: string) => ({ profileId: id, roles: ["COMMITTEE"] as string[] });

function seed(opts: { preferred?: string | null; urgentLimit?: string | null; adviserMayDecide?: boolean } = {}) {
  sharedFake.reset({
    Scheme: [{ id: A, name: "Opera House", planNumber: "SP 99999", address: "1 Macquarie St", suburb: "Sydney", postcode: "2000", timeZone: "Australia/Sydney" }],
    SchemeMembership: ["m1", "m2", "m3"].map((profileId) => ({ schemeId: A, profileId, role: "COMMITTEE", isActive: true })),
    WorksSettings: [{ schemeId: A, approvalRule: "TWO", urgentLimit: opts.urgentLimit === undefined ? "2000.00" : opts.urgentLimit, adviserMayDecide: !!opts.adviserMayDecide, adviserLimit: opts.adviserMayDecide ? "1000.00" : null }],
    WorksPreferredContractor: opts.preferred === null ? [] : [{ schemeId: A, trade: "Plumbing", contractorBusinessId: opts.preferred ?? "c-ok" }],
    ContractorBusiness: [
      { id: "c-ok", status: "APPROVED", deletedAt: null, tradingName: "Ace Plumbing" },
      { id: "c-other", status: "APPROVED", deletedAt: null, tradingName: "Other Plumbing" },
      { id: "c-pending", status: "PENDING", deletedAt: null, tradingName: "New Co" },
    ],
    Profile: [{ id: "m1", firstName: "Matthew", lastName: "W", email: "m@x.test", phone: "0400 000 000" }],
    WorksRequest: [{ id: "req", schemeId: A, status: "SUBMITTED", raisedById: "owner", deletedAt: null, title: "Burst pipe", description: "Water everywhere", location: "Car park", trade: "Plumbing", isEmergency: true, requestNumber: "WR-0001" }],
    WorksDecision: [],
    WorksDecisionVote: [],
    WorksRequestReview: [],
    WorksWorkOrder: [],
    WorksDocument: [],
  });
}

const request = () => sharedFake.table("WorksRequest").find((r) => r.id === "req")!;
const orders = () => sharedFake.table("WorksWorkOrder");

async function decideUrgent(amount = 1500) {
  const p = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "URGENT", note: null, amount });
  expect(p.status).toBe("DECIDED");
  // decidedAt is set by the claim.
  return p;
}

describe("the urgent decision's amount", () => {
  beforeEach(() => seed());

  it("is required", async () => {
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "URGENT", note: null })).rejects.toThrow(/most the urgent work may cost/);
  });

  it("lets one member decide within the urgent limit, and needs the usual votes over it", async () => {
    const over = await proposeRoute({ schemeId: A, requestId: "req", actor: member("m1"), outcome: "URGENT", note: null, amount: 2500 });
    expect(over.status).toBe("OPEN");
    expect(sharedFake.table("WorksDecision")[0]).toMatchObject({ rule: "TWO", requiredVotes: 2, amount: "2500.00" });
  });

  it("holds the Adviser to the committee's limit under a delegation", async () => {
    seed({ adviserMayDecide: true });
    await expect(proposeRoute({ schemeId: A, requestId: "req", actor: { profileId: "adv", roles: ["ADVISER"] }, outcome: "URGENT", note: null, amount: 1500 })).rejects.toThrow(/over the most the committee lets the Adviser approve/);
    const ok = await proposeRoute({ schemeId: A, requestId: "req", actor: { profileId: "adv", roles: ["ADVISER"] }, outcome: "URGENT", note: null, amount: 800 });
    expect(ok.status).toBe("DECIDED");
  });
});

describe("issuing the urgent order", () => {
  it("goes to the preferred contractor with the agreed amount and no contract", async () => {
    seed();
    await decideUrgent(1500);
    const r = await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1" });
    expect(r).toMatchObject({ issued: true, workOrderNumber: "WO-0001", contractorBusinessId: "c-ok" });
    expect(orders()[0]).toMatchObject({ requestId: "req", contractId: null, status: "AWAITING_ACKNOWLEDGEMENT", amountLimit: "1500.00", issuedById: "m1" });
  });

  it("asks for a contractor when there is no preferred one, or it is no longer approved", async () => {
    seed({ preferred: null });
    await decideUrgent();
    expect(await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1" })).toEqual({ issued: false, reason: "NO_CONTRACTOR" });
    seed({ preferred: "c-pending" });
    await decideUrgent();
    expect(await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1" })).toEqual({ issued: false, reason: "NO_CONTRACTOR" });
    expect(orders()).toHaveLength(0);
    expect((await orderingState(A, "req"))?.canIssue).toBe(true);
  });

  it("goes to a chosen contractor, who must be approved", async () => {
    seed({ preferred: null });
    await decideUrgent();
    await expect(issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1", contractorBusinessId: "c-pending" })).rejects.toThrow(/approved/);
    const r = await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1", contractorBusinessId: "c-other" });
    expect(r).toMatchObject({ issued: true, contractorBusinessId: "c-other" });
  });

  it("is refused without an urgent decision, a second time, or for another building", async () => {
    seed();
    await expect(issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1" })).rejects.toThrow(/not waiting for an urgent work order/);
    await decideUrgent();
    await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1" });
    await expect(issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1", contractorBusinessId: "c-other" })).rejects.toThrow(/already been issued/);
    await expect(issueUrgentOrder({ schemeId: B, requestId: "req", issuedById: "m1" })).rejects.toThrow(/not found/);
    expect(orders()).toHaveLength(1);
  });
});

describe("the contractor's answer", () => {
  beforeEach(async () => {
    seed();
    await decideUrgent();
    await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1" });
  });
  const id = () => String(orders()[0].id);

  it("accepting starts the work", async () => {
    const r = await respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: true, reason: null, profileId: "contact" });
    expect(r.accepted).toBe(true);
    expect(orders()[0].status).toBe("AUTHORISED");
    expect(request().status).toBe("DELIVERY");
  });

  it("declining needs a reason, and lets another order go out", async () => {
    await expect(respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: false, reason: " ", profileId: "contact" })).rejects.toThrow(/Say why/);
    await respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: false, reason: "No one free", profileId: "contact" });
    expect(orders()[0]).toMatchObject({ status: "DECLINED", declineReason: "No one free" });
    expect(request().status).toBe("PROCUREMENT");
    expect((await orderingState(A, "req"))?.canIssue).toBe(true);
    const again = await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1", contractorBusinessId: "c-other" });
    expect(again).toMatchObject({ issued: true, workOrderNumber: "WO-0002" });
  });

  it("is only the business the order was sent to, and only once", async () => {
    await expect(respondToOrder({ workOrderId: id(), contractorBusinessId: "c-other", accept: true, reason: null, profileId: "x" })).rejects.toThrow(/not found/);
    await respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: true, reason: null, profileId: "contact" });
    await expect(respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: false, reason: "changed my mind", profileId: "contact" })).rejects.toThrow(/already been answered/);
  });

  it("shows the order only to that business, with the address and a contact", async () => {
    expect(await orderForContractor(id(), ["c-other"])).toBeNull();
    const o = await orderForContractor(id(), ["c-ok"]);
    expect(o).toMatchObject({ workOrderNumber: "WO-0001", trade: "Plumbing", location: "Car park", amountLimit: 1500, building: { address: "1 Macquarie St, Sydney, 2000" }, contact: { name: "Matthew W", email: "m@x.test" } });
    expect((await ordersForContractor(["c-other"])).length).toBe(0);
    expect((await ordersForContractor(["c-ok"])).map((x) => x.statusLabel)).toEqual(["Waiting for the contractor to accept"]);
  });
});

describe("when things go wrong", () => {
  beforeEach(async () => {
    seed();
    await decideUrgent();
    await issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1" });
  });
  const id = () => String(orders()[0].id);

  it("an unanswered order can be cancelled so another goes out", async () => {
    expect((await orderingState(A, "req"))?.canIssue).toBe(false);
    await expect(cancelUrgentOrder({ schemeId: B, workOrderId: id(), reason: null })).rejects.toThrow(/not found/);
    await cancelUrgentOrder({ schemeId: A, workOrderId: id(), reason: "No reply" });
    expect(orders()[0]).toMatchObject({ status: "CANCELLED", declineReason: "No reply" });
    expect((await orderingState(A, "req"))?.canIssue).toBe(true);
    await expect(respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: true, reason: null, profileId: "c" })).rejects.toThrow(/already been answered or cancelled/);
    await expect(cancelUrgentOrder({ schemeId: A, workOrderId: id(), reason: null })).rejects.toThrow(/not answered/);
  });

  it("once declined, the contractor no longer sees the address, photos or contact", async () => {
    await respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: false, reason: "Busy", profileId: "c" });
    const o = await orderForContractor(id(), ["c-ok"]);
    expect(o).toMatchObject({ ended: true, description: "", location: null, contact: null, photos: [], building: { address: "" } });
  });

  it("a business no longer approved cannot see or take the job", async () => {
    sharedFake.table("ContractorBusiness").find((c) => c.id === "c-ok")!.status = "SUSPENDED";
    await expect(respondToOrder({ workOrderId: id(), contractorBusinessId: "c-ok", accept: true, reason: null, profileId: "c" })).rejects.toThrow(/not currently approved/);
    sharedFake.table("ContractorContact").push({ contractorBusinessId: "c-ok", profileId: "c", status: "ACTIVE" });
    expect(await myContractorBusinessIds("c")).toEqual([]);
  });

  it("a stale preferred contractor is not offered", async () => {
    await cancelUrgentOrder({ schemeId: A, workOrderId: id(), reason: null });
    sharedFake.table("ContractorBusiness").find((c) => c.id === "c-ok")!.status = "SUSPENDED";
    expect((await orderingState(A, "req"))?.preferredContractorId).toBeNull();
  });

  it("no order goes out once the request has moved on", async () => {
    await cancelUrgentOrder({ schemeId: A, workOrderId: id(), reason: null });
    request().status = "CLOSED";
    await expect(issueUrgentOrder({ schemeId: A, requestId: "req", issuedById: "m1", contractorBusinessId: "c-other" })).rejects.toThrow(/not waiting/);
  });
});
