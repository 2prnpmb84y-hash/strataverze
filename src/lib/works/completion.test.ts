import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/storage/server-storage", () => ({ signDownloads: vi.fn(async (p: string[]) => p.map(() => "https://signed")) }));
const uploads = vi.hoisted(() => ({
  verifyUpload: vi.fn(async (i: { uploadId: string; schemeId: string; purpose: string }) => ({ uploadId: i.uploadId, path: `schemes/${i.schemeId}/works/${i.purpose}/${i.uploadId}`, fileName: "file.pdf", size: 10, mimeType: "application/pdf" })),
  consumeUpload: vi.fn(async (_id: string, create: () => Promise<unknown>) => create()),
}));
vi.mock("@/lib/storage/uploads", () => uploads);

import { sharedFake } from "@/test/fake-orm";
import {
  answerCompletion,
  checkCompletion,
  checkInvoice,
  closeOutForCommittee,
  closeOutForContractor,
  reportCompletion,
  returnInvoice,
  sendInvoiceToFinance,
  submitInvoice,
} from "./completion";
import { proposeVariation, vote } from "./review";
import { syncWorksInvoiceFromFinance } from "./finance-link";
import { contractorConflict } from "@/lib/finance/invoice-approval";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const member = (id: string) => ({ profileId: id, roles: ["COMMITTEE"] as string[] });
const adviser = { profileId: "adv", roles: ["ADVISER"] as string[] };
const NOW = new Date("2026-10-26T02:00:00Z");

function seed(opts: { orderStatus?: string; amountLimit?: string | null; gstRegistered?: boolean; adviserMayCodeInvoices?: boolean; bank?: boolean } = {}) {
  sharedFake.reset({
    Scheme: [{ id: A, name: "Opera House", planNumber: "SP 99999", suburb: "Sydney", timeZone: "Australia/Sydney" }],
    SchemeMembership: [
      ...["m1", "m2", "m3"].map((profileId) => ({ schemeId: A, profileId, role: "COMMITTEE", isActive: true })),
      { schemeId: A, profileId: "adv", role: "ADVISER", isActive: true },
    ],
    WorksSettings: [{ schemeId: A, approvalRule: "TWO", urgentLimit: "2000.00", adviserMayDecide: false, adviserLimit: null, adviserMayCodeInvoices: !!opts.adviserMayCodeInvoices }],
    ContractorBusiness: [
      { id: "c1", status: "APPROVED", deletedAt: null, companyName: "Ace Plumbing Pty Ltd", tradingName: "Ace Plumbing", abn: "12345678901", gstRegistered: opts.gstRegistered ?? true },
      { id: "c2", status: "APPROVED", deletedAt: null, companyName: "Other Co" },
    ],
    ContractorContact: [{ id: "cc1", contractorBusinessId: "c1", profileId: "tradie", status: "ACTIVE", isPrimary: true, firstName: "Tom", lastName: "Trade", email: "t@x.test" }],
    WorksBankDetailVersion: opts.bank === false ? [] : [{ id: "bv1", contractorBusinessId: "c1", versionNumber: 1, bsb: "062-000", accountNumber: "12345678", accountName: "Ace Plumbing", status: "SUBMITTED_UNVERIFIED", updatedById: "tradie", createdAt: "2026-10-01T00:00:00.000Z" }],
    WorksRequest: [{ id: "req", schemeId: A, status: "DELIVERY", raisedById: "owner", deletedAt: null, title: "Burst pipe", description: "Water everywhere", requestNumber: "WR-0001", isEmergency: true }],
    WorksWorkOrder: [{ id: "wo", schemeId: A, requestId: "req", contractorBusinessId: "c1", workOrderNumber: "WO-0001", status: opts.orderStatus ?? "AUTHORISED", amountLimit: opts.amountLimit === undefined ? "1500.00" : opts.amountLimit }],
    WorksCompletionSubmission: [],
    WorksInvoice: [],
    WorksDocument: [],
    WorksDecision: [],
    WorksDecisionVote: [],
    Fund: [
      { id: "fa", schemeId: A, name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true, deletedAt: null },
      { id: "fc", schemeId: A, name: "Capital Works Fund", fundType: "CAPITAL_WORKS", isActive: true, deletedAt: null },
      { id: "fx", schemeId: B, name: "Elsewhere", fundType: "ADMINISTRATIVE", isActive: true, deletedAt: null },
    ],
    AccountCode: [
      { id: "repairs", schemeId: A, code: "5-2000", name: "Repairs and maintenance", accountType: "EXPENSE", isActive: true, fundId: "fa" },
      { id: "capex", schemeId: A, code: "6-1000", name: "Capital works", accountType: "EXPENSE", isActive: true, fundId: "fc" },
      { id: "bank", schemeId: A, code: "1-1000", name: "Bank", accountType: "ASSET", isActive: true, fundId: "fa" },
    ],
    Supplier: [],
    SupplierBankDetailVersion: [],
    SupplierInvoice: [],
  });
}

