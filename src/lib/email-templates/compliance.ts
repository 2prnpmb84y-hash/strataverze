import { emailButton, emailLayout } from "./layout";
import { html, plainSubject } from "./html";

/**
 * Plain one-message emails for statutory workflows (payment plans, committee
 * training, annual reporting, information certificates), each to one person
 * so addresses are never shared between recipients.
 */
export function complianceEmail(params: { to: string; subject: string; heading: string; lines: string[]; buttonLabel: string; url: string }) {
  const content = html`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">${params.heading}</h1>
    ${params.lines.map((l) => html`<p style="margin:0 0 12px;font-size:15px;color:#1A202C;line-height:1.6;">${l}</p>`)}
    ${emailButton(params.buttonLabel, params.url)}
  `;
  return { to: params.to, subject: plainSubject(params.subject), html: emailLayout(content) };
}
