import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/storage/server-storage", () => ({ signDownloads: vi.fn(async (p: string[]) => p.map(() => "https://signed")) }));
const uploads = vi.hoisted(() => ({
  verifyUpload: vi.fn(async (i: { uploadId: string; schemeId: string }) => ({ uploadId: i.uploadId, path: `schemes/${i.schemeId}/works/quotes/q.pdf`, fileName: "quote.pdf", size: 10, mimeType: "application/pdf" })),
  consumeUpload: vi.fn(async (_id: string, create: () => Promise<unknown>) => create()),
}));
vi.mock("@/lib/storage/uploads", () => uploads);

import { sharedFake } from "@/test/fake-orm";
import {
  checkQuote,
  closeOutQuotes,
  invite,
  jobForContractor,
  jobsForContractor,
  openRfq,
  parsePostcodes,
  quoteApprovalProblem,
  rfqForCommittee,
  setDeadlines,
  setInterest,
  submitQuote,
  sweepDeadlines,
  withdrawQuote,
} from "./marketplace";
import { proposeQuoteApproval, vote } from "./review";

const A = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;
const member = (id: string) => ({ profileId: id, roles: ["COMMITTEE"] as string[] });
const quote = (total: number, gst = 0) => ({ total, gst, validUntil: null, durationDays: 3, inclusions: "Labour", exclusions: "", conditions: "", uploadId: null });

function seed(opts: { adviserMayDecide?: boolean } = {}) {
  sharedFake.reset({
    Scheme: [{ id: A, name: "Opera House", planNumber: "SP 99999", address: "1 Macquarie St", suburb: "Sydney", postcode: "2000" }],
    SchemeMembership: ["m1", "m2", "m3"].map((profileId) => ({ schemeId: A, profileId, role: "COMMITTEE", isActive: true })),
    WorksSettings: [{ schemeId: A, approvalRule: "TWO", urgentLimit: "2000.00", adviserMayDecide: !!opts.adviserMayDecide, adviserLimit: opts.adviserMayDecide ? "5000.00" : null }],
    Profile: [{ id: "m1", firstName: "Matthew", lastName: "W", email: "m@x.test", phone: "0400" }],
    ContractorBusiness: [
      { id: "c1", status: "APPROVED", deletedAt: null, tradingName: "Ace Plumbing", tradeCategories: ["Plumbing"], servicePostcodes: ["2000", "2010"] },
      { id: "c2", status: "APPROVED", deletedAt: null, tradingName: "Beta Plumbing", tradeCategories: ["plumbing"], servicePostcodes: ["2000"] },
      { id: "c3", status: "APPROVED", deletedAt: null, tradingName: "Far Plumbing", tradeCategories: ["Plumbing"], servicePostcodes: ["2770"] },
      { id: "c4", status: "APPROVED", deletedAt: null, tradingName: "Sparky", tradeCategories: ["Electrical"], servicePostcodes: ["2000"] },
      { id: "c5", status: "PENDING", deletedAt: null, tradingName: "New Co", tradeCategories: ["Plumbing"], servicePostcodes: ["2000"] },
    ],
    WorksRequest: [{ id: "req", schemeId: A, status: "PROCUREMENT", raisedById: "owner", deletedAt: null, title: "Leak at unit 4 (Mrs Smith)", description: "Owner text", location: "Unit 4 bathroom", trade: "Plumbing", isEmergency: false, requestNumber: "WR-0001" }],
    WorksRfq: [],
    WorksRfqInterest: [],
    WorksRfqInvitation: [],
    WorksQuotation: [],
    WorksDecision: [],
    WorksDecisionVote: [],
    WorksWorkOrder: [],
    WorksDocument: [],
  });
}

const rfq = () => sharedFake.table("WorksRfq")[0];
async function open(now = new Date()) {
  return openRfq({ schemeId: A, requestId: "req", openedById: "m1", summary: { title: "Leaking pipe", body: "Water from a ceiling pipe." }, now });
}
async function toQuoting(ids = ["c1", "c2"]) {
  await open();
  await invite({ schemeId: A, rfqId: String(rfq().id), businessIds: ids, invitedById: "m1" });
}