const order = () => sharedFake.table("WorksWorkOrder")[0];
const request = () => sharedFake.table("WorksRequest")[0];
const done = { summary: "Replaced the pipe", completedOn: "2026-10-25", photoUploadIds: ["p1"] };
const invoiceRaw = (over: Record<string, unknown> = {}) => ({ invoiceNumber: "INV-100", invoiceDate: "2026-10-25", total: "1100.00", gst: "100.00", uploadId: "u1", ...over });

async function reportAndConfirm() {
  await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
  await answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m1", accept: true, comments: null });
}
async function invoiceIt(over: Record<string, unknown> = {}) {
  const r = await submitInvoice({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", raw: invoiceRaw(over), now: NOW });
  if (!r.ok) throw new Error(JSON.stringify(r.fieldErrors));
  return r.invoiceId;
}

describe("reporting the work done", () => {
  beforeEach(() => seed());

  it("checks the report", () => {
    expect(checkCompletion({ summary: "", completedOn: "2026-10-25" }, "2026-10-26")).toMatchObject({ ok: false, fieldErrors: { summary: expect.any(String) } });
    expect(checkCompletion({ summary: "Done", completedOn: "2026-10-27" }, "2026-10-26")).toMatchObject({ ok: false, fieldErrors: { completedOn: /future/ } });
    expect(checkCompletion({ summary: "Done", completedOn: "2026-02-30" }, "2026-10-26")).toMatchObject({ ok: false });
    expect(checkCompletion({ summary: "Done", completedOn: "2026-10-26", photoUploadIds: ["a", "b"] }, "2026-10-26")).toMatchObject({ ok: true, value: { photoUploadIds: ["a", "b"] } });
  });

  it("moves an accepted order to checking, with the report and photos", async () => {
    const r = await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    expect(order()).toMatchObject({ status: "COMPLETION_REVIEW" });
    expect(sharedFake.table("WorksCompletionSubmission")).toEqual([expect.objectContaining({ workOrderId: "wo", status: "SUBMITTED", summary: "Replaced the pipe" })]);
    expect(sharedFake.table("WorksDocument")).toEqual([expect.objectContaining({ requestId: "req", documentType: "COMPLETION", schemeId: A })]);
    expect(uploads.verifyUpload).toHaveBeenCalledWith(expect.objectContaining({ purpose: "works_completion", schemeId: A }));
    expect(r.photoProblem).toBeNull();
  });

  it("only for the contractor's own accepted order, once", async () => {
    await expect(reportCompletion({ workOrderId: "wo", businessIds: ["c2"], profileId: "x", completion: done })).rejects.toThrow(/not found/);
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    await expect(reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done })).rejects.toThrow(/already reported/);
  });

  it("not before the order is accepted", async () => {
    order().status = "AWAITING_ACKNOWLEDGEMENT";
    await expect(reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done })).rejects.toThrow(/cannot be reported/);
  });
});

