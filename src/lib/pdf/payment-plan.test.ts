import { describe, expect, it } from "vitest";
import { PAYMENT_PLANS } from "@/config/statutory";
import { paymentPlanReplyBlocks, renderPaymentPlanReplyPdf, type PaymentPlanReplyDocument } from "./payment-plan";

const base: PaymentPlanReplyDocument = {
  schemeName: "Harbour View",
  planNumber: "12345",
  planLabel: "Strata Plan",
  ownersCorporation: "owners corporation",
  lotNumber: "Lot 7",
  ownerNames: "Jo Citizen",
  ownerAddress: "7/1 Example St, Sydney NSW 2000",
  receivedOn: "2026-10-20",
  decision: "APPROVED",
  meetingLabel: "Meeting of the strata committee",
  meetingOn: "2026-10-25",
  interestWaiver: null,
  refusalReasons: null,
  mediation: PAYMENT_PLANS.mediation,
  extensionStatement: PAYMENT_PLANS.extensionStatement,
  plan: {
    agreedOn: "2026-10-26",
    leviesOwingCents: 200_000,
    interestOwingCents: 5_000,
    interestMethod: "Simple interest at 10% a year.",
    totalCents: 205_000,
    coversCurrentLevies: false,
    paymentMethods: "Bank transfer, reference Lot 7.",
    contactDetails: "A Adviser, adviser@example.com",
    paidToDateCents: 0,
    instalments: [
      { number: 1, dueOn: "2026-11-01", amountCents: 102_500, paidCents: 0 },
      { number: 2, dueOn: "2026-12-01", amountCents: 102_500, paidCents: 0 },
    ],
  },
  preparedOn: "2026-10-26",
};

const text = (d: PaymentPlanReplyDocument) => JSON.stringify(paymentPlanReplyBlocks(d));

describe("payment plan statement", () => {
  it("has every item the statement must contain", () => {
    const t = text(base);
    for (const s of ["Jo Citizen", "7/1 Example St", "Lot 7", "Levies owing", "Interest payable", "How interest is calculated", "Payment schedule", "How to pay", "Amount paid to date", "Contact", PAYMENT_PLANS.extensionStatement, "26 October 2026"]) {
      expect(t).toContain(s);
    }
  });

  it("gives the reasons and the next step on a refusal", () => {
    const t = text({ ...base, decision: "REFUSED", plan: null, refusalReasons: "The administrative fund would be short this quarter." });
    expect(t).toContain("administrative fund would be short");
    expect(t).toContain(PAYMENT_PLANS.mediation);
    expect(t).not.toContain("Payment schedule");
  });

  it("renders as a PDF", async () => {
    const bytes = await renderPaymentPlanReplyPdf(base);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
