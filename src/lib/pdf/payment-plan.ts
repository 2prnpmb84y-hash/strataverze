/**
 * The written reply to a payment plan request: on approval, the payment plan
 * statement with the contents the building's rule pack lists
 * (`rules.PAYMENT_PLANS.statementContents`); on refusal, the reasons and how
 * they apply, with where the owner can go next.
 */
import { renderPdf, type PdfBlock } from "./document";
import { aud, longDate, planLine } from "./documents";

export interface PaymentPlanReplyDocument {
  schemeName: string;
  planNumber: string | null;
  ownersCorporation: string;
  lotNumber: string;
  ownerNames: string;
  ownerAddress: string | null;
  receivedOn: string;
  decision: "APPROVED" | "REFUSED";
  meetingLabel: string;
  meetingOn: string;
  interestWaiver: "WAIVED" | "NOT_WAIVED" | null;
  refusalReasons: string | null;
  mediation: string;
  extensionStatement: string;
  plan: null | {
    agreedOn: string;
    leviesOwingCents: number;
    interestOwingCents: number;
    interestMethod: string;
    totalCents: number;
    coversCurrentLevies: boolean;
    paymentMethods: string;
    contactDetails: string;
    paidToDateCents: number;
    instalments: { number: number; dueOn: string; amountCents: number; paidCents: number }[];
  };
  preparedOn: string;
}

export function paymentPlanReplyBlocks(d: PaymentPlanReplyDocument): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { kind: "heading", text: d.decision === "APPROVED" ? "Payment plan statement" : "Reply to your payment plan request" },
    {
      kind: "keyValues",
      rows: [
        ["Lot owner", d.ownerNames],
        ["Address", d.ownerAddress || "Not recorded"],
        ["Lot", d.lotNumber],
        ["Request received", longDate(d.receivedOn)],
        ["Decided", `${d.meetingLabel}, ${longDate(d.meetingOn)}`],
      ],
    },
    { kind: "spacer" },
  ];
  if (d.decision === "REFUSED") {
    blocks.push(
      { kind: "text", text: `The ${d.ownersCorporation} has not approved your request for a payment plan.` },
      { kind: "box", title: "Reasons, and how they apply to your request", lines: (d.refusalReasons ?? "").split(/\n+/).filter(Boolean) },
    );
    if (d.interestWaiver) blocks.push({ kind: "text", text: d.interestWaiver === "WAIVED" ? "Interest on the overdue levies has been waived." : "The request to waive interest was not approved." });
    blocks.push({ kind: "box", tone: "note", title: "What you can do", lines: [d.mediation] });
    return blocks;
  }
  const p = d.plan!;
  blocks.push(
    { kind: "text", text: `The ${d.ownersCorporation} has approved a payment plan for the levies below. It was agreed on ${longDate(p.agreedOn)}.` },
    {
      kind: "keyValues",
      rows: [
        ["Levies owing", aud(p.leviesOwingCents)],
        ["Interest payable", d.interestWaiver === "WAIVED" ? "Waived" : aud(p.interestOwingCents)],
        ["How interest is calculated", p.interestMethod],
        ["Amount this plan covers", aud(p.totalCents)],
        ["Covers current levies", p.coversCurrentLevies ? "Yes" : "No, overdue levies only"],
        ["Amount paid to date", aud(p.paidToDateCents)],
      ],
    },
    { kind: "heading", text: "Payment schedule", level: 2 },
    {
      kind: "table",
      columns: [
        { header: "Instalment", width: 0.2 },
        { header: "Due", width: 0.4 },
        { header: "Amount", width: 0.2, align: "right" },
        { header: "Paid", width: 0.2, align: "right" },
      ],
      rows: p.instalments.map((i) => [String(i.number), longDate(i.dueOn), aud(i.amountCents), aud(i.paidCents)]),
      totalRow: ["Total", "", aud(p.instalments.reduce((s, i) => s + i.amountCents, 0)), aud(p.paidToDateCents)],
    },
    { kind: "keyValues", rows: [["How to pay", p.paymentMethods], ["Contact", p.contactDetails]] },
    { kind: "box", tone: "note", lines: p.coversCurrentLevies ? [d.extensionStatement] : [d.extensionStatement, "Keep paying new levies as they fall due."] },
  );
  return blocks;
}

export function renderPaymentPlanReplyPdf(d: PaymentPlanReplyDocument) {
  return renderPdf({
    title: d.decision === "APPROVED" ? "Payment plan statement" : "Payment plan request reply",
    schemeName: d.schemeName,
    schemeLine: planLine(d.planNumber),
    blocks: paymentPlanReplyBlocks(d),
    generatedAt: new Date(`${d.preparedOn}T00:00:00Z`),
  });
}