describe("the building confirms it or sends it back", () => {
  beforeEach(async () => {
    seed();
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
  });

  it("confirms: the order is complete and the request moves to invoice and payment", async () => {
    await answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m1", accept: true, comments: null });
    expect(order()).toMatchObject({ status: "COMPLETE" });
    expect(request()).toMatchObject({ status: "CLOSE_OUT" });
    expect(sharedFake.table("WorksCompletionSubmission")[0]).toMatchObject({ status: "ACCEPTED", reviewedById: "m1" });
  });

  it("sends back with a reason, so the contractor can report it again", async () => {
    await expect(answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m1", accept: false, comments: " " })).rejects.toThrow(/what still needs doing/);
    await answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m1", accept: false, comments: "Still dripping" });
    expect(order()).toMatchObject({ status: "AUTHORISED", actualEnd: null });
    expect(request()).toMatchObject({ status: "DELIVERY" });
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    expect(order()).toMatchObject({ status: "COMPLETION_REVIEW" });
  });

  it("not from another building, and only once", async () => {
    await expect(answerCompletion({ schemeId: B, workOrderId: "wo", actorId: "m1", accept: true, comments: null })).rejects.toThrow(/not found/);
    await answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m1", accept: true, comments: null });
    await expect(answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m2", accept: true, comments: null })).rejects.toThrow(/not waiting/);
  });
});

describe("checking an invoice", () => {
  const ctx = { today: "2026-10-26", amountLimit: 1500, gstRegistered: true };
  it("needs the number, date, total and document", () => {
    const r = checkInvoice({}, ctx);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["document", "invoiceDate", "invoiceNumber", "total"]);
  });
  it("GST is at most one eleventh, and nil when not registered", () => {
    expect(checkInvoice(invoiceRaw({ gst: "101.00" }), ctx)).toMatchObject({ ok: false, fieldErrors: { gst: /eleventh/ } });
    expect(checkInvoice(invoiceRaw({ gst: "100.00" }), ctx)).toMatchObject({ ok: true });
    expect(checkInvoice(invoiceRaw({ gst: "10" }), { ...ctx, gstRegistered: false })).toMatchObject({ ok: false, fieldErrors: { gst: /not registered/ } });
    expect(checkInvoice(invoiceRaw({ gst: "" }), { ...ctx, gstRegistered: false })).toMatchObject({ ok: true, value: { gst: 0 } });
  });
  it("over the work order's amount needs a reason", () => {
    expect(checkInvoice(invoiceRaw({ total: "1500.01" }), ctx)).toMatchObject({ ok: false, fieldErrors: { excessReason: expect.any(String) } });
    expect(checkInvoice(invoiceRaw({ total: "1650", gst: "150", excessReason: "More pipe" }), ctx)).toMatchObject({ ok: true, overLimit: true, value: { excessReason: "More pipe" } });
    expect(checkInvoice(invoiceRaw({ excessReason: "ignored" }), ctx)).toMatchObject({ ok: true, overLimit: false, value: { excessReason: null } });
  });
  it("dates: not in the future, due not before the invoice", () => {
    expect(checkInvoice(invoiceRaw({ invoiceDate: "2026-10-27" }), ctx)).toMatchObject({ ok: false, fieldErrors: { invoiceDate: /future/ } });
    expect(checkInvoice(invoiceRaw({ dueDate: "2026-10-01" }), ctx)).toMatchObject({ ok: false, fieldErrors: { dueDate: /before/ } });
  });
});

describe("the contractor's invoice", () => {
  beforeEach(() => seed());

  it("only once the job is reported done", async () => {
    await expect(submitInvoice({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", raw: invoiceRaw(), now: NOW })).rejects.toThrow(/Report the job done/);
  });

  it("is saved against the order with its document, due in 30 days by default", async () => {
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    const id = await invoiceIt();
    expect(sharedFake.table("WorksInvoice").find((w) => w.id === id)).toMatchObject({ workOrderId: "wo", requestId: "req", status: "SUBMITTED", claimedAmount: "1100.00", gstAmount: "100.00", dueDate: "2026-11-24T00:00:00.000Z", documentPath: `schemes/${A}/works/works_invoice/u1` });
  });

  it("refuses a repeated invoice number", async () => {
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    await invoiceIt();
    const r = await submitInvoice({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", raw: invoiceRaw(), now: NOW });
    expect(r).toMatchObject({ ok: false, fieldErrors: { invoiceNumber: /already/ } });
  });

  it("shows the contractor whether they can report or invoice", async () => {
    expect(await closeOutForContractor("wo", ["c1"])).toMatchObject({ canReport: true, canInvoice: false, hasBankDetails: true });
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    expect(await closeOutForContractor("wo", ["c1"])).toMatchObject({ canReport: false, canInvoice: true });
    await invoiceIt();
    expect(await closeOutForContractor("wo", ["c1"])).toMatchObject({ canInvoice: false, invoices: [expect.objectContaining({ statusLabel: expect.stringMatching(/checking/) })] });
    expect(await closeOutForContractor("wo", ["c2"])).toBeNull();
  });
});

describe("sending it for payment", () => {
  beforeEach(() => seed());

  it("only after the work is confirmed done", async () => {
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    const id = await invoiceIt();
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" })).rejects.toThrow(/Confirm the work is done/);
  });

  it("becomes a supplier invoice waiting for approval, prepared by whoever sent it", async () => {
    await reportAndConfirm();
    const id = await invoiceIt();
    const r = await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m2"), fundId: "fa", accountCodeId: "repairs" });
    const supplier = sharedFake.table("Supplier")[0];
    expect(supplier).toMatchObject({ schemeId: A, contractorBusinessId: "c1", companyName: "Ace Plumbing Pty Ltd", bankBsb: "062-000", gstRegistered: true });
    // The contractor's own bank details, to be verified by the building. The change is dated now
    // (the database default), so the cooling-off second check applies to the first payment.
    expect(sharedFake.table("SupplierBankDetailVersion")).toEqual([expect.objectContaining({ supplierId: supplier.id, schemeId: A, status: "PENDING", changedBy: "tradie", newAccountNumber: "12345678", previousBsb: null })]);
    expect(sharedFake.table("SupplierBankDetailVersion")[0].changedAt).toBeUndefined();
    expect(sharedFake.table("SupplierInvoice")).toEqual([
      expect.objectContaining({ id: r.supplierInvoiceId, schemeId: A, supplierId: supplier.id, status: "AWAITING_APPROVAL", preparedById: "m2", worksInvoiceId: id, fundId: "fa", accountCodeId: "repairs", totalAmount: "1100.00", gstAmount: "100.00", subtotal: "1000.00" }),
    ]);
    expect(sharedFake.table("WorksInvoice")[0]).toMatchObject({ status: "WITH_FINANCE", codedById: "m2" });
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" })).rejects.toThrow(/not waiting/);
  });

  it("uses the same supplier for the contractor's next invoice", async () => {
    await reportAndConfirm();
    const first = await invoiceIt();
    await sendInvoiceToFinance({ schemeId: A, invoiceId: first, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" });
    sharedFake.table("WorksInvoice")[0].status = "CANCELLED";
    const second = await invoiceIt({ invoiceNumber: "INV-101" });
    await sendInvoiceToFinance({ schemeId: A, invoiceId: second, actor: member("m1"), fundId: "fc", accountCodeId: "capex" });
    expect(sharedFake.table("Supplier")).toHaveLength(1);
    expect(sharedFake.table("SupplierBankDetailVersion")).toHaveLength(1);
  });

  it("checks the fund and account are the building's and go together", async () => {
    await reportAndConfirm();
    const id = await invoiceIt();
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fx", accountCodeId: "repairs" })).rejects.toThrow(/fund/);
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "bank" })).rejects.toThrow(/expense account/);
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fc", accountCodeId: "repairs" })).rejects.toThrow(/other fund/);
    expect(sharedFake.table("SupplierInvoice")).toHaveLength(0);
  });

  it("the Adviser only where the building allows it", async () => {
    await reportAndConfirm();
    const id = await invoiceIt();
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: adviser, fundId: "fa", accountCodeId: "repairs" })).rejects.toThrow(/has not asked the Adviser/);
    sharedFake.table("WorksSettings")[0].adviserMayCodeInvoices = true;
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: adviser, fundId: "fa", accountCodeId: "repairs" });
    expect(sharedFake.table("SupplierInvoice")[0]).toMatchObject({ preparedById: "adv" });
  });

  it("no bank details yet: the supplier has none, and finance blocks payment", async () => {
    seed({ bank: false });
    await reportAndConfirm();
    const id = await invoiceIt();
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" });
    expect(sharedFake.table("Supplier")[0]).toMatchObject({ bankBsb: null });
    expect(sharedFake.table("SupplierBankDetailVersion")).toHaveLength(0);
  });
});

