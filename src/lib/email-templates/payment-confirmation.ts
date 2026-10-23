import { emailLayout, emailButton } from "./layout";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** TC-001: tell the scheme's advisers an owner's upload may duplicate an earlier one. */
export function possibleDuplicatePaymentEmail(params: {
  recipientEmails: string[];
  schemeName: string;
  lotLabel: string;
  noticeNumber: string | null;
  amount: string;
  documentDate: string;
  earlierUploadedAt: string;
  reviewUrl: string;
}) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">Possible duplicate payment confirmation</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#1A202C;line-height:1.6;">
      An owner of ${esc(params.lotLabel)} at <strong>${esc(params.schemeName)}</strong> uploaded a payment confirmation that matches one they uploaded on ${esc(params.earlierUploadedAt)}:
      ${esc(params.amount)} paid on ${esc(params.documentDate)}${params.noticeNumber ? ` for notice ${esc(params.noticeNumber)}` : ""}.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#1A202C;line-height:1.6;">
      Both uploads are kept. Nothing has been posted. Check them against the bank statement when you review.
    </p>
    ${emailButton("Review the upload", params.reviewUrl)}
  `;
  return {
    to: params.recipientEmails,
    subject: `Possible duplicate payment confirmation: ${params.schemeName}, ${params.lotLabel}`,
    html: emailLayout(content),
  };
}
