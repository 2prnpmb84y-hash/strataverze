import { emailButton, emailLayout } from "./layout";
import { html, plainSubject } from "./html";

/**
 * Works marketplace emails (25 Oct 2026): one plain message per event, each
 * to one person (addresses are never shared between recipients).
 */
export function worksEmail(params: { to: string; subject: string; heading: string; lines: string[]; buttonLabel: string; url: string }) {
  const content = html`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">${params.heading}</h1>
    ${params.lines.map((l) => html`<p style="margin:0 0 12px;font-size:15px;color:#1A202C;line-height:1.6;">${l}</p>`)}
    ${emailButton(params.buttonLabel, params.url)}
  `;
  return { to: params.to, subject: plainSubject(params.subject), html: emailLayout(content) };
}
