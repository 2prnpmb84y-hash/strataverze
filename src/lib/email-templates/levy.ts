import { emailLayout, emailButton } from "./layout";

type LevyIssuedParams = {
  recipientEmail: string;
  ownerName: string;
  schemeName: string;
  levyTitle: string;
  amount: string;
  dueDate: Date;
  detailUrl: string;
};

export function levyIssuedEmail(params: LevyIssuedParams) {
  const dueDateFormatted = params.dueDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      Levy Notice
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4a4a5a;line-height:1.6;">
      Hi ${params.ownerName}, a levy has been issued for
      <strong>${params.schemeName}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;">
      <tr>
        <td style="padding:12px 16px;background-color:#f4f5f7;border-radius:8px;">
          <p style="margin:0 0 4px;font-size:13px;color:#8c8c9a;">Levy</p>
          <p style="margin:0 0 12px;font-size:15px;color:#1a1a2e;font-weight:600;">${params.levyTitle}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#8c8c9a;">Amount Due</p>
          <p style="margin:0 0 12px;font-size:22px;color:#1a1a2e;font-weight:700;">$${params.amount}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#8c8c9a;">Due Date</p>
          <p style="margin:0;font-size:15px;color:#1a1a2e;">${dueDateFormatted}</p>
        </td>
      </tr>
    </table>
    ${emailButton("View Levy Details", params.detailUrl)}
  `;

  return {
    to: params.recipientEmail,
    subject: `Levy notice: ${params.levyTitle} — $${params.amount} due ${dueDateFormatted}`,
    html: emailLayout(content),
  };
}
