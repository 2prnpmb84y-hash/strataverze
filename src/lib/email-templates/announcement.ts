import { emailLayout, emailButton } from "./layout";
import { html, plainSubject } from "./html";

type AnnouncementPublishedParams = {
  recipientEmails: string[];
  schemeName: string;
  title: string;
  body: string;
  priority: string;
  authorName: string;
  detailUrl: string;
};

const priorityLabels: Record<string, string> = {
  NORMAL: "Notice",
  IMPORTANT: "Important Notice",
  URGENT: "Urgent Notice",
};

export function announcementPublishedEmail(params: AnnouncementPublishedParams) {
  const priorityLabel = priorityLabels[params.priority] ?? "Notice";

  // Truncate body for email preview (first 300 chars)
  const preview =
    params.body.length > 300
      ? params.body.slice(0, 300).trimEnd() + "…"
      : params.body;

  const urgentBanner =
    params.priority === "URGENT"
      ? html`<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:0 0 20px;font-size:13px;color:#991b1b;font-weight:600;">
          ⚠ This is an urgent announcement requiring your immediate attention.
        </div>`
      : "";

  const content = html`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      ${priorityLabel}
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#1A202C;line-height:1.6;">
      A new announcement has been posted for
      <strong>${params.schemeName}</strong>.
    </p>
    ${urgentBanner}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;width:100px;">Title</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;font-weight:600;">${params.title}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;">Posted by</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${params.authorName}</td>
      </tr>
    </table>
    <div style="background:#F8FAFB;border-radius:8px;padding:16px;margin:0 0 20px;font-size:14px;color:#1A202C;line-height:1.6;white-space:pre-wrap;">
${preview}
    </div>
    ${emailButton("View Announcement", params.detailUrl)}
  `;

  return {
    to: params.recipientEmails,
    subject: plainSubject(`${priorityLabel}: ${params.title} — ${params.schemeName}`),
    html: emailLayout(content),
  };
}
