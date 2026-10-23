import { emailLayout, emailButton } from "./layout";
import { html, plainSubject } from "./html";


export function platformInvoiceEmail(params: {
  to: string[];
  schemeName: string;
  invoiceNumber: string;
  monthLabel: string;
  total: string;
  promotional: boolean;
  needsApproval: boolean;
  detailUrl: string;
}) {
  const scheme = params.schemeName;
  const content = html`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      StrataVerze invoice ${params.invoiceNumber}
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#1A202C;line-height:1.6;">
      StrataVerze has issued its invoice to <strong>${scheme}</strong> for ${params.monthLabel}.
      It covers the subscription for the month and any StrataVerze fees from the month before.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;">
      <tr>
        <td style="padding:12px 16px;background-color:#F8FAFB;border-radius:8px;">
          <p style="margin:0 0 4px;font-size:13px;color:#64748B;">Total including GST</p>
          <p style="margin:0;font-size:22px;color:#1a1a2e;font-weight:700;">${params.total}</p>
          ${params.promotional ? html`<p style="margin:8px 0 0;font-size:13px;color:#64748B;">The subscription is credited during the promotional period.</p>` : ""}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;color:#1A202C;line-height:1.6;">
      ${
        params.needsApproval
          ? "It has been entered in the scheme's accounts as a supplier invoice from StrataVerze, awaiting the committee's approval."
          : "There is nothing to pay this month."
      }
    </p>
    ${emailButton("View StrataVerze fees", params.detailUrl)}
  `;
  return {
    to: params.to,
    subject: plainSubject(`StrataVerze invoice ${params.invoiceNumber} for ${params.schemeName}: ${params.total}`),
    html: emailLayout(content),
  };
}