describe("opening for quotes", () => {
  beforeEach(() => seed());

  it("opens for interest for 3 days, with the committee's summary", async () => {
    const now = new Date("2026-10-26T00:00:00Z");
    const r = await open(now);
    expect(r).toMatchObject({ marketplace: true, status: "INTEREST", trade: "Plumbing", postcode: "2000", title: "Leaking pipe", description: "Water from a ceiling pipe.", rfqNumber: "RFQ-0001" });
    expect(new Date(String(r.interestClosesAt)).getTime() - now.getTime()).toBe(3 * DAY);
  });

  it("only for a request waiting for quotes, with a trade", async () => {
    sharedFake.table("WorksRequest")[0].isEmergency = true;
    await expect(open()).rejects.toThrow(/not waiting for quotes/);
    sharedFake.table("WorksRequest")[0].isEmergency = false;
    sharedFake.table("WorksRequest")[0].trade = null;
    await expect(open()).rejects.toThrow(/no kind of work/);
  });
});

describe("what contractors see", () => {
  beforeEach(async () => {
    seed();
    await open();
  });

  it("only approved contractors in the trade who work in the postcode see the job", async () => {
    for (const [id, sees] of [["c1", true], ["c2", true], ["c3", false], ["c4", false], ["c5", false]] as const) {
      expect((await jobsForContractor([id])).open.length).toBe(sees ? 1 : 0);
      expect(!!(await jobForContractor(String(rfq().id), [id]))).toBe(sees);
    }
  });

  it("before an invitation: the summary and suburb, no address, location, contact or owner text", async () => {
    const j = await jobForContractor(String(rfq().id), ["c1"]);
    expect(j).toMatchObject({ title: "Leaking pipe", summary: "Water from a ceiling pipe.", suburb: "Sydney", building: null, location: null, contact: null, invited: false });
    expect(JSON.stringify(j)).not.toMatch(/Mrs Smith|Unit 4|Macquarie/);
  });

  it("once invited: the address, where in the building and a contact", async () => {
    await invite({ schemeId: A, rfqId: String(rfq().id), businessIds: ["c1"], invitedById: "m1" });
    const j = await jobForContractor(String(rfq().id), ["c1"]);
    expect(j).toMatchObject({ invited: true, location: "Unit 4 bathroom", building: { address: "1 Macquarie St, Sydney, 2000" }, contact: { name: "Matthew W", email: "m@x.test" } });
  });

  it("interest only while open, and only from an eligible business", async () => {
    await setInterest({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", interested: true });
    await setInterest({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", interested: true });
    expect(sharedFake.table("WorksRfqInterest")).toHaveLength(1);
    await expect(setInterest({ rfqId: String(rfq().id), businessIds: ["c3"], profileId: "p3", interested: true })).rejects.toThrow(/not found/);
    await expect(setInterest({ rfqId: String(rfq().id), businessIds: ["c2"], profileId: "p2", interested: true, now: new Date(Date.now() + 4 * DAY) })).rejects.toThrow(/no longer taking interest/);
    await setInterest({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", interested: false });
    expect((await rfqForCommittee(A, "req"))?.interested).toHaveLength(0);
  });
});

describe("inviting", () => {
  beforeEach(async () => {
    seed();
    await open();
  });

  it("moves to quoting with 7 days to quote, up to the number chosen", async () => {
    const now = new Date();
    const r = await invite({ schemeId: A, rfqId: String(rfq().id), businessIds: ["c1"], invitedById: "m1", now });
    expect(r.invited).toEqual(["c1"]);
    expect(rfq().status).toBe("QUOTING");
    expect(new Date(String(rfq().quoteClosesAt)).getTime() - now.getTime()).toBe(7 * DAY);
    await expect(invite({ schemeId: A, rfqId: String(rfq().id), businessIds: ["c2", "c3", "c4"], invitedById: "m1" })).rejects.toThrow(/more than the 3/);
    await invite({ schemeId: A, rfqId: String(rfq().id), businessIds: ["c2", "c3", "c4"], invitedById: "m1", inviteLimit: 4 });
    expect(sharedFake.table("WorksRfqInvitation")).toHaveLength(4);
  });

  it("only approved contractors", async () => {
    await expect(invite({ schemeId: A, rfqId: String(rfq().id), businessIds: ["c5"], invitedById: "m1" })).rejects.toThrow(/approved/);
  });
});

describe("quoting", () => {
  beforeEach(async () => {
    seed();
    await toQuoting();
  });

  it("checks the form", () => {
    expect(checkQuote({ total: "$1,200.50", gst: "109.14" })).toMatchObject({ ok: true, value: { total: 1200.5, gst: 109.14 } });
    const bad = checkQuote({ total: "100", gst: "200" });
    expect(bad.ok).toBe(false);
    expect(parsePostcodes("2000, 2010 2010\n2047")).toEqual({ ok: true, value: ["2000", "2010", "2047"] });
    expect(parsePostcodes("2000, NSW").ok).toBe(false);
  });

  it("only an invited business, before the deadline; changing it makes a new version", async () => {
    await expect(submitQuote({ rfqId: String(rfq().id), businessIds: ["c3"], profileId: "p3", quote: quote(900) })).rejects.toThrow(/not invited/);
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(900) });
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: { ...quote(950), uploadId: "u1" } });
    const q = sharedFake.table("WorksQuotation")[0];
    expect(q).toMatchObject({ status: "SUBMITTED", totalAmount: "950.00", currentVersion: 2, documentName: "quote.pdf" });
    await expect(submitQuote({ rfqId: String(rfq().id), businessIds: ["c2"], profileId: "p2", quote: quote(800), now: new Date(Date.now() + 8 * DAY) })).rejects.toThrow(/closed/);
  });

  it("can be withdrawn before the deadline", async () => {
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(900) });
    await withdrawQuote({ rfqId: String(rfq().id), businessIds: ["c1"] });
    expect(sharedFake.table("WorksQuotation")[0].status).toBe("WITHDRAWN");
  });
});