describe("extra cost over the work order", () => {
  beforeEach(async () => {
    seed();
    await reportAndConfirm();
  });

  it("needs the committee's vote before it can be sent for payment", async () => {
    const id = await invoiceIt({ total: "1650.00", gst: "150.00", excessReason: "Corroded joint" });
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" })).rejects.toThrow(/agree the extra/);
    const p = await proposeVariation({ schemeId: A, requestId: "req", invoiceId: id, actor: member("m1"), note: null });
    expect(p.status).toBe("OPEN");
    const view = await closeOutForCommittee(A, "req", member("m2"));
    expect(view?.live?.variation).toMatchObject({ overLimit: true, agreed: false, openDecisionId: p.decisionId });
    expect(view?.can.sendToFinance).toBe(false);
    const v = await vote({ schemeId: A, decisionId: p.decisionId, requestId: "req", actor: member("m2"), vote: "FOR", comment: null });
    expect(v.status).toBe("DECIDED");
    expect((await closeOutForCommittee(A, "req", member("m2")))?.can.sendToFinance).toBe(true);
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m3"), fundId: "fa", accountCodeId: "repairs" });
    expect(sharedFake.table("SupplierInvoice")[0]).toMatchObject({ totalAmount: "1650.00" });
  });

  it("no vote for an invoice within the amount", async () => {
    const id = await invoiceIt();
    await expect(proposeVariation({ schemeId: A, requestId: "req", invoiceId: id, actor: member("m1"), note: null })).rejects.toThrow(/within/);
  });

  it("an agreed amount does not carry over to a different amount", async () => {
    const id = await invoiceIt({ total: "1650.00", gst: "150.00", excessReason: "Corroded joint" });
    const p = await proposeVariation({ schemeId: A, requestId: "req", invoiceId: id, actor: member("m1"), note: null });
    // The invoice changes while the vote is open: the vote can no longer apply.
    sharedFake.table("WorksInvoice")[0].claimedAmount = "1700.00";
    const v = await vote({ schemeId: A, decisionId: p.decisionId, requestId: "req", actor: member("m2"), vote: "FOR", comment: null });
    expect(v.status).toBe("WITHDRAWN");
  });

  it("sending the invoice back withdraws the open vote", async () => {
    const id = await invoiceIt({ total: "1650.00", gst: "150.00", excessReason: "Corroded joint" });
    const p = await proposeVariation({ schemeId: A, requestId: "req", invoiceId: id, actor: member("m1"), note: null });
    await expect(returnInvoice({ schemeId: A, invoiceId: id, reason: "" })).rejects.toThrow(/Say what is wrong/);
    await returnInvoice({ schemeId: A, invoiceId: id, reason: "We agreed $1,500" });
    expect(sharedFake.table("WorksInvoice")[0]).toMatchObject({ status: "RETURNED", returnReason: "We agreed $1,500" });
    expect(sharedFake.table("WorksDecision").find((d) => d.id === p.decisionId)).toMatchObject({ status: "WITHDRAWN" });
    // A corrected invoice can follow.
    await invoiceIt({ invoiceNumber: "INV-100A", total: "1500.00", gst: "136.36" });
  });
});

