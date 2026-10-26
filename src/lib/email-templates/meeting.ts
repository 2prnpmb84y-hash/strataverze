import { emailLayout, emailButton } from "./layout";
import { html, plainSubject } from "./html";

type MeetingScheduledParams = {
  recipientEmails: string[];
  schemeName: string;
  meetingTitle: string;
  meetingType: string;
  scheduledAt: Date;
  /** The meeting's time zone: the date and time are shown in it. */
  timeZone: string;
  location?: string;
  detailUrl: string;
};

const meetingTypeLabels: Record<string, string> = {
  AGM: "Annual General Meeting",
  SGM: "Special General Meeting",
  COMMITTEE: "Committee Meeting",
};

export function meetingScheduledEmail(params: MeetingScheduledParams) {
  const typeLabel =
    meetingTypeLabels[params.meetingType] ?? params.meetingType;
  const dateFormatted = params.scheduledAt.toLocaleDateString("en-AU", {
    timeZone: params.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatted = params.scheduledAt.toLocaleTimeString("en-AU", {
    timeZone: params.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const locationRow = params.location
    ? html`<tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;width:100px;">Location</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${params.location}</td>
      </tr>`
    : "";

  const content = html`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      Meeting Scheduled
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#1A202C;line-height:1.6;">
      A ${typeLabel.toLowerCase()} has been scheduled for
      <strong>${params.schemeName}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;width:100px;">Meeting</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;font-weight:600;">${params.meetingTitle}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;">Type</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${typeLabel}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;">Date</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${dateFormatted}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;">Time</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${timeFormatted}</td>
      </tr>
      ${locationRow}
    </table>
    ${emailButton("View Meeting Details", params.detailUrl)}
  `;

  return {
    to: params.recipientEmails,
    subject: plainSubject(`${typeLabel}: ${params.meetingTitle} — ${dateFormatted}`),
    html: emailLayout(content),
  };
}