describe("approving a quote", () => {
  beforeEach(async () => {
    seed();
    await toQuoting();
  });
  const quoteId = (biz: string) => String(sharedFake.table("WorksQuotation").find((q) => q.contractorBusinessId === biz)!.id);

  it("waits for the deadline or every invited contractor to quote", async () => {
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(900) });
    expect((await quoteApprovalProblem(quoteId("c1"))).problem).toMatch(/Wait until the quote deadline/);
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c2"], profileId: "p2", quote: quote(1100) });
    expect((await quoteApprovalProblem(quoteId("c1"))).problem).toBeNull();
  });

  it("over $30,000 needs two quotes", async () => {
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(45000) });
    rfq().quoteClosesAt = new Date(Date.now() - 1000).toISOString();
    expect((await quoteApprovalProblem(quoteId("c1"))).problem).toMatch(/at least 2 quotes/);
  });

  it("is a committee vote; once decided the quote is accepted and the request approved", async () => {
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(900) });
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c2"], profileId: "p2", quote: quote(1100) });
    const p = await proposeQuoteApproval({ schemeId: A, requestId: "req", quotationId: quoteId("c1"), actor: member("m1"), note: null });
    expect(p.status).toBe("OPEN");
    expect(sharedFake.table("WorksDecision")[0]).toMatchObject({ kind: "QUOTE", quotationId: quoteId("c1"), amount: "900.00", requiredVotes: 2 });
    await expect(proposeQuoteApproval({ schemeId: A, requestId: "req", quotationId: quoteId("c2"), actor: member("m2"), note: null })).rejects.toThrow(/already open/);
    const v = await vote({ schemeId: A, decisionId: p.decisionId, actor: member("m2"), vote: "FOR", comment: null });
    expect(v).toMatchObject({ status: "DECIDED", applied: true });
    expect(sharedFake.table("WorksQuotation").find((q) => q.contractorBusinessId === "c1")?.status).toBe("ACCEPTED");
    // The others stay open until the chosen contractor accepts the work order.
    expect(sharedFake.table("WorksQuotation").find((q) => q.contractorBusinessId === "c2")?.status).toBe("SUBMITTED");
    expect(rfq().status).toBe("AWARDED");
    expect(sharedFake.table("WorksRequest")[0].status).toBe("APPROVAL");
    const closed = await closeOutQuotes("req");
    expect(closed?.businessIds).toEqual(["c2"]);
    expect(sharedFake.table("WorksQuotation").find((q) => q.contractorBusinessId === "c2")?.status).toBe("DECLINED");
  });

  it("owners and other buildings' members cannot propose; the Adviser only under delegation and limit", async () => {
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(6000) });
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c2"], profileId: "p2", quote: quote(4000) });
    await expect(proposeQuoteApproval({ schemeId: A, requestId: "req", quotationId: quoteId("c1"), actor: { profileId: "owner", roles: ["OWNER"] }, note: null })).rejects.toThrow(/Only the committee/);
    await expect(proposeQuoteApproval({ schemeId: A, requestId: "other", quotationId: quoteId("c1"), actor: member("m1"), note: null })).rejects.toThrow(/not found/);
    await expect(proposeQuoteApproval({ schemeId: A, requestId: "req", quotationId: quoteId("c1"), actor: { profileId: "adv", roles: ["ADVISER"] }, note: null })).rejects.toThrow(/Only the committee/);
  });

  it("a quote withdrawn before the vote settles is not approved", async () => {
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(900) });
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c2"], profileId: "p2", quote: quote(1100) });
    const p = await proposeQuoteApproval({ schemeId: A, requestId: "req", quotationId: quoteId("c1"), actor: member("m1"), note: null });
    sharedFake.table("WorksQuotation").find((q) => q.contractorBusinessId === "c1")!.status = "WITHDRAWN";
    const v = await vote({ schemeId: A, decisionId: p.decisionId, actor: member("m2"), vote: "FOR", comment: null });
    expect(v.applied).toBe(false);
    expect(rfq().status).toBe("QUOTING");
    expect(sharedFake.table("WorksRequest")[0].status).toBe("PROCUREMENT");
  });
});