describe("finance moves the works invoice on", () => {
  beforeEach(async () => {
    seed();
    await reportAndConfirm();
    const id = await invoiceIt();
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" });
  });
  const si = () => sharedFake.table("SupplierInvoice")[0];
  const wi = () => sharedFake.table("WorksInvoice")[0];

  it("approved, part paid, then paid (closing the request)", async () => {
    await syncWorksInvoiceFromFinance(String(si().id), "APPROVED");
    expect(wi()).toMatchObject({ status: "APPROVED", approvedAmount: "1100.00" });
    si().amountPaid = "500.00";
    await syncWorksInvoiceFromFinance(String(si().id), "PARTIALLY_PAID");
    expect(wi()).toMatchObject({ status: "PARTIALLY_PAID", paidAmount: "500.00" });
    expect(request()).toMatchObject({ status: "CLOSE_OUT" });
    si().amountPaid = "1100.00";
    await syncWorksInvoiceFromFinance(String(si().id), "PAID");
    expect(wi()).toMatchObject({ status: "PAID", paidAmount: "1100.00" });
    expect(request()).toMatchObject({ status: "CLOSED" });
  });

  it("cancelled, so the contractor can send another", async () => {
    await syncWorksInvoiceFromFinance(String(si().id), "CANCELLED");
    expect(wi()).toMatchObject({ status: "CANCELLED" });
    expect(await closeOutForContractor("wo", ["c1"])).toMatchObject({ canInvoice: true });
  });

  it("ignores supplier invoices that did not come from works, and paid invoices", async () => {
    expect(await syncWorksInvoiceFromFinance("nope", "PAID")).toBeNull();
    si().amountPaid = "1100.00";
    await syncWorksInvoiceFromFinance(String(si().id), "PAID");
    await syncWorksInvoiceFromFinance(String(si().id), "CANCELLED");
    expect(wi()).toMatchObject({ status: "PAID" });
  });
});

