import { emailLayout, emailButton } from "./layout";

type MeetingScheduledParams = {
  recipientEmails: string[];
  schemeName: string;
  meetingTitle: string;
  meetingType: string;
  scheduledAt: Date;
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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatted = params.scheduledAt.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const locationRow = params.location
    ? `<tr>
        <td style="padding:4px 0;font-size:13px;color:#8c8c9a;width:100px;">Location</td>
        <td style="padding:4px 8px;font-size:13px;color:#4a4a5a;">${params.location}</td>
      </tr>`
    : "";

  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      Meeting Scheduled
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4a4a5a;line-height:1.6;">
      A ${typeLabel.toLowerCase()} has been scheduled for
      <strong>${params.schemeName}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#8c8c9a;width:100px;">Meeting</td>
        <td style="padding:4px 8px;font-size:13px;color:#4a4a5a;font-weight:600;">${params.meetingTitle}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#8c8c9a;">Type</td>
        <td style="padding:4px 8px;font-size:13px;color:#4a4a5a;">${typeLabel}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#8c8c9a;">Date</td>
        <td style="padding:4px 8px;font-size:13px;color:#4a4a5a;">${dateFormatted}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#8c8c9a;">Time</td>
        <td style="padding:4px 8px;font-size:13px;color:#4a4a5a;">${timeFormatted}</td>
      </tr>
      ${locationRow}
    </table>
    ${emailButton("View Meeting Details", params.detailUrl)}
  `;

  return {
    to: params.recipientEmails,
    subject: `${typeLabel}: ${params.meetingTitle} — ${dateFormatted}`,
    html: emailLayout(content),
  };
}