describe("the Adviser under delegation", () => {
  it("can approve within the Adviser limit", async () => {
    seed({ adviserMayDecide: true });
    await toQuoting();
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", quote: quote(6000) });
    await submitQuote({ rfqId: String(rfq().id), businessIds: ["c2"], profileId: "p2", quote: quote(4000) });
    const id = (biz: string) => String(sharedFake.table("WorksQuotation").find((q) => q.contractorBusinessId === biz)!.id);
    await expect(proposeQuoteApproval({ schemeId: A, requestId: "req", quotationId: id("c1"), actor: { profileId: "adv", roles: ["ADVISER"] }, note: null })).rejects.toThrow(/over the most/);
    const p = await proposeQuoteApproval({ schemeId: A, requestId: "req", quotationId: id("c2"), actor: { profileId: "adv", roles: ["ADVISER"] }, note: null });
    expect(p.status).toBe("DECIDED");
  });
});

describe("deadlines", () => {
  beforeEach(() => seed());

  it("the daily sweep reports interest closed once, then quotes closed once", async () => {
    await open();
    await setInterest({ rfqId: String(rfq().id), businessIds: ["c1"], profileId: "p1", interested: true });
    const later = new Date(Date.now() + 4 * DAY);
    expect((await sweepDeadlines(later)).interestClosed).toEqual([expect.objectContaining({ rfqNumber: "RFQ-0001", interested: 1 })]);
    expect((await sweepDeadlines(later)).interestClosed).toEqual([]);
    await invite({ schemeId: A, rfqId: String(rfq().id), businessIds: ["c1"], invitedById: "m1" });
    const after = new Date(Date.now() + 8 * DAY);
    expect((await sweepDeadlines(after)).quotesClosed).toEqual([expect.objectContaining({ quotes: 0 })]);
    expect(rfq().status).toBe("CLOSED");
    expect((await sweepDeadlines(after)).quotesClosed).toEqual([]);
  });

  it("the committee can extend them, reopening closed quotes", async () => {
    await toQuoting();
    rfq().status = "CLOSED";
    const d = new Date(Date.now() + 10 * DAY).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    await setDeadlines({ schemeId: A, rfqId: String(rfq().id), quoteClosesAt: d });
    expect(rfq().status).toBe("QUOTING");
    await expect(setDeadlines({ schemeId: A, rfqId: String(rfq().id), quoteClosesAt: "2020-01-01" })).rejects.toThrow(/future/);
  });
});