describe("review fixes", () => {
  beforeEach(() => seed());
  const makeContact = (profileId: string) => sharedFake.table("ContractorContact").push({ id: `cc-${profileId}`, contractorBusinessId: "c1", profileId, status: "ACTIVE", isPrimary: false, firstName: "M", lastName: "X" });

  it("a committee member who is the contractor's contact cannot confirm, agree, send or approve", async () => {
    makeContact("m1");
    await reportCompletion({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", completion: done });
    await expect(answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m1", accept: true, comments: null })).rejects.toThrow(/contact of the contractor/);
    await answerCompletion({ schemeId: A, workOrderId: "wo", actorId: "m2", accept: true, comments: null });
    const id = await invoiceIt({ total: "1650.00", gst: "150.00", excessReason: "x" });
    await expect(proposeVariation({ schemeId: A, requestId: "req", invoiceId: id, actor: member("m1"), note: null })).rejects.toThrow(/contact of the contractor/);
    const p = await proposeVariation({ schemeId: A, requestId: "req", invoiceId: id, actor: member("m2"), note: null });
    await expect(vote({ schemeId: A, decisionId: p.decisionId, requestId: "req", actor: member("m1"), vote: "FOR", comment: null })).rejects.toThrow(/cannot vote/);
    await vote({ schemeId: A, decisionId: p.decisionId, requestId: "req", actor: member("m3"), vote: "FOR", comment: null });
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" })).rejects.toThrow(/contact of the contractor/);
    const view = await closeOutForCommittee(A, "req", member("m1"));
    expect(view?.can).toMatchObject({ conflicted: true, sendToFinance: false, returnInvoice: false });
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m2"), fundId: "fa", accountCodeId: "repairs" });
    const supplierId = String(sharedFake.table("Supplier")[0].id);
    expect(await contractorConflict(supplierId, "m1")).toMatch(/someone else must approve/);
    expect(await contractorConflict(supplierId, "m3")).toBeNull();
  });

  it("adopts the building's existing supplier with the same ABN, recording the contractor's bank details as a change", async () => {
    sharedFake.table("Supplier").push({ id: "manual", schemeId: A, abn: "12345678901", companyName: "Ace (manual)", contractorBusinessId: null, isActive: true, bankBsb: "111-111", bankAccountNumber: "999", bankAccountName: "Old" });
    await reportAndConfirm();
    const id = await invoiceIt();
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" });
    expect(sharedFake.table("Supplier")).toHaveLength(1);
    expect(sharedFake.table("Supplier")[0]).toMatchObject({ id: "manual", contractorBusinessId: "c1", bankBsb: "062-000" });
    expect(sharedFake.table("SupplierBankDetailVersion")[0]).toMatchObject({ supplierId: "manual", previousBsb: "111-111", newBsb: "062-000", status: "PENDING" });
    expect(sharedFake.table("SupplierInvoice")[0]).toMatchObject({ supplierId: "manual" });
  });

  it("refuses an invoice number already in finance for the same ABN", async () => {
    sharedFake.table("Supplier").push({ id: "other", schemeId: A, abn: "12345678901", companyName: "Ace again", contractorBusinessId: "cX", isActive: true });
    sharedFake.table("SupplierInvoice").push({ id: "keyed", schemeId: A, supplierId: "other", invoiceNumber: "INV-100", status: "AWAITING_APPROVAL" });
    await reportAndConfirm();
    const id = await invoiceIt();
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" })).rejects.toThrow(/already in the building's finance/);
  });

  it("refuses a contractor the Adviser has made inactive", async () => {
    sharedFake.table("Supplier").push({ id: "s1", schemeId: A, contractorBusinessId: "c1", isActive: false, companyName: "Ace" });
    await reportAndConfirm();
    const id = await invoiceIt();
    await expect(sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" })).rejects.toThrow(/inactive/);
  });

  it("brings GST registration up to date on the supplier", async () => {
    sharedFake.table("Supplier").push({ id: "s1", schemeId: A, contractorBusinessId: "c1", isActive: true, gstRegistered: false, companyName: "Ace" });
    await reportAndConfirm();
    const id = await invoiceIt();
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" });
    expect(sharedFake.table("Supplier")[0]).toMatchObject({ gstRegistered: true });
  });

  it("cancelling after approval does not free the order, and the cap counts what was paid before", async () => {
    await reportAndConfirm();
    const id = await invoiceIt();
    await sendInvoiceToFinance({ schemeId: A, invoiceId: id, actor: member("m1"), fundId: "fa", accountCodeId: "repairs" });
    const si = sharedFake.table("SupplierInvoice")[0];
    await syncWorksInvoiceFromFinance(String(si.id), "APPROVED");
    await syncWorksInvoiceFromFinance(String(si.id), "CANCELLED");
    expect(sharedFake.table("WorksInvoice")[0]).toMatchObject({ status: "APPROVED" });
    // If an invoice with $1,100 paid were ever replaced, the next may only take the rest of $1,500.
    Object.assign(sharedFake.table("WorksInvoice")[0], { status: "CANCELLED", paidAmount: "1100.00" });
    const r = await submitInvoice({ workOrderId: "wo", businessIds: ["c1"], profileId: "tradie", raw: invoiceRaw({ invoiceNumber: "INV-2", total: "500.00", gst: "0" }), now: NOW });
    expect(r).toMatchObject({ ok: false, fieldErrors: { excessReason: expect.any(String) } });
  });

  it("the Adviser is not offered a vote proposal without the delegation", async () => {
    await reportAndConfirm();
    await invoiceIt({ total: "1650.00", gst: "150.00", excessReason: "x" });
    expect((await closeOutForCommittee(A, "req", adviser))?.can.proposeVariation).toBe(false);
    expect((await closeOutForCommittee(A, "req", member("m1")))?.can.proposeVariation).toBe(true);
  });

  it("warns when nobody else could approve the payment", async () => {
    await reportAndConfirm();
    await invoiceIt();
    expect((await closeOutForCommittee(A, "req", member("m1")))?.approvalWarning).toMatch(/Nobody other than you/);
    sharedFake.table("SchemeMembership").find((m) => m.profileId === "m2")!.isTreasurer = true;
    expect((await closeOutForCommittee(A, "req", member("m1")))?.approvalWarning).toBeNull();
  });
});
